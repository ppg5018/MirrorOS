#!/bin/bash
# MirrorOS — Voice pipeline setup
# Run once on the Orange Pi / Raspberry Pi after cloning the repo.
# Usage: bash scripts/setup-voice.sh

set -e
echo "=== MirrorOS Voice Setup ==="

# ── System packages ─────────────────────────────────────────
echo "[1/4] Installing system packages..."
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
echo "[2/4] Installing Python packages..."
pip3 install --upgrade pip
pip3 install -r requirements.txt

# ── Download Whisper Tiny model ──────────────────────────────
echo "[3/4] Pre-downloading Whisper Tiny model..."
python3 -c "import whisper; whisper.load_model('tiny'); print('Whisper tiny: OK')"

# ── Test audio device ────────────────────────────────────────
echo "[4/4] Checking audio devices..."
arecord -l 2>/dev/null || echo "  WARNING: No recording devices found. Check USB mic is connected."
aplay  -l 2>/dev/null || echo "  WARNING: No playback devices found."

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Add PORCUPINE_ACCESS_KEY to your .env file"
echo "     Get a free key at: https://console.picovoice.ai"
echo ""
echo "  2. (Optional) Train a custom 'Hey Mirror' wake word:"
echo "     https://console.picovoice.ai/ppn"
echo "     Then set KEYWORD_PATH=/path/to/hey-mirror.ppn in .env"
echo ""
echo "  3. Set default wake keyword (built-in) in .env:"
echo "     WAKE_KEYWORD=picovoice"
echo ""
echo "  4. Start the voice process:"
echo "     pm2 start ecosystem.config.js"
echo "     OR for testing: python3 server/voice/wakeword.py"
