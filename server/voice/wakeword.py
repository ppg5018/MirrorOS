#!/usr/bin/env python3
"""
MirrorOS — Wake Word Detection (Day 7)
Always-listening loop using Porcupine.

On "Hey Mirror" detected:
  1. POST /api/voice/state { state: listening }  → UI glows teal
  2. Record 4 seconds of audio
  3. POST /api/voice/state { state: processing }  → UI shows transcript
  4. transcribe.py → text
  5. POST /api/voice        → Claude reply
  6. speak.py              → speaker output
  7. POST /api/voice/state { state: idle }

RAM:  ~40MB idle (Porcupine is a lightweight DNN)
CPU:  <5% on Orange Pi A53
"""

import os
import sys
import struct
import subprocess
import wave
import time
import json

import pvporcupine
import pyaudio
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
PORCUPINE_KEY   = os.environ.get('PORCUPINE_ACCESS_KEY', '')
BACKEND_URL     = os.environ.get('MIRROR_BACKEND', 'http://localhost:3000')
WAV_PATH        = '/tmp/voice_input.wav'
RECORD_SECONDS  = int(os.environ.get('RECORD_SECONDS', '8'))
SCRIPT_DIR      = os.path.dirname(os.path.abspath(__file__))

# Keyword: set WAKE_KEYWORD env var to any pvporcupine built-in keyword.
# Built-ins: alexa, computer, hey barista, hey google, hey siri, jarvis,
#            ok google, porcupine, terminator, bumblebee, americano, blueberry,
#            grapefruit, grasshopper, picovoice, porcupine, smart mirror, snowboy
# Default is 'picovoice' until a custom "hey mirror" .ppn model is trained.
WAKE_KEYWORD    = os.environ.get('WAKE_KEYWORD', 'jarvis')  # fallback built-in for testing

# Path to custom "Hey Mirror" .ppn model
# Supports both WAKE_WORD_PATH (brief spec) and KEYWORD_PATH (legacy)
KEYWORD_PATH    = os.environ.get('WAKE_WORD_PATH', '') or os.environ.get('KEYWORD_PATH', '')

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

# ── YouTube pause ───────────────────────────────────────────
def pause_media():
    """Signal the frontend to pause any playing media before STT."""
    try:
        requests.post(f'{BACKEND_URL}/api/media/pause', timeout=2)
    except Exception:
        pass  # Media pause is best-effort

# ── Audio helpers ───────────────────────────────────────────
def save_wav(frames, filename, frame_length, sample_rate):
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)        # 16-bit PCM
        wf.setframerate(sample_rate)
        wf.writeframes(b''.join(frames))

def record(stream, porcupine, seconds):
    import struct, math
    SILENCE_THRESHOLD   = int(os.environ.get('SILENCE_THRESHOLD', '500'))
    SILENCE_CHUNKS      = 30   # ~1 second of silence → stop early
    MIN_SPEAKING_CHUNKS = 10   # must speak for ~0.3s before early-stop kicks in

    frame_length = porcupine.frame_length
    total_frames = int(porcupine.sample_rate / frame_length * seconds)

    frames = []
    silent_chunks   = 0
    speaking_started = False

    log(f'Recording up to {seconds}s (silence threshold={SILENCE_THRESHOLD})...')

    for i in range(total_frames):
        data = stream.read(frame_length, exception_on_overflow=False)
        frames.append(data)

        shorts = struct.unpack_from(f'{frame_length}h', data)
        rms = math.sqrt(sum(s * s for s in shorts) / frame_length)

        if rms > SILENCE_THRESHOLD:
            speaking_started = True
            silent_chunks = 0
        elif speaking_started:
            silent_chunks += 1

        if speaking_started and silent_chunks > SILENCE_CHUNKS and i > MIN_SPEAKING_CHUNKS:
            log(f'Speech ended, stopping at chunk {i}/{total_frames}')
            break

    return frames

# ── Pipeline steps ──────────────────────────────────────────
def transcribe(wav_path):
    result = subprocess.run(
        ['python3', os.path.join(SCRIPT_DIR, 'transcribe.py'), wav_path],
        capture_output=True, text=True, timeout=30
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

# ── Main loop ───────────────────────────────────────────────
def main():
    if not PORCUPINE_KEY:
        log('ERROR: PORCUPINE_ACCESS_KEY not set in environment')
        sys.exit(1)

    log('Initialising Porcupine...')

    # Use custom "Hey Mirror" .ppn if available, else fall back to built-in
    if KEYWORD_PATH and os.path.exists(KEYWORD_PATH):
        log(f'Using custom wake word: {KEYWORD_PATH}')
        porcupine = pvporcupine.create(
            access_key=PORCUPINE_KEY,
            keyword_paths=[KEYWORD_PATH]
        )
        wake_word_name = 'Hey Mirror'
    else:
        if KEYWORD_PATH:
            log(f'WARNING: {KEYWORD_PATH} not found — falling back to built-in')
            log('Train custom wake word: see scripts/train-wakeword.md')
        log(f'Using built-in keyword: "{WAKE_KEYWORD}"')
        porcupine = pvporcupine.create(
            access_key=PORCUPINE_KEY,
            keywords=[WAKE_KEYWORD]
        )
        wake_word_name = WAKE_KEYWORD.title()

    pa = pyaudio.PyAudio()
    stream = pa.open(
        rate=porcupine.sample_rate,
        channels=1,
        format=pyaudio.paInt16,
        input=True,
        frames_per_buffer=porcupine.frame_length
    )

    log(f'Say "{wake_word_name}" to activate the mirror (sample_rate={porcupine.sample_rate})')

    try:
        while True:
            pcm_raw = stream.read(porcupine.frame_length, exception_on_overflow=False)
            pcm = struct.unpack_from('h' * porcupine.frame_length, pcm_raw)

            if porcupine.process(pcm) >= 0:
                log(f'Wake word detected — recording {RECORD_SECONDS}s')

                # 1. Pause any playing media (YouTube/Spotify)
                pause_media()

                # 2. Signal UI: listening state
                notify_backend('listening')

                # 3. Record audio
                frames = record(stream, porcupine, RECORD_SECONDS)
                save_wav(frames, WAV_PATH, porcupine.frame_length, porcupine.sample_rate)

                # 4. Transcribe
                log('Transcribing...')
                notify_backend('transcribing')
                text = transcribe(WAV_PATH)

                if not text:
                    log('No speech detected, resuming')
                    notify_backend('idle')
                    continue

                log(f'Heard: "{text}"')

                # 5. Signal UI: thinking — show what was heard in AI bar
                notify_backend('thinking', text)

                # 6. Send to Claude via backend
                try:
                    reply = send_to_backend(text)
                    if reply:
                        log(f'Reply: "{reply}"')
                        notify_backend('speaking')
                        speak(reply)
                except Exception as e:
                    log(f'Backend error: {e}')
                    notify_backend('idle')
                    continue

                # 7. Signal UI: back to idle
                notify_backend('idle')

    except KeyboardInterrupt:
        log('Shutting down')
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()
        porcupine.delete()

if __name__ == '__main__':
    main()
