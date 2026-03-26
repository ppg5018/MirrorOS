/* ============================================
   MirrorOS — Karaoke overlay handler (dashboard)
   Loads /karaoke in a fullscreen iframe so the
   Spotify Web Playback SDK stays alive on the
   dashboard (music keeps playing through navigation).
   ============================================ */
;(function () {
  let karaokeFrame = null

  function openKaraoke(data) {
    if (karaokeFrame) return
    const track = data && data.track
    let src = '/karaoke'
    if (track && track.name) {
      src += '?' + new URLSearchParams({
        name:        track.name,
        artist:      track.artist || '',
        album:       track.album  || '',
        duration_ms: track.duration_ms || 0
      }).toString()
    }
    karaokeFrame = document.createElement('iframe')
    karaokeFrame.src = src
    karaokeFrame.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:1000;border:none;background:#000'
    document.body.appendChild(karaokeFrame)
  }

  function closeKaraoke() {
    if (karaokeFrame) {
      karaokeFrame.remove()
      karaokeFrame = null
    }
  }

  // iframe posts a message when it wants to close (instead of navigating the parent)
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'karaoke:exit') closeKaraoke()
  })

  if (typeof socket !== 'undefined') {
    socket.on('mode:karaoke',   (data) => openKaraoke(data))
    socket.on('mode:dashboard', ()     => closeKaraoke())
  }

  window.karaokeMode = {
    activate:   (data) => openKaraoke(data),
    deactivate: ()     => closeKaraoke()
  }
})()
