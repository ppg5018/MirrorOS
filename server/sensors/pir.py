#!/usr/bin/env python3
"""
MirrorOS — PIR Motion Sensor (HC-SR501 on GPIO pin 11)
Turns screen ON when motion detected.
Turns screen OFF after SCREEN_TIMEOUT seconds of no movement.

Falls back to keyboard simulation if GPIO is unavailable.
"""

import time
import os
import sys
import requests

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

BACKEND_URL    = os.environ.get('MIRROR_BACKEND', 'http://localhost:3000')
SCREEN_TIMEOUT = int(os.environ.get('SCREEN_TIMEOUT', '120'))  # 2 min default
PIR_PIN        = 11

# Try GPIO (Orange Pi or RPi)
try:
    import OPi.GPIO as GPIO
    HAS_GPIO = True
    print('[pir] Using OPi.GPIO (Orange Pi)')
except ImportError:
    try:
        import RPi.GPIO as GPIO
        HAS_GPIO = True
        print('[pir] Using RPi.GPIO (Raspberry Pi)')
    except ImportError:
        HAS_GPIO = False
        print('[pir] No GPIO available — keyboard simulation mode', file=sys.stderr)

screen_on   = True
last_motion = time.time()

def ts():
    return time.strftime('%H:%M:%S')

def screen_control(on):
    global screen_on
    if screen_on == on:
        return
    screen_on = on

    if on:
        os.system('vcgencmd display_power 1 2>/dev/null || '
                  'xrandr --output HDMI-1 --auto 2>/dev/null || true')
        print(f'[{ts()}] [pir] Screen ON')
    else:
        os.system('vcgencmd display_power 0 2>/dev/null || '
                  'xrandr --output HDMI-1 --off 2>/dev/null || true')
        print(f'[{ts()}] [pir] Screen OFF')

    # Notify backend so UI can fade in/out
    try:
        requests.post(
            f'{BACKEND_URL}/api/sensors/motion',
            json={'motion': on, 'screenOn': on},
            timeout=2
        )
    except Exception:
        pass

def motion_detected(channel=None):
    global last_motion
    last_motion = time.time()
    print(f'[{ts()}] [pir] Motion detected')
    screen_control(True)

def run_simulation():
    print('[pir] Press Enter to simulate motion. Ctrl+C to quit.')
    while True:
        try:
            input()
            motion_detected()
        except KeyboardInterrupt:
            break

def main():
    global last_motion

    print(f'[pir] Starting — timeout={SCREEN_TIMEOUT}s, pin={PIR_PIN}')

    if not HAS_GPIO:
        run_simulation()
        return

    GPIO.setmode(GPIO.BOARD)
    GPIO.setup(PIR_PIN, GPIO.IN)
    GPIO.add_event_detect(PIR_PIN, GPIO.RISING,
                          callback=motion_detected, bouncetime=2000)

    print(f'[pir] Listening on GPIO pin {PIR_PIN}')

    try:
        while True:
            if screen_on and (time.time() - last_motion) > SCREEN_TIMEOUT:
                screen_control(False)
            time.sleep(5)
    except KeyboardInterrupt:
        print('[pir] Stopping')
    finally:
        if HAS_GPIO:
            GPIO.cleanup()

if __name__ == '__main__':
    main()
