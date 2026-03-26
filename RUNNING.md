# Running MirrorOS

## Prerequisites

- Node.js (v18+)
- Python 3 (for voice features)
- A `.env` file in the project root (already present)

## Install dependencies

```bash
npm install
```

## Start the server

```bash
npm start
# or
node server/index.js
```

Server runs on **http://localhost:3000** (configured via `PORT` in `.env`).

## Pages

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | Main mirror UI |
| `http://localhost:3000/companion` | Companion/phone UI |
| `http://localhost:3000/fitness` | Fitness mode |
| `http://localhost:3000/fitness/history` | Workout history |

## Required .env keys

| Key | Purpose |
|-----|---------|
| `CLAUDE_API_KEY` | Required — server won't start without it |
| `OPENWEATHER_API_KEY` | Weather widget |
| `SPOTIFY_CLIENT_ID/SECRET` | Spotify integration |
| `GOOGLE_CLIENT_ID/SECRET` | Google Calendar |
| `NEWSAPI_KEY` | News widget |
| `EXERCISEDB_API_KEY` | Fitness exercise data |

## Optional: Run with PM2 (background process)

```bash
npm run pm2:start    # start
npm run pm2:status   # check status
npm run pm2:logs     # view logs
npm run pm2:stop     # stop
```

## Setup scripts

```bash
npm run setup:spotify   # Authorize Spotify OAuth
npm run setup:fitness   # Initialize fitness data
```

## Test voice

```bash
npm run test:mic     # Test microphone
npm run test:voice   # Test voice recognition
npm run test:tts     # Test text-to-speech
```
