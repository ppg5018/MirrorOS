#!/bin/bash
# MirrorOS — INMP441 I2S microphone setup (Raspberry Pi 4)
#
# Wiring (physical header pin numbers):
#   INMP441 VDD → pin 1  (3.3V)       INMP441 SCK → pin 12 (GPIO18, I2S clock)
#   INMP441 GND → pin 6  (GND)        INMP441 WS  → pin 35 (GPIO19, I2S word select)
#   INMP441 L/R → pin 9  (GND)        INMP441 SD  → pin 38 (GPIO20, I2S data in)
#
# Run it twice:
#   sudo bash scripts/setup-mic.sh      ← 1st run: enables I2S, installs ALSA config
#   sudo reboot
#   sudo bash scripts/setup-mic.sh      ← 2nd run: checks the mic, sets gain, test-records
#
# Safe to re-run any time. Change the mic gain with:
#   sudo MIC_GAIN_DB=30 bash scripts/setup-mic.sh
#
# What it sets up:
#   /boot/firmware/config.txt  dtparam=i2s=on, dtoverlay=googlevoicehat-soundcard
#   /etc/asound.conf           ALSA device "mirror_mic": 48 kHz / 32-bit stereo from
#                              the mic, converted to the 16 kHz / 16-bit mono that
#                              wakeword.py records, plus a software gain stage.
#                              server/voice/mic.py picks this device by name.

set -euo pipefail

CARD="sndrpigooglevoi"          # ALSA card id created by the googlevoicehat overlay
PCM="mirror_mic"                # device name the voice loop looks for
GAIN_DB="${MIC_GAIN_DB:-24}"    # INMP441 is quiet at 16-bit; 24 dB suits ~0.5–1 m
MARK_BEGIN="# >>> MirrorOS INMP441 mic >>>"
MARK_END="# <<< MirrorOS INMP441 mic <<<"
ASOUND="/etc/asound.conf"
TEST_WAV="/tmp/mirror_mic_test.wav"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo:  sudo bash scripts/setup-mic.sh"
  exit 1
fi

if ! [[ "$GAIN_DB" =~ ^[0-9]+([.][0-9]+)?$ ]] || [ "${GAIN_DB%.*}" -gt 40 ]; then
  echo "MIC_GAIN_DB must be a number between 0 and 40 (got '$GAIN_DB')"
  exit 1
fi

# Bookworm keeps config.txt in /boot/firmware; Bullseye and older in /boot.
if [ -f /boot/firmware/config.txt ]; then
  CONFIG=/boot/firmware/config.txt
elif [ -f /boot/config.txt ]; then
  CONFIG=/boot/config.txt
else
  echo "Could not find config.txt in /boot/firmware or /boot — is this a Raspberry Pi?"
  exit 1
fi

echo "=== MirrorOS INMP441 mic setup ==="
echo ""

# ── 1. Boot config ──────────────────────────────────────────
echo "[1/4] Boot config ($CONFIG)"
REBOOT_NEEDED=0
MISSING=()
for line in \
  "dtparam=i2s=on" \
  "dtoverlay=googlevoicehat-soundcard"
do
  if grep -qxF "$line" "$CONFIG"; then
    echo "  = $line (already set)"
  else
    MISSING+=("$line")
  fi
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  [ -f "$CONFIG.mirroros.bak" ] || cp "$CONFIG" "$CONFIG.mirroros.bak"
  {
    echo ""
    echo "# MirrorOS: INMP441 I2S mic (scripts/setup-mic.sh)"
    echo "[all]"   # config.txt may end inside a [pi5]/[cm4] filter — reset it
    for line in "${MISSING[@]}"; do echo "$line"; done
  } >> "$CONFIG"
  for line in "${MISSING[@]}"; do echo "  + $line"; done
  echo "  (backup: $CONFIG.mirroros.bak)"
  REBOOT_NEEDED=1
fi

# Voice loop runs as the normal user under PM2 — it needs the audio group for the
# mic. Pi OS usually has this already.
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  if getent group audio >/dev/null && ! id -nG "$SUDO_USER" | tr ' ' '\n' | grep -qx audio; then
    usermod -aG audio "$SUDO_USER"
    echo "  + added $SUDO_USER to group audio"
    REBOOT_NEEDED=1
  fi
fi
echo ""

