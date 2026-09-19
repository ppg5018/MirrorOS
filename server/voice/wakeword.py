#!/usr/bin/env python3
"""
MirrorOS — Wake Word Detection
Always-listening loop using openWakeWord (open-source, no cloud, no AccessKey).

On wake word detected:
  1. POST /api/voice/state { state: listening }  → UI glows teal
  2. Record up to RECORD_SECONDS of audio (stops early on silence)
  3. POST /api/voice/state { state: transcribing }
  4. transcribe.py → text
  5. POST /api/voice        → Claude reply
  6. speak.py              → speaker output
  7. POST /api/voice/state { state: idle }

Wake word resolution (first match wins):
  1. config/wakeword.json, either form:
       { "name": "Hey Jarvis", "builtin": "hey_jarvis" }      ← use a bundled model
       { "name": "Hey Mirror", "file": "hey-mirror.onnx" }    ← custom model, loaded
         from server/voice/wakewords/<file> (train one free on Colab)
  2. env WAKE_WORD_PATH    →  absolute path to a .onnx/.tflite model
  3. env WAKE_MODEL        →  a bundled pre-trained model name
       (hey_jarvis, hey_mycroft, hey_rhasspy, alexa)   — default: hey_jarvis

A config naming a "file" that does not exist is the classic failure: the mirror
falls back to the built-in and quietly listens for a different phrase than the
one the config advertises. That case is now logged loudly at startup.

RAM:  ~80MB idle    CPU: low on Pi 3B (tflite framework recommended there)
"""

import os
import sys
import subprocess
import wave
import time
import json

import numpy as np
import openwakeword
from openwakeword.model import Model
import requests

from mic import resolve_input_device

# Load .env file (same pattern as Node.js dotenv)
def _load_env():
    env_path = os.path.join(os.path.dirname(__file__), '../../.env')
    env_path = os.path.normpath(env_path)
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    os.environ.setdefault(k.strip(), v.strip())
_load_env()

# ── Config ──────────────────────────────────────────────────
BACKEND_URL     = os.environ.get('MIRROR_BACKEND', 'http://localhost:3000')
WAV_PATH        = '/tmp/voice_input.wav'
RECORD_SECONDS  = int(os.environ.get('RECORD_SECONDS', '8'))
SCRIPT_DIR      = os.path.dirname(os.path.abspath(__file__))

# openWakeWord expects 16kHz mono 16-bit PCM, fed in 80ms chunks (1280 samples).
SAMPLE_RATE     = 16000
FRAME_LENGTH    = 1280
# Detection cutoff. openWakeWord's own default is 0.5, but this mic reads low:
# a genuine "hey jarvis" measured 0.40-0.93 depending on distance and level,
# while ambient noise stays <0.05. 0.35 keeps recall high with a wide margin
# over noise. Raise it toward 0.5 via WAKE_THRESHOLD if you see false triggers.
#
# Note this cutoff is NOT what stops the mirror answering itself — the tail of
# its own reply once scored 0.38, which no usable threshold cleanly excludes.
# The refractory window in settle() is what fixes that; see COOLDOWN_SECONDS.
DETECT_THRESHOLD = float(os.environ.get('WAKE_THRESHOLD', '0.35'))

# Refractory window after a command completes. The speaker sits inches from the
# mic on a mirror, so the room is still ringing with our own reply when the loop
# resumes. See settle().
COOLDOWN_SECONDS = float(os.environ.get('WAKE_COOLDOWN', '1.5'))

# WAKE_DEBUG=1 → log live audio level + wake-word score every ~2s so you can
# self-test at your own pace and see whether your voice registers.
WAKE_DEBUG      = os.environ.get('WAKE_DEBUG', '') not in ('', '0', 'false', 'False')

# WAKE_DENOISE=1 → openWakeWord's Speex noise suppression. Optional: needs the
# speexdsp-ns package (libspeexdsp-dev, no aarch64 wheel for Python 3.13), so it
# is not in requirements.txt and a missing package only logs a warning.
WAKE_DENOISE    = os.environ.get('WAKE_DENOISE', '0') not in ('', '0', 'false', 'False')

