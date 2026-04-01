/* ============================================================
   MirrorOS — screensaver.js
   Manages fullscreen video screensaver mode.
   Exposes window.screensaver (ScreensaverMode instance).
   ============================================================ */

class ScreensaverMode {
  constructor() {
    this.active  = false
    this.videos  = []
    this.overlay = null
    this.videoEl = null
    this.fallbackEl = null
  }

  async init() {
    // Build overlay DOM
    this.overlay = document.createElement('div')
    this.overlay.id = 'screensaver-overlay'

    this.videoEl = document.createElement('video')
    this.videoEl.id = 'screensaver-video'
    this.videoEl.autoplay   = true
    this.videoEl.muted      = true
    this.videoEl.loop       = true
    this.videoEl.playsInline = true
    this.videoEl.style.display = 'none'

    this.fallbackEl = document.createElement('div')
    this.fallbackEl.id = 'screensaver-fallback'

    this.overlay.appendChild(this.videoEl)
    this.overlay.appendChild(this.fallbackEl)
    document.body.appendChild(this.overlay)

    await this.loadVideos()
    console.log('[Screensaver] initialized, videos:', this.videos.length)
  }

  async loadVideos() {
    try {
      const res = await fetch('/api/screensaver/list')
      this.videos = await res.json()
    } catch (_) {
      this.videos = []
    }
  }

  _coverScreen() {
    // main.js applies CSS zoom to <html> to scale the 1920×1080 design.
    // That zoom shrinks fixed-position elements too, so 100vw/100vh no longer
    // cover the real viewport. Compensate by sizing the overlay with inverse zoom.
    const zoom = parseFloat(document.documentElement.style.zoom) || 1
    this.overlay.style.width  = Math.ceil(window.innerWidth  / zoom) + 'px'
    this.overlay.style.height = Math.ceil(window.innerHeight / zoom) + 'px'
  }

  async enter() {
    if (this.active) return
    this.active = true
    window.screensaverActive = true

    console.log('[Screensaver] entered')

    // Cover full screen regardless of page zoom
    this._coverScreen()

    // Show overlay (display:flex first, then opacity transition)
    this.overlay.style.display = 'flex'
    requestAnimationFrame(() => {
      this.overlay.classList.add('visible')
    })

    await this.loadVideos()

    if (this.videos.length > 0) {
      const pick = this.videos[Math.floor(Math.random() * this.videos.length)]
      this.fallbackEl.style.display = 'none'
      this.videoEl.style.display = 'block'
      this.videoEl.src = pick.url
      this.videoEl.load()
      this.videoEl.addEventListener('canplay', () => {
        this.videoEl.play().catch(() => this._showFallback())
      }, { once: true })
      // Fallback if canplay never fires within 4 seconds
      setTimeout(() => {
        if (this.active && this.videoEl.paused && this.videoEl.readyState < 3) {
          this._showFallback()
        }
      }, 4000)
    } else {
      this._showFallback()
    }

    if (window.socket) window.socket.emit('screensaver:enter')
  }

  exit() {
    if (!this.active) return
    this.active = false
    window.screensaverActive = false

    console.log('[Screensaver] exited')

    this.overlay.classList.remove('visible')
    setTimeout(() => {
      this.overlay.style.display = 'none'
      this.videoEl.pause()
      this.videoEl.src = ''
      this.videoEl.style.display = 'none'
      this.fallbackEl.style.display = 'none'
    }, 800)

    if (window.socket) window.socket.emit('screensaver:exit')
  }

  isActive() { return this.active }

  onLibraryUpdated() { this.loadVideos() }

  _showFallback() {
    this.videoEl.style.display = 'none'
    this.fallbackEl.style.display = 'block'
    this.fallbackEl.innerHTML = ''

    // 60 twinkling stars
    for (let i = 0; i < 60; i++) {
      const star = document.createElement('div')
      star.className = 'star'
      star.style.left = Math.random() * 100 + '%'
      star.style.top  = Math.random() * 100 + '%'
      star.style.setProperty('--duration', (2 + Math.random() * 3) + 's')
      star.style.animationDelay = (Math.random() * 3) + 's'
      this.fallbackEl.appendChild(star)
    }

    // Sleeping cat SVG
    const catSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    catSvg.id = 'screensaver-cat'
    catSvg.setAttribute('width', '160')
    catSvg.setAttribute('height', '100')
    catSvg.setAttribute('viewBox', '0 0 160 100')
    catSvg.innerHTML = `
      <ellipse cx="75" cy="65" rx="45" ry="28" fill="#1a2a3a" stroke="#4ecdc4" stroke-width="1.5"/>
      <circle cx="115" cy="50" r="22" fill="#1a2a3a" stroke="#4ecdc4" stroke-width="1.5"/>
      <polygon points="105,32 100,18 115,30" fill="#1a2a3a" stroke="#4ecdc4" stroke-width="1.5"/>
      <polygon points="120,30 128,18 132,32" fill="#1a2a3a" stroke="#4ecdc4" stroke-width="1.5"/>
      <path d="M107 50 Q111 46 115 50" stroke="#4ecdc4" stroke-width="1.5" fill="none"/>
      <path d="M116 50 Q120 46 124 50" stroke="#4ecdc4" stroke-width="1.5" fill="none"/>
      <circle cx="115" cy="56" r="2" fill="#4ecdc4" opacity="0.6"/>
      <line x1="92" y1="54" x2="108" y2="56" stroke="#4ecdc4" stroke-width="0.8" opacity="0.5"/>
      <line x1="92" y1="58" x2="108" y2="58" stroke="#4ecdc4" stroke-width="0.8" opacity="0.5"/>
      <line x1="122" y1="56" x2="138" y2="54" stroke="#4ecdc4" stroke-width="0.8" opacity="0.5"/>
      <line x1="122" y1="58" x2="138" y2="58" stroke="#4ecdc4" stroke-width="0.8" opacity="0.5"/>
      <g id="cat-tail">
        <path d="M35 70 Q15 60 10 40 Q8 25 20 22"
              stroke="#4ecdc4" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      </g>
    `
    this.fallbackEl.appendChild(catSvg)
  }
}

window.screensaver = new ScreensaverMode()
