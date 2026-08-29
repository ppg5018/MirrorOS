# MirrorOS — CLAUDE.md

Complete context for AI-assisted development. Read this before touching any file.

> After completing a task your code will be reviewed by codex — work accordingly. Prefer accuracy, follow the conventions below, and keep the mirror resilient (a stray throw must never take the whole display down).

---

## What This Is

MirrorOS (product name **Mira**) is an AI-powered smart mirror running on a **Raspberry Pi 4** (target hardware, 1GB RAM) in **Pune, India**. It runs fullscreen in a Chromium kiosk. A Node.js + Express backend serves a vanilla JS frontend. The user interacts by voice (wake word, default "jarvis") or via a companion app on their phone.

The mirror owner's name is **Arjun**. Timezone is **Asia/Kolkata (IST)**. Responses may be English, Hindi, or Hinglish.

The Pi runs three PM2 processes: the Node backend, the Python voice loop, and the Python PIR sensor loop (see Deployment).

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js (18+), Express 4, Socket.io 4 |
| Frontend | Vanilla JS — no React, no Vue, no bundler, no build step |
| AI | Anthropic Claude (`claude-haiku-4-5`) via `@anthropic-ai/sdk` |
| Wake word | **openWakeWord** (Python, `server/voice/wakeword.py`) — open-source, no cloud, no access key. Default keyword `jarvis`; supports custom `.onnx` models |
| Speech-to-text | **Sarvam Saarika** (cloud, Hinglish-aware) if `SARVAM_API_KEY` set, else **Whisper** `base` offline (`server/voice/transcribe.py`) |
| Text-to-speech | **Sarvam Bulbul** (cloud) if `SARVAM_API_KEY` set, else **Piper** neural offline, else `pyttsx3` (`server/voice/speak.py`) |
| Music | Spotify Web API + Web Playback SDK |
| WhatsApp | **Baileys** (`@whiskeysockets/baileys`) — QR-linked, message reading |
| Calendar/Gmail | Google APIs via OAuth2 (`googleapis`) |
| Fitness data | ExerciseDB API |
| Weather | OpenWeatherMap API |
| Lyrics | LRCLIB (free, no key needed) |
| HTTP (server) | `node-fetch` v2 — **never axios** |
| Process mgr | PM2 (`ecosystem.config.js`) |
| Logging | `pino` (`server/logger.js`) |
| Hardware | PIR motion sensor + WS2812B LED strip (Python, GPIO) |

The `open` npm package is ESM-only (v11) — use `await import('open')`, never `require('open')`.

---

## Design System

- **Background:** `#000000` pure black — always
- **Accent / teal:** `#4af0c4`
- **Fonts:** `Space Mono` (headings, active elements, mono data), `DM Sans` (body), `Inter` (dashboard UI)
- **No gradients** on text, no rounded cards, no shadows — minimal and dark
- Accent used for: current lyric, active states, progress fills, glow effects
- All animations use `transform` and `opacity` only — never layout-triggering properties

---

## Project Structure

