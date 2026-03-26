/* ============================================
   MirrorOS — Karaoke Page Logic
   Features: album art bg, beat visualizer, word highlight, remote sync
   ============================================ */

// ── roundRect polyfill (Pi 3 B+ / Chromium < 99) ─────────────
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) {
    this.rect(x, y, w, h)
    return this
  }
}

// ── State ─────────────────────────────────────────────────────
let lyrics       = []
let activeIndex  = -1
let activeWordIdx = -1
let duration     = 0
let syncInterval = null
let isSynced     = false
let syncOffset   = 0        // ms offset adjusted by remote (+/-)

// Beat visualizer state
let beats        = []       // [{ ms, confidence }] from audio analysis
let activeBeatIdx = -1
let beatPulse    = 0        // 0–1, decays each frame, spiked on beat

// Canvas / visualizer refs — kept outside initVisualizer for beat access
let vizCtx, vizCanvas, vizHeights, vizTargets
const VIZ_BARS = 80

// ── Boot ──────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  initParticles()
  initVisualizer()
  await loadCurrentSong()
  connectSocket()
})

// ── Load current song + lyrics ────────────────────────────────
async function loadCurrentSong() {
  try {
    // URL params are set by modes/karaoke.js when navigating here for a specific song
    const urlParams = new URLSearchParams(window.location.search)
    const urlTrack  = urlParams.get('name')

    let id, name, artist, album, album_art, duration_ms

    if (urlTrack) {
      // Trust URL params — they come from the AI play command and are up-to-date
      name        = urlTrack
      artist      = urlParams.get('artist') || ''
      album       = urlParams.get('album')  || ''
      duration_ms = parseInt(urlParams.get('duration_ms')) || 0
      // Still fetch position for id + album_art (non-blocking, best effort)
      fetch('/api/spotify/position').then(r => r.json()).then(pos => {
        if (pos?.track?.id) loadBeatAnalysis(pos.track.id).catch(() => {})
        if (pos?.track?.album_art) setAlbumArt(pos.track.album_art)
      }).catch(() => {})
    } else {
      // Default: fetch from Spotify position (manual karaoke open)
      const spotify = await fetch('/api/spotify/position').then(r => r.json())
      if (!spotify || !spotify.track) { showMessage('Nothing playing on Spotify'); return }
      ;({ id, name, artist, album, album_art, duration_ms } = spotify.track)
      if (id) loadBeatAnalysis(id).catch(() => {})
      setAlbumArt(album_art)
    }

    duration = duration_ms || 0

    document.getElementById('song-title').textContent  = name
    document.getElementById('song-artist').textContent = artist
    if (duration) document.getElementById('time-total').textContent = formatTime(duration)

    // ── Lyrics ────────────────────────────────────────────────
    const params = new URLSearchParams({ artist, track: name, album: album || '' })
    const lyricsData = await fetch('/api/karaoke/lyrics?' + params).then(r => r.json())

    if (lyricsData.error || !lyricsData.lines?.length) {
      showMessage('No lyrics found for this track')
      return
    }

    lyrics   = lyricsData.lines
    isSynced = lyricsData.synced

    if (isSynced) startSync()
    else renderUnsynced()

  } catch (err) {
    console.error('[karaoke-page] loadCurrentSong:', err.message)
    showMessage('Could not load lyrics')
  }
}

// ── Album art — blurred ambient background ────────────────────
function setAlbumArt(url) {
  const bg = document.getElementById('album-bg')
  if (!bg) return
  if (url) {
    bg.style.backgroundImage = `url(${url})`
    bg.style.opacity = '1'
  } else {
    bg.style.backgroundImage = 'none'
    bg.style.opacity = '0'
  }
}

// ── Fetch beat analysis ───────────────────────────────────────
async function loadBeatAnalysis(trackId) {
  const data = await fetch('/api/spotify/analysis?track_id=' + trackId).then(r => r.json())
  if (data.beats?.length) {
    beats = data.beats
    console.log('[karaoke-page] loaded', beats.length, 'beats, tempo', data.tempo)
  }
}