# ── Mic DSP config ──────────────────────────────────────────
# The mic is read raw (ALSA "mirror_raw": 48 kHz, S32_LE, stereo) and filtered
# BEFORE any gain. The INMP441's noise is ~97% below 50 Hz (DC wander + rumble);
# the old ALSA chain applied gain first, so that rumble clipped and took the
# speech with it. See MicDSP.
HW_RATE         = 48000
DECIMATE        = HW_RATE // SAMPLE_RATE           # 3
HW_BLOCK        = FRAME_LENGTH * DECIMATE          # 3840 frames = 80 ms at 48 kHz
MIC_HPF_HZ          = float(os.environ.get('MIC_HPF_HZ', '100'))
MIC_LPF_HZ          = 7200.0                       # anti-alias for the /3 decimation
# Fixed gain applied after filtering. Measured at standing distance, the
# loudest 50 ms of speech is -35.5 dBFS after the HPF; +13 dB puts it at
# -22.5 dBFS, openWakeWord's trained input level, and the noise floor
# (-47.1 dBFS) lands at -34.1 dBFS.
# Deliberately NOT adaptive: SNR is only 11.6 dB, so most blocks are noise and
# any RMS-tracking AGC ends up tracking (and amplifying) the noise. If distance
# variation becomes a problem, use a slow peak-tracker bounded to ~[6, 15] dB,
# not an RMS loop.
# Distinct from setup-mic.sh's MIC_GAIN_DB, which is the ALSA softvol gain on
# the "mirror_mic" device — that gain does not apply on the mirror_raw path.
MIC_DSP_GAIN_DB     = float(os.environ.get('MIC_DSP_GAIN_DB', '13.0'))

# Fallback bundled model when no custom wake-word file is present.
# Built-ins: hey_jarvis, hey_mycroft, hey_rhasspy, alexa
WAKE_MODEL      = os.environ.get('WAKE_MODEL', 'hey_jarvis')

# Inference backend. Empty = infer from the model file extension (onnx for the
# built-ins). requirements.txt tells Pi users to set WAKE_FRAMEWORK=tflite for
# the lighter tflite-runtime; that switch previously had no effect because the
# framework was hardcoded below.
WAKE_FRAMEWORK  = os.environ.get('WAKE_FRAMEWORK', '').strip().lower()

# Custom model path — read from config/wakeword.json if present, then env.
_wakeword_cfg_path = os.path.normpath(
    os.path.join(SCRIPT_DIR, '../../config/wakeword.json')
)
_cfg_name = None
if os.path.exists(_wakeword_cfg_path):
    try:
        with open(_wakeword_cfg_path) as _f:
            _wakeword_cfg = json.load(_f)
        _cfg_name = _wakeword_cfg.get('name')

        # "builtin": pick one of openWakeWord's bundled models by name. This lets
        # the config describe the real setup instead of pointing at a custom file
        # that was never trained.
        _cfg_builtin = (_wakeword_cfg.get('builtin') or '').strip()
        if _cfg_builtin and not os.environ.get('WAKE_MODEL'):
            WAKE_MODEL = _cfg_builtin

        _model_file = _wakeword_cfg.get('file', '')
        if _model_file and not os.environ.get('WAKE_WORD_PATH'):
            os.environ['WAKE_WORD_PATH'] = os.path.normpath(
                os.path.join(SCRIPT_DIR, 'wakewords', _model_file)
            )
    except Exception as _e:
        print(f'[wakeword] malformed config/wakeword.json ({_e}) — using built-in',
              flush=True)

MODEL_PATH      = os.environ.get('WAKE_WORD_PATH', '')

def ts():
    return time.strftime('%H:%M:%S')

def log(msg):
    print(f'[{ts()}] [wakeword] {msg}', flush=True)

# ── State notifications ─────────────────────────────────────
def notify_backend(event, text=None):
    """POST to /api/voice/state so the mirror UI updates."""
    try:
        payload = {'event': event}
        if text:
            payload['text'] = text
        requests.post(f'{BACKEND_URL}/api/voice/state', json=payload, timeout=3)
    except Exception as e:
        log(f'state notify failed ({event}): {e}')

