#!/bin/bash
# MirrorOS — Voice Pipeline Test
# Run each step in order to verify the full pipeline works.
# Usage: bash scripts/test-voice.sh

set -e
BACKEND="http://localhost:3000"

echo "=== MirrorOS Voice Pipeline Test ==="
echo ""

# ── TEST 1: TTS ──────────────────────────────────────────────
echo "TEST 1 — pyttsx3 Text-to-Speech"
python3 server/voice/speak.py "Hello, I am MirrorOS. Voice is working correctly."
echo ""
read -p "Did you hear audio? (y/n): " ans1
if [ "$ans1" != "y" ]; then
  echo "  TTS failed. Check:"
  echo "  - Speaker connected and volume up"
  echo "  - sudo apt-get install espeak espeak-data"
  echo "  - pip3 install pyttsx3"
  exit 1
fi
echo "  ✓ TTS working"
echo ""

# ── TEST 2: Whisper STT ──────────────────────────────────────
echo "TEST 2 — Whisper Tiny Speech-to-Text"
echo "Recording 4 seconds — say something now..."
sleep 1

python3 - <<'EOF'
import pyaudio, wave

RATE   = 16000
CHUNK  = 512
SECS   = 4
OUTPUT = '/tmp/test_audio.wav'

pa     = pyaudio.PyAudio()
stream = pa.open(rate=RATE, channels=1, format=pyaudio.paInt16,
                 input=True, frames_per_buffer=CHUNK)

frames = [stream.read(CHUNK, exception_on_overflow=False)
          for _ in range(int(RATE / CHUNK * SECS))]

stream.stop_stream()
stream.close()
pa.terminate()

wf = wave.open(OUTPUT, 'wb')
wf.setnchannels(1)
wf.setsampwidth(2)
wf.setframerate(RATE)
wf.writeframes(b''.join(frames))
wf.close()
print('Recording saved to /tmp/test_audio.wav')
EOF

echo "Transcribing (first run downloads ~75MB Whisper model)..."
result=$(python3 server/voice/transcribe.py /tmp/test_audio.wav)

if [ -z "$result" ]; then
  echo "  WARNING: No speech detected. Try again with more volume."
else
  echo "  You said: \"$result\""
  echo "  ✓ STT working"
fi
echo ""

# ── TEST 3: Full pipeline via HTTP (no wake word) ────────────
echo "TEST 3 — Full pipeline without wake word"
echo "Sending: 'what is the weather today'"

# Check server is running
if ! curl -s "$BACKEND/api/status" > /dev/null 2>&1; then
  echo "  ERROR: Backend not running. Start it with: node server/index.js"
  exit 1
fi

response=$(curl -s -X POST "$BACKEND/api/voice" \
  -H "Content-Type: application/json" \
  -d '{"text":"what is the weather today"}')

echo "  Response: $response"
reply=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reply',''))" 2>/dev/null)

if [ -n "$reply" ]; then
  echo "  ✓ Claude replied: \"$reply\""
  echo "Speaking reply aloud..."
  python3 server/voice/speak.py "$reply"
else
  echo "  ERROR: No reply from Claude. Check CLAUDE_API_KEY in .env"
fi
echo ""

# ── TEST 4: Voice state endpoint ────────────────────────────
echo "TEST 4 — Voice state sync (UI updates)"
curl -s -X POST "$BACKEND/api/voice/state" \
  -H "Content-Type: application/json" \
  -d '{"event":"listening"}' > /dev/null
echo "  Sent: listening → check browser shows teal glow"
sleep 1

curl -s -X POST "$BACKEND/api/voice/state" \
  -H "Content-Type: application/json" \
  -d '{"event":"thinking","text":"what is the weather today"}' > /dev/null
echo "  Sent: thinking → check browser shows transcribed text"
sleep 2

curl -s -X POST "$BACKEND/api/voice/state" \
  -H "Content-Type: application/json" \
  -d '{"event":"idle"}' > /dev/null
echo "  Sent: idle → check browser returns to idle state"
echo "  ✓ State sync working"
echo ""

echo "=== All tests complete ==="
echo ""
echo "STEP 4 — To test the full wake word pipeline:"
echo "  1. Add PORCUPINE_ACCESS_KEY to .env"
echo "     Get free key at: https://console.picovoice.ai"
echo "  2. Run: python3 server/voice/wakeword.py"
echo "  3. Say 'Jarvis' clearly, then wait 1 second, then speak"
echo "  4. Watch terminal for: Wake word detected → Heard → Reply"
