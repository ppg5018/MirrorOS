# MirrorOS — CLAUDE.md

Complete context for AI-assisted development. Read this before touching any file.

---
After completing the task your code will be reviewed by codex ,so work accordingly
## What This Is

MirrorOS is an AI-powered smart mirror running on a **Raspberry Pi** (target hardware) in **Pune, India**. It runs fullscreen in a Chromium kiosk. A Node.js + Express backend serves a vanilla JS frontend. The user interacts by voice ("Hey Mirror, ...") or via a companion app on their phone.

The mirror owner's name is **Arjun**.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js, Express, Socket.io |
| Frontend | Vanilla JS — no React, no Vue, no bundler |
| AI | Anthropic Claude (claude-haiku-4-5) via `@anthropic-ai/sdk` |
| Wake word | `porcupine` (Python, `wakeword.py`) |
| Music | Spotify Web API + Web Playback SDK |
| Video | YouTube IFrame API + Google OAuth |
| Calendar/Gmail | Google APIs via OAuth2 |
| Fitness data | ExerciseDB API |
| Weather | OpenWeatherMap API |
| Lyrics | LRCLIB (free, no key needed) |
| HTTP (server) | `node-fetch` — **never axios** |

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
│   ├── index.js                  ← Express app, Socket.io, all route registration
│   ├── logger.js
│   ├── scheduler.js              ← Morning briefing cron
│   ├── google-auth.js
│   ├── ai/
│   │   ├── claude.js             ← Claude API calls, tool definitions, system prompt, conversation memory
│   │   └── functions.js          ← Tool implementations (all call internal API via get()/post())
│   ├── routes/
│   │   ├── weather.js
│   │   ├── calendar.js
│   │   ├── gmail.js
│   │   ├── whatsapp.js
│   │   ├── tasks.js
│   │   ├── backlight.js
│   │   ├── voice.js              ← POST /api/voice — main AI entry point
│   │   ├── spotify.js            ← All Spotify endpoints
│   │   ├── karaoke.js            ← Lyrics fetch + LRC parsing
│   │   ├── fitness.js
│   │   ├── media.js
│   │   ├── music.js
│   │   ├── news.js
│   │   ├── quote.js
│   │   ├── photos.js
│   │   ├── briefing.js
│   │   ├── status.js
│   │   ├── auth-status.js
│   │   └── youtube.js
│   ├── helpers/
│   │   └── spotify-auth.js       ← Token load/refresh from config/spotify-token.json
│   └── fitness/
│       ├── workout-engine.js     ← Singleton, passed io, manages workout state
│       ├── exercise-library.js
│       ├── calorie-calculator.js
│       └── history-tracker.js
├── public/
│   ├── index.html                ← Main dashboard (fullscreen mirror UI)
│   ├── karaoke.html              ← Karaoke mode (separate page)
│   ├── karaoke-remote.html       ← Phone companion for karaoke
│   ├── fitness.html              ← Fitness mode
│   ├── fitness-history.html
│   ├── companion/
│   │   └── index.html            ← Phone companion app (main)
│   ├── css/
│   │   ├── mirror.css            ← Dashboard styles
│   │   ├── karaoke.css           ← Karaoke page styles
│   │   ├── karaoke-remote.css
│   │   ├── fitness.css
│   │   └── fitness-history.css
│   └── js/
│       ├── main.js               ← Dashboard boot, clock, weather, calendar, tasks, wallpaper
│       ├── socket.js             ← Socket.io client — all dashboard socket listeners
│       ├── spotify-player.js     ← Spotify Web Playback SDK wrapper
│       ├── music-widget.js       ← Now Playing widget
│       ├── youtube-player.js     ← YouTube IFrame overlay
│       ├── slideshow.js          ← Ambient photo slideshow
│       ├── news-ticker.js
│       ├── backlight.js
│       ├── weather-icons.js
│       ├── media.js
│       ├── fitness-widget.js
│       ├── fitness-ui.js
│       ├── fitness-history.js
│       ├── karaoke-page.js       ← Full karaoke page logic
│       ├── karaoke-remote.js     ← Phone remote logic
│       └── modes/
│           └── karaoke.js        ← Dashboard listener — redirects to /karaoke on mode:karaoke
├── config/
│   ├── spotify-token.json        ← OAuth token (gitignored) — run npm run setup:spotify
│   └── google-token.json         ← Google OAuth token (gitignored)
├── data/
│   ├── workouts/                 ← Workout JSON definitions
│   └── gifs/                     ← Exercise animation GIFs
└── .env                          ← All secrets (see Environment Variables below)
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
| `/auth/callback` | inline in `server/index.js` | Google OAuth callback |
| `/spotify/token` | inline in `server/index.js` | Token for Web Playback SDK |

