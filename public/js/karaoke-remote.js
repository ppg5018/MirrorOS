/* ============================================
   MirrorOS — Karaoke Remote Companion
   Phone browser control for /karaoke page
   ============================================ */

let socket
let offsetMs = 0

window.addEventListener('load', async () => {
  loadTrackInfo()
  connectSocket()

  document.getElementById('btn-offset-minus').addEventListener('click', () => send('offset_minus'))
  document.getElementById('btn-offset-plus').addEventListener('click',  () => send('offset_plus'))
  document.getElementById('btn-skip').addEventListener('click',         () => send('skip'))
})

// ── Load current track from Spotify position ──────────────────
async function loadTrackInfo() {
  try {
    const data = await fetch('/api/spotify/position').then(r => r.json())
    if (!data.track) return
    updateTrack(data.track)
  } catch (e) {}
}

function updateTrack(track) {
  document.getElementById('track-name').textContent   = track.name   || '—'
  document.getElementById('track-artist').textContent = track.artist || '—'
  const img = document.getElementById('album-art')
  if (track.album_art) {
    img.src   = track.album_art
    img.style.display = 'block'
  } else {
    img.style.display = 'none'
  }
}

// ── Socket ────────────────────────────────────────────────────
function connectSocket() {
  socket = io()

  // Live lyric line from karaoke page
  socket.on('karaoke:line_change', (data) => {
    const el = document.getElementById('remote-lyric')
    el.textContent = data.text || ''

    // Flash animation
    el.classList.remove('lyric-flash')
    void el.offsetWidth
    el.classList.add('lyric-flash')
  })

  // If karaoke exits, show idle state
  socket.on('mode:dashboard', () => {
    document.getElementById('remote-lyric').textContent = 'Karaoke ended'
    document.getElementById('track-name').textContent   = '—'
    document.getElementById('track-artist').textContent = 'Open Spotify and play a song'
    document.getElementById('album-art').style.display  = 'none'
  })

  // If a new song loads in karaoke, update track info here too
  socket.on('mode:karaoke', (data) => {
    if (data?.track) updateTrack(data.track)
    else loadTrackInfo()
  })
}

// ── Send command to karaoke page via server relay ─────────────
function send(action) {
  if (!socket) return
  socket.emit('karaoke:cmd', { action })

  // Update local offset display for offset commands
  if (action === 'offset_plus')  offsetMs += 500
  if (action === 'offset_minus') offsetMs -= 500
  if (action === 'offset_plus' || action === 'offset_minus') {
    const sign = offsetMs >= 0 ? '+' : ''
    document.getElementById('offset-value').textContent = sign + (offsetMs / 1000).toFixed(1) + 's'
  }
  if (action === 'exit') {
    document.getElementById('remote-lyric').textContent = 'Exiting…'
  }
}