// ── Show a status message in the current lyric slot ───────────
function showMessage(msg) {
  const el = document.getElementById('lyric-text')
  if (el) { el.innerHTML = ''; el.textContent = msg }
}

// ── Render unsynced lyrics as static list ─────────────────────
function renderUnsynced() {
  const container = document.getElementById('lyrics-container')
  container.innerHTML = ''
  const list = document.createElement('div')
  list.id = 'unsynced-list'
  lyrics.forEach(line => {
    const el = document.createElement('div')
    el.className   = 'lyric-unsynced'
    el.textContent = line.text
    list.appendChild(el)
  })
  container.appendChild(list)
}

// ── Sync polling — every 500ms ────────────────────────────────
async function syncLyrics() {
  try {
    const data = await fetch('/api/spotify/position').then(r => r.json())
    const rawPos  = data.position_ms || 0
    const pos     = rawPos + syncOffset

    if (!duration && data.track?.duration_ms) {
      duration = data.track.duration_ms
      document.getElementById('time-total').textContent = formatTime(duration)
    }

    // Progress bar + timestamps
    const pct = duration ? Math.min(100, (rawPos / duration) * 100) : 0
    document.getElementById('progress-fill').style.width = pct + '%'
    document.getElementById('time-current').textContent  = formatTime(rawPos)

    // ── Line-level sync ───────────────────────────────────────
    const idx = lyrics.findIndex((line, i) => {
      const next = lyrics[i + 1]
      return pos >= line.time && (!next || pos < next.time)
    })

    if (idx !== -1 && idx !== activeIndex) {
      activeIndex   = idx
      activeWordIdx = -1
      renderLyrics(idx)
      triggerBacklight(idx)
      spawnParticleBurst()
      // Tell remote companion
      if (typeof _socket !== 'undefined') {
        _socket.emit('karaoke:line_change', { lineIndex: idx, text: lyrics[idx].text })
      }
    }

    // ── Word-level sync (within active line) ──────────────────
    if (activeIndex !== -1 && lyrics[activeIndex]?.words) {
      syncWordHighlight(pos, activeIndex)
    }

    // ── Beat sync ─────────────────────────────────────────────
    if (beats.length) {
      const bi = beats.findIndex((b, i) => {
        const next = beats[i + 1]
        return rawPos >= b.ms && (!next || rawPos < next.ms)
      })
      if (bi !== -1 && bi !== activeBeatIdx) {
        activeBeatIdx = bi
        beatPulse = 0.6 + (beats[bi].confidence || 0.5) * 0.4  // 0.6–1.0
      }
    }

  } catch (err) {
    console.warn('[karaoke-page] sync error:', err.message)
  }
}

// ── Render 5 lines: 2 past + active + 2 upcoming ─────────────
function renderLyrics(idx) {
  const get = (i) => (lyrics[i] ? lyrics[i].text : '')

  document.getElementById('lyric-past-2').textContent = get(idx - 2)
  document.getElementById('lyric-past-1').textContent = get(idx - 1)
  document.getElementById('lyric-next-1').textContent = get(idx + 1)
  document.getElementById('lyric-next-2').textContent = get(idx + 2)

  // Active line — render as word spans for word-level highlight
  const lyricText = document.getElementById('lyric-text')
  lyricText.innerHTML = ''
  if (lyrics[idx]?.words) {
    lyrics[idx].words.forEach((word, wi) => {
      const span = document.createElement('span')
      span.className   = 'word'
      span.dataset.idx = wi
      span.textContent = word.text + ' '
      lyricText.appendChild(span)
    })
  } else {
    lyricText.textContent = get(idx)
  }

  // Re-trigger line animation
  const cur = document.getElementById('lyric-current')
  cur.style.animation = 'none'
  cur.offsetHeight
  cur.style.animation = 'glowPulse 3s ease-in-out infinite, lineIn 400ms ease forwards'
}

