/* ============================================
   MirrorOS — music-widget.js
   Spotify-first music widget
   ============================================ */

class MusicWidget {
  constructor() {
    this.progress     = 0
    this.duration     = 1
    this.tickInterval = null
    this.lastData     = null
    this.visible      = false
  }

  init() {
    this.el = document.getElementById('widget-music')
    if (!this.el) {
      console.warn('[MusicWidget] #widget-music not found in DOM')
      return
    }
    window.musicWidgetInstance = this
    this._fetchAndUpdate()
    setInterval(() => this._fetchAndUpdate(), 10000) // Pi: 10s saves 12 Spotify calls/min
  }

  async _fetchAndUpdate() {
    try {
      const res  = await fetch('/api/spotify/now-playing')
      const data = await res.json()
      this.update(data)
    } catch (e) { /* silent fail */ }
  }

  update(data) {
    this.lastData = data
    if (!this.el) return

    const titleEl  = document.getElementById('music-title')
    const artistEl = document.getElementById('music-artist')
    const sourceEl = document.getElementById('music-source')
    const barEl    = document.getElementById('music-bar-fill')
    const timeEl   = document.getElementById('music-time')
    const artEl    = document.getElementById('music-art')

    if (!titleEl) return

    if (!data || !data.playing) {
      titleEl.textContent  = 'Nothing playing'
      artistEl.textContent = 'Say "play music" to start'
      if (sourceEl) sourceEl.textContent = ''
      if (barEl)    barEl.style.width = '0%'
      if (timeEl)   timeEl.textContent = ''
      if (artEl) {
        artEl.innerHTML  = '<span class="music-note">♪</span>'
        artEl.style.cssText = ''
      }
      this._stopTick()
      if (this.visible) {
        this.el.style.animation = 'slideOutLeft 0.3s ease-in forwards'
        setTimeout(() => { this.el.style.display = 'none'; this.visible = false }, 300)
      }
      return
    }

    // Show widget
    if (!this.visible) {
      this.el.style.display = 'block'
      this.el.style.animation = 'slideInLeft 0.4s ease-out forwards'
      this.visible = true
    }

    titleEl.textContent  = data.title  || ''
    artistEl.textContent = data.artist || ''

    // Source badge
    if (sourceEl) {
      sourceEl.textContent = data.source === 'spotify' ? '♫ SPOTIFY' : '▶ YOUTUBE'
      sourceEl.className   = 'music-source ' + (data.source || 'spotify')
    }

    // Album art
    if (artEl) {
      if (data.coverUrl) {
        artEl.innerHTML = '<img src="' + data.coverUrl + '" ' +
          'onerror="this.parentElement.innerHTML=\'<span class=\\\"music-note\\\">♪</span>\'">'
        artEl.style.cssText = ''
      } else {
        artEl.innerHTML = '<span class="music-note">♪</span>'
        artEl.style.cssText = ''
      }
    }

    // Progress
    this.progress = data.progress || 0
    this.duration = data.duration || 1
    this._updateBar()
    this._stopTick()
    if (data.playing) this._startTick()
  }

  _updateBar() {
    const pct      = Math.min(100, (this.progress / this.duration) * 100)
    const barEl    = document.getElementById('music-bar-fill')
    const startEl  = document.getElementById('music-time-start')
    const endEl    = document.getElementById('music-time-end')
    const legacyEl = document.getElementById('music-time')
    if (barEl)    barEl.style.width = pct + '%'
    if (startEl)  startEl.textContent = this._fmt(this.progress)
    if (endEl)    endEl.textContent   = this._fmt(this.duration)
    if (legacyEl) legacyEl.textContent = this._fmt(this.progress) + ' / ' + this._fmt(this.duration)
  }

  _fmt(s) {
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')
  }

  _startTick() {
    this.tickInterval = setInterval(() => {
      if (this.progress < this.duration) { this.progress++; this._updateBar() }
      else this._stopTick()
    }, 1000)
  }

  _stopTick() {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
  }
}

if (typeof window !== 'undefined') {
  window.MusicWidget = MusicWidget
}