# ── Media pause ─────────────────────────────────────────────
def pause_media():
    """Signal the frontend to pause any playing media before STT."""
    try:
        requests.post(f'{BACKEND_URL}/api/media/pause', timeout=2)
    except Exception:
        pass  # Media pause is best-effort


def resume_media():
    """Signal the frontend to resume media paused by pause_media().
    The frontend only acts on this if it actually paused something."""
    try:
        requests.post(f'{BACKEND_URL}/api/media/resume', timeout=2)
    except Exception:
        pass  # Best-effort, same as pause

# ── Mic capture + DSP ───────────────────────────────────────
def _dbfs(x):
    """RMS level of a float block in dBFS (-inf-safe)."""
    rms = float(np.sqrt(np.mean(x * x))) if x.size else 0.0
    return 20.0 * np.log10(rms) if rms > 1e-10 else -200.0


class MicDSP:
    """48 kHz float mono -> 16 kHz int16, filter first, gain last.

    1. 4th-order Butterworth HPF (MIC_HPF_HZ) cascaded with an 8th-order LPF
       at 7.2 kHz, one SOS array, state (zi) carried across blocks. Resetting
       it per block puts a step at every 80 ms boundary, and those transients
       false-trigger the wake word.
    2. Decimate by 3 with plain slicing — the LPF above is the anti-alias
       filter (resample_poly per block is stateless and leaves edge artefacts).
    3. Fixed gain MIC_DSP_GAIN_DB (see its comment for why it is not adaptive).
    4. Soft-clip at +/-0.99, convert to int16.
    """

    def __init__(self):
        from scipy.signal import butter
        hp = butter(4, MIC_HPF_HZ, btype='highpass', fs=HW_RATE, output='sos')
        lp = butter(8, MIC_LPF_HZ, btype='lowpass', fs=HW_RATE, output='sos')
        self.sos = np.vstack([hp, lp])
        self.zi = np.zeros((self.sos.shape[0], 2))
        self.gain = 10.0 ** (MIC_DSP_GAIN_DB / 20.0)
        self.in_dbfs = -200.0     # pre-gain level of the last block (debug)

    def filter_decimate(self, x):
        """48 kHz float block -> filtered 16 kHz float block (stateful)."""
        from scipy.signal import sosfilt
        y, self.zi = sosfilt(self.sos, x, zi=self.zi)
        return y[::DECIMATE]

    def apply_gain(self, y):
        """Filtered 16 kHz float block -> int16 (fixed gain + soft clip)."""
        self.in_dbfs = _dbfs(y)
        out = y * self.gain
        out = 0.99 * np.tanh(out / 0.99)                   # soft clip at +/-0.99
        return np.round(out * 32767.0).astype(np.int16)

    def process(self, x):
        return self.apply_gain(self.filter_decimate(x))


class MicCapture:
    """The one place audio is read. read() returns a FRAME_LENGTH (1280)
    int16 mono frame at 16 kHz — what model.predict() and save_wav() expect."""

    def __init__(self, stream, channels):
        self.stream = stream
        self.channels = channels
        self.dsp = MicDSP()

    def read(self):
        raw = self.stream.read(HW_BLOCK, exception_on_overflow=False)
        pcm = np.frombuffer(raw, dtype='<i4').reshape(-1, self.channels)
        # Channel 0 only: the INMP441 (L/R -> GND) drives the left slot and the
        # right slot is measured all-zero — summing would only add noise.
        x = pcm[:, 0].astype(np.float64) / 2147483648.0
        return self.dsp.process(x)

    def backlog_blocks(self):
        return self.stream.get_read_available() // HW_BLOCK


# ── Audio helpers ───────────────────────────────────────────
def save_wav(frames, filename):
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)        # 16-bit PCM
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b''.join(frames))

