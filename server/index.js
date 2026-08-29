// Polyfill Web Crypto for Node.js 18 (required by Baileys)
if (!global.crypto) {
  global.crypto = require('crypto').webcrypto
}

require('dotenv').config()

const fs           = require('fs')
const path         = require('path')
const { exec }     = require('child_process')

const PORT = process.env.PORT || 3000

if (!process.env.CLAUDE_API_KEY) {
  console.error('ERROR: CLAUDE_API_KEY missing from .env')
  process.exit(1)
}

// Global safety net — a stray throw in a timer/callback or an unhandled
// promise rejection must never take the whole mirror down.
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err && (err.stack || err.message) || err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason && (reason.stack || reason.message) || reason)
})

const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const compression = require('compression')
const logger = require('./logger')

const auth = require('./middleware/auth')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: auth.corsOptions,
  // perMessageDeflate buffers per-connection compression context (memory + CPU)
  // for little benefit on a LAN — disable it on the Pi. Also cap payload size.
  perMessageDeflate: false,
  maxHttpBufferSize: 1e6
})

// Require the shared secret on every socket connection (loopback exempt).
io.use(auth.socketAuth)

// Make io accessible to routes
app.set('io', io)

// Workout engine singleton
const WorkoutEngine = require('./fitness/workout-engine')
const workoutEngine = new WorkoutEngine(io)
app.set('workoutEngine', workoutEngine)

// Middleware
app.use(compression())
app.use(cors(auth.corsOptions))
app.use(express.json())
app.use(logger.middleware)

// Hand the shared secret to same-origin pages so browser requests
// (dashboard, companion, karaoke) authenticate transparently.
app.use(auth.issueKeyCookie)

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

// Static files — cache so the kiosk stops re-fetching CSS/JS on every reload.
app.use(express.static(path.join(__dirname, '../public'), { maxAge: '1h' }))

// Companion app
app.get('/companion', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/companion/index.html'))
})

// Karaoke mode
app.get('/karaoke', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/karaoke.html'))
})

// Karaoke phone remote
app.get('/karaoke/remote', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/karaoke-remote.html'))
})

// Fitness mode
app.get('/fitness', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/fitness.html'))
})
app.get('/fitness/history', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/fitness-history.html'))
})

// Setup wizard (phone onboarding)
app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/setup.html'))
})
app.get('/setup-guide', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/setup-guide.html'))
})

// Quick reconnect page — open on phone to re-auth any service
app.get('/reconnect', (req, res) => {
  const { getLanIP } = require('./utils/network')
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MirrorOS — Reconnect</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:-apple-system,sans-serif;padding:24px;min-height:100vh}
  h1{font-size:18px;margin-bottom:6px;color:#4af0c4}
  p{font-size:13px;color:#666;margin-bottom:28px}
  .btn{display:block;width:100%;padding:16px;border:none;border-radius:12px;font-size:16px;
    font-weight:600;cursor:pointer;margin-bottom:14px;text-align:center}
  .btn-google{background:#fff;color:#000}
  .btn-email{background:#4af0c4;color:#000}
  .btn-spotify{background:#1DB954;color:#000}
  .msg{font-size:13px;margin-top:16px;text-align:center;min-height:20px;color:#4af0c4}
</style>
</head>
<body>
<h1>Reconnect Services</h1>
<p>Tap a service to set it up again on the mirror.</p>
<button class="btn btn-google" onclick="reconnect()">Reconnect Calendar (Google sign-in)</button>
<button class="btn btn-email" onclick="reconnect()">Reconnect Email (app password)</button>
<button class="btn btn-spotify" onclick="reconnect()">Reconnect Spotify</button>
<div class="msg" id="msg"></div>
<script>
function reconnect() { window.location.href = '/setup' }
</script>
</body>
</html>`)
})

// Shared-secret guard for the whole API surface (loopback exempt).
app.use('/api', auth.apiKeyGuard)

// Routes
app.use('/api/weather',     require('./routes/weather'))
app.use('/api/calendar',    require('./routes/calendar'))
app.use('/api/gmail',       require('./routes/gmail'))
app.use('/api/whatsapp',    require('./routes/whatsapp'))
app.use('/api/tasks',       require('./routes/tasks'))
app.use('/api/habits',      require('./routes/habits'))
app.use('/api/alarm',       require('./routes/alarm'))
app.use('/api/backlight',   require('./routes/backlight'))
app.use('/api/voice',       require('./routes/voice'))
app.use('/api/status',      require('./routes/status'))
app.use('/api/auth-status', require('./routes/auth-status'))
app.use('/api/briefing',    require('./routes/briefing'))
app.use('/api/media',       require('./routes/media'))
app.use('/api/music',       require('./routes/music'))
app.use('/api/news',        require('./routes/news'))
app.use('/api/spotify',     require('./routes/spotify'))
app.use('/api/quote',       require('./routes/quote').router)
app.use('/api/photos',      require('./routes/photos'))
app.use('/api/fitness',     require('./routes/fitness'))
app.use('/api/karaoke',     require('./routes/karaoke'))
app.use('/api/screensaver', require('./routes/screensaver'))
app.use('/api/setup',      require('./routes/setup'))

// Serve uploaded photos as static files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads'), { maxAge: '1d' }))

// Serve fitness GIFs as static files (immutable media — cache aggressively)
app.use('/data/gifs', express.static(path.join(__dirname, '../data/gifs'), { maxAge: '7d', immutable: true }))

// Serve screensaver videos and thumbnails
app.use('/screensaver', express.static(path.join(__dirname, '../public/screensaver'), { maxAge: '7d' }))

// Spotify token endpoint for Web Playback SDK
app.get('/spotify/token', async (req, res) => {
  try {
    const { getValidToken } = require('./helpers/spotify-auth')
    const token = await getValidToken()
    res.json({ token, connected: !!token })
  } catch (err) {
    res.json({ token: null, connected: false, error: err.message })
  }
})

// PIR motion sensor event from pir.py
app.post('/api/sensors/motion', (req, res) => {
  const { motion, screenOn } = req.body
  console.log(`[pir] motion=${motion}, screenOn=${screenOn}`)
  if (io) io.emit('motion', { motion, screenOn })

  if (motion === true) {
    const { triggerBriefingFromPIR } = require('./scheduler')
    triggerBriefingFromPIR(io).catch(err => {
      console.error('[pir] briefing trigger error:', err.message)
    })
  }

  res.json({ success: true })
})

// Full briefing status including PIR state and cooldown
app.get('/api/briefing/status-full', (req, res) => {
  const { getBriefingStatus, getNextBriefingTime } = require('./scheduler')
  res.json({
    ...getBriefingStatus(),
    nextScheduled: getNextBriefingTime(),
    scheduledCron: process.env.BRIEFING_CRON || '0 7 * * *'
  })
})

// Google OAuth callback — localhost redirect (Pi's own browser)
app.get('/auth/google/callback', async (req, res) => {
  const { google } = require('googleapis')
  const { getMirrorBaseURL } = require('./utils/network')
  const REDIRECT_URI = `http://localhost:${PORT}/auth/google/callback`

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )

  const code = req.query.code
  if (!code) return res.status(400).send('No code')

  try {
    const { tokens } = await oauth2Client.getToken(code)
    const tokenPath = path.join(__dirname, '../config/google-token.json')
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true })
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2))

    if (io) io.emit('setup:step-complete', { step: 'google', success: true })

    res.redirect(`${getMirrorBaseURL()}/setup?step=google&status=success`)
  } catch (err) {
    const { getMirrorBaseURL: base } = require('./utils/network')
    res.redirect(`${base()}/setup?step=google&status=error&msg=${encodeURIComponent(err.message)}`)
  }
})