```
MirrorOS/
├── server/
│   ├── index.js                  ← Express app, Socket.io, auth wiring, route registration, boot sequence
│   ├── logger.js                 ← pino logger + request middleware
│   ├── scheduler.js              ← Morning briefing cron + PIR-triggered briefing + midnight habit rollover
│   ├── google-auth.js            ← Google OAuth helper
│   ├── alarms.js                 ← Wall-clock alarms — load, 15s checker, ring/snooze/stop (config/alarms.json)
│   ├── reminders.js              ← One-shot spoken reminders, persisted + rescheduled on boot (config/reminders.json)
│   ├── ai/
│   │   ├── claude.js             ← Claude calls, tool schemas, SYSTEM_PROMPT, conversation memory, TOOL_TO_WIDGET
│   │   └── functions.js          ← Tool implementations (call internal API via get()/post()) + widget normalization
│   ├── middleware/
│   │   └── auth.js               ← Shared-secret guard: corsOptions, socketAuth, issueKeyCookie, apiKeyGuard
│   ├── routes/                   ← One Express router per feature (see API Routes)
│   ├── helpers/
│   │   └── spotify-auth.js       ← Spotify token load/refresh from config/spotify-token.json
│   ├── fitness/
│   │   ├── workout-engine.js     ← Singleton, passed io, manages workout state + timers
│   │   ├── exercise-library.js
│   │   ├── calorie-calculator.js
│   │   └── history-tracker.js    ← Appends to data/workout-history.ndjson
│   ├── utils/
│   │   ├── bounded-cache.js      ← LRU + TTL cache (caps memory on the Pi)
│   │   ├── network.js            ← getLanIP(), getMirrorBaseURL(), getGoogleRedirectURI()
│   │   └── safe-path.js          ← isValidWorkoutId(), safeWorkoutPath() — path-traversal guard
│   ├── whatsapp/
│   │   └── client.js             ← Baileys connect, QR, in-memory messageStore (LRU, ~40 contacts)
│   ├── voice/
│   │   ├── wakeword.py           ← openWakeWord always-listening loop; records → transcribe → /api/voice → speak
│   │   ├── transcribe.py         ← Sarvam Saarika or Whisper base
│   │   ├── speak.py              ← Sarvam Bulbul, Piper, or pyttsx3
│   │   └── piper-voices/         ← en_US-amy-medium.onnx (downloaded once)
│   ├── sensors/
│   │   └── pir.py                ← HC-SR501 on GPIO; screen on/off; POST /api/sensors/motion
│   └── led/
│       └── controller.py         ← WS2812B strip; python3 controller.py <mode> [brightness]
├── public/                       ← Served static; all frontend lives here (no build step)
│   ├── index.html                ← Main dashboard (fullscreen mirror UI)
│   ├── companion/index.html      ← Phone companion app
│   ├── karaoke.html              ← Karaoke mode (separate page)
│   ├── karaoke-remote.html       ← Phone companion for karaoke
│   ├── fitness.html              ← Fitness mode
│   ├── fitness-history.html
│   ├── setup.html                ← Phone onboarding wizard
│   ├── setup-guide.html
│   ├── css/                      ← mirror.css, karaoke.css, karaoke-remote.css, fitness.css, fitness-history.css, screensaver.css
│   ├── js/
│   │   ├── main.js               ← Dashboard boot, clock, weather, calendar, tasks, wallpaper, viewport zoom
│   │   ├── socket.js             ← Socket.io client — all dashboard socket listeners
│   │   ├── spotify-player.js     ← Spotify Web Playback SDK wrapper
│   │   ├── music-widget.js       ← Now Playing widget
│   │   ├── slideshow.js          ← Ambient photo slideshow
│   │   ├── screensaver.js        ← Screensaver / video wallpaper mode
│   │   ├── alarm-widget.js
│   │   ├── news-ticker.js
│   │   ├── backlight.js
│   │   ├── weather-icons.js
│   │   ├── media.js
│   │   ├── fitness-widget.js / fitness-ui.js / fitness-history.js
│   │   ├── karaoke-page.js       ← Full karaoke page logic
│   │   ├── karaoke-remote.js     ← Phone remote logic
│   │   └── modes/karaoke.js      ← Dashboard listener — redirects to /karaoke on mode:karaoke
│   ├── uploads/photos/           ← Slideshow photos (served at /uploads)
│   └── screensaver/              ← Uploaded videos + thumbnails (served at /screensaver)
├── config/                       ← Runtime state + secrets (gitignored)
│   ├── api-key                   ← Auto-generated shared secret (0600) if MIRROR_API_KEY unset
│   ├── spotify-token.json        ← Spotify OAuth token
│   ├── google-token.json         ← Google OAuth token
│   ├── user.json                 ← Owner profile + setupComplete flag
│   ├── alarms.json / reminders.json
│   ├── wakeword.json             ← Optional custom wake-word model pointer
│   ├── screensaver.json / wifi.json / setup-complete.json
│   └── whatsapp-auth/            ← Baileys multi-file auth state
├── data/
│   ├── workouts/                 ← Workout JSON definitions
│   ├── gifs/                     ← Exercise animation GIFs (served at /data/gifs)
│   ├── habits.json               ← Habits + per-day history
│   ├── exercises.json
│   └── workout-history.ndjson    ← Append-only workout log
├── scripts/                      ← Setup + ops (spotify-auth.js, google-auth.js, setup-*.sh, health-check.sh, update.sh…)
├── src/                          ← ⚠️ Unused React/shadcn design export — NOT wired into the running mirror (see Dead / Separate Code)
├── landing/                      ← ⚠️ Separate marketing/SEO site (Mira) — NOT served by the Node backend
├── ecosystem.config.js           ← PM2: backend + voice + pir processes
├── requirements.txt              ← Python deps (openWakeWord, whisper, piper-tts, pyaudio…)
└── .env                          ← All secrets (see Environment Variables)
```

