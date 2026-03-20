class NewsTicker {
  constructor() {
    this.el = null
    this.headlines = []
    this.currentIndex = 0
    this.interval = null
  }

  init() {
    this.el = document.createElement('div')
    this.el.id = 'news-ticker'
    this.el.innerHTML = `
      <div class="news-bar-accent"></div>
      <span class="ticker-label">NEWS</span>
      <span class="ticker-source" id="ticker-source"></span>
      <div class="ticker-track">
        <span class="ticker-text" id="ticker-text"></span>
      </div>
      <span class="ticker-time" id="ticker-time"></span>
      <div class="ticker-dots" id="ticker-dots"></div>
    `
    document.body.appendChild(this.el)
  }

  load(headlines) {
    if (!headlines || headlines.length === 0) return
    this.headlines = headlines
    this.currentIndex = 0
    this._buildDots()
    this._show(0)
    this._startRotation()
  }

  _buildDots() {
    const dotsEl = document.getElementById('ticker-dots')
    if (!dotsEl) return
    dotsEl.innerHTML = ''
    this.headlines.forEach((_, i) => {
      const dot = document.createElement('span')
      dot.className = 'ticker-dot' + (i === 0 ? ' active' : '')
      dotsEl.appendChild(dot)
    })
  }

  _show(index) {
    const h = this.headlines[index]
    if (!h) return
    const textEl = document.getElementById('ticker-text')
    const srcEl  = document.getElementById('ticker-source')
    const timeEl = document.getElementById('ticker-time')

    // Fade out
    if (textEl) { textEl.style.opacity = '0'; textEl.style.transform = 'translateY(6px)' }
    if (srcEl)  srcEl.style.opacity = '0'
    if (timeEl) timeEl.style.opacity = '0'

    // Update active dot
    const dots = document.querySelectorAll('.ticker-dot')
    dots.forEach((d, i) => d.classList.toggle('active', i === index))

    setTimeout(() => {
      if (textEl) {
        textEl.textContent = h.title
        textEl.style.opacity = '1'
        textEl.style.transform = 'translateY(0)'
      }
      if (srcEl) {
        srcEl.textContent = h.source || ''
        srcEl.style.opacity = '1'
      }
      if (timeEl) {
        timeEl.textContent = this._formatTime(h.publishedAt || h.time)
        timeEl.style.opacity = timeEl.textContent ? '1' : '0'
      }
    }, 300)
  }

  _formatTime(val) {
    if (!val) return ''
    const date = new Date(val)
    if (isNaN(date.getTime())) return val // already formatted string
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1)  return 'just now'
    if (diffMin < 60) return diffMin + 'm ago'
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24)   return diffH + 'h ago'
    return Math.floor(diffH / 24) + 'd ago'
  }

  _startRotation() {
    if (this.interval) clearInterval(this.interval)
    this.interval = setInterval(() => {
      this.currentIndex = (this.currentIndex + 1) % this.headlines.length
      this._show(this.currentIndex)
    }, 8000)
  }

  destroy() {
    if (this.interval) clearInterval(this.interval)
    if (this.el) this.el.remove()
  }
}

if (typeof window !== 'undefined') {
  window.NewsTicker = NewsTicker
}
