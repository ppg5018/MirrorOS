const express = require('express')
const router  = express.Router()
const { getValidToken, isConnected, getUserInfo } = require('../helpers/spotify-auth')
const BoundedCache = require('../utils/bounded-cache')

const API = 'https://api.spotify.com/v1'

// ── Core Spotify API helper ───────────────────────────────────
async function spotify(method, endpoint, body = null) {
  const token = await getValidToken()
  if (!token) throw new Error('Spotify not authenticated')

  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type':  'application/json'
    }
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(API + endpoint, opts)
  if (res.status === 204) return null
  if (res.status === 401) throw new Error('Spotify token expired')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error('Spotify API ' + res.status + ': ' + (err.error?.message || endpoint))
  }
  return res.json()
}

// ── Connect device targeting ──────────────────────────────────
// Audio comes out of Mira's own speaker via a librespot/Raspotify Connect
// device running on the Pi. The Web API only *controls* it, so we resolve that
// device's id by name and target it on play/control. Name precedence:
//   env SPOTIFY_DEVICE_NAME → config/spotify-device.json {name} → 'Mira'
function targetDeviceName() {
  if (process.env.SPOTIFY_DEVICE_NAME) return process.env.SPOTIFY_DEVICE_NAME
  try {
    const fs   = require('fs')
    const path = require('path')
    const cfg  = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/spotify-device.json'), 'utf8'))
    if (cfg.name) return cfg.name
  } catch (e) { /* fall through */ }
  return 'Mira'
}

let _deviceCache = { id: null, at: 0 }
const DEVICE_TTL = 30 * 1000

async function listDevices() {
  const data = await spotify('GET', '/me/player/devices')
  return data?.devices || []
}

// Pick the device to target. Preference: the Mira Connect device (librespot on
// the Pi) → whatever device is currently active → the first available device.
// Cached 30s. Returns null only when no Spotify device is available at all.
async function resolveDeviceId() {
  if (_deviceCache.id && Date.now() - _deviceCache.at < DEVICE_TTL) return _deviceCache.id
  try {
    const wanted  = targetDeviceName().toLowerCase()
    const devices = await listDevices()
    if (!devices.length) return null
    const mira   = devices.find(d => (d.name || '').toLowerCase() === wanted)
             || devices.find(d => (d.name || '').toLowerCase().includes(wanted))
    const active = devices.find(d => d.is_active)
    const pick   = mira || active || devices[0]
    if (pick) { _deviceCache = { id: pick.id, at: Date.now() }; return pick.id }
  } catch (e) {
    console.error('[Spotify] device resolve failed:', e.message)
  }
  return null
}

// Wrap routes in try/catch — returns 503 on any failure
function safe(fn) {
  return async (req, res) => {
    try { await fn(req, res) } catch (err) {
      console.error('[Spotify Route]', err.message)
      res.status(503).json({ error: err.message, connected: false })
    }
  }
}

// ── GET /api/spotify/auth — start OAuth web flow ─────────────
router.get('/auth', (req, res) => {
  const { getMirrorBaseURL } = require('../utils/network')

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return res.status(400).send('SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not set in .env')
  }

  const redirectURI = `${getMirrorBaseURL()}/api/spotify/callback`
  const scopes = [
    'user-read-email', 'user-read-private',
    'user-read-playback-state', 'user-modify-playback-state',
    'user-read-currently-playing', 'playlist-read-private',
    'playlist-read-collaborative', 'user-library-read',
    'user-top-read', 'user-read-recently-played'
  ].join(' ')

  const state = require('crypto').randomBytes(16).toString('hex')
  // Store state in app locals for verification
  req.app.set('spotify_oauth_state', state)

  const url = 'https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    '&client_id=' + encodeURIComponent(process.env.SPOTIFY_CLIENT_ID) +
    '&scope=' + encodeURIComponent(scopes) +
    '&redirect_uri=' + encodeURIComponent(redirectURI) +
    '&state=' + state

  res.redirect(url)
})

// ── GET /api/spotify/callback — handle OAuth response ─────────
router.get('/callback', async (req, res) => {
  const { getMirrorBaseURL } = require('../utils/network')
  const fs   = require('fs')
  const path = require('path')
  const base = getMirrorBaseURL()

  const { code, state, error } = req.query

  if (error) return res.redirect(`${base}/setup?step=spotify&status=error&msg=${encodeURIComponent(error)}`)

  const savedState = req.app.get('spotify_oauth_state')
  if (state !== savedState) return res.redirect(`${base}/setup?step=spotify&status=error&msg=state_mismatch`)

  const redirectURI = `${base}/api/spotify/callback`
  const creds = Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectURI }).toString()
    })
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)

    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': 'Bearer ' + tokenData.access_token }
    })
    const profile = await profileRes.json()

    const token = {
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt:    Date.now() + (tokenData.expires_in * 1000),
      scope:        tokenData.scope,
      displayName:  profile.display_name,
      email:        profile.email,
      country:      profile.country,
      savedAt:      new Date().toISOString()
    }

    const tokenPath = path.join(__dirname, '../../config/spotify-token.json')
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true })
    fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2))

    const io = req.app.get('io')
    if (io) io.emit('setup:step-complete', { step: 'spotify', success: true })

    res.redirect(`${base}/setup?step=spotify&status=success`)
  } catch (err) {
    res.redirect(`${base}/setup?step=spotify&status=error&msg=${encodeURIComponent(err.message)}`)
  }
})