---

## Pages / URL Routes

| URL | File | Purpose |
|---|---|---|
| `/` | `public/index.html` | Main dashboard — fullscreen mirror |
| `/companion` | `public/companion/index.html` | Phone companion app |
| `/karaoke` | `public/karaoke.html` | Karaoke mode (full page takeover) |
| `/karaoke/remote` | `public/karaoke-remote.html` | Phone remote for karaoke |
| `/fitness` | `public/fitness.html` | Active workout mode |
| `/fitness/history` | `public/fitness-history.html` | Workout history |
| `/setup` | `public/setup.html` | Phone onboarding wizard |
| `/setup-guide` | `public/setup-guide.html` | Setup help page |
| `/reconnect` | inline HTML in `server/index.js` | Quick re-auth launcher (redirects to `/setup`) |
| `/auth/google/callback` | inline in `server/index.js` | Google OAuth callback (localhost redirect on the Pi) |
| `/auth/callback` | inline in `server/index.js` | Legacy alias → `/auth/google/callback` |
| `/spotify/token` | inline in `server/index.js` | Token for Web Playback SDK |

Static mounts: `/uploads` (photos, 1d cache), `/data/gifs` (7d immutable), `/screensaver` (videos/thumbs, 7d), plus `public/` (1h cache).

---

## Auth Model

Every `/api/*` route and the Socket.io handshake are protected by a single shared secret (`server/middleware/auth.js`).

- **Secret source (priority):** `MIRROR_API_KEY` env → `config/api-key` file (mode `0600`) → auto-generated with `crypto.randomBytes(32)` on first run and saved to the file.
- **Loopback is exempt.** Requests from `127.0.0.1` / `::1` skip auth — this is how `wakeword.py`, the scheduler, and internal `functions.js` `get()/post()` calls work without a key.
- **Browser clients** (dashboard, companion, karaoke) authenticate transparently via a same-origin `mirror_key` cookie set by `issueKeyCookie` (SameSite=lax).
- **Programmatic clients** may pass the key as `X-API-Key` header, `?key=` query param, or Socket.io handshake `auth.key` / `query.key`.
- **CORS** (`auth.corsOptions`) allows localhost + private LAN ranges (`10.*`, `192.168.*`, `172.16–31.*`) with credentials.

When adding routes, mount them under `/api/*` so the guard applies. Internal server-to-server calls hit `http://localhost:PORT` and are auto-trusted by the loopback exemption.

---

## API Routes

Registered in `server/index.js`. All under `/api/*` (guarded except loopback).

