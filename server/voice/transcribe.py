#!/usr/bin/env python3
"""
MirrorOS — Whisper Base STT
Transcribes a WAV file to text.

Model sizes:
  tiny  → ~75MB disk,  ~200-250MB RAM spike (~1-2s)
  base  → ~150MB disk, ~350MB RAM spike (~2-3s)  ← current

Language detection:
  Set WHISPER_LANG=en  for English-only (faster)
  Set WHISPER_LANG=hi  for Hindi-only
  Unset (default)      for auto-detect — handles Hinglish naturally

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

LANGUAGE = os.environ.get('WHISPER_LANG', None)  # None = auto-detect


def boost_audio(wav_path, gain=2.0):
    """Boost quiet audio before transcribing."""
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


def transcribe(wav_path):
    import whisper

    if not os.path.exists(wav_path):
        print(f'[transcribe] ERROR: file not found: {wav_path}', file=sys.stderr)
        return ''

    boost_audio(wav_path)

    model = whisper.load_model('base')

    result = model.transcribe(
        wav_path,
        language=LANGUAGE,              # None = auto-detect (Hinglish friendly)
        fp16=False,                     # No GPU on Orange Pi / RPi
        verbose=False,
        temperature=0,                  # Deterministic — less hallucination
        best_of=1,
        beam_size=3,                    # Better accuracy, still fast
        condition_on_previous_text=False,  # Prevents looping artifacts
        initial_prompt="Hey Mirror",    # Primes Whisper for mirror context
        no_speech_threshold=0.6,
        logprob_threshold=-1.0,
        compression_ratio_threshold=2.4,
    )

    detected_lang = result.get('language', 'en')
    print(f'[transcribe] Detected language: {detected_lang}', file=sys.stderr)

    text = result.get('text', '').strip()

    # Remove Whisper artifacts: [BLANK_AUDIO], (inaudible), etc.
    text = re.sub(r'\[.*?\]', '', text)
    text = re.sub(r'\(.*?\)', '', text)
    text = re.sub(r'\s+', ' ', text)
    text = text.strip(' .,')
    text = text.strip()

    # Unload model from RAM immediately (critical for Orange Pi 1GB)
    del model

    if len(text) < 3:
        return ''

    return text


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: transcribe.py <wav_file>', file=sys.stderr)
        sys.exit(1)

    output = transcribe(sys.argv[1])
    print(output, end='')
