# Training Custom "Hey Mirror" Wake Word

## Step 1 — Go to Picovoice Console
Open: https://console.picovoice.ai/
Sign in with your account.

## Step 2 — Create Custom Wake Word
- Click "Wake Word" in the left sidebar
- Click "Create Wake Word"
- Type exactly: **Hey Mirror**
- Select language: English
- Platform: Raspberry Pi (works for Orange Pi too)
- Click "Train"
- Training takes 2–3 minutes

## Step 3 — Download the .ppn file
- Once trained, click Download
- Select platform: Raspberry Pi
- Save file as: `hey-mirror_en_raspberry-pi.ppn`
- Put it in: `server/voice/hey-mirror.ppn`

## Step 4 — Update .env
```
WAKE_WORD_PATH=server/voice/hey-mirror.ppn
```

## Step 5 — Restart voice pipeline
```bash
pm2 restart mirroros-voice
# OR for testing:
python3 server/voice/wakeword.py
```

Now say **"Hey Mirror"** instead of "Jarvis".

---

## Troubleshooting
- If the wake word is too sensitive (false triggers): retrain with more samples
- If it misses commands: speak more clearly, check mic gain with `alsamixer`
- The .ppn file is device-specific — use Raspberry Pi platform for Orange Pi too