| Prefix | Router | Notes |
|---|---|---|
| `/api/weather` | `routes/weather.js` | OpenWeatherMap |
| `/api/calendar` | `routes/calendar.js` | Google Calendar |
| `/api/gmail` | `routes/gmail.js` | Gmail preview + name |
| `/api/whatsapp` | `routes/whatsapp.js` | Messages, unread count, `GET /qr` for pairing |
| `/api/tasks` | `routes/tasks.js` | `GET` / `POST` / `DELETE {text}` / `PATCH {text}` (complete) |
| `/api/habits` | `routes/habits.js` | `GET`, `POST`, `PATCH /check`, `PATCH /uncheck`, `DELETE` — streaks derived, not stored |
| `/api/alarm` | `routes/alarm.js` | `GET` / `POST` / `PATCH` (enable/disable) / `DELETE`; `POST /snooze`, `POST /stop` |
| `/api/backlight` | `routes/backlight.js` | `{ mode, brightness }` — fire-and-forget from clients |
| `/api/voice` | `routes/voice.js` | **Main AI entry** — `POST { text }` → Claude → tool → `{ reply, tool }`; also `POST /state`, `POST /volume` |
| `/api/status` | `routes/status.js` | System status |
| `/api/auth-status` | `routes/auth-status.js` | Which services are connected |
| `/api/briefing` | `routes/briefing.js` | Morning briefing (also `GET /api/briefing/status-full` inline in index.js) |
| `/api/media` | `routes/media.js` | `POST /pause`, `POST /resume` (used by voice loop to duck audio) |
| `/api/music` | `routes/music.js` | Music helpers |
| `/api/news` | `routes/news.js` | Headlines (currently mock in `functions.get_news`) |
| `/api/spotify` | `routes/spotify.js` | See Spotify table below |
| `/api/quote` | `routes/quote.js` | `GET` current, `POST /refresh`; exports `{ router, setupQuoteCron }` |
| `/api/photos` | `routes/photos.js` | Slideshow photo CRUD |
| `/api/fitness` | `routes/fitness.js` | `GET /workouts`, `GET /state`, `POST /start`, `POST /action` |
| `/api/karaoke` | `routes/karaoke.js` | `GET /lyrics?artist=&track=&album=` — LRCLIB fetch + parse, 24h cache |
| `/api/screensaver` | `routes/screensaver.js` | Upload/list/delete videos, settings, `POST /trigger` |
| `/api/setup` | `routes/setup.js` | Onboarding: status, user-profile, Google/Spotify auth URLs + paste-url, WhatsApp QR, complete |
| `/api/sensors/motion` | inline in `index.js` | PIR → emits `motion` + may trigger briefing |

### Spotify — `/api/spotify/`
| Endpoint | Purpose |
|---|---|
| `GET /status` | Connection status |
| `GET /search?q=` | Search tracks |
| `GET /now-playing` | Currently playing track |
| `GET /position` | Position ms + track — **500ms cache** — used by karaoke sync |
| `GET /analysis?track_id=` | Beat timestamps for visualizer — **cached permanently** |
| `POST /play` | Play by URI |
| `POST /control` | pause/resume/next/prev/volume/shuffle |
| `GET /recently-played` | Last 10 tracks |
| `GET /top-tracks` | Top tracks (short term) |
| `GET /liked-songs` | Liked songs (20) |
| `GET /playlists` | User playlists |

`/position` mock (when no Spotify token): cycles `position_ms` via `Date.now() % 278000`, returns "Tum Hi Ho" by Arijit Singh.

### Karaoke lyrics
`GET /api/karaoke/lyrics?artist=&track=&album=` → LRCLIB fetch, parse LRC (standard + Enhanced), add estimated word timings — 24h cache. Returns `{ synced, lines: [{ time, text, words:[{time,text}] }] }` or `{ error: 'not_found' }`.

---

## AI Tools (Claude function calls)

Model: **`claude-haiku-4-5`**. Schemas live in `server/ai/claude.js` (`tools[]`), implementations in `server/ai/functions.js` (`functions{}`). The system prompt caps replies at 2–3 spoken sentences, no markdown.

