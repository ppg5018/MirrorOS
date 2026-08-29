#!/usr/bin/env python3
"""
MirrorOS — TTS (Text-to-Speech)

Priority chain:
  1. Sarvam Bulbul  — natural Indian voices, cloud (needs SARVAM_API_KEY)
  2. Piper          — neural, offline, natural (macOS + Raspberry Pi)
  3. pyttsx3        — robotic espeak, last resort

Sarvam config (env / .env):
  SARVAM_API_KEY        required to use Sarvam
  SARVAM_TTS_MODEL      default: bulbul:v2   (or bulbul:v3)
  SARVAM_TTS_SPEAKER    default: anushka     (v2 female: anushka/manisha/vidya/arya;
                                              v2 male: abhilash/karun/hitesh)
  SARVAM_TTS_LANG       default: en-IN
  SARVAM_TTS_PACE       default: 1.0

Usage: python3 speak.py "Your message here"
"""

import sys
import os
import base64
import subprocess
import tempfile
import shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_env():
    """Load ../../.env so this works when run standalone (not just via wakeword.py)."""
    env_path = os.path.normpath(os.path.join(SCRIPT_DIR, '../../.env'))
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    os.environ.setdefault(k.strip(), v.strip())
_load_env()

# Piper voice — env override, else the bundled default.
DEFAULT_VOICE = os.path.join(SCRIPT_DIR, 'piper-voices', 'en_US-amy-medium.onnx')
PIPER_VOICE   = os.environ.get('PIPER_VOICE', DEFAULT_VOICE)
LENGTH_SCALE  = os.environ.get('PIPER_LENGTH_SCALE', '1.0')

SARVAM_URL    = 'https://api.sarvam.ai/text-to-speech'


def _play(wav_path):
    """Play a WAV through the platform's audio player."""
    if sys.platform == 'darwin':
        subprocess.run(['afplay', wav_path], check=False)
        return
    # Linux / Raspberry Pi
    player = (shutil.which('aplay') or shutil.which('paplay')
              or shutil.which('play'))
    if player:
        subprocess.run([player, wav_path], check=False)
    else:
        print('[speak] no audio player found (install alsa-utils for aplay)',
              file=sys.stderr)


def _play_bytes(wav_bytes):
    tf = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    path = tf.name
    tf.write(wav_bytes)
    tf.close()
    try:
        _play(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def speak_sarvam(text):
    """Synthesize with Sarvam Bulbul and play it. Returns True on success."""
    key = os.environ.get('SARVAM_API_KEY')
    if not key:
        return False

    import requests

    body = {
        'text': text[:1400],  # v2 caps at 1500 chars; mirror replies are short
        'target_language_code': os.environ.get('SARVAM_TTS_LANG', 'en-IN'),
        'model': os.environ.get('SARVAM_TTS_MODEL', 'bulbul:v2'),
        'speaker': os.environ.get('SARVAM_TTS_SPEAKER', 'anushka'),
        'speech_sample_rate': 22050,
        'pace': float(os.environ.get('SARVAM_TTS_PACE', '1.0')),
    }

    try:
        r = requests.post(
            SARVAM_URL,
            headers={'api-subscription-key': key,
                     'Content-Type': 'application/json'},
            json=body, timeout=30
        )
    except Exception as e:
        print(f'[speak] Sarvam request error: {e}', file=sys.stderr)
        return False

    if r.status_code != 200:
        print(f'[speak] Sarvam TTS {r.status_code}: {r.text[:200]}',
              file=sys.stderr)
        return False

    audios = (r.json() or {}).get('audios') or []
    if not audios:
        print('[speak] Sarvam returned no audio', file=sys.stderr)
        return False

    try:
        _play_bytes(base64.b64decode(audios[0]))
        return True
    except Exception as e:
        print(f'[speak] Sarvam audio decode/play error: {e}', file=sys.stderr)
        return False


def speak_piper(text):
    """Synthesize with Piper and play it. Returns True on success."""
    if not os.path.exists(PIPER_VOICE):
        return False

    tf = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    wav_path = tf.name
    tf.close()

    try:
        proc = subprocess.run(
            [sys.executable, '-m', 'piper',
             '-m', PIPER_VOICE,
             '--length-scale', LENGTH_SCALE,
             '-f', wav_path],
            input=text, text=True, capture_output=True, timeout=30
        )
        if proc.returncode != 0 or not os.path.exists(wav_path) \
                or os.path.getsize(wav_path) == 0:
            print(f'[speak] Piper failed: {proc.stderr.strip()[:200]}',
                  file=sys.stderr)
            return False
        _play(wav_path)
        return True
    except Exception as e:
        print(f'[speak] Piper error: {e}', file=sys.stderr)
        return False
    finally:
        try:
            os.remove(wav_path)
        except OSError:
            pass


def speak_fallback(text):
    """Last-resort robotic TTS if Sarvam and Piper are unavailable."""
    try:
        import pyttsx3
        engine = pyttsx3.init()
        engine.setProperty('rate', 165)
        engine.setProperty('volume', 0.9)
        engine.say(text)
        engine.runAndWait()
        engine.stop()
    except Exception as e:
        print(f'[speak] fallback TTS failed: {e}', file=sys.stderr)


def speak(text):
    text = (text or '').strip()
    if not text:
        return

    print(f'Speaking: {text[:60]}...', flush=True)

    if speak_sarvam(text):
        return
    if speak_piper(text):
        return
    print('[speak] falling back to pyttsx3', file=sys.stderr)
    speak_fallback(text)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: speak.py <text>', file=sys.stderr)
        sys.exit(1)

    speak(' '.join(sys.argv[1:]))
