/* ============================================
   MirrorOS — media.js
   Media status bar + voice-pause bridge (Spotify)
   ============================================ */

let mediaState = {
  playing: false,
  platform: null,
  title: null
}

async function playMedia(query, platform = 'spotify') {
  try {
    // Route through voice → Claude → play_music tool
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `play ${query}` })
    })
    const data = await res.json()

    mediaState = { playing: true, platform, title: query }
    updateMediaStatusBar()

    console.log('[media] play:', query, '→', data.reply)
    return data
  } catch (err) {
    console.error('[media] playMedia error:', err)
  }
}

async function stopMedia() {
  try {
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'stop the music' })
    })
    mediaState = { playing: false, platform: null, title: null }
    updateMediaStatusBar()
    return res.json()
  } catch (err) {
    console.error('[media] stopMedia error:', err)
  }
}

function updateMediaStatusBar() {
  const musicTag = document.querySelector('.status-tag-text:not(.warn)')
  const activeDot = document.querySelector('.status-active-dot')
  if (!musicTag) return

  if (mediaState.playing) {
    musicTag.textContent = mediaState.title
      ? `♫ ${mediaState.title.slice(0, 20)}`
      : 'Music Sync'
    if (activeDot) activeDot.style.background = 'var(--accent)'
  } else {
    musicTag.textContent = 'Music Sync'
    if (activeDot) activeDot.style.background = 'var(--dimmest)'
  }
}

// IMPORTANT: media must pause before Whisper STT loads (RAM constraint)
// and so playing music doesn't bleed into the mic during recording.
async function pauseForVoice() {
  try {
    const np = await fetch('/api/spotify/now-playing').then(r => r.json())
    if (!np.playing) return
    mediaState._wasPaused = true
    console.log('[media] pausing Spotify for voice input')
    fetch('/api/spotify/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause' })
    }).catch(() => {})
  } catch (err) {
    console.error('[media] pauseForVoice error:', err)
  }
}

function resumeAfterVoice() {
  if (!mediaState._wasPaused) return
  mediaState._wasPaused = false
  console.log('[media] resuming Spotify after voice')
  fetch('/api/spotify/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'resume' })
  }).catch(() => {})
}

// ── Socket-driven media pause (triggered by wakeword.py) ───
// Listens for server-sent pause/resume signals — socket defined in socket.js
if (typeof socket !== 'undefined') {
  socket.on('media-pause',  () => { pauseForVoice();   console.log('[media] server requested pause') })
  socket.on('media-resume', () => { resumeAfterVoice(); console.log('[media] server requested resume') })
}
