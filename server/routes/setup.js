const express = require('express')
const router  = express.Router()
const fs      = require('fs')
const path    = require('path')

// POST /api/setup/spotify-start
// Launches npm run setup:spotify on the Pi in background.
// Phone polls /api/auth-status until spotify becomes connected.
router.post('/spotify-start', (req, res) => {
  const { exec } = require('child_process')
  const rootDir  = path.join(__dirname, '../../')

  exec('npm run setup:spotify', { cwd: rootDir }, (err) => {
    if (err) console.error('[setup] spotify-auth exit:', err.message)
  })

  res.json({ success: true, message: 'Spotify auth started on mirror' })
})

// GET /api/setup/status
router.get('/status', (req, res) => {
  const { getAuthClient } = require('../google-auth')
  const { getMirrorBaseURL, getLanIP } = require('../utils/network')

  const spotifyPath   = path.join(__dirname, '../../config/spotify-token.json')
  const whatsappPath  = path.join(__dirname, '../../config/whatsapp-auth')
  const userConfigPath = path.join(__dirname, '../../config/user.json')

  const googleConnected   = !!getAuthClient()
  const spotifyConnected  = fs.existsSync(spotifyPath)
  const whatsappConnected = fs.existsSync(whatsappPath) &&
    fs.readdirSync(whatsappPath).length > 0

  let userConfig = {}
  try { userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8')) } catch (e) {}

  res.json({
    mirrorIP:  getLanIP(),
    mirrorURL: getMirrorBaseURL(),
    steps: {
      wifi:        true,
      apiKeys:     !!(process.env.CLAUDE_API_KEY && process.env.OPENWEATHER_API_KEY),
      userProfile: !!(userConfig.name && userConfig.city),
      google:      googleConnected,
      spotify:     spotifyConnected,
      whatsapp:    whatsappConnected,
      wakeWord:    !!(process.env.WAKE_WORD_PATH || process.env.PORCUPINE_ACCESS_KEY),
      complete:    !!(googleConnected && userConfig.name)
    }
  })
})

// POST /api/setup/user-profile
router.post('/user-profile', (req, res) => {
  const { name, city, wakeWord, briefingTime, weightKg } = req.body

  if (!name || !city) {
    return res.status(400).json({ error: 'Name and city are required' })
  }

  const configPath = path.join(__dirname, '../../config/user.json')

  let existing = {}
  try { existing = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch (e) {}

  const userConfig = {
    ...existing,
    name:         name.trim(),
    city:         city.trim(),
    wakeWord:     wakeWord || 'hey mirror',
    briefingTime: briefingTime || '07:00',
    weightKg:     weightKg || 70,
    setupDate:    new Date().toISOString()
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(userConfig, null, 2))

  process.env.OPENWEATHER_CITY = city.trim()

  const io = req.app.get('io')
  if (io) {
    io.emit('setup:step-complete', {
      step: 'userProfile',
      name: userConfig.name,
      city: userConfig.city
    })
  }

  res.json({ success: true, user: userConfig })
})

// GET /api/setup/google-auth-url
router.get('/google-auth-url', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.json({
      available: false,
      reason: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in .env'
    })
  }

  try {
    const { getGoogleAuthURL } = require('../google-auth')
    const url = getGoogleAuthURL()
    res.json({ available: true, url })
  } catch (err) {
    res.json({ available: false, reason: err.message })
  }
})

// POST /api/setup/google-open-on-device
// Opens Google auth URL in the Pi's own browser (localhost redirect works)
// Phone polls /api/setup/status until google becomes true
router.post('/google-open-on-device', async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ error: 'Google credentials not set in .env' })
  }

  try {
    const { getGoogleAuthURL } = require('../google-auth')
    const url = getGoogleAuthURL()

    // Open in Pi's local browser — works because redirect is http://localhost:3000
    const { exec } = require('child_process')
    const cmd = process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}" 2>/dev/null || chromium-browser "${url}" 2>/dev/null || chromium "${url}" 2>/dev/null`

    exec(cmd, (err) => {
      if (err) console.error('[setup] browser open failed:', err.message)
    })

    res.json({ success: true, message: 'Opening Google sign-in on mirror browser' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/setup/google-auth-url-for-phone
// Generates a Google auth URL the phone opens. After sign-in, Google redirects to
// http://127.0.0.1:3000/auth/google/callback?code=... which fails on the phone.
// User copies that URL and pastes it — we extract the code and exchange for token.
router.get('/google-auth-url-for-phone', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ error: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in .env' })
  }
  const crypto = require('crypto')
  const { google } = require('googleapis')

  const REDIRECT_URI = `http://127.0.0.1:${process.env.PORT || 3000}/auth/google/callback`
  const state = crypto.randomBytes(16).toString('hex')
  req.app.set('google_oauth_state', state)

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope: [
      'openid', 'profile', 'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/youtube.readonly'
    ],
    state
  })

  res.json({ url, redirectUri: REDIRECT_URI })
})