// ── GET /api/spotify/auth/redirect-uri — show URI for Spotify dashboard ──
router.get('/auth/redirect-uri', (req, res) => {
  const { getMirrorBaseURL } = require('../utils/network')
  res.json({ redirectURI: `${getMirrorBaseURL()}/api/spotify/callback` })
})

// ── GET /api/spotify/status ───────────────────────────────────
router.get('/status', (req, res) => {
  res.json({ connected: isConnected(), user: getUserInfo(), source: 'oauth_token_file' })
})

// ── GET /api/spotify/search?q= ────────────────────────────────
// Bounded: 50 most-recent queries, 30-min TTL.
const searchCache = new BoundedCache({ max: 50, ttl: 30 * 60 * 1000 })
router.get('/search', safe(async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json([])

  const key = q.toLowerCase()
  const cached = searchCache.get(key)
  if (cached) return res.json(cached)

  const data = await spotify('GET',
    '/search?q=' + encodeURIComponent(q) +
    '&type=track&limit=5&market=' + (getUserInfo()?.country || 'IN'))

  const results = (data.tracks?.items || []).map(item => ({
    id:         item.id,
    uri:        item.uri,
    title:      item.name,
    artist:     item.artists.map(a => a.name).join(', '),
    album:      item.album.name,
    duration:   Math.floor(item.duration_ms / 1000),
    coverUrl:   item.album.images[0]?.url || null,
    previewUrl: item.preview_url
  }))

  searchCache.set(key, results)
  res.json(results)
}))

// ── GET /api/spotify/now-playing ──────────────────────────────
router.get('/now-playing', safe(async (req, res) => {
  const data = await spotify('GET', '/me/player/currently-playing')
  if (!data || !data.item) return res.json({ playing: false })
  res.json({
    playing:  data.is_playing,
    title:    data.item.name,
    artist:   data.item.artists.map(a => a.name).join(', '),
    album:    data.item.album.name,
    uri:      data.item.uri,
    progress: Math.floor(data.progress_ms / 1000),
    duration: Math.floor(data.item.duration_ms / 1000),
    coverUrl: data.item.album.images[0]?.url || null,
    source:   'spotify'
  })
}))

// ── GET /api/spotify/devices ──────────────────────────────────
// Lists available Connect devices and flags the one Mira targets.
router.get('/devices', safe(async (req, res) => {
  const devices = await listDevices()
  const wanted  = targetDeviceName().toLowerCase()
  res.json({
    target: targetDeviceName(),
    devices: devices.map(d => ({
      id: d.id, name: d.name, type: d.type, active: d.is_active,
      isTarget: (d.name || '').toLowerCase().includes(wanted)
    }))
  })
}))

// ── POST /api/spotify/play ────────────────────────────────────
// Body: { uri, deviceId? } — defaults to the Mira Connect device so audio
// plays on the mirror's own speaker.
router.post('/play', safe(async (req, res) => {
  const { uri } = req.body
  const deviceId = req.body.deviceId || await resolveDeviceId()
  const body = uri
    ? (uri.includes('playlist') || uri.includes('album')
        ? { context_uri: uri }
        : { uris: [uri] })
    : {}
  const endpoint = '/me/player/play' + (deviceId ? '?device_id=' + deviceId : '')
  await spotify('PUT', endpoint, body)
  res.json({ success: true, deviceId: deviceId || null })
}))

// ── POST /api/spotify/control ─────────────────────────────────
// Body: { action: 'pause'|'resume'|'next'|'prev'|'volume'|'shuffle', value }
// Actions target the Mira Connect device when it's online.
router.post('/control', safe(async (req, res) => {
  const { action, value } = req.body
  const io = req.app.get('io')

  const deviceId = await resolveDeviceId()
  const dev = deviceId ? '&device_id=' + deviceId : ''
  const devQ = deviceId ? '?device_id=' + deviceId : ''

  switch (action) {
    case 'pause':   await spotify('PUT',  '/me/player/pause'    + devQ); break
    case 'resume':  await spotify('PUT',  '/me/player/play'     + devQ); break
    case 'next':    await spotify('POST', '/me/player/next'     + devQ); break
    case 'prev':    await spotify('POST', '/me/player/previous' + devQ); break
    case 'volume':
      await spotify('PUT',
        '/me/player/volume?volume_percent=' + Math.min(100, Math.max(0, parseInt(value) || 50)) + dev)
      break
    case 'shuffle':
      await spotify('PUT', '/me/player/shuffle?state=' + (value ? 'true' : 'false') + dev)
      break
    default:
      return res.status(400).json({ error: 'Unknown action: ' + action })
  }

  if (io) io.emit('music-update')
  res.json({ success: true, action })
}))

