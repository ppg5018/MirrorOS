require('dotenv').config()

if (!process.env.CLAUDE_API_KEY) {
  console.error('ERROR: CLAUDE_API_KEY missing from .env')
  process.exit(1)
}

const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const path = require('path')
const logger = require('./logger')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

// Make io accessible to routes
app.set('io', io)

// Workout engine singleton
const WorkoutEngine = require('./fitness/workout-engine')
const workoutEngine = new WorkoutEngine(io)
app.set('workoutEngine', workoutEngine)

// Middleware
app.use(cors())
app.use(express.json())
app.use(logger.middleware)

// Static files
app.use(express.static(path.join(__dirname, '../public')))

// Companion app
app.get('/companion', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/companion/index.html'))
})

// Fitness mode
app.get('/fitness', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/fitness.html'))
})
app.get('/fitness/history', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/fitness-history.html'))
})

// Routes
app.use('/api/weather',     require('./routes/weather'))
app.use('/api/calendar',    require('./routes/calendar'))
app.use('/api/gmail',       require('./routes/gmail'))
app.use('/api/whatsapp',    require('./routes/whatsapp'))
app.use('/api/tasks',       require('./routes/tasks'))
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

// Serve uploaded photos as static files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')))

// Serve fitness GIFs as static files
app.use('/data/gifs', express.static(path.join(__dirname, '../data/gifs')))

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

// YouTube player closed notification from frontend
app.post('/api/youtube/closed', (req, res) => {
  io.emit('youtube-closed')
  res.json({ success: true })
})

// PIR motion sensor event from pir.py
app.post('/api/sensors/motion', (req, res) => {
  const { motion, screenOn } = req.body
  console.log(`[pir] motion=${motion}, screenOn=${screenOn}`)
  if (io) io.emit('motion', { motion, screenOn })
  res.json({ success: true })
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

// Google OAuth callback (used when running google-auth.js with server already up)
app.get('/auth/callback', async (req, res) => {
  const { google } = require('googleapis')
  const fs   = require('fs')
  const path = require('path')

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000/auth/callback'
  )

  const code = req.query.code
  if (!code) return res.status(400).send('No code')

  try {
    const { tokens } = await oauth2Client.getToken(code)
    const tokenPath = path.join(__dirname, '../config/google-token.json')
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true })
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2))

    res.send(`
      <html>
      <body style="font-family:sans-serif;text-align:center;padding:60px;background:#000;color:#fff">
        <h2 style="color:#4af0c4">MirrorOS Connected!</h2>
        <p>Google account linked. You can close this tab.</p>
      </body>
      </html>
    `)
  } catch (err) {
    res.status(500).send('OAuth error: ' + err.message)
  }
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

  socket.on('youtube-close-from-companion', () => {
    console.log('[socket] youtube-close-from-companion')
    io.emit('youtube-close')
    io.emit('youtube-closed')
  })

  socket.on('disconnect', () => {
    console.log(`[socket] client disconnected: ${socket.id}`)
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  logger.info(`MirrorOS backend running on port ${PORT}`)
  logger.info(`Node ${process.version} · ${process.env.NODE_ENV || 'development'}`)

  const scheduler = require('./scheduler')
  scheduler.start(io)

  const { setupQuoteCron } = require('./routes/quote')
  setupQuoteCron(io)
})
