/* ============================================
   MirrorOS — spotify-player.js
   Spotify Web Playback SDK wrapper
   ============================================ */

let spotifyPlayer   = null
let spotifyDeviceId = null
let spotifyReady    = false

// Called by Spotify SDK once it loads
window.onSpotifyWebPlaybackSDKReady = () => {
  initSpotifyPlayer()
}

async function initSpotifyPlayer() {
  // Check if Spotify is connected
  const status = await fetch('/api/spotify/status').then(r => r.json()).catch(() => ({ connected: false }))
  if (!status.connected) {
    console.log('[Spotify] Not connected. Run: npm run setup:spotify')
    showSpotifyHint()
    return
  }

  if (!window.Spotify) {
    console.warn('[Spotify] SDK not loaded yet — retrying in 1s')
    setTimeout(initSpotifyPlayer, 1000)
    return
  }

  spotifyPlayer = new Spotify.Player({
    name: 'MirrorOS — ' + (status.user?.displayName || 'Mirror'),
    getOAuthToken: async cb => {
      const r = await fetch('/spotify/token').then(r => r.json()).catch(() => ({ token: null }))
      cb(r.token || '')
    },
    volume: 0.75
  })

  spotifyPlayer.addListener('ready', ({ device_id }) => {
    console.log('[Spotify] ✓ Ready as device:', device_id)
    spotifyDeviceId = device_id
    spotifyReady    = true
    hideSpotifyHint()
    window.dispatchEvent(new CustomEvent('spotify-ready', { detail: { deviceId: device_id } }))
  })

  spotifyPlayer.addListener('not_ready', ({ device_id }) => {
    console.warn('[Spotify] Device offline:', device_id)
    spotifyReady = false
  })

  spotifyPlayer.addListener('player_state_changed', state => {
    if (!state) return
    const track = state.track_window?.current_track
    if (!track) return
    const data = {
      playing:  !state.paused,
      title:    track.name,
      artist:   track.artists.map(a => a.name).join(', '),
      album:    track.album.name,
      uri:      track.uri,
      progress: Math.floor(state.position / 1000),
      duration: Math.floor(state.duration / 1000),
      coverUrl: track.album.images[0]?.url || null,
      source:   'spotify'
    }
    if (window.musicWidgetInstance) window.musicWidgetInstance.update(data)
  })

  spotifyPlayer.addListener('initialization_error', ({ message }) =>
    console.error('[Spotify] Init error:', message))
  spotifyPlayer.addListener('authentication_error', ({ message }) =>
    console.error('[Spotify] Auth error:', message))
  spotifyPlayer.addListener('account_error', ({ message }) =>
    console.error('[Spotify] Account error (Premium required?):', message))

  await spotifyPlayer.connect()
}

async function spotifyPlayUri(uri) {
  if (!spotifyDeviceId) {
    console.warn('[Spotify] No device ID yet — player not ready')
    return false
  }
  await fetch('/api/spotify/play', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ uri, deviceId: spotifyDeviceId })
  })
  return true
}

async function spotifySearch(query) {
  const res = await fetch('/api/spotify/search?q=' + encodeURIComponent(query))
  return res.json()
}

async function spotifyControl(action, value) {
  await fetch('/api/spotify/control', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, value })
  })
}

function showSpotifyHint() {
  const el = document.getElementById('spotify-hint')
  if (el) {
    el.style.display = 'flex'
    setTimeout(() => { el.style.display = 'none' }, 10000)
  }
}

function hideSpotifyHint() {
  const el = document.getElementById('spotify-hint')
  if (el) el.style.display = 'none'
}

window.spotifyPlayUri    = spotifyPlayUri
window.spotifySearch     = spotifySearch
window.spotifyControl    = spotifyControl
window.isSpotifyReady    = () => spotifyReady
window.getSpotifyDevice  = () => spotifyDeviceId