// ── GET /api/spotify/recently-played ─────────────────────────
router.get('/recently-played', safe(async (req, res) => {
  const data = await spotify('GET', '/me/player/recently-played?limit=10')
  const tracks = (data.items || []).map(item => ({
    title:    item.track.name,
    artist:   item.track.artists.map(a => a.name).join(', '),
    uri:      item.track.uri,
    coverUrl: item.track.album.images[0]?.url || null,
    playedAt: item.played_at
  }))
  res.json({ tracks })
}))

// ── GET /api/spotify/top-tracks ──────────────────────────────
router.get('/top-tracks', safe(async (req, res) => {
  const data = await spotify('GET', '/me/top/tracks?limit=10&time_range=short_term')
  const tracks = (data.items || []).map(item => ({
    title:    item.name,
    artist:   item.artists.map(a => a.name).join(', '),
    uri:      item.uri,
    coverUrl: item.album.images[0]?.url || null
  }))
  res.json({ tracks })
}))

// ── GET /api/spotify/liked-songs ─────────────────────────────
router.get('/liked-songs', safe(async (req, res) => {
  const data = await spotify('GET', '/me/tracks?limit=20')
  const tracks = (data.items || []).map(item => ({
    title:    item.track.name,
    artist:   item.track.artists.map(a => a.name).join(', '),
    uri:      item.track.uri,
    coverUrl: item.track.album.images[0]?.url || null
  }))
  res.json({ tracks })
}))

// ── GET /api/spotify/position ─────────────────────────────────
// Near real-time position for karaoke sync — 500ms cache only
let _positionCache = null
let _positionCacheAt = 0
const POSITION_TTL = 500

router.get('/position', safe(async (req, res) => {
  if (_positionCache && Date.now() - _positionCacheAt < POSITION_TTL) {
    return res.json(_positionCache)
  }

  const token = await (require('../helpers/spotify-auth').getValidToken)()
  if (!token) {
    // Mock data for testing without Spotify
    const mock = {
      position_ms: Date.now() % 278000,   // cycles within song length
      is_playing:  true,
      track: { name: 'Tum Hi Ho', artist: 'Arijit Singh', album: 'Aashiqui 2', duration_ms: 278000 }
    }
    return res.json(mock)
  }

  const data = await spotify('GET', '/me/player/currently-playing')
  if (!data || !data.item) {
    return res.json({ position_ms: 0, is_playing: false, track: null })
  }

  const result = {
    position_ms: data.progress_ms || 0,
    is_playing:  data.is_playing,
    track: {
      id:          data.item.id,
      name:        data.item.name,
      artist:      data.item.artists.map(a => a.name).join(', '),
      album:       data.item.album.name,
      album_art:   data.item.album.images[0]?.url || null,
      duration_ms: data.item.duration_ms
    }
  }

  _positionCache   = result
  _positionCacheAt = Date.now()
  res.json(result)
}))

// ── GET /api/spotify/analysis?track_id= ───────────────────────
// Analysis is immutable, but beats[] arrays are large — keep only the 20 most
// recent tracks instead of every track ever played.
const _analysisCache = new BoundedCache({ max: 20 })
router.get('/analysis', safe(async (req, res) => {
  const { track_id } = req.query
  if (!track_id) return res.status(400).json({ error: 'track_id required' })
  const cached = _analysisCache.get(track_id)
  if (cached) return res.json(cached)

  const data = await spotify('GET', '/audio-analysis/' + track_id)

  const result = {
    tempo:  data.track?.tempo || 120,
    beats:  (data.beats  || []).map(b => ({ ms: Math.round(b.start * 1000), confidence: b.confidence })),
    bars:   (data.bars   || []).map(b => ({ ms: Math.round(b.start * 1000) })),
  }

  _analysisCache.set(track_id, result)
  res.json(result)
}))

// ── GET /api/spotify/playlists ────────────────────────────────
router.get('/playlists', safe(async (req, res) => {
  const data = await spotify('GET', '/me/playlists?limit=20')
  const playlists = (data.items || []).map(item => ({
    id:         item.id,
    name:       item.name,
    uri:        item.uri,
    trackCount: item.tracks.total,
    coverUrl:   item.images[0]?.url || null
  }))
  res.json({ playlists })
}))

module.exports = router
