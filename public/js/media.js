/* ============================================
   MirrorOS — media.js
   YouTube / Spotify media control
   Playwright YouTube + Spotify Web API come Day 14
   ============================================ */

let mediaState = {
  playing: false,
  platform: null,
  title: null
}

async function playMedia(query, platform = 'youtube') {
  try {
    // Route through voice → Claude → play_media tool
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `play ${query} on ${platform}` })
    })
    const data = await res.json()

    mediaState = { playing: true, platform, title: query }
    updateMediaStatusBar()

    console.log('[media] play:', query, 'on', platform, '→', data.reply)
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

// IMPORTANT: YouTube must pause before Whisper STT loads (RAM constraint)
function pauseForVoice() {
  if (mediaState.playing) {
    console.log('[media] pausing media for voice input')
    // Playwright YouTube pause call goes here Day 14
    mediaState._wasPaused = true
  }
}

function resumeAfterVoice() {
  if (mediaState._wasPaused) {
    console.log('[media] resuming media after voice')
    mediaState._wasPaused = false
    // Playwright YouTube resume call goes here Day 14
  }
}

// ── Socket-driven media pause (triggered by wakeword.py) ───
// Listens for server-sent pause/resume signals — socket defined in socket.js
if (typeof socket !== 'undefined') {
  socket.on('media-pause',  () => { pauseForVoice();   console.log('[media] server requested pause') })
  socket.on('media-resume', () => { resumeAfterVoice(); console.log('[media] server requested resume') })
}