| Tool | What it does |
|---|---|
| `get_weather` | Fetch weather (optional `days`) |
| `get_calendar_events` | Today's calendar |
| `get_whatsapp_messages` | Unread messages, or `contact`-scoped; reads from Baileys `messageStore` |
| `get_tasks` | Task list |
| `add_task` | Add task (`priority` high/medium/low) |
| `complete_task` | Mark task done (checkmark) — used for any "finish/remove/done" intent |
| `delete_task` | Permanently delete a task |
| `manage_habits` | add / check / uncheck / remove / list habits with streaks |
| `set_backlight` | Change LED strip mode/colour/brightness |
| `play_music` | Spotify: search_and_play, play_liked/recent/top, play_playlist, pause/resume/next/prev, volume(_up/_down), shuffle |
| `set_reminder` | One-shot spoken reminder at `HH:MM` (persisted) |
| `alarm_control` | set / list / delete / enable / disable / snooze / stop wall-clock alarms |
| `control_slideshow` | Photo slideshow: next/prev/pause/resume/show/hide |
| `get_quote` | Get (`refresh:false`) or generate (`refresh:true`) the daily quote |
| `get_news` | Headlines (mock data currently) |
| `morning_briefing` | Aggregates weather + calendar + tasks + WhatsApp |
| `fitness_control` | start / pause / resume / skip / stop / status / list_workouts |
| `karaoke_control` | open / close / fetch_lyrics / play |
| `screensaver_control` | enter / exit |
| `control_widget` | show / hide / highlight any panel (or `all`); normalizes spoken synonyms |
| `control_display` | dim / brighten / set_brightness / clear_wallpaper — the screen overlay, NOT the LED strip |

**`control_widget` vs `set_backlight` vs `control_display`:** widgets = on-screen panels; `set_backlight` = the physical LED strip (warm/party/red…); `control_display` = the screen dimming overlay + ambient wallpaper. Keep these distinct.

**Adding a new tool:**
1. Add the schema to the `tools[]` array in `server/ai/claude.js`.
2. Add the implementation to the `functions` object in `server/ai/functions.js` (use the `get()` / `post()` helpers — they hit `http://localhost:PORT`).
3. Add intent mapping to `SYSTEM_PROMPT` in `server/ai/claude.js`.
4. Add to `TOOL_TO_WIDGET` in `claude.js` if it should highlight a widget (and mirror any widget name in `functions.js` `WIDGET_NAMES` / `WIDGET_ALIASES`).

The tool loop is agentic: one assistant turn may contain multiple `tool_use` blocks (e.g. "change X to Y" → `complete_task` + `add_task`), capped at `MAX_TOOL_ITERATIONS = 5`. Every `tool_use` must get a matching `tool_result` back or the API 400s.

---

## Socket.io Events

### Server → clients
| Event | Payload | Meaning |
|---|---|---|
| `ai-response` | `{ text, highlightWidget, historyDepth, isReminder? }` | Claude / reminder / alarm reply to speak + show |
| `voice-state` | `{ state, text }` | listening / transcribing / idle |
| `tasks-updated` | `{ tasks }` | Task list changed |
| `habits-updated` | — | Habits changed or midnight rollover |
| `music-update` | — | Spotify state changed — refetch |
| `spotify-play` | `{ uri }` | Play this Spotify URI (Web Playback SDK) |
| `spotify-control` | `{ action, value }` | Control Spotify player |
| `media-pause` / `media-resume` | — | Duck/unduck audio (voice loop) |
| `mode:karaoke` | `{ track? }` | Go to karaoke page |
| `mode:dashboard` | — | Return to dashboard |
| `karaoke:line_change` | `{ lineIndex, text }` | Current lyric line changed |
| `karaoke:cmd` | `{ action }` | Remote command (offset_plus/minus, skip, exit) |
| `slideshow-control` | `{ action }` | Slideshow command |
| `slideshow-settings` | `{…}` | Slideshow config changed |
| `photos-updated` | — | Photo library changed |
| `screensaver:enter` / `screensaver:exit` | — | Screensaver toggle |
| `screensaver:library-updated` | — | Screensaver videos changed |
| `motion` | `{ motion, screenOn }` | PIR sensor event |
| `announcement` | `{ text }` | Text announcement |
| `notification` | `{…}` | Notification push |
| `widget-toggle` | `{ widget, visible }` | Show/hide widget |
| `widget-highlight` | `{ widget }` | Briefly highlight a widget |
| `display-brightness` | `{ action, level? }` | Screen dim overlay |
| `wallpaper-control` | `{ action }` | Ambient art control (e.g. clear) |
| `quote-update` | `{ text, author }` | New quote |
| `backlight-change` | `{ mode, brightness }` | LED strip updated |
| `alarms-updated` | — | Alarm list changed |
| `alarm:ring` / `alarm:stop` | `{…}` | Alarm fired / dismissed |
| `briefing:starting` / `briefing:complete` | `{ source, text? }` | Morning briefing lifecycle |
| `fitness:state` | `{ state }` | Workout state changed |
| `fitness:redirect` | `{ url }` | Navigate to fitness page |
| `fitness:next_exercise` / `fitness:rest_start` / `fitness:timer_tick` / `fitness:complete` | `{…}` | Workout progression |
| `whatsapp:qr` | `{ qr }` | Pairing QR string |
| `whatsapp:status` | `{ connected }` | WhatsApp connection state |
| `whatsapp:message` | `{ from, text, … }` | Incoming message |
| `setup:step-complete` / `setup:complete` | `{ step, success }` | Onboarding progress |

