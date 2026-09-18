#!/bin/bash
# MirrorOS — Voice pipeline setup
# Run once on the Orange Pi / Raspberry Pi after cloning the repo.
# Usage: bash scripts/setup-voice.sh

set -e
# Run from the project folder (on the Pi: /home/mira/Desktop/MirrorOs) no matter
# where this script is called from — requirements.txt is loaded by relative path.
cd "$(dirname "$0")/.."
echo "=== MirrorOS Voice Setup ==="

# ── System packages ─────────────────────────────────────────
echo "[1/3] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y \
  python3-pip \
  python3-dev \
  portaudio19-dev \
  ffmpeg \
  espeak \
  espeak-ng \
  libespeak-ng-dev \
  alsa-utils

# ── Python packages ─────────────────────────────────────────
echo "[2/3] Installing Python packages..."
# Pi OS (Bookworm+) marks the system Python "externally managed" (PEP 668) and
# refuses plain pip installs. The mirror runs on system python3 under PM2, so
# install there explicitly (as your user, not sudo — it lands in ~/.local).
PIP_FLAGS=()
if python3 -c 'import os, sys, sysconfig; sys.exit(0 if sys.prefix == sys.base_prefix and os.path.exists(os.path.join(sysconfig.get_path("stdlib"), "EXTERNALLY-MANAGED")) else 1)'; then
  PIP_FLAGS+=(--break-system-packages)
fi
pip3 install "${PIP_FLAGS[@]}" -r requirements.txt
# openwakeword hard-requires tflite-runtime on Linux, which has no wheels for
# Python 3.12+ — install it without deps (its real deps are in requirements.txt).
pip3 install "${PIP_FLAGS[@]}" --no-deps "openwakeword>=0.6.0"
python3 -c "import openwakeword; print('  openwakeword: OK')"

# ── Test audio device ────────────────────────────────────────
echo "[3/3] Checking audio devices..."
arecord -l 2>/dev/null || echo "  WARNING: No recording devices found. For the INMP441 mic run: sudo bash scripts/setup-mic.sh"
aplay  -l 2>/dev/null || echo "  WARNING: No playback devices found."

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. INMP441 mic:  sudo bash scripts/setup-mic.sh   (run, reboot, run again)"
echo "  2. Start / restart the voice loop:"
echo "       pm2 restart ecosystem.config.js --only mirroros-voice --update-env"
echo "     OR for testing:  python3 server/voice/wakeword.py"
echo "  Wake word is \"Hey Jarvis\" by default (WAKE_MODEL in ecosystem.config.js)."
