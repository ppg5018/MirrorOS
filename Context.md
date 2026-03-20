# MirrorOS — Claude Code Session Context
> Paste this at the start of every Claude Code session. Do not summarise it. Read it fully before writing any code.

---

## What this project is

MirrorOS is an AI-powered smart mirror built for the Indian market (Pune-first). A wall-mounted mirror with an LCD panel in the top-right corner. Widgets appear to float on the mirror surface. The majority of the mirror is pure reflection — the display is a corner panel, not full-screen.

**The key rule:** Pure black background always. Black pixels emit zero light and act as a perfect mirror. Never put any element in the centre of the screen — that is where the user's face appears.

---

## Hardware

| Device | Spec | Use |
|---|---|---|
| Orange Pi Zero 2W | 1GB RAM, Quad-core A53 @ 1.5GHz | Budget + Smart tier |
| Raspberry Pi 4 | 2GB RAM, Quad-core A72 @ 1.8GHz | Pro tier only |
| Display | 21.5" IPS 1080p bare panel + LVDS driver board | All tiers |
| Mic | USB lapel mic (budget) / ReSpeaker 4-mic (Pro) | Voice input |
| LEDs | WS2812B addressable strip on GPIO 18 | Backlight |
| PIR | HC-SR501 on GPIO pin 11 | Motion detection |
| Amp | TPA3116 50W+50W | Smart/Pro audio |

**OS:** Debian-based Linux on Orange Pi. Chromium runs in kiosk mode (`--kiosk --fullscreen --disable-infobars`). Everything managed by PM2.

---

## RAM Budget (Orange Pi — 1GB total)

| Process | RAM | Notes |
|---|---|---|
| Linux OS | 150 MB | Always |
| Chromium (UI) | 280 MB | Always |
| Node.js backend | 80 MB | Always |
| Porcupine wake word | 40 MB | Always |
| Whisper Tiny (STT) | 0 MB idle / 200–350 MB spike | Load on demand only |
| pyttsx3 TTS | 20 MB | Always |
| PM2 + system | 30 MB | Always |
| **At rest total** | **~600 MB** | 424 MB free |
| **During voice** | **~920 MB** | Only ~100 MB free ⚠️ |

**Critical constraint:** YouTube MUST pause before voice STT runs. Whisper Tiny must be used — not Base, Small, or Medium. React is banned — too heavy. Vanilla JS only.

---

## Tech Stack

```
Frontend  →  Vanilla JS + HTML + CSS (NO React, NO Vue, NO build toolchain)
             Socket.io client (real-time updates)
             Alpine.js only if reactive state is needed (15KB, no npm)

Backend   →  Node.js + Express (port 3000)
             Socket.io server (real-time push to UI)
             PM2 (process manager, auto-restart, auto-start on boot)
             node-cron (7am morning briefing scheduler)

Voice     →  Python: Porcupine (wake word) → Whisper Tiny (STT) → Claude API → pyttsx3 (TTS)

LEDs      →  Python: rpi_ws281x library on GPIO 18

Integrations → Gmail API (OAuth 2.0, readonly scope)
               Google Calendar API (OAuth 2.0)
               Google Tasks API
               WhatsApp via Baileys library (NOT official Business API)
               OpenWeatherMap REST (free tier, 60 calls/min)
               Spotify Web API + Web Player
               YouTube via Playwright browser automation

OTA       →  GitHub repo + nightly git pull at 2am via cron
```

---

## File Structure

```
mirroros/
├── public/
│   ├── index.html             ← Main mirror UI (served in Chromium kiosk)
│   ├── css/mirror.css         ← All styles, CSS variables
│   ├── js/
│   │   ├── main.js            ← Widget data fetching + clock updates
│   │   ├── socket.js          ← Socket.io client connection
│   │   ├── backlight.js       ← LED API calls
│   │   └── media.js           ← YouTube/Spotify control
│   └── companion/
│       └── index.html         ← Phone companion app (mobile web)
├── server/
│   ├── index.js               ← Express + Socket.io server (main entry)
│   ├── routes/
│   │   ├── weather.js         ← OpenWeatherMap (10min cache)
│   │   ├── calendar.js        ← Google Calendar API
│   │   ├── gmail.js           ← Gmail API
│   │   ├── whatsapp.js        ← Baileys WhatsApp
│   │   ├── tasks.js           ← Google Tasks API
│   │   └── backlight.js       ← WS2812B LED control
│   ├── ai/
│   │   ├── claude.js          ← Claude API + 9 function tool definitions
│   │   └── functions.js       ← Tool implementations (calls route files)
│   └── voice/
│       ├── wakeword.py        ← Porcupine always-listening loop
│       ├── transcribe.py      ← Whisper Tiny STT
│       └── speak.py           ← pyttsx3 TTS (rate=165, volume=0.9)
├── config/
│   ├── customer.json          ← Per-customer settings (city, widgets, branding)
│   └── wifi.conf              ← WiFi credentials (gitignored)
├── scripts/
│   ├── update.sh              ← git pull + npm install + pm2 restart all
│   └── setup-wifi.sh          ← Hotspot AP mode for first-time WiFi setup
├── ecosystem.config.js        ← PM2 process definitions
├── .env                       ← All API keys (gitignored)
├── .gitignore
└── CONTEXT.md                 ← This file
```

