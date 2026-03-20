/* ============================================
   MirrorOS — slideshow.js
   Cycles uploaded photos inside the wallpaper widget
   ============================================ */

class Slideshow {
  constructor() {
    this.photos   = []
    this.current  = 0
    this.timer    = null
    this.settings = { interval: 10, transition: 'fade', order: 'random' }
    this.thumbEl  = null
    this.textEl   = null
    this.clearEl  = null
  }

  init() {
    this.thumbEl = document.getElementById('wallpaper-thumb')
    this.textEl  = document.getElementById('wallpaper-drop-text')
    this.clearEl = document.getElementById('wallpaper-clear')

    this.loadSettings().then(() => this.loadPhotos())
    window.slideshowInstance = this
  }

  async loadSettings() {
    try {
      const res     = await fetch('/api/photos/settings')
      this.settings = await res.json()
    } catch (e) {}
  }

  async loadPhotos() {
    try {
      const res   = await fetch('/api/photos')
      const data  = await res.json()
      this.photos = data.photos || []

      if (this.settings.order === 'random') {
        this.photos.sort(() => Math.random() - 0.5)
      } else if (this.settings.order === 'oldest') {
        this.photos.reverse()
      }

      if (this.photos.length > 0) {
        this._showPhoto(0)
        this._startTimer()
      } else {
        this._stopTimer()
        // Fall back to locally saved wallpaper
        const saved = localStorage.getItem('mirror-wallpaper')
        if (saved && this.thumbEl) {
          this.thumbEl.style.backgroundImage = 'url(' + saved + ')'
          this.thumbEl.style.display = 'block'
        }
      }
    } catch (e) {
      console.warn('[Slideshow] Load failed:', e.message)
    }
  }

  _showPhoto(index) {
    if (!this.photos.length || !this.thumbEl) return
    this.current = ((index % this.photos.length) + this.photos.length) % this.photos.length
    const photo  = this.photos[this.current]

    this.thumbEl.style.transition = 'opacity 0.5s ease'
    this.thumbEl.style.opacity    = '0'
    this.thumbEl.style.display    = 'block'

    setTimeout(() => {
      this.thumbEl.style.backgroundImage = 'url(' + photo.url + ')'
      this.thumbEl.style.transition      = 'opacity ' + this._getFadeDuration() + ' ease'
      this.thumbEl.style.opacity         = '0.85'
    }, 500)

    if (this.textEl) {
      this.textEl.textContent = (this.current + 1) + ' / ' + this.photos.length
    }
    if (this.clearEl) this.clearEl.style.display = 'block'
  }

  _getFadeDuration() {
    switch (this.settings.transition) {
      case 'slow':  return '3s'
      case 'quick': return '0.3s'
      default:      return '1s'
    }
  }

  _startTimer() {
    this._stopTimer()
    if (this.photos.length < 2) return
    this.timer = setInterval(() => this._showPhoto(this.current + 1), this.settings.interval * 1000)
  }

  _stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  next()   { this._showPhoto(this.current + 1); this._startTimer() }
  prev()   { this._showPhoto(this.current - 1); this._startTimer() }
  pause()  { this._stopTimer() }
  resume() { if (this.photos.length > 1) this._startTimer() }

  applySettings(s) {
    this.settings = { ...this.settings, ...s }
    if (this.photos.length > 0) this._startTimer()
  }

  refresh() {
    this._stopTimer()
    this.loadPhotos()
  }
}

window.Slideshow = Slideshow