// POST /api/setup/google-paste-url
// Receives the failed redirect URL from the phone, extracts code, exchanges for token.
router.post('/google-paste-url', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })

  let parsed
  try { parsed = new URL(url) } catch (e) {
    return res.status(400).json({ error: 'Invalid URL — copy the full address bar URL' })
  }

  const code  = parsed.searchParams.get('code')
  const state = parsed.searchParams.get('state')
  const error = parsed.searchParams.get('error')

  if (error) return res.status(400).json({ error: `Google declined: ${error}` })
  if (!code) return res.status(400).json({ error: 'No code found. Copy the full URL from the address bar.' })

  const expectedState = req.app.get('google_oauth_state')
  if (expectedState && state !== expectedState) {
    return res.status(400).json({ error: 'State mismatch — tap "Open Google Login" again and retry' })
  }

  try {
    const { google } = require('googleapis')
    const REDIRECT_URI = `http://127.0.0.1:${process.env.PORT || 3000}/auth/google/callback`

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)

    const tokenPath = path.join(__dirname, '../../config/google-token.json')
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true })
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2))
    req.app.set('google_oauth_state', null)

    const io = req.app.get('io')
    if (io) io.emit('setup:step-complete', { step: 'google', success: true })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/setup/google-auth-url/instructions
router.get('/google-auth-url/instructions', (req, res) => {
  const { getGoogleRedirectURI, getMirrorBaseURL } = require('../utils/network')

  res.json({
    redirectURI: getGoogleRedirectURI(),
    mirrorURL:   getMirrorBaseURL(),
    instructions: [
      'Go to console.cloud.google.com',
      'Open your project → APIs & Services → Credentials',
      'Click your OAuth 2.0 Client ID',
      'Under "Authorized redirect URIs" click Add URI',
      getGoogleRedirectURI(),
      'Click Save, then try Google sign-in again'
    ]
  })
})

// POST /api/setup/complete
router.post('/complete', (req, res) => {
  const configPath = path.join(__dirname, '../../config/user.json')

  try {
    let config = {}
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch (e) {}

    config.setupComplete    = true
    config.setupCompletedAt = new Date().toISOString()

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    const io = req.app.get('io')
    if (io) io.emit('setup:complete', { name: config.name || 'User' })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/setup/spotify-auth-url
// Returns a Spotify auth URL. Redirect URI is localhost:3001 (allowed by Spotify).
// Phone opens the URL, logs in, Spotify redirects to localhost:3001 (fails on phone).
// User copies that failed URL and pastes it — we extract the code and exchange it.
router.get('/spotify-auth-url', (req, res) => {
  const crypto = require('crypto')
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return res.status(400).json({ error: 'SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not set in .env' })
  }
  const state = crypto.randomBytes(16).toString('hex')
  req.app.set('spotify_oauth_state', state)

  const REDIRECT_URI = 'http://127.0.0.1:3001/callback'
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.SPOTIFY_CLIENT_ID,
    scope: [
      'streaming', 'user-read-email', 'user-read-private',
      'user-read-playback-state', 'user-modify-playback-state',
      'user-read-currently-playing', 'playlist-read-private',
      'playlist-read-collaborative', 'user-library-read',
      'user-top-read', 'user-read-recently-played'
    ].join(' '),
    redirect_uri:  REDIRECT_URI,
    state,
    show_dialog:   'false'
  })

  res.json({
    url:         `https://accounts.spotify.com/authorize?${params}`,
    redirectUri: REDIRECT_URI
  })
})

// POST /api/setup/spotify-paste-url
// Receives the full redirect URL that failed on the phone, extracts the code, exchanges for token.
router.post('/spotify-paste-url', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })

  let parsed
  try { parsed = new URL(url) } catch (e) {
    return res.status(400).json({ error: 'Invalid URL — make sure you copied the full address bar URL' })
  }

  const code  = parsed.searchParams.get('code')
  const state = parsed.searchParams.get('state')
  const error = parsed.searchParams.get('error')

  if (error) return res.status(400).json({ error: `Spotify declined: ${error}` })
  if (!code) return res.status(400).json({ error: 'No code found in URL. Copy the full URL from the address bar.' })

  const expectedState = req.app.get('spotify_oauth_state')
  if (expectedState && state !== expectedState) {
    return res.status(400).json({ error: 'State mismatch — tap "Open Spotify Login" again and retry' })
  }

  const REDIRECT_URI = 'http://127.0.0.1:3001/callback'
  const creds = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }).toString()
    })
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)

    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    })
    const profile = await profileRes.json()

    const token = {
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt:    Date.now() + (tokenData.expires_in * 1000),
      scope:        tokenData.scope,
      displayName:  profile.display_name,
      email:        profile.email,
      savedAt:      new Date().toISOString()
    }

    const tokenPath = path.join(__dirname, '../../config/spotify-token.json')
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true })
    fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2))
    req.app.set('spotify_oauth_state', null)

    const io = req.app.get('io')
    if (io) io.emit('setup:step-complete', { step: 'spotify', success: true })

    res.json({ success: true, displayName: profile.display_name, email: profile.email })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/setup/whatsapp-qr
router.get('/whatsapp-qr', (req, res) => {
  try {
    const { getQR, getConnectionStatus } = require('../whatsapp/client')
    res.json({ connected: getConnectionStatus(), qr: getQR() || null })
  } catch (e) {
    res.json({ connected: false, qr: null, error: 'WhatsApp client not initialized' })
  }
})

module.exports = router