---

## API Routes

```
GET  /api/weather      → Current + 7-day forecast (OpenWeatherMap, 10min cache)
GET  /api/calendar     → Today's events (Google Calendar)
GET  /api/gmail        → Unread count + subject previews
GET  /api/whatsapp     → Unread messages per contact
GET  /api/tasks        → Task list with priorities
POST /api/tasks        → Add new task { task: string, priority: "high"|"medium"|"low" }
POST /api/backlight    → Change LED { mode: "warm"|"cool"|"red"|"music_sync"|"off"|"night" }
POST /api/voice        → Process voice query text → Claude → function call → reply
GET  /api/status       → System health (RAM, uptime, WiFi, PM2 status)
```

## Socket.io Events

```
Server → Client:
  "notification"      push new notification to UI
  "whatsapp-msg"      new WhatsApp message received
  "ai-response"       AI reply text (for typewriter animation)
  "backlight-change"  LED state updated

Client → Server:
  "voice-query"       text from voice transcription
  "widget-toggle"     show/hide a widget { widget: string, visible: bool }
```

---

## UI Design System

```css
:root {
  --black:    #000000;  /* background — NEVER change */
  --surface:  #0a0a0a;  /* subtle widget backgrounds */
  --surface-2:#111111;
  --white:    #ffffff;  /* primary text */
  --dim:      #888888;  /* secondary text */
  --dimmer:   #444444;  /* tertiary text */
  --dimmest:  #222222;  /* borders, dividers */
  --accent:   #4af0c4;  /* teal — AI pulse, active states */
  --accent-2: #4a9cf0;  /* blue — info badges */
  --warn:     #f0a84a;  /* amber — warnings */
  --danger:   #f04a4a;  /* red — urgent alerts */
  --wa-green: #25d366;  /* WhatsApp brand */
}

/* Clock */
font-family: 'Space Mono', monospace;
font-size: clamp(48px, 8vw, 82px);

/* Body text */
font-family: 'DM Sans', sans-serif;
font-size: 13px;
font-weight: 300;
```

**3-column grid layout:**
- Top row: Weather (left) | Clock (centre) | Calendar (right)
- Middle row: Tasks (left) | Face Ring (centre) | Notifications (right)
- Bottom: AI bar (full width)

**3 screen states:**
1. `IDLE` — all widgets visible, AI bar shows "Say Hey Mirror"
2. `LISTENING` — teal glow ring expands, waveform animation, AI bar shows "Listening..."
3. `RESPONDING` — typewriter animation on AI reply, relevant widget highlights

---

## Claude API Function Tools (all 9)

```javascript
// These are defined in server/ai/claude.js
const tools = [
  { name: "get_weather",           // → routes/weather.js
  { name: "get_calendar_events",   // → routes/calendar.js
  { name: "get_whatsapp_messages", // → routes/whatsapp.js
  { name: "add_task",              // → POST routes/tasks.js
  { name: "set_backlight",         // → routes/backlight.js → Python LED script
  { name: "play_media",            // → Playwright YouTube / Spotify API
  { name: "set_reminder",          // → node-cron timed reminder
  { name: "get_news",              // → NewsAPI or RSS feed
  { name: "morning_briefing"       // → aggregates all APIs → spoken summary
]
```

---

## Voice Pipeline (end to end)

```
User: "Hey Mirror, [command]"
  ↓
wakeword.py — Porcupine detects "Hey Mirror" (offline, ~40MB, <100ms)
  ↓
Record 4 seconds of audio → /tmp/voice_input.wav
  ↓
transcribe.py — Whisper Tiny transcribes to text (1–2s, 200–350MB RAM spike)
  ↓
POST /api/voice with { text: "..." }
  ↓
server/ai/claude.js — sends to Claude API with all 9 tool definitions
  ↓
Claude returns tool_use → execute function in functions.js
  ↓
Function result sent back to Claude → Claude forms natural language reply
  ↓
Socket.io emits "ai-response" to mirror UI (typewriter animation)
  ↓
speak.py called with reply text → pyttsx3 → speaker output
  ↓
Total time: 3–5s (Orange Pi) / 2–3s (RPi 4)
```