// ── Word-level highlighting within active line ────────────────
function syncWordHighlight(pos, lineIdx) {
  const wordList = lyrics[lineIdx]?.words
  if (!wordList) return

  // Find which word is current
  const wi = wordList.findIndex((w, i) => {
    const next = wordList[i + 1]
    return pos >= w.time && (!next || pos < next.time)
  })

  if (wi === activeWordIdx) return
  activeWordIdx = wi

  const spans = document.getElementById('lyric-text').querySelectorAll('.word')
  spans.forEach((span, i) => {
    span.classList.remove('word-active', 'word-done')
    if (i < wi)      span.classList.add('word-done')
    else if (i === wi) span.classList.add('word-active')
  })
}

// ── Visualizer — beat-reactive bars via rAF ───────────────────
function initVisualizer() {
  vizCanvas = document.getElementById('visualizer')
  vizCtx    = vizCanvas.getContext('2d')
  vizCanvas.width  = window.innerWidth
  vizCanvas.height = 120

  vizHeights = Array.from({ length: VIZ_BARS }, () => Math.random() * 20 + 5)
  vizTargets = Array.from({ length: VIZ_BARS }, () => Math.random() * 60 + 10)

  drawVisualizer()
}

function drawVisualizer() {
  const ctx = vizCtx
  const W   = vizCanvas.width
  const H   = vizCanvas.height

  ctx.clearRect(0, 0, W, H)

  const barW = W / VIZ_BARS

  // Decay beat pulse each frame
  beatPulse *= 0.88

  // Update heights — blend toward ambient targets + beat spike
  vizHeights = vizHeights.map((h, i) => {
    // Ambient drift
    if (Math.abs(h - vizTargets[i]) < 2) {
      vizTargets[i] = Math.random() * 60 + 5
    }
    let target = vizTargets[i]

    // Beat spike: center bars spike more (bell curve across bar index)
    if (beatPulse > 0.05) {
      const center   = VIZ_BARS / 2
      const distance = Math.abs(i - center) / (VIZ_BARS / 2)  // 0 at center, 1 at edges
      const bell     = Math.exp(-distance * distance * 4)      // Gaussian curve
      target = Math.max(target, beatPulse * H * 0.85 * bell)
    }

    return h + (target - h) * 0.1
  })

  // Draw bars
  vizHeights.forEach((h, i) => {
    const x     = i * barW + barW * 0.15
    const w     = barW * 0.7
    const alpha = 0.2 + (h / H) * 0.75
    ctx.fillStyle = `rgba(74, 240, 196, ${alpha})`
    ctx.beginPath()
    ctx.roundRect(x, H - h, w, h, [2, 2, 0, 0])
    ctx.fill()
  })

  requestAnimationFrame(drawVisualizer)
}

// ── Ambient particles ─────────────────────────────────────────
function initParticles() {
  const container = document.getElementById('particles')
  for (let i = 0; i < 15; i++) {
    const p  = document.createElement('div')
    p.className = 'particle'
    p.style.left              = Math.random() * 100 + '%'
    p.style.bottom            = Math.random() * 20 + '%'
    p.style.animationDuration = (8 + Math.random() * 12) + 's'
    p.style.animationDelay    = (-Math.random() * 8) + 's'
    p.style.opacity           = String(Math.random() * 0.6)
    const sz = (2 + Math.random() * 3) + 'px'
    p.style.width = p.style.height = sz
    container.appendChild(p)
  }
}

// ── Burst particles on line change ────────────────────────────
function spawnParticleBurst() {
  const container = document.getElementById('particles')
  for (let i = 0; i < 6; i++) {
    const p  = document.createElement('div')
    p.className = 'particle'
    p.style.left              = (30 + Math.random() * 40) + '%'
    p.style.bottom            = '45%'
    p.style.animationDuration = (2 + Math.random() * 3) + 's'
    p.style.animationDelay    = '0s'
    p.style.opacity           = '0.8'
    const sz = (2 + Math.random() * 3) + 'px'
    p.style.width = p.style.height = sz
    container.appendChild(p)
    setTimeout(() => p.remove(), 5000)
  }
}

