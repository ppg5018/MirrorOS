#!/usr/bin/env python3
"""
MirrorOS — Speech-to-Text

One engine: Sarvam Saarika — Hinglish/Indian-accent aware, cloud.
There is deliberately no offline fallback (a local engine is too heavy for the
Pi's RAM). Without SARVAM_API_KEY the mirror cannot hear commands.

Sarvam config (env / .env):
  SARVAM_API_KEY     required
  SARVAM_STT_MODEL   default: saarika:v2.5
  SARVAM_STT_LANG    default: en-IN   (use 'unknown' to auto-detect Hindi etc.)

Usage: python3 transcribe.py /tmp/voice_input.wav
Output: transcribed text on stdout (single line, no trailing newline)
Exit codes:
  0  success (stdout may be empty — the user said nothing)
  1  usage error
  3  STT unavailable (no SARVAM_API_KEY, or the Sarvam request failed)
"""

import sys
import os
import re
import warnings
warnings.filterwarnings('ignore')


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

def _env(name, default=None):
    """os.environ.get, but an empty/whitespace value counts as unset.

    PM2 env blocks and .env lines like `SARVAM_STT_LANG=` produce empty
    strings; sending those to Sarvam (e.g. language_code='') gets a 400,
    so treat them as missing and use the default instead.
    """
    v = os.environ.get(name)
    v = v.strip() if isinstance(v, str) else v
    return v if v else default


SARVAM_URL = 'https://api.sarvam.ai/speech-to-text'
STT_UNAVAILABLE = 3


class STTUnavailable(Exception):
    """Sarvam could not be used — distinct from 'heard nothing'."""


def _clean(text):
    """Strip bracketed non-speech tags and collapse whitespace."""
    text = re.sub(r'\[.*?\]', '', text)      # [BLANK_AUDIO], etc.
    text = re.sub(r'\(.*?\)', '', text)      # (inaudible), etc.
    text = re.sub(r'\s+', ' ', text)
    text = text.strip(' .,').strip()
    return text if len(text) >= 3 else ''


def boost_audio(wav_path, gain=2.0):
    """Boost quiet audio in place before the Sarvam upload.

    The INMP441 mic records quiet; a low-RMS clip transcribes badly or empty.
    """
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


def transcribe_sarvam(wav_path, key):
    """Transcribe via Sarvam Saarika.
    Returns the transcript string (may be ''); raises STTUnavailable on
    any request/HTTP/response failure."""
    boost_audio(wav_path)

    import requests

    try:
        with open(wav_path, 'rb') as f:
            r = requests.post(
                SARVAM_URL,
                headers={'api-subscription-key': key},
                files={'file': ('audio.wav', f, 'audio/wav')},
                data={
                    'model': _env('SARVAM_STT_MODEL', 'saarika:v2.5'),
                    'language_code': _env('SARVAM_STT_LANG', 'en-IN'),
                },
                timeout=30
            )
    except Exception as e:
        raise STTUnavailable(f'Sarvam request error: {e}')

    if r.status_code != 200:
        raise STTUnavailable(f'Sarvam STT {r.status_code}: {r.text[:200]}')

    try:
        transcript = (r.json() or {}).get('transcript') or ''
    except ValueError as e:
        raise STTUnavailable(f'Sarvam returned invalid JSON: {e}')

    print(f'[transcribe] Sarvam transcript: "{transcript}"', file=sys.stderr)
    return transcript.strip()


def transcribe(wav_path):
    """Return the cleaned transcript ('' if the file is missing or nothing
    was said). Raises STTUnavailable when Sarvam can't be used."""
    if not os.path.exists(wav_path):
        print(f'[transcribe] ERROR: file not found: {wav_path}', file=sys.stderr)
        return ''

    key = _env('SARVAM_API_KEY')
    if not key:
        raise STTUnavailable('no SARVAM_API_KEY — STT unavailable')

    return _clean(transcribe_sarvam(wav_path, key))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: transcribe.py <wav_file>', file=sys.stderr)
        sys.exit(1)

    try:
        output = transcribe(sys.argv[1])
    except STTUnavailable as e:
        print(f'[transcribe] {e}', file=sys.stderr)
        sys.exit(STT_UNAVAILABLE)

    print(output, end='')