### Client → server
| Event | Meaning |
|---|---|
| `announcement` | Push announcement text (rebroadcast) |
| `widget-toggle` | Toggle widget visibility (rebroadcast) |
| `karaoke:open` / `karaoke:close` | Enter/exit karaoke (triggers `mode:karaoke` / `mode:dashboard`) |
| `karaoke:line_change` | Current lyric line — server rebroadcasts to remote |
| `karaoke:cmd` | Remote control command — rebroadcast; `exit` also broadcasts `mode:dashboard` |

---

## Voice Pipeline

```
wakeword.py (openWakeWord — default keyword "jarvis", custom .onnx supported)
  → POST /api/media/pause                        ← duck Spotify
  → POST /api/voice/state { event: 'listening' } ← UI glows teal
  → records ~8s to /tmp (stops on silence)
  → transcribe.py  (Sarvam Saarika if SARVAM_API_KEY, else Whisper base)
  → POST /api/voice/state { event: 'transcribing' }
  → POST /api/voice { text }
      → server/routes/voice.js
          → server/ai/claude.js processQuery()
              → Claude (claude-haiku-4-5) with tools + cached system prompt
              → functions.execute(toolName, input, io)   (agentic loop, ≤5 iterations)
              → io.emit('ai-response', { text, highlightWidget, historyDepth })
          → returns { reply, tool }
  → speak.py  (Sarvam Bulbul → Piper → pyttsx3)
  → POST /api/media/resume · POST /api/voice/state { event: 'idle' }
```

The dashboard's AI test input bar (`initTestInput()` in `main.js`) bypasses the wake word and calls `POST /api/voice` directly.

**Conversation memory** (`server/ai/claude.js`): last 5 exchanges (10 messages), 10-minute TTL. History is always plain `{role, content:string}` — never raw `tool_use` blocks. `lastToolContext` is injected into the next user message so follow-ups like "play that again" resolve. Reset phrases ("start over", "nevermind", "reset"…) clear it. The system prompt is sent with `cache_control: ephemeral`.

---

## Hardware & Scheduling

**PIR sensor** (`server/sensors/pir.py`, HC-SR501): controls screen power (`vcgencmd` / `xrandr`), turns the display off after `SCREEN_TIMEOUT` seconds of no motion, and POSTs `/api/sensors/motion`. Falls back to a no-GPIO simulation on dev machines.

**LED strip** (`server/led/controller.py`, WS2812B): invoked as `python3 controller.py <mode> [brightness]` from `/api/backlight`. Modes: warm, cool, night, party, music_sync, red, green, blue, off.

**Scheduler** (`server/scheduler.js`):
- Fixed briefing via `BRIEFING_CRON` (default `0 7 * * *` IST).
- PIR auto-briefing: fires once when motion is seen inside the morning window (`BRIEFING_WINDOW_START`..`END:END_MIN`), respecting `BRIEFING_COOLDOWN_HOURS` and `BRIEFING_PIR_DELAY_MS`. Disable with `BRIEFING_PIR_TRIGGER=false`.
- Also schedules midnight habit rollover.
- Exports: `start(io)`, `stop()`, `triggerBriefing(io)`, `triggerBriefingFromPIR(io)`, `getBriefingStatus()`, `getNextBriefingTime()`.

