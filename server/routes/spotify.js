const express = require('express')
const router  = express.Router()
const { getValidToken, isConnected, getUserInfo } = require('../helpers/spotify-auth')

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

// Wrap routes in try/catch — returns 503 on any failure
function safe(fn) {
  return async (req, res) => {
    try { await fn(req, res) } catch (err) {
      console.error('[Spotify Route]', err.message)
      res.status(503).json({ error: err.message, connected: false })
    }
  }
}

// ── GET /api/spotify/status ───────────────────────────────────
router.get('/status', (req, res) => {
  res.json({ connected: isConnected(), user: getUserInfo(), source: 'oauth_token_file' })
})

// ── GET /api/spotify/search?q= ────────────────────────────────
const searchCache = {}
router.get('/search', safe(async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json([])

  const key = q.toLowerCase()
  if (searchCache[key] && Date.now() - searchCache[key].t < 1800000) {
    return res.json(searchCache[key].data)
  }

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

  searchCache[key] = { data: results, t: Date.now() }
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

// ── POST /api/spotify/play ────────────────────────────────────
// Body: { uri, deviceId }
router.post('/play', safe(async (req, res) => {
  const { uri, deviceId } = req.body
  const body = uri
    ? (uri.includes('playlist') || uri.includes('album')
        ? { context_uri: uri }
        : { uris: [uri] })
    : {}
  const endpoint = '/me/player/play' + (deviceId ? '?device_id=' + deviceId : '')
  await spotify('PUT', endpoint, body)
  res.json({ success: true })
}))

// ── POST /api/spotify/control ─────────────────────────────────
// Body: { action: 'pause'|'resume'|'next'|'prev'|'volume'|'shuffle', value }
router.post('/control', safe(async (req, res) => {
  const { action, value } = req.body
  const io = req.app.get('io')

  switch (action) {
    case 'pause':   await spotify('PUT',  '/me/player/pause');    break
    case 'resume':  await spotify('PUT',  '/me/player/play');     break
    case 'next':    await spotify('POST', '/me/player/next');     break
    case 'prev':    await spotify('POST', '/me/player/previous'); break
    case 'volume':
      await spotify('PUT',
        '/me/player/volume?volume_percent=' + Math.min(100, Math.max(0, parseInt(value) || 50)))
      break
    case 'shuffle':
      await spotify('PUT', '/me/player/shuffle?state=' + (value ? 'true' : 'false'))
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
// Returns beat timestamps for visualizer sync. Cached forever (analysis is immutable).
const _analysisCache = {}
router.get('/analysis', safe(async (req, res) => {
  const { track_id } = req.query
  if (!track_id) return res.status(400).json({ error: 'track_id required' })
  if (_analysisCache[track_id]) return res.json(_analysisCache[track_id])

  const data = await spotify('GET', '/audio-analysis/' + track_id)

  const result = {
    tempo:  data.track?.tempo || 120,
    beats:  (data.beats  || []).map(b => ({ ms: Math.round(b.start * 1000), confidence: b.confidence })),
    bars:   (data.bars   || []).map(b => ({ ms: Math.round(b.start * 1000) })),
  }

  _analysisCache[track_id] = result
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