---

## API Routes

### Spotify — `/api/spotify/`
| Endpoint | Purpose |
|---|---|
| `GET /status` | Connection status |
| `GET /search?q=` | Search tracks |
| `GET /now-playing` | Currently playing track |
| `GET /position` | Position in ms + track info — **500ms cache** — used by karaoke sync |
| `GET /analysis?track_id=` | Beat timestamps for visualizer — **cached forever** |
| `POST /play` | Play by URI |
| `POST /control` | pause/resume/next/prev/volume/shuffle |
| `GET /recently-played` | Last 10 tracks |
| `GET /top-tracks` | Top tracks (short term) |
| `GET /liked-songs` | Liked songs (20) |
| `GET /playlists` | User playlists |

`/position` mock (when no Spotify token): cycles `position_ms` via `Date.now() % 278000`, returns "Tum Hi Ho" by Arijit Singh.

### Karaoke — `/api/karaoke/`
| Endpoint | Purpose |
|---|---|
| `GET /lyrics?artist=&track=&album=` | Fetch from LRCLIB, parse LRC (standard + Enhanced), add estimated word timings — **24h cache** |

Returns `{ synced: bool, lines: [{ time, text, words: [{time, text}] }] }` or `{ error: 'not_found' }`.

### Other key routes
| Prefix | Notes |
|---|---|
| `POST /api/voice` | Main AI entry — takes `{ text }`, runs through Claude, executes tool, returns `{ reply, tool }` |
| `POST /api/backlight` | `{ mode, color, brightness }` — fire-and-forget from karaoke |
| `GET /api/weather` | OpenWeatherMap |
| `GET /api/calendar` | Google Calendar |
| `GET /api/gmail` | Gmail preview + name |
| `GET /api/tasks`, `POST`, `DELETE`, `PATCH` | Task CRUD |
| `GET /api/fitness/*` | Workout engine endpoints |
| `POST /api/sensors/motion` | PIR sensor → emits `motion` socket event |
| `POST /api/youtube/play` | Trigger YouTube play on mirror |
| `POST /api/voice/volume` | System volume (osascript on macOS, amixer on Pi) |

---

## AI Tools (Claude function calls)

Defined in `server/ai/claude.js` (schema) and `server/ai/functions.js` (implementation).

| Tool | What it does |
|---|---|
| `get_weather` | Fetch weather |
| `get_calendar_events` | Today's calendar |
| `get_whatsapp_messages` | WhatsApp messages |
| `get_tasks` | Task list |
| `add_task` | Add task |
| `complete_task` | Mark task done |
| `set_backlight` | Change backlight mode/colour |
| `play_music` | Spotify control (search, play, pause, skip, volume, shuffle, liked, recent, top, playlist) |
| `play_youtube` | YouTube search/history/subscriptions/close |
| `control_slideshow` | Photo slideshow control |
| `get_quote` | Daily quote |
| `set_reminder` | Timed cron reminder |
| `get_news` | Headlines |
| `morning_briefing` | Full morning briefing (weather + calendar + tasks + messages) |
| `fitness_control` | Workout start/stop/pause/resume/skip/status/list |
| `karaoke_control` | Karaoke open/close/play/fetch_lyrics |