# ── 2. ALSA device "mirror_mic" ─────────────────────────────
echo "[2/4] ALSA device '$PCM' ($ASOUND, gain ${GAIN_DB} dB)"
BLOCK=$(cat <<EOF
$MARK_BEGIN
# Written by scripts/setup-mic.sh — edit MIC_GAIN_DB and re-run instead of editing here.
# Raw I2S capture: the googlevoicehat card only does 48 kHz, 32-bit, 2 channels.
pcm.${PCM}_hw {
    type hw
    card $CARD
    device 0
}
# Software gain. New softvol controls start at their maximum, so max_dB IS the gain.
pcm.${PCM}_gain {
    type softvol
    slave.pcm "${PCM}_hw"
    control {
        name "Mic Boost Capture Volume"
        card $CARD
    }
    min_dB -5.0
    max_dB $GAIN_DB
    resolution 256
}
# What apps open: any rate/format/channels (wakeword.py asks for 16 kHz S16 mono).
# The INMP441 only drives one I2S slot (L/R pin sets which) and leaves the other
# silent, so summing both slots gives full level whichever slot it lands in.
pcm.$PCM {
    type plug
    slave {
        pcm "${PCM}_gain"
        format S32_LE
        rate 48000
        channels 2
    }
    ttable.0.0 1
    ttable.0.1 1
    hint {
        show on
        description "INMP441 I2S microphone (MirrorOS)"
    }
}
$MARK_END
EOF
)

touch "$ASOUND"
# Drop any previous copy of our block, keep everything else in the file.
awk -v b="$MARK_BEGIN" -v e="$MARK_END" '
  $0 == b { skip = 1; next }
  $0 == e { skip = 0; next }
  !skip   { print }
' "$ASOUND" > "$ASOUND.tmp"
printf '%s\n' "$BLOCK" >> "$ASOUND.tmp"
chmod 644 "$ASOUND.tmp"
mv "$ASOUND.tmp" "$ASOUND"
echo "  ✓ written"
echo ""

# ── 3. Is the mic card up? (only after the reboot) ──────────
echo "[3/4] Mic sound card"
if ! grep -q "\[$CARD" /proc/asound/cards 2>/dev/null; then
  if [ "$REBOOT_NEEDED" -eq 1 ]; then
    echo "  Not loaded yet — that's expected before the first reboot."
  else
    echo "  ✗ Card '$CARD' is not present even though config.txt is set."
    echo "    Check the lines above are not inside a [section] that excludes the Pi 4,"
    echo "    and look for errors with:  dmesg | grep -iE 'i2s|voicehat'"
  fi
  echo ""
  echo "=== Next: sudo reboot   then run this script again ==="
  exit 0
fi
echo "  ✓ $(grep "\[$CARD" /proc/asound/cards | sed 's/^ *//')"
echo ""

# ── 4. Gain + test recording ────────────────────────────────
echo "[4/4] Test recording"
# Opening the device once creates the 'Mic Boost' control; pin it to 100% (= max_dB)
# so a re-run with a new MIC_GAIN_DB takes effect, then persist it across reboots.
if ! arecord -q -D "$PCM" -f S16_LE -r 16000 -c 1 -d 1 /dev/null 2>/tmp/mirror_mic_err; then
  echo "  ✗ Could not open '$PCM':"
  sed 's/^/    /' /tmp/mirror_mic_err
  if grep -qi busy /tmp/mirror_mic_err; then
    echo "    The voice loop is probably holding the mic. Stop it and re-run:"
    echo "      pm2 stop mirroros-voice   (then: sudo bash scripts/setup-mic.sh)"
  fi
  exit 1
fi
amixer -q -c "$CARD" sset 'Mic Boost' 100% 2>/dev/null || true
alsactl store 2>/dev/null || true

echo "  Speak normally from where you'll stand at the mirror — recording 4 seconds..."
arecord -q -D "$PCM" -f S16_LE -r 16000 -c 1 -d 4 "$TEST_WAV"
chmod 644 "$TEST_WAV"

python3 - "$TEST_WAV" "$GAIN_DB" <<'PY'
import array, math, sys, wave
path, gain = sys.argv[1], sys.argv[2]
with wave.open(path) as w:
    s = array.array('h', w.readframes(w.getnframes()))
rms  = math.sqrt(sum(x * x for x in s) / len(s)) if s else 0.0
peak = max((abs(x) for x in s), default=0)
print(f'  level: rms={rms:.0f}  peak={peak}  (voice loop treats rms > 500 as speech)')
if peak < 100:
    print('  ✗ Almost silent. Check the SD wire is on pin 38 (not 40), L/R is on')
    print('    pin 9, and the mic header is soldered. Then re-run this script.')
elif peak >= 32000:
    print('  ! Clipping — lower the gain:  sudo MIC_GAIN_DB=18 bash scripts/setup-mic.sh')
elif rms < 300:
    print(f'  ! Quiet at {gain} dB. Speak closer or raise the gain:')
    print('      sudo MIC_GAIN_DB=30 bash scripts/setup-mic.sh')
else:
    print('  ✓ Mic level looks good')
PY

echo ""
echo "=== Mic ready ==="
echo "  Hear the recording:   aplay $TEST_WAV"
echo "  Live level meter:     npm run test:mic"
echo "  Restart voice loop:   pm2 restart mirroros-voice && pm2 logs mirroros-voice"
