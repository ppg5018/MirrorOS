/* ============================================
   MirrorOS — spotify-player.js
   Spotify Connect control (no Web Playback SDK)

   Audio plays on the mirror's own librespot/Raspotify Connect device ("Mira").
   This file no longer creates an in-browser player — it only asks the backend
   to control that Connect device via the Web API. The now-playing widget polls
   /api/spotify/now-playing on its own, so no player_state_changed feed is needed.
   ============================================ */

let spotifyReady    = false      // is the Mira Connect device online?
let spotifyDeviceId = null
let _statusTimer    = null

async function initSpotifyPlayer() {
  const status = await fetch('/api/spotify/status')
    .then(r => r.json()).catch(() => ({ connected: false }))

  if (!status.connected) {
    console.log('[Spotify] Not connected. Run setup to link an account.')
    showSpotifyHint()
    return
  }

  await refreshDeviceStatus()
  // Re-check the Connect device periodically — librespot may come online a few
  // seconds after boot, or drop off and return.
  if (!_statusTimer) _statusTimer = setInterval(refreshDeviceStatus, 15000)
}

async function refreshDeviceStatus() {
  try {
    const data = await fetch('/api/spotify/devices').then(r => r.json())
    const target = (data.devices || []).find(d => d.isTarget)
    spotifyReady    = !!target
    spotifyDeviceId = target ? target.id : null
    if (spotifyReady) {
      hideSpotifyHint()
      window.dispatchEvent(new CustomEvent('spotify-ready', { detail: { deviceId: spotifyDeviceId } }))
    } else {
      console.warn('[Spotify] Mira Connect device offline — is Raspotify running?')
      showSpotifyHint()
    }
  } catch (e) {
    spotifyReady = false
  }
}

// Play a track/album/playlist on Mira's speaker. Backend resolves the Mira
// Connect device, so no deviceId is needed here.
async function spotifyPlayUri(uri) {
  const res = await fetch('/api/spotify/play', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ uri })
  }).then(r => r.json()).catch(() => ({}))
  return !!res.success
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

// Boot immediately — no SDK to wait on.
initSpotifyPlayer()

window.spotifyPlayUri    = spotifyPlayUri
window.spotifySearch     = spotifySearch
window.spotifyControl    = spotifyControl
window.isSpotifyReady    = () => spotifyReady
window.getSpotifyDevice  = () => spotifyDeviceId
