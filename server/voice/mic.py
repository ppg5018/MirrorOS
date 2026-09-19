"""
MirrorOS — microphone selection, shared by wakeword.py and the mic test scripts.

On the Pi scripts/setup-mic.sh exposes the INMP441 I2S mic as two ALSA devices:
"mirror_raw" (untouched 48 kHz / 32-bit stereo — wakeword.py opens this via
MIC_DEVICE and does its own filtering + fixed gain) and "mirror_mic" (the same stream
with a fixed gain, converted to whatever the caller asks for — used by the test
tools).
PortAudio's *default* input on a Pi is usually an HDMI/headphone card with no
capture at all, so the mic has to be picked by name.

Resolution order:
  1. MIC_DEVICE env — a PortAudio input name: exact match first, then a
     case-insensitive substring. If it is missing we warn and use the default.
  2. "mirror_mic" if it exists (exact name only — the helper devices
     mirror_mic_hw / mirror_mic_gain must never be picked by accident).
  3. PortAudio's default input (Mac dev machine, USB mic).
"""

import os

DEFAULT_DEVICE = 'mirror_mic'


def list_input_devices(pa):
    """[(index, name)] for every PortAudio device that can record."""
    devices = []
    for i in range(pa.get_device_count()):
        try:
            info = pa.get_device_info_by_index(i)
        except Exception:
            continue  # a device that vanished mid-scan must not break startup
        if int(info.get('maxInputChannels', 0) or 0) > 0:
            devices.append((i, str(info.get('name', ''))))
    return devices


def match_device(devices, name, allow_substring=True):
    """Index of the device called `name` in [(index, name)], else None."""
    wanted = (name or '').strip().lower()
    if not wanted:
        return None
    for index, dev_name in devices:
        if dev_name.strip().lower() == wanted:
            return index
    if allow_substring:
        for index, dev_name in devices:
            if wanted in dev_name.lower():
                return index
    return None


def resolve_input_device(pa, log=print):
    """Pick the recording device. Returns (index or None, description).

    None means "PortAudio default" — pass it straight to pa.open() as
    input_device_index, which treats None as the default input.
    """
    devices = list_input_devices(pa)
    requested = os.environ.get('MIC_DEVICE', '').strip()

    if requested:
        index = match_device(devices, requested)
        if index is not None:
            return index, f'"{requested}" (MIC_DEVICE, device {index})'
        names = ', '.join(n for _, n in devices) or 'none'
        log(f'WARNING: MIC_DEVICE="{requested}" not found — using the default input. '
            f'Inputs available: {names}. On the Pi, run: sudo bash scripts/setup-mic.sh')
        return None, 'system default'

    index = match_device(devices, DEFAULT_DEVICE, allow_substring=False)
    if index is not None:
        return index, f'"{DEFAULT_DEVICE}" (device {index})'
    return None, 'system default'