---

## Environment Variables (.env)

```
CLAUDE_API_KEY=
OPENWEATHER_API_KEY=
OPENWEATHER_CITY=Pune
PORCUPINE_ACCESS_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
PORT=3000
NODE_ENV=production
```

---

## PM2 Config (ecosystem.config.js)

```javascript
module.exports = {
  apps: [
    {
      name: 'mirroros-backend',
      script: 'server/index.js',
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
      env: { NODE_ENV: 'production', PORT: 3000 }
    },
    {
      name: 'mirroros-voice',
      script: 'server/voice/wakeword.py',
      interpreter: 'python3',
      watch: false,
      restart_delay: 2000,
    }
  ]
}
```

---

## Per-Customer Config (config/customer.json)

```json
{
  "customer": "Customer Name",
  "city": "Pune",
  "timezone": "Asia/Kolkata",
  "morning_briefing_time": "07:00",
  "widgets": {
    "clock": true, "weather": true, "calendar": true,
    "tasks": true, "notifications": true, "whatsapp": true,
    "ai_bar": true, "fitness": false, "face_ring": false
  },
  "backlight": { "default_mode": "warm_white", "music_sync": true, "brightness": 80 },
  "branding": { "logo": null, "accent_colour": "#4af0c4" }
}
```

---

## Current Build Status

<!-- UPDATE THIS SECTION EVERY SESSION -->

**Days completed:** 12 / 15
**Last working feature:** OTA updates (git pull + pm2 restart), WS2812B LED controller (simulation + real hw), PIR motion sensor (screen on/off), demo mode script, health check (8/8 ✓), nightly cron setup.
**Currently working on:** —
**Known bugs:** —
**Build status:** Feature complete — ready for Orange Pi deployment
**Mock data still in use:** whatsapp, news
**Real APIs connected:** OpenWeatherMap (weather), Claude API (voice/AI + morning briefing), Gmail (5min cache), Google Calendar (10min cache), Google Tasks (2min cache)

**Completed files:**
- public/js/backlight.js, media.js, socket.js (typewriter + highlightWidget), main.js (setState + body classes + highlightWidget + fetchTasks)
- public/index.html — waveform element, all script tags, widget IDs (weather/calendar/tasks/notifications)
- public/css/mirror.css — state animations, waveform, glow, typewriter cursor, widget-highlight, tasks widget styles
- public/companion/index.html — mobile companion app (AI query, backlight, tasks)
- server/logger.js — timestamped file + console logging
- server/ai/claude.js — improved system prompt, prompt caching, TOOL_TO_WIDGET, token usage logging, get_tasks tool, haiku-4-5 model
- server/ai/functions.js — morning_briefing aggregates all 4 APIs + returns structured object, get_tasks function
- server/routes/briefing.js — POST /api/briefing manual trigger
- server/routes/gmail.js — real Gmail API (5min cache) + mock fallback
- server/routes/calendar.js — real Google Calendar API (10min cache) + mock fallback
- server/routes/tasks.js — real Google Tasks API GET+POST (2min cache) + local fallback
- server/google-auth.js — shared getAuthClient() helper (OAuth2 client with token refresh)
- server/voice/wakeword.py, transcribe.py, speak.py — full Python voice pipeline
- ecosystem.config.js — PM2 config for backend + voice processes
- config/customer.json — per-customer settings
- scripts/update.sh, setup-wifi.sh — OTA + WiFi hotspot
- scripts/google-auth.js — one-time Google OAuth token setup (run once)
- scripts/setup-google-oauth.md — Google Cloud project + OAuth credentials guide
- scripts/train-wakeword.md — custom "Hey Mirror" wake word training guide (Picovoice console)

---

## Rules Claude Code must follow

1. **Vanilla JS only** — no React, no Vue, no Svelte, no build toolchain
2. **RAM budget is hard** — never load Whisper unless a voice command is active
3. **Never put content in screen centre** — user's face reflects there
4. **Always use CSS variables** — never hardcode colours
5. **All secrets in .env** — never hardcode API keys
6. **Error handling is mandatory** — every API call must have try/catch with graceful fallback
7. **Mock data first** — routes return mock JSON until Day 11 when real APIs connect
8. **Socket.io for real-time** — never poll from frontend; backend pushes updates
9. **PM2 manages all processes** — never start Node.js or Python directly
10. **Log everything** to /var/log/mirroros/ with timestamps, but rotate logs

---

*Update the "Current Build Status" section at the end of every session.*