**Persistence subsystems** — all init'd in `index.js` boot after `server.listen`:
- `alarms.init(io)` — loads `config/alarms.json`, runs a checker every ~15s; one-shot alarms self-remove, recurring repeat.
- `reminders.init(io)` — reloads `config/reminders.json`, reschedules pending, fires any that came due while offline (within 2h).
- `quote.setupQuoteCron(io)`.
- WhatsApp connects 3s after boot (non-fatal if it fails — the mirror runs without it).

---

## Coding Conventions

### HTTP in server-side code
Always use the `get()` / `post()` helpers in `functions.js` (they hit `http://localhost:PORT`, trusted via loopback exemption). Never axios. Use `node-fetch` v2 elsewhere in the server.

```js
// CORRECT — in functions.js
const data   = await get('/api/spotify/position')
const result = await post('/api/tasks', { task: 'Buy milk', priority: 'low' })

// WRONG
const axios = require('axios')            // never
const { default: open } = require('open') // crashes — open is ESM-only; use await import('open')
```

### Route pattern
Spotify routes use the `safe()` wrapper for consistent error handling:
```js
router.get('/endpoint', safe(async (req, res) => {
  const data = await spotify('GET', '/me/...')
  res.json(data)
}))
```

### Caching
- Lyrics: 24h TTL, key `"artist::track".toLowerCase()`.
- Spotify position: 500ms TTL. Spotify analysis: permanent per `track_id`. Search: 30min TTL.
- Prefer `server/utils/bounded-cache.js` (`new BoundedCache({ max, ttl })`) for any new in-memory cache — the Pi has ~1GB RAM shared with Chromium + Python.

### Resilience
- `index.js` installs `uncaughtException` / `unhandledRejection` handlers — a stray throw in a timer must never crash the mirror. New background work should catch its own errors.
- Node old-space is capped at 256MB in PM2 (`--max-old-space-size=256`); avoid unbounded arrays/maps.

### Security
- Mount new routes under `/api/*` so the shared-secret guard applies.
- Any user-supplied path/id (e.g. workout IDs, filenames) must go through `server/utils/safe-path.js` or equivalent validation — never interpolate into `fs` paths directly.

### Frontend — no build step
All JS loads as plain `<script>` tags in order; globals are shared via `window.*`. Scripts at the end of `<body>` run after DOM is ready — **do not wrap socket bindings in `DOMContentLoaded`**, it has already fired.

### Canvas
Include the `roundRect` polyfill for Pi 3 B+ / Chromium < 99:
```js
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h) {
    this.rect(x, y, w, h); return this
  }
}
```

### Backlight calls
Always fire-and-forget — never `await`:
```js
fetch('/api/backlight', { method: 'POST', ... }).catch(() => {})
```

### Viewport scaling
`main.js` applies `document.documentElement.style.zoom` to scale the 1920×1080 design to any screen. Overlays/modals that must be true fullscreen use `position: fixed` — they are scaled correctly by the zoom.

---

## Environment Variables

Required / common in `.env` (see `.env.example`):
```
CLAUDE_API_KEY=           # Anthropic — required, server won't start without it
OPENWEATHER_API_KEY=      # OpenWeatherMap
OPENWEATHER_CITY=Pune
PORT=3000
NODE_ENV=production

MIRROR_API_KEY=           # Optional shared secret; auto-generated to config/api-key if blank

SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
GOOGLE_CLIENT_ID=         # Calendar + Gmail
GOOGLE_CLIENT_SECRET=
NEWSAPI_KEY=
EXERCISEDB_API_KEY=

# Morning briefing
BRIEFING_CRON=0 7 * * *
BRIEFING_PIR_TRIGGER=true
BRIEFING_WINDOW_START=6
BRIEFING_WINDOW_END=9
BRIEFING_WINDOW_END_MIN=30
BRIEFING_COOLDOWN_HOURS=2
BRIEFING_PIR_DELAY_MS=3000
```