def record(mic, seconds):
    # int16 RMS of a post-gain frame; see SILENCE_THRESHOLD in ecosystem.config.js
    SILENCE_THRESHOLD = int(os.environ.get('SILENCE_THRESHOLD', '1200'))

    # Everything below is TIME-based so it stays correct no matter what
    # FRAME_LENGTH is. (This is what broke: the old code counted frames, so
    # switching to openWakeWord's 1280-sample frames stretched the trailing
    # silence from ~1s to ~2.4s — the mic seemed to "keep listening".)
    frames_per_sec  = SAMPLE_RATE / FRAME_LENGTH               # 12.5 @ 16k/1280
    silence_secs    = float(os.environ.get('SILENCE_SECONDS', '0.7'))
    prespeech_secs  = float(os.environ.get('PRESPEECH_TIMEOUT', '3.0'))
    silence_limit   = int(silence_secs * frames_per_sec)       # stop this long after speech ends
    min_speaking    = int(0.3 * frames_per_sec)                # need ~0.3s of speech first
    prespeech_limit = int(prespeech_secs * frames_per_sec)     # give up if nothing is said

    total_frames = int(frames_per_sec * seconds)

    frames = []
    silent_chunks    = 0
    speaking_started = False

    log(f'Recording up to {seconds}s (stops {silence_secs}s after you finish)...')

    for i in range(total_frames):
        frame = mic.read()
        frames.append(frame.tobytes())

        # numpy, not a Python per-sample loop: this runs 12.5x/sec on a Pi 4
        # that is also driving Chromium, and the loop has to keep up with the
        # mic in real time or PortAudio starts dropping frames.
        samples = frame.astype(np.float32)
        rms = float(np.sqrt(np.mean(samples * samples))) if samples.size else 0.0

        if rms > SILENCE_THRESHOLD:
            speaking_started = True
            silent_chunks = 0
        elif speaking_started:
            silent_chunks += 1

        # Stop shortly after you stop talking
        if speaking_started and silent_chunks > silence_limit and i > min_speaking:
            log(f'Speech ended — stopping at {(i + 1) / frames_per_sec:.1f}s')
            break

        # Never started talking? Don't sit there recording dead air.
        if not speaking_started and i > prespeech_limit:
            log(f'No speech after {prespeech_secs}s — stopping')
            break

    return frames

def drain_stream(mic):
    """Discard audio that piled up while we were busy.

    record -> transcribe -> Claude -> speak takes several seconds, and PortAudio
    keeps filling its input ring the entire time. Without this the loop resumes
    on stale audio -- including the mirror's own spoken reply bleeding back in
    through the mic -- and re-triggers on its own voice. model.reset() clears the
    wake-word feature buffer, not PortAudio's, so both are needed.

    The backlog still goes through mic.read() so the filter state stays
    continuous.
    """
    try:
        dropped = 0
        limit = SAMPLE_RATE * 30          # never spin forever on a stuck stream
        while dropped < limit:
            if mic.backlog_blocks() < 1:
                break
            mic.read()
            dropped += FRAME_LENGTH
        if dropped:
            log(f'Flushed {dropped / SAMPLE_RATE:.1f}s of buffered audio')
    except Exception as e:
        log(f'stream flush skipped: {e}')


def settle(mic, model, seconds=None):
    """Swallow live audio for a moment after a command finishes.

    drain_stream() only clears what PortAudio already buffered. It cannot help
    with sound still arriving: the tail of our own reply, and the room echo
    behind it, land in the *next* frames. Feeding those to the detector is how
    the mirror ends up answering itself in a loop. So read and throw away audio
    for a short refractory window, then reset the detector so it restarts from a
    clean feature buffer rather than one primed with our own voice.
    """
    seconds = COOLDOWN_SECONDS if seconds is None else seconds
    deadline = time.time() + seconds
    try:
        while time.time() < deadline:
            mic.read()
    except Exception as e:
        log(f'settle interrupted: {e}')
    model.reset()
    log(f'Listening again (settled {seconds:.1f}s)')


# ── Pipeline steps ──────────────────────────────────────────
STT_UNAVAILABLE = 3   # transcribe.py exit code: Sarvam unusable (not "heard nothing")