**Adding a new tool:**
1. Add schema to `tools[]` array in `server/ai/claude.js`
2. Add implementation to `functions` object in `server/ai/functions.js` (use `get()`/`post()` helpers)
3. Add intent mapping to `SYSTEM_PROMPT` in `server/ai/claude.js`
4. Add to `TOOL_TO_WIDGET` map in both `claude.js` and `main.js` if it should highlight a widget

---

## Socket.io Events

### Server → All clients
| Event | Payload | Meaning |
|---|---|---|
| `ai-response` | `{ text, highlightWidget, historyDepth }` | Claude replied |
| `voice-state` | `{ state, text }` | listening / processing / idle |
| `tasks-updated` | `{ tasks }` | Task list changed |
| `music-update` | — | Spotify state changed — refetch |
| `spotify-play` | `{ uri }` | Play this Spotify URI |
| `spotify-control` | `{ action, value }` | Control Spotify player |
| `youtube-play` | `{ videoId, title, channel }` | Show YouTube overlay |
| `youtube-close` | — | Dismiss YouTube overlay |
| `youtube-closed` | — | Overlay dismissed (ack) |
| `mode:karaoke` | `{ track? }` | Go to karaoke page |
| `mode:dashboard` | — | Return to dashboard |
| `karaoke:line_change` | `{ lineIndex, text }` | Current lyric line changed |
| `karaoke:cmd` | `{ action }` | Remote command (offset_plus/minus, skip, exit) |
| `slideshow-control` | `{ action }` | Slideshow command |
| `motion` | `{ motion, screenOn }` | PIR sensor event |
| `announcement` | `{ text }` | Text announcement |
| `widget-toggle` | `{ widget, visible }` | Show/hide widget |
| `quote-update` | `{ text, author }` | New quote |
| `fitness:state` | `{ state }` | Workout state changed |
| `fitness:redirect` | `{ url }` | Navigate to fitness page |
| `backlight-change` | `{ mode, brightness }` | Backlight updated |

### Client → Server
| Event | Meaning |
|---|---|
| `karaoke:open` | Open karaoke (triggers `mode:karaoke` broadcast) |
| `karaoke:close` | Close karaoke (triggers `mode:dashboard` broadcast) |
| `karaoke:line_change` | Current lyric line — server rebroadcasts to remote |
| `karaoke:cmd` | Remote control command — server rebroadcasts |
| `announcement` | Push announcement text |
| `widget-toggle` | Toggle widget visibility |
| `youtube-close-from-companion` | Companion app closing YouTube |

---

## Voice Pipeline

```
wakeword.py (Porcupine)
  → POST /api/voice/state { state: 'listening' }   ← emits voice-state socket
  → [records audio, transcribes]
  → POST /api/voice { text: "..." }
      → server/routes/voice.js
          → server/ai/claude.js processQuery()
              → Claude API (claude-haiku-4-5) with tool use
              → functions.execute(toolName, input, io)
              → second Claude call with tool result
              → io.emit('ai-response', { text, highlightWidget })
          → returns { reply, tool }
  → POST /api/voice/state { state: 'idle' }
```

The AI test input bar in the dashboard (`initTestInput()` in `main.js`) bypasses wakeword and calls `POST /api/voice` directly.

---

## Coding Conventions

### HTTP in server-side code
**Always use the `get()`/`post()` helpers in `functions.js`.** Never use axios. The `open` npm package is ESM-only (v11) — use `await import('open')` dynamic import, not `require('open')`.

```js
// CORRECT — in functions.js
const data = await get('/api/spotify/position')
const result = await post('/api/tasks', { task: 'Buy milk', priority: 'low' })

// WRONG
const axios = require('axios')  // never
const { default: open } = require('open')  // will crash
```