Voice-process env (set in `ecosystem.config.js`, not `.env`): `WAKE_KEYWORD` (default `jarvis`), `RECORD_SECONDS`, `WHISPER_LANG`, optional `KEYWORD_PATH` / `WAKE_WORD_PATH` for a custom `.onnx` model, and `SARVAM_API_KEY` (+ `SARVAM_STT_*` / `SARVAM_TTS_*`) to enable Sarvam STT/TTS. `PORCUPINE_ACCESS_KEY` remains in `.env.example` for legacy reasons but the wake word engine is now openWakeWord and does not require it.

### Auth setup commands
```bash
npm run setup:spotify        # Spotify OAuth → config/spotify-token.json
node scripts/google-auth.js  # Google OAuth → config/google-token.json
```
Or use the phone wizard at `/setup`. Spotify tokens auto-refresh within 2 min of expiry (`server/helpers/spotify-auth.js`); Google tokens refresh via `googleapis`.

---

## Running & Deployment

```bash
npm start          # or: npm run dev — node server/index.js
npm run pm2:start  # start all three PM2 processes (ecosystem.config.js)
npm run pm2:logs   # tail logs
npm run health     # scripts/health-check.sh
```

PM2 runs three apps (`ecosystem.config.js`): `mirroros-backend` (Node), `mirroros-voice` (`wakeword.py`), and `mirroros-pir` (`pir.py`). Python deps: `pip3 install -r requirements.txt`. Piper voice download: `python3 -m piper.download_voices en_US-amy-medium --download-dir server/voice/piper-voices`.

**Testing:** there is no automated test runner or `*.test.js` suite. Verification is manual via the scripts (`test:mic`, `test:voice`, `test:tts`, `health`). When adding logic that codex will review, prefer small, testable functions and verify behavior by exercising the relevant `/api/*` route or tool path.

---

## Modes / Page Navigation

| Mode | Entered by | Exited by | Page |
|---|---|---|---|
| Dashboard | Default | — | `/` |
| Fitness | Voice / companion | workout complete / voice stop | `/fitness` |
| Karaoke | Voice "karaoke mode" or `mode:karaoke` | Voice "go back" / exit button / remote exit | `/karaoke` |
| Screensaver | Voice "sleep mode" / idle | Voice "wake up" / motion | overlay on `/` |

Navigation between separate pages (fitness, karaoke) uses `window.location.href`.

---

## Key Patterns to Know

**Karaoke word sync:** `parseLrc()` in `server/routes/karaoke.js` handles standard and Enhanced LRC. Every line gets a `words[]` array — real timestamps (`<mm:ss.xx>`) or estimated (evenly distributed). Frontend highlights word-by-word.

**Beat visualizer:** `GET /api/spotify/analysis` returns `beats[]` with `ms` timestamps. In `karaoke-page.js`, `beatPulse` (0–1) is set per beat and decays ×0.88/frame; a Gaussian bell makes center bars spike harder than edges.

**Widget naming:** `functions.js` holds the canonical `WIDGET_NAMES`, the `ALL_WIDGETS` subset (content panels only — clock and AI bar stay visible), and `WIDGET_ALIASES` for spoken synonyms (messages→notifications, schedule→calendar, spotify→music, slideshow→wallpaper…). Keep these in sync with `public/js/socket.js`.

**WorkoutEngine:** singleton created in `index.js`, passed `io`; routes reach it via `req.app.get('workoutEngine')`. It owns timers, exercise progression, and emits `fitness:*` events.

**WhatsApp store:** in-memory only, LRU-capped at ~40 contacts / 10 messages each to bound memory. Auth state persists in `config/whatsapp-auth/`. Reading is via `getMessages()` / `getMessagesFromContact()` / `getConnectionStatus()`.

---

## Dead / Separate Code (do not assume these run)

- **`src/`** — a React + shadcn/ui component export (fitness UI in `src/app/App.tsx`, 30+ `components/ui/*.tsx`). There is **no** Vite/Webpack config, no entry point, and no build script; the live mirror serves hand-written static HTML from `public/`. Treat `src/` as an unused design reference unless a real build pipeline is added.
- **`landing/`** — the standalone Mira marketing/SEO site (canonical `https://www.getmira.co.in/`). It is **not** served by the Node backend and is deployed separately.
- **`*.pre-mira.bak` files** in `public/` — pre-rebrand backups; ignore.