def transcribe(wav_path):
    """Returns (text, error). error is a short message when STT is
    unavailable (exit code 3), else None."""
    result = subprocess.run(
        ['python3', os.path.join(SCRIPT_DIR, 'transcribe.py'), wav_path],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        log(f'transcribe stderr: {result.stderr.strip()}')
    if result.returncode == STT_UNAVAILABLE:
        lines = result.stderr.strip().splitlines()
        return '', (lines[-1] if lines else 'speech-to-text unavailable')
    return result.stdout.strip(), None

def speak(text):
    subprocess.run(
        ['python3', os.path.join(SCRIPT_DIR, 'speak.py'), text],
        timeout=30
    )

def send_to_backend(text):
    resp = requests.post(
        f'{BACKEND_URL}/api/voice',
        json={'text': text},
        timeout=30
    )
    return resp.json().get('reply', '')

# ── Model loading ───────────────────────────────────────────
def _new_model(**kwargs):
    """openWakeWord Model, with Speex noise suppression if WAKE_DENOISE=1 and
    speexdsp-ns is importable. A missing optional package must never stop the
    voice loop from starting — warn once and build the model without it."""
    if WAKE_DENOISE:
        try:
            import speexdsp_ns  # noqa: F401 — availability check only
            model = Model(enable_speex_noise_suppression=True, **kwargs)
            log('Speex noise suppression: on')
            return model
        except Exception as e:
            log(f'WARNING: WAKE_DENOISE=1 but Speex noise suppression is unavailable '
                f'({type(e).__name__}: {e}) — continuing without it')
    return Model(**kwargs)

def load_model():
    """Ensure feature models are present, then load the wake-word model.

    Returns (model, target_key, display_name).
    """
    # Downloads melspectrogram + embedding feature models (and bundled
    # wake words) on first run. Idempotent — skips anything already cached.
    try:
        openwakeword.utils.download_models()
    except Exception as e:
        log(f'model download skipped/failed ({e}) — using cached models if present')

    if MODEL_PATH and os.path.exists(MODEL_PATH):
        framework = WAKE_FRAMEWORK or (
            'tflite' if MODEL_PATH.endswith('.tflite') else 'onnx')
        log(f'Using custom wake word: {MODEL_PATH} ({framework})')
        model = _new_model(wakeword_models=[MODEL_PATH], inference_framework=framework)
        target_key = os.path.splitext(os.path.basename(MODEL_PATH))[0]
        display = _cfg_name or 'Hey Mirror'
    else:
        if MODEL_PATH:
            spoken = WAKE_MODEL.replace('_', ' ')
            log(f'WARNING: wake-word model not found: {MODEL_PATH}')
            log(f'WARNING: config/wakeword.json names "{_cfg_name or "a custom word"}" '
                f'but that model is missing, so the mirror is NOT listening for it.')
            log(f'WARNING: falling back to built-in "{WAKE_MODEL}" — say "{spoken}" instead.')
            log('Train a free custom model: https://github.com/dscripka/openWakeWord')
        log(f'Using built-in model: "{WAKE_MODEL}"')
        model = _new_model(wakeword_models=[WAKE_MODEL],
                           inference_framework=WAKE_FRAMEWORK or 'onnx')
        target_key = list(model.models.keys())[0]
        display = WAKE_MODEL.replace('_', ' ').title()

    return model, target_key, display

# ── Main loop ───────────────────────────────────────────────
def main():
    import pyaudio

    log('Initialising openWakeWord...')
    model, target_key, wake_word_name = load_model()

    pa = pyaudio.PyAudio()

    # The INMP441 I2S mic is opened raw as the ALSA device "mirror_raw"
    # (scripts/setup-mic.sh, MIC_DEVICE in ecosystem.config.js) — all filtering
    # and gain happen in MicDSP. PortAudio's default input on a Pi has no
    # capture. See server/voice/mic.py.
    mic_index, mic_desc = resolve_input_device(pa, log)

    def open_stream(index):
        """Open at the hardware format (48 kHz S32, up to 2 channels — a dev
        machine's mic may be mono). Returns (stream, channels)."""
        info = (pa.get_device_info_by_index(index) if index is not None
                else pa.get_default_input_device_info())
        channels = max(1, min(2, int(info.get('maxInputChannels', 1) or 1)))
        stream = pa.open(
            rate=HW_RATE,
            channels=channels,
            format=pyaudio.paInt32,
            input=True,
            input_device_index=index,
            frames_per_buffer=HW_BLOCK
        )
        return stream, channels

    try:
        stream, channels = open_stream(mic_index)
    except Exception as e:
        if mic_index is None:
            raise
        # Usually "Device or resource busy" (another process has the mic) or a
        # missing sound card. Try the default input rather than crash-looping.
        log(f'Could not open mic {mic_desc} ({e}) — falling back to default input')
        mic_desc = 'system default'
        stream, channels = open_stream(None)
    mic = MicCapture(stream, channels)
    log(f'Microphone: {mic_desc} — {HW_RATE} Hz S32 x{channels}, '
        f'HPF {MIC_HPF_HZ:g} Hz, fixed gain {MIC_DSP_GAIN_DB:+g} dB')

    log(f'Say "{wake_word_name}" to activate the mirror '
        f'(model="{target_key}", threshold={DETECT_THRESHOLD})')

    _dbg_frames = 0
    _dbg_peak_amp = 0
    _dbg_peak_in = -200.0
    _dbg_peak_score = 0.0

    try:
        while True:
            frame = mic.read()

            scores = model.predict(frame)
            score = scores.get(target_key, max(scores.values()) if scores else 0.0)

            if WAKE_DEBUG:
                _dbg_frames += 1
                _dbg_peak_amp = max(_dbg_peak_amp, int(np.abs(frame.astype(np.int32)).max()))
                _dbg_peak_in = max(_dbg_peak_in, mic.dsp.in_dbfs)
                _dbg_peak_score = max(_dbg_peak_score, score)
                if _dbg_frames >= 25:  # ~2s @ 80ms/frame
                    # out_peak = post-gain int16 peak, in = loudest pre-gain
                    # block RMS (gain is fixed at MIC_DSP_GAIN_DB, so not shown)
                    log(f'[debug] out_peak={_dbg_peak_amp:5d}  in={_dbg_peak_in:6.1f} dBFS'
                        f'  wake_score={_dbg_peak_score:.2f}'
                        f'  (need >= {DETECT_THRESHOLD})')
                    _dbg_frames = 0
                    _dbg_peak_amp = 0
                    _dbg_peak_in = -200.0
                    _dbg_peak_score = 0.0

            if score >= DETECT_THRESHOLD:
                log(f'Wake word detected (score={score:.2f}) — recording {RECORD_SECONDS}s')

                # A failure in any step (record/transcribe/backend/speak) must
                # never crash the always-listening loop — log it, reset the UI
                # to idle, and keep listening.
                try:
                    # 1. Pause any playing media (Spotify)
                    pause_media()

                    # 2. Signal UI: listening state
                    notify_backend('listening')

                    # 3. Record audio
                    frames = record(mic, RECORD_SECONDS)
                    save_wav(frames, WAV_PATH)

                    # 4. Transcribe
                    log('Transcribing...')
                    notify_backend('transcribing')
                    text, error = transcribe(WAV_PATH)

                    if error:
                        log(f'STT unavailable: {error}')
                        notify_backend('speaking')
                        speak("Sorry, I can't reach the speech service right now.")
                    elif not text:
                        log('No speech detected, resuming')
                    else:
                        log(f'Heard: "{text}"')

                        # 5. Signal UI: thinking — show what was heard
                        notify_backend('thinking', text)

                        # 6. Send to Claude via backend
                        reply = send_to_backend(text)
                        if reply:
                            log(f'Reply: "{reply}"')
                            notify_backend('speaking')
                            speak(reply)
                except Exception as e:
                    log(f'Command pipeline error ({type(e).__name__}): {e}')

                # 7. Resume any media we paused, signal UI back to idle, and
                #    clear buffered audio so the recording tail and our own
                #    spoken reply can't re-trigger detection.
                resume_media()
                notify_backend('idle')
                drain_stream(mic)      # clear the backlog that piled up
                settle(mic, model)     # then let our own reply die out

    except KeyboardInterrupt:
        log('Shutting down')
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()

if __name__ == '__main__':
    main()