// ── Backlight cycling ─────────────────────────────────────────
const COLORS = ['#4af0c4', '#4a9cf0', '#c44af0', '#f0a84a', '#f04a9c', '#4af060']
function triggerBacklight(idx) {
  fetch('/api/backlight', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'solid', color: COLORS[idx % COLORS.length], brightness: 55 })
  }).catch(() => {})
}

// ── Helpers ───────────────────────────────────────────────────
function formatTime(ms) {
  const s = Math.floor((ms || 0) / 1000)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

function startSync() {
  syncLyrics()
  syncInterval = setInterval(syncLyrics, 500)
}

// ── Socket ────────────────────────────────────────────────────
let _socket
function connectSocket() {
  _socket = io()

  _socket.on('mode:dashboard', () => {
    clearInterval(syncInterval)
    // If running inside the dashboard iframe, tell parent to close us
    // rather than navigating the parent frame to /
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'karaoke:exit' }, '*')
    } else {
      window.location.href = '/'
    }
  })

  _socket.on('mode:karaoke', (data) => {
    clearInterval(syncInterval)
    syncInterval  = null
    lyrics        = []
    beats         = []
    activeIndex   = -1
    activeWordIdx = -1
    syncOffset    = 0
    beatPulse     = 0

    document.getElementById('lyric-past-2').textContent = ''
    document.getElementById('lyric-past-1').textContent = ''
    const lt = document.getElementById('lyric-text'); if (lt) { lt.innerHTML = ''; lt.textContent = '...' }
    document.getElementById('lyric-next-1').textContent = ''
    document.getElementById('lyric-next-2').textContent = ''
    document.getElementById('progress-fill').style.width = '0%'

    if (data?.track) {
      const { id, name, artist, album, album_art, duration_ms } = data.track
      duration = duration_ms || 0
      document.getElementById('song-title').textContent  = name
      document.getElementById('song-artist').textContent = artist
      if (duration) document.getElementById('time-total').textContent = formatTime(duration)
      setAlbumArt(album_art || null)
      if (id) loadBeatAnalysis(id).catch(() => {})

      const params = new URLSearchParams({ artist, track: name, album: album || '' })
      setTimeout(async () => {
        const ld = await fetch('/api/karaoke/lyrics?' + params).then(r => r.json()).catch(() => ({}))
        if (ld.lines?.length) { lyrics = ld.lines; isSynced = ld.synced; if (isSynced) startSync(); else renderUnsynced() }
        else showMessage('No lyrics found')
      }, 400)
    } else {
      setTimeout(loadCurrentSong, 1500)
    }
  })

  // Remote control commands
  _socket.on('karaoke:cmd', (data) => {
    switch (data.action) {
      case 'offset_plus':  syncOffset += 500;  showOffsetToast(syncOffset); break
      case 'offset_minus': syncOffset -= 500;  showOffsetToast(syncOffset); break
      case 'skip':
        fetch('/api/spotify/control', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'next' }) })
          .then(() => setTimeout(loadCurrentSong, 800))
          .catch(() => {})
        break
    }
  })
}

// ── Sync offset toast ─────────────────────────────────────────
function showOffsetToast(offsetMs) {
  let toast = document.getElementById('offset-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'offset-toast'
    document.body.appendChild(toast)
  }
  const sign = offsetMs >= 0 ? '+' : ''
  toast.textContent = 'Sync ' + sign + (offsetMs / 1000).toFixed(1) + 's'
  toast.classList.add('visible')
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 2000)
}

// ── Exit button ───────────────────────────────────────────────
document.getElementById('exit-btn').addEventListener('click', () => {
  clearInterval(syncInterval)
  if (_socket) _socket.emit('karaoke:close')
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'karaoke:exit' }, '*')
  } else {
    window.location.href = '/'
  }
})

// ── Resize ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (vizCanvas) vizCanvas.width = window.innerWidth
})
