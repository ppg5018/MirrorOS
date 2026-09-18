#!/usr/bin/env python3
"""
MirrorOS — Microphone Level Tester
Run this to check your mic input before testing voice commands.

Usage: python3 scripts/test-mic.py
"""

import os
import sys
import pyaudio
import struct
import math
import time

# Same device choice as the voice loop (MIC_DEVICE env → "mirror_mic" → default)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server', 'voice'))
from mic import resolve_input_device

SAMPLE_RATE = 16000
CHUNK = 512

pa = pyaudio.PyAudio()

print('Available microphones:')
for i in range(pa.get_device_count()):
    info = pa.get_device_info_by_index(i)
    if info['maxInputChannels'] > 0:
        print(f"  [{i}] {info['name']}")

mic_index, mic_desc = resolve_input_device(pa)

print()
print(f'Testing microphone {mic_desc} for 5 seconds...')
print('Speak normally and watch the level bar:')
print()

try:
    stream = pa.open(
        rate=SAMPLE_RATE,
        channels=1,
        format=pyaudio.paInt16,
        input=True,
        input_device_index=mic_index,
        frames_per_buffer=CHUNK
    )
except Exception as e:
    print(f'Could not open the microphone: {e}')
    print('If it says "busy", the voice loop has the mic — run: pm2 stop mirroros-voice')
    pa.terminate()
    sys.exit(1)

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
print('  LOUD  (>2000) → mic is clearly picking up your voice')
print('  OK    (>500)  → fine')
print('  QUIET (<500)  → Pi INMP441: this reads mirror_mic at a fixed MIC_GAIN_DB (12 dB);')
print('                  try sudo MIC_GAIN_DB=18 bash scripts/setup-mic.sh')
print('Note: the voice loop does NOT use these levels — it reads mirror_raw and applies')
print('its own filter + AGC. For live voice-loop levels run it with WAKE_DEBUG=1.')
print()
print('If bar barely moved at all:')
print('  - Pi INMP441: check SD → pin 38, L/R → pin 9, then run sudo bash scripts/setup-mic.sh')
print('  - USB mic: check it is plugged in, or set MIC_DEVICE to its name (listed above)')
print('  - macOS: System Preferences → Sound → Input')
