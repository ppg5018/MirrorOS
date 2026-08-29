#!/usr/bin/env python3
"""
MirrorOS — Speech-to-Text

Priority chain:
  1. Sarvam Saarika — Hinglish/Indian-accent aware, cloud (needs SARVAM_API_KEY)
  2. Whisper 'base' — offline fallback

Sarvam config (env / .env):
  SARVAM_API_KEY     required to use Sarvam
  SARVAM_STT_MODEL   default: saarika:v2.5
  SARVAM_STT_LANG    default: en-IN   (use 'unknown' to auto-detect Hindi etc.)

Whisper language (fallback only):
  WHISPER_LANG=en / hi / unset (auto-detect)

Usage: python3 transcribe.py /tmp/voice_input.wav
Output: transcribed text on stdout (single line, no trailing newline)
"""

import sys
import os
import re
import ssl
import warnings
warnings.filterwarnings('ignore')

# Fix SSL cert verification on macOS (not needed on Orange Pi/Linux)
if sys.platform == 'darwin':
    ssl._create_default_https_context = ssl._create_unverified_context


def _load_env():
    env_path = os.path.normpath(os.path.join(os.path.dirname(__file__), '../../.env'))
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    os.environ.setdefault(k.strip(), v.strip())
_load_env()

LANGUAGE     = os.environ.get('WHISPER_LANG', None)  # None = auto-detect
SARVAM_URL   = 'https://api.sarvam.ai/speech-to-text'


def _clean(text):
    """Strip Whisper artifacts and collapse whitespace."""
    text = re.sub(r'\[.*?\]', '', text)      # [BLANK_AUDIO], etc.
    text = re.sub(r'\(.*?\)', '', text)      # (inaudible), etc.
    text = re.sub(r'\s+', ' ', text)
    text = text.strip(' .,').strip()
    return text if len(text) >= 3 else ''


def transcribe_sarvam(wav_path):
    """Transcribe via Sarvam Saarika.
    Returns the transcript string on success (may be ''), or None on failure
    (so the caller can fall back to Whisper)."""
    key = os.environ.get('SARVAM_API_KEY')
    if not key:
        return None

    import requests

    try:
        with open(wav_path, 'rb') as f:
            r = requests.post(
                SARVAM_URL,
                headers={'api-subscription-key': key},
                files={'file': ('audio.wav', f, 'audio/wav')},
                data={
                    'model': os.environ.get('SARVAM_STT_MODEL', 'saarika:v2.5'),
                    'language_code': os.environ.get('SARVAM_STT_LANG', 'en-IN'),
                },
                timeout=30
            )
    except Exception as e:
        print(f'[transcribe] Sarvam request error: {e}', file=sys.stderr)
        return None

    if r.status_code != 200:
        print(f'[transcribe] Sarvam STT {r.status_code}: {r.text[:200]}',
              file=sys.stderr)
        return None

    transcript = (r.json() or {}).get('transcript', '')
    print(f'[transcribe] Sarvam transcript: "{transcript}"', file=sys.stderr)
    return transcript.strip()


def boost_audio(wav_path, gain=2.0):
    """Boost quiet audio before transcribing (Whisper fallback path)."""
    try:
        import numpy as np
        import soundfile as sf
        data, samplerate = sf.read(wav_path)
        rms = float(np.sqrt(np.mean(data**2)))
        print(f'[transcribe] Audio RMS: {rms:.4f}', file=sys.stderr)
        if rms < 0.01:
            data = np.clip(data * gain, -1.0, 1.0)
            sf.write(wav_path, data, samplerate)
            print(f'[transcribe] Audio boosted {gain}x', file=sys.stderr)
    except Exception as e:
        print(f'[transcribe] boost_audio skipped: {e}', file=sys.stderr)


def transcribe_whisper(wav_path):
    import whisper

    boost_audio(wav_path)
    model = whisper.load_model('base')

    result = model.transcribe(
        wav_path,
        language=LANGUAGE,              # None = auto-detect (Hinglish friendly)
        fp16=False,                     # No GPU on Orange Pi / RPi
        verbose=None,                   # None (not False) — silences Whisper's
                                        # "Detected language: X" stdout line that
                                        # was leaking into the transcribed text
        temperature=0,
        best_of=1,
        beam_size=3,
        condition_on_previous_text=False,
        initial_prompt="Hey Mirror",
        no_speech_threshold=0.6,
        logprob_threshold=-1.0,
        compression_ratio_threshold=2.4,
    )

    text = result.get('text', '').strip()
    del model                          # free RAM immediately (Pi constraint)
    return text


def transcribe(wav_path):
    if not os.path.exists(wav_path):
        print(f'[transcribe] ERROR: file not found: {wav_path}', file=sys.stderr)
        return ''

    # 1. Sarvam (if configured). None => failed, fall back to Whisper.
    if os.environ.get('SARVAM_API_KEY'):
        text = transcribe_sarvam(wav_path)
        if text is not None:
            return _clean(text)
        print('[transcribe] Sarvam failed — falling back to Whisper',
              file=sys.stderr)

    # 2. Whisper fallback
    return _clean(transcribe_whisper(wav_path))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: transcribe.py <wav_file>', file=sys.stderr)
        sys.exit(1)

    output = transcribe(sys.argv[1])
    print(output, end='')