### Route pattern
All Spotify routes use the `safe()` wrapper for consistent error handling:
```js
router.get('/endpoint', safe(async (req, res) => {
  const data = await spotify('GET', '/me/...')
  res.json(data)
}))
```

### Caching patterns
- Lyrics: 24h TTL in `lyricsCache` object, key = `"artist::track".toLowerCase()`
- Spotify position: 500ms TTL (`_positionCache`)
- Spotify analysis: permanent (never changes), `_analysisCache[track_id]`
- Search results: 30min TTL in `searchCache`

### Frontend — no build step
All JS is loaded as plain `<script>` tags in order. Globals are shared via `window.*`. Scripts at the end of `<body>` execute after DOM is ready — **do not wrap in `DOMContentLoaded`** for socket bindings, it will already have fired.

### Canvas
Always include the roundRect polyfill for Pi 3 B+ (Chromium < 99):
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
`main.js` applies `document.documentElement.style.zoom` to scale the 1920×1080 design to any screen. Overlays/modals that need to be true fullscreen must use `position: fixed` — they are correctly scaled by the zoom.

---

## Environment Variables

Required in `.env`:
```
CLAUDE_API_KEY=           # Anthropic — required, server won't start without it
OPENWEATHER_API_KEY=      # OpenWeatherMap
OPENWEATHER_CITY=Pune
PORCUPINE_ACCESS_KEY=     # Wake word detection
SPOTIFY_CLIENT_ID=        # Spotify OAuth app
SPOTIFY_CLIENT_SECRET=
GOOGLE_CLIENT_ID=         # Google OAuth (Calendar, Gmail, YouTube)
GOOGLE_CLIENT_SECRET=
NEWSAPI_KEY=              # News headlines
YOUTUBE_API_KEY=          # Optional — falls back to Google OAuth
EXERCISEDB_API_KEY=       # Exercise GIFs and metadata
PORT=3000
NODE_ENV=production
```

### Auth setup commands
```bash
npm run setup:spotify     # Spotify OAuth — writes config/spotify-token.json
node server/google-auth.js  # Google OAuth — writes config/google-token.json
```

Token auto-refresh: Spotify tokens refresh automatically when within 2 min of expiry (`server/helpers/spotify-auth.js`). Google tokens refresh via `googleapis` library.

---

## Modes / Page Navigation

The mirror has distinct modes that take over the screen:

| Mode | How entered | How exited | Page |
|---|---|---|---|
| Dashboard | Default | — | `/` |
| YouTube | `youtube-play` socket or voice | "close video" / voice / overlay button | overlay on `/` |
| Fitness | Voice or companion | workout complete / voice stop | `/fitness` |
| Karaoke | Voice "karaoke mode" or `mode:karaoke` socket | Voice "go back" / exit button / remote exit | `/karaoke` |

Navigation between modes uses `window.location.href` for separate pages (fitness, karaoke) or socket events + CSS class toggling for overlays (YouTube).

---

## Key Patterns to Know

**Karaoke word sync:** `parseLrc()` in `server/routes/karaoke.js` handles both standard and Enhanced LRC. Every line gets a `words[]` array — either real timestamps (from `<mm:ss.xx>` tags) or estimated (evenly distributed across line duration). The frontend uses this for word-by-word highlight.

**Beat visualizer:** `GET /api/spotify/analysis` returns `beats[]` with `ms` timestamps. In `karaoke-page.js`, `beatPulse` (0–1) is set on each beat and decays at ×0.88/frame. A Gaussian bell curve makes center bars spike harder than edge bars.

**Conversation memory:** Claude keeps the last 5 exchanges (10 messages) with a 10-minute TTL. History is always plain strings — never includes raw tool_use blocks. `lastToolContext` injects the most recent tool call into the next user message so follow-ups like "play that again" work correctly.

**WorkoutEngine:** Singleton instantiated in `server/index.js`, passed `io` directly. Routes access it via `req.app.get('workoutEngine')`. It manages timers, exercise progression, and emits `fitness:state` socket events.