// Legacy alias for backward compatibility
app.get('/auth/callback', (req, res) => {
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''
  res.redirect('/auth/google/callback' + qs)
})

// Setup QR data — tells mirror whether setup is complete and what URL to show
app.get('/api/setup/qr-data', (req, res) => {
  const { getMirrorBaseURL, getLanIP } = require('./utils/network')
  const userConfigPath = path.join(__dirname, '../config/user.json')

  let setupComplete = false
  try {
    const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'))
    setupComplete = config.setupComplete === true
  } catch (e) {}

  const base = getMirrorBaseURL()
  res.json({
    setupURL:      `${base}/setup`,
    setupComplete,
    mirrorIP:      getLanIP()
  })
})

// Volume control endpoint (companion app slider)
app.post('/api/voice/volume', (req, res) => {
  const { exec } = require('child_process')
  const vol = Math.min(100, Math.max(0, parseInt(req.body.volume) || 80))
  const cmd = process.platform === 'darwin'
    ? `osascript -e "set volume output volume ${vol}"`
    : `amixer sset Master ${vol}%`
  exec(cmd, (err) => {
    if (err) console.error('[volume] change failed:', err.message)
  })
  res.json({ success: true, volume: vol })
})

// Socket.io
io.on('connection', (socket) => {
  console.log(`[socket] client connected: ${socket.id}`)

  socket.on('announcement', ({ text }) => {
    if (!text) return
    console.log(`[socket] announcement: "${text}"`)
    io.emit('announcement', { text })
  })

  socket.on('widget-toggle', ({ widget, visible }) => {
    console.log(`[socket] widget-toggle: ${widget} → ${visible}`)
    io.emit('widget-toggle', { widget, visible })
  })

  // Karaoke mode events
  socket.on('karaoke:open', () => {
    console.log('[socket] karaoke:open')
    io.emit('mode:karaoke', {})
  })

  socket.on('karaoke:close', () => {
    console.log('[socket] karaoke:close')
    io.emit('mode:dashboard', {})
  })

  socket.on('karaoke:line_change', (data) => {
    // Broadcast to all clients — remote companion reads this for live lyrics
    socket.broadcast.emit('karaoke:line_change', data)
  })

  // Remote companion → relay commands to karaoke page
  socket.on('karaoke:cmd', (data) => {
    console.log('[socket] karaoke:cmd', data.action)
    socket.broadcast.emit('karaoke:cmd', data)
    // Exit command also triggers dashboard redirect for all
    if (data.action === 'exit') io.emit('mode:dashboard', {})
  })

  socket.on('disconnect', () => {
    console.log(`[socket] client disconnected: ${socket.id}`)
  })
})

const { connectWhatsApp } = require('./whatsapp/client')

server.listen(PORT, () => {
  logger.info(`MirrorOS backend running on port ${PORT}`)
  logger.info(`Node ${process.version} · ${process.env.NODE_ENV || 'development'}`)

  const scheduler = require('./scheduler')
  scheduler.start(io)

  // Reschedule any reminders that were pending before the last restart.
  require('./reminders').init(io)

  // Load persisted alarms and start the minute checker.
  require('./alarms').init(io)

  const { setupQuoteCron } = require('./routes/quote')
  setupQuoteCron(io)

  setTimeout(async () => {
    console.log('[WhatsApp] Starting connection...')
    try {
      await connectWhatsApp(io)
    } catch (e) {
      console.error('[WhatsApp] Failed to start:', e.message)
      console.log('[WhatsApp] Mirror continues without WhatsApp')
    }
  }, 3000)
})
