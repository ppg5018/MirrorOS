#!/usr/bin/env python3
"""
MirrorOS — Microphone Level Tester
Run this to check your mic input before testing voice commands.

Usage: python3 scripts/test-mic.py
"""

import pyaudio
import struct
import math
import time

SAMPLE_RATE = 16000
CHUNK = 512

pa = pyaudio.PyAudio()

print('Available microphones:')
for i in range(pa.get_device_count()):
    info = pa.get_device_info_by_index(i)
    if info['maxInputChannels'] > 0:
        print(f"  [{i}] {info['name']}")

print()
print('Testing default microphone for 5 seconds...')
print('Speak normally and watch the level bar:')
print()

stream = pa.open(
    rate=SAMPLE_RATE,
    channels=1,
    format=pyaudio.paInt16,
    input=True,
    frames_per_buffer=CHUNK
)

start = time.time()
while time.time() - start < 5:
    data = stream.read(CHUNK, exception_on_overflow=False)
    shorts = struct.unpack(f'{len(data)//2}h', data)
    rms = math.sqrt(sum(s * s for s in shorts) / len(shorts))

    level  = min(int(rms / 100), 40)
    bar    = '█' * level + '░' * (40 - level)
    status = 'LOUD ' if rms > 2000 else 'OK   ' if rms > 500 else 'QUIET'
    print(f'\r[{bar}] {int(rms):5d}  {status}', end='', flush=True)

stream.stop_stream()
stream.close()
pa.terminate()

print('\n')
print('Results:')
print('  LOUD  (>2000) → good, voice commands will work well')
print('  OK    (>500)  → fine, default SILENCE_THRESHOLD=500 works')
print('  QUIET (<500)  → lower SILENCE_THRESHOLD in wakeword.py to 200')
print()
print('If bar barely moved at all:')
print('  - Check mic is plugged in and set as default input device')
print('  - macOS: System Preferences → Sound → Input')
