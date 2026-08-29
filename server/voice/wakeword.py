#!/usr/bin/env python3
"""
MirrorOS — Wake Word Detection
Always-listening loop using openWakeWord (open-source, no cloud, no AccessKey).

On "Hey Mirror" detected:
  1. POST /api/voice/state { state: listening }  → UI glows teal
  2. Record up to RECORD_SECONDS of audio (stops early on silence)
  3. POST /api/voice/state { state: transcribing }
  4. transcribe.py → text
  5. POST /api/voice        → Claude reply
  6. speak.py              → speaker output
  7. POST /api/voice/state { state: idle }

Wake word resolution (first match wins):
  1. config/wakeword.json  →  { "name": "Hey Mirror", "file": "hey-mirror.onnx" }
       loads server/voice/wakewords/<file>   (custom model trained free on Colab)
  2. env WAKE_WORD_PATH    →  absolute path to a .onnx/.tflite model
  3. env WAKE_MODEL        →  a bundled pre-trained model name
       (hey_jarvis, hey_mycroft, hey_rhasspy, alexa)   — default: hey_jarvis

RAM:  ~80MB idle    CPU: low on Pi 3B (tflite framework recommended there)
"""

import os
import sys
import struct
import subprocess
import wave
import time
import json

import numpy as np
import openwakeword
from openwakeword.model import Model
import requests

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
# Detection cutoff. 0.5 is openWakeWord's default, but real utterances on the
# MacBook mic land ~0.44-0.47 while ambient noise stays <0.05, so 0.35 catches
# normal speech with wide margin. Tune per-mic via the WAKE_THRESHOLD env var
# (raise it toward 0.5 if you get false triggers).
DETECT_THRESHOLD = float(os.environ.get('WAKE_THRESHOLD', '0.35'))

# WAKE_DEBUG=1 → log live audio level + wake-word score every ~2s so you can
# self-test at your own pace and see whether your voice registers.
WAKE_DEBUG      = os.environ.get('WAKE_DEBUG', '') not in ('', '0', 'false', 'False')

# Fallback bundled model when no custom "Hey Mirror" file is present.
# Built-ins: hey_jarvis, hey_mycroft, hey_rhasspy, alexa
WAKE_MODEL      = os.environ.get('WAKE_MODEL', 'hey_jarvis')

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
        _model_file = _wakeword_cfg.get('file', '')
        if _model_file and not os.environ.get('WAKE_WORD_PATH'):
            os.environ['WAKE_WORD_PATH'] = os.path.normpath(
                os.path.join(SCRIPT_DIR, 'wakewords', _model_file)
            )
    except Exception:
        pass  # Malformed wakeword.json — fall through to env/built-in

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

# ── Audio helpers ───────────────────────────────────────────
def save_wav(frames, filename):
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)        # 16-bit PCM
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b''.join(frames))

def record(stream, seconds):
    import math
    SILENCE_THRESHOLD = int(os.environ.get('SILENCE_THRESHOLD', '500'))

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
        data = stream.read(FRAME_LENGTH, exception_on_overflow=False)
        frames.append(data)

        shorts = struct.unpack_from(f'{FRAME_LENGTH}h', data)
        rms = math.sqrt(sum(s * s for s in shorts) / FRAME_LENGTH)

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

# ── Pipeline steps ──────────────────────────────────────────
def transcribe(wav_path):
    result = subprocess.run(
        ['python3', os.path.join(SCRIPT_DIR, 'transcribe.py'), wav_path],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        log(f'transcribe stderr: {result.stderr.strip()}')
    return result.stdout.strip()

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
        framework = 'tflite' if MODEL_PATH.endswith('.tflite') else 'onnx'
        log(f'Using custom wake word: {MODEL_PATH} ({framework})')
        model = Model(wakeword_models=[MODEL_PATH], inference_framework=framework)
        target_key = os.path.splitext(os.path.basename(MODEL_PATH))[0]
        display = _cfg_name or 'Hey Mirror'
    else:
        if MODEL_PATH:
            log(f'WARNING: {MODEL_PATH} not found — falling back to built-in "{WAKE_MODEL}"')
            log('Train a free custom "Hey Mirror" model: https://github.com/dscripka/openWakeWord')
        log(f'Using built-in model: "{WAKE_MODEL}"')
        model = Model(wakeword_models=[WAKE_MODEL], inference_framework='onnx')
        target_key = list(model.models.keys())[0]
        display = WAKE_MODEL.replace('_', ' ').title()

    return model, target_key, display

# ── Main loop ───────────────────────────────────────────────
def main():
    import pyaudio

    log('Initialising openWakeWord...')
    model, target_key, wake_word_name = load_model()

    pa = pyaudio.PyAudio()
    stream = pa.open(
        rate=SAMPLE_RATE,
        channels=1,
        format=pyaudio.paInt16,
        input=True,
        frames_per_buffer=FRAME_LENGTH
    )

    log(f'Say "{wake_word_name}" to activate the mirror '
        f'(model="{target_key}", threshold={DETECT_THRESHOLD})')

    _dbg_frames = 0
    _dbg_peak_amp = 0
    _dbg_peak_score = 0.0

    try:
        while True:
            pcm_raw = stream.read(FRAME_LENGTH, exception_on_overflow=False)
            frame = np.frombuffer(pcm_raw, dtype=np.int16)

            scores = model.predict(frame)
            score = scores.get(target_key, max(scores.values()) if scores else 0.0)

            if WAKE_DEBUG:
                _dbg_frames += 1
                _dbg_peak_amp = max(_dbg_peak_amp, int(np.abs(frame).max()))
                _dbg_peak_score = max(_dbg_peak_score, score)
                if _dbg_frames >= 25:  # ~2s @ 80ms/frame
                    log(f'[debug] mic_peak={_dbg_peak_amp:5d}  wake_score={_dbg_peak_score:.2f}'
                        f'  (need >= {DETECT_THRESHOLD})')
                    _dbg_frames = 0
                    _dbg_peak_amp = 0
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
                    frames = record(stream, RECORD_SECONDS)
                    save_wav(frames, WAV_PATH)

                    # 4. Transcribe
                    log('Transcribing...')
                    notify_backend('transcribing')
                    text = transcribe(WAV_PATH)

                    if not text:
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
                #    clear buffered audio so the recording tail can't
                #    re-trigger detection.
                resume_media()
                notify_backend('idle')
                model.reset()

    except KeyboardInterrupt:
        log('Shutting down')
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()

if __name__ == '__main__':
    main()
