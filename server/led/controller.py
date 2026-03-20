#!/usr/bin/env python3
"""
MirrorOS — WS2812B LED Strip Controller
Controls addressable LED strip on GPIO 18.

Usage: python3 controller.py <mode> [brightness]
Modes: warm, cool, night, party, music_sync, red, green, blue, off

Falls back to simulation mode if rpi_ws281x is not available
(Mac dev machine / no LED strip connected).
"""

import sys
import os
import time

# Try rpi_ws281x (Orange Pi / RPi with LEDs wired)
try:
    from rpi_ws281x import PixelStrip, Color
    HAS_LED = True
except ImportError:
    HAS_LED = False
    print('[led] rpi_ws281x not available — simulation mode', file=sys.stderr)

# ── Strip config ─────────────────────────────────────────────
LED_COUNT      = 60       # Number of LEDs in your strip
LED_PIN        = 18       # GPIO pin (must be PWM capable)
LED_FREQ_HZ    = 800000
LED_DMA        = 10
LED_BRIGHTNESS = 200      # 0–255 default
LED_INVERT     = False
LED_CHANNEL    = 0

if HAS_LED:
    strip = PixelStrip(
        LED_COUNT, LED_PIN, LED_FREQ_HZ,
        LED_DMA, LED_INVERT, LED_BRIGHTNESS, LED_CHANNEL
    )
    strip.begin()

# ── Helpers ──────────────────────────────────────────────────
def set_all(r, g, b):
    if not HAS_LED:
        print(f'[led] SIM: All {LED_COUNT} LEDs → rgb({r},{g},{b})')
        return
    for i in range(strip.numPixels()):
        strip.setPixelColor(i, Color(r, g, b))
    strip.show()

def set_brightness(pct):
    pct = max(0, min(100, int(pct)))
    val = int(pct * 2.55)
    if HAS_LED:
        strip.setBrightness(val)
        strip.show()
    print(f'[led] Brightness: {pct}%')

# ── Modes ────────────────────────────────────────────────────
def warm():
    set_all(255, 180, 100)

def cool():
    set_all(200, 220, 255)

def night():
    set_all(0, 30, 10)   # Very dim green — easy on eyes

def red():
    set_all(255, 0, 0)

def green():
    set_all(0, 255, 0)

def blue():
    set_all(0, 0, 255)

def off():
    set_all(0, 0, 0)

def party():
    if not HAS_LED:
        print('[led] SIM: Party mode — cycling colors')
        return
    colors = [
        (255, 0,   0),
        (0,   255, 0),
        (0,   0,   255),
        (255, 255, 0),
        (0,   255, 255),
        (255, 0,   255),
    ]
    for _ in range(20):
        for i in range(strip.numPixels()):
            r, g, b = colors[i % len(colors)]
            strip.setPixelColor(i, Color(r, g, b))
        strip.show()
        time.sleep(0.1)

def music_sync():
    """Slow teal pulse — placeholder until audio input is wired."""
    if not HAS_LED:
        print('[led] SIM: Music sync mode — teal pulse')
        return
    for brightness in list(range(50, 255, 5)) + list(range(255, 50, -5)):
        set_all(0, brightness, int(brightness * 0.8))
        time.sleep(0.02)

# ── Mode map ─────────────────────────────────────────────────
MODES = {
    'warm':       warm,
    'cool':       cool,
    'night':      night,
    'party':      party,
    'music_sync': music_sync,
    'red':        red,
    'green':      green,
    'blue':       blue,
    'off':        off,
}

# ── Entry point ──────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: controller.py <mode> [brightness]')
        print(f'Modes: {", ".join(MODES.keys())}')
        sys.exit(1)

    mode       = sys.argv[1].lower()
    brightness = int(sys.argv[2]) if len(sys.argv) > 2 else None

    if brightness is not None:
        set_brightness(brightness)

    if mode in MODES:
        MODES[mode]()
        print(f'[led] Mode set: {mode}')
    else:
        print(f'[led] Unknown mode: {mode}')
        print(f'Available: {", ".join(MODES.keys())}')
        sys.exit(1)
