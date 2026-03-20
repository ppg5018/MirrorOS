#!/usr/bin/env python3
"""
MirrorOS — TTS (Text-to-Speech)
Uses pyttsx3 with rate=165, volume=0.9.
Prefers Indian English voice if available.

Usage: python3 speak.py "Your message here"
RAM:   ~20MB (pyttsx3 uses espeak/festival on Linux)
"""

import sys
import pyttsx3

RATE   = 165    # words per minute — natural conversational pace
VOLUME = 0.9    # 0.0–1.0

def speak(text):
    if not text:
        return

    engine = pyttsx3.init()
    engine.setProperty('rate', RATE)
    engine.setProperty('volume', VOLUME)

    voices = engine.getProperty('voices')

    indian_voice  = None
    english_voice = None

    for voice in voices:
        vid   = voice.id.lower()
        vname = voice.name.lower()
        # Prefer Indian English first
        if 'india' in vid or 'india' in vname:
            indian_voice = voice.id
        elif 'english' in vname or 'en_' in vid or 'en-' in vid or 'en_us' in vid:
            if english_voice is None:
                english_voice = voice.id

    if indian_voice:
        engine.setProperty('voice', indian_voice)
    elif english_voice:
        engine.setProperty('voice', english_voice)
    # else: use system default

    print(f'Speaking: {text[:60]}...', flush=True)
    engine.say(text)
    engine.runAndWait()
    engine.stop()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: speak.py <text>', file=sys.stderr)
        sys.exit(1)

    speak(' '.join(sys.argv[1:]))
