class YouTubePlayer {
  constructor() {
    this.overlay = null
    this.player  = null
    this.visible = false
  }

  init() {
    // Inject YouTube IFrame API script (only once)
    if (!document.getElementById('yt-api-script')) {
      const tag = document.createElement('script')
      tag.id  = 'yt-api-script'
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }

    // Build overlay DOM
    this.overlay = document.createElement('div')
    this.overlay.id = 'yt-overlay'
    this.overlay.innerHTML = `
      <div id="yt-backdrop"></div>
      <div id="yt-container">
        <div id="yt-header">
          <div id="yt-title-text"></div>
          <div id="yt-channel-text"></div>
        </div>
        <div id="yt-player-wrap">
          <div id="yt-player-el"></div>
        </div>
        <div id="yt-controls">
          <button class="yt-btn" onclick="window.ytPlayer.togglePlayPause()">⏯</button>
          <button class="yt-btn" onclick="window.ytPlayer.skipForward()">+10s</button>
          <div class="yt-vol-wrap">
            <span class="yt-vol-label">🔊</span>
            <input type="range" id="yt-vol" min="0" max="100" value="80"
              oninput="window.ytPlayer.setVolume(this.value)">
          </div>
          <button class="yt-btn yt-close-btn" onclick="window.ytPlayer.close()">✕ Close</button>
        </div>
        <div id="yt-hint">Say "close video" or "go back" to dismiss</div>
      </div>
    `
    document.body.appendChild(this.overlay)

    // Expose globally so YT API callbacks and inline onclick handlers can reach it
    window.ytPlayer = this
  }

  play(videoId, title, channel) {
    this.show()
    document.getElementById('yt-title-text').textContent   = title   || ''
    document.getElementById('yt-channel-text').textContent = channel || ''

    if (this.player && typeof this.player.loadVideoById === 'function') {
      // Player already exists — load new video into it
      this.player.loadVideoById(videoId)
    } else {
      // First play — wait for YT IFrame API, then create player
      const tryCreate = () => {
        if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
          setTimeout(tryCreate, 100)
          return
        }
        this.player = new YT.Player('yt-player-el', {
          height: '100%',
          width:  '100%',
          videoId,
          playerVars: {
            autoplay:       1,
            controls:       1,
            modestbranding: 1,
            rel:            0,
            iv_load_policy: 3
          },
          events: {
            onReady:       e => e.target.setVolume(80),
            onStateChange: e => {
              if (e.data === YT.PlayerState.ENDED) this.close()
            }
          }
        })
      }
      tryCreate()
    }
  }

  show() {
    this.visible = true
    this.overlay.style.display   = 'flex'
    this.overlay.style.animation = 'ytFadeIn 0.3s ease-out forwards'
    // Dim the mirror UI behind the overlay
    document.querySelector('.mirror-grid')?.classList.add('mirror-dimmed')
    document.querySelector('.top-bar')?.classList.add('mirror-dimmed')
    document.querySelector('.status-bar')?.classList.add('mirror-dimmed')
  }

  close() {
    if (!this.visible) return
    this.visible = false
    this.overlay.style.animation = 'ytFadeOut 0.25s ease-in forwards'
    setTimeout(() => {
      this.overlay.style.display = 'none'
      if (this.player && typeof this.player.stopVideo === 'function') {
        this.player.stopVideo()
      }
    }, 260)
    // Restore mirror brightness
    document.querySelector('.mirror-grid')?.classList.remove('mirror-dimmed')
    document.querySelector('.top-bar')?.classList.remove('mirror-dimmed')
    document.querySelector('.status-bar')?.classList.remove('mirror-dimmed')
    // Notify backend so companion app can update its close button
    fetch('/api/youtube/closed', { method: 'POST' }).catch(() => {})
  }

  togglePlayPause() {
    if (!this.player) return
    this.player.getPlayerState() === 1
      ? this.player.pauseVideo()
      : this.player.playVideo()
  }

  skipForward() {
    if (!this.player) return
    this.player.seekTo(this.player.getCurrentTime() + 10, true)
  }

  setVolume(v) {
    if (this.player) this.player.setVolume(parseInt(v))
  }

  isOpen() { return this.visible }
}

if (typeof window !== 'undefined') {
  window.YouTubePlayer = YouTubePlayer
}
