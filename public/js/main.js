/* ============================================
   MirrorOS — main.js
   ============================================ */

// ── Viewport scaling (matches Figma's transform:scale approach) ──────────────
// Scales the entire UI so a 1920×1080 design fits any screen size
;(function applyScale() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
  document.documentElement.style.zoom = scale
})()
window.addEventListener('resize', function () {
  document.documentElement.style.zoom = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
})

// Flag: true while a direct text query is in flight (prevents socket double-animation)
let _queryInFlight = false

/* ─── Figma-exact inline SVG icons ─── */
const SVG_ICONS = {
  // Notification icons
  whatsapp: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" stroke="rgba(37,211,102,0.90)" stroke-width="1.1"/><path d="M17.5 14.3c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.2-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.4-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.2-.5 0-.2-.8-1.9-1.1-2.6-.3-.6-.5-.5-.7-.5H8c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.1 3.1 1.3 3.3c.2.2 2.2 3.4 5.4 4.7 3.2 1.3 3.2.9 3.8.8.6-.1 1.8-.7 2.1-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.3-.5-.5Z" fill="rgba(37,211,102,0.85)"/></svg>',

  gmail: '<svg width="22" height="17" viewBox="0 0 24 18" fill="none"><rect x="1" y="1" width="22" height="16" rx="2" stroke="rgba(255,100,100,0.85)" stroke-width="1.1"/><polyline points="1,2 12,10 23,2" stroke="rgba(255,100,100,0.85)" stroke-width="1.1" fill="none" stroke-linejoin="round"/></svg>',

  calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,107,53,1.0)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',

  // Music control icons
  prev: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/><rect x="5" y="4" width="2.5" height="16" rx="1"/></svg>',

  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>',

  pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',

  next: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="16.5" y="4" width="2.5" height="16" rx="1"/></svg>',

  heart: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',

  spotifyLogo: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="rgba(30,215,96,0.20)" stroke="rgba(30,215,96,0.75)" stroke-width="1"/><path d="M7 15.5c2.5-1 5.5-.8 7.5.5" stroke="rgba(30,215,96,1.0)" stroke-width="1.3" stroke-linecap="round"/><path d="M6.5 12.5c3-1.2 6.5-1 9 .8" stroke="rgba(30,215,96,1.0)" stroke-width="1.3" stroke-linecap="round"/><path d="M6 9.5c3.5-1.4 7.5-1.2 10.5 1" stroke="rgba(30,215,96,1.0)" stroke-width="1.3" stroke-linecap="round"/></svg>',

  // Task check icon
  check: '<svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#00FF88" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
}

// Client-side tool → widget map (mirrors server/ai/claude.js TOOL_TO_WIDGET)
const TOOL_TO_WIDGET = {
  get_weather: 'weather',
  get_calendar_events: 'calendar',
  get_whatsapp_messages: 'notifications',
  add_task: 'tasks',
  set_backlight: 'backlight',
  morning_briefing: 'all',
  get_news: 'ai-bar',
  set_reminder: 'ai-bar',
  play_music: 'music',
  get_quote:  'quote'
}

// ── Typewriter animation ────────────────────
function typewriter(el, text, speed = 28) {
  el.textContent = ''
  let i = 0
  const cursor = document.createElement('span')
  cursor.style.cssText = 'color:var(--accent);animation:blink 0.8s step-end infinite;'
  cursor.textContent = '|'
  el.appendChild(cursor)

  const timer = setInterval(() => {
    el.insertBefore(document.createTextNode(text[i++]), cursor)
    if (i >= text.length) {
      clearInterval(timer)
      setTimeout(() => {
        cursor.remove()
        setState('idle')
        el.textContent = 'Say \u201cHey Mirror\u201d to begin.'
      }, 7000)
    }
  }, speed)
}

// ── Clock ──────────────────────────────────
function updateClock() {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')

  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

  document.getElementById('clock-h').textContent = h
  document.getElementById('clock-m').textContent = m

  document.getElementById('clock-date').textContent =
    days[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()]
}

updateClock()
setInterval(updateClock, 1000)

// ── Weather ────────────────────────────────
async function fetchWeather() {
  try {
    const res = await fetch('/api/weather')
    const data = await res.json()

    const tempEl = document.querySelector('.weather-temp')
    const condEl = document.querySelector('.weather-condition')
    const iconEl = document.querySelector('.weather-icon')

    if (tempEl) tempEl.textContent = data.temp + '°'
    if (condEl) condEl.textContent = data.city + ' · ' + data.condition
    if (iconEl && typeof getWeatherIcon === 'function') {
      iconEl.innerHTML = getWeatherIcon(data.weatherMain || data.condition, 52)
    }

    // Forecast — slot 0 = TODAY (current conditions), slots 1-3 = API forecast days
    const forecastDays = document.querySelectorAll('.forecast-day')
    if (forecastDays.length) {
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
      const today = new Date()

      // Slot 0: today's current weather
      const todayNameEl = forecastDays[0] ? forecastDays[0].querySelector('.day-name') : null
      const todayHiEl   = forecastDays[0] ? forecastDays[0].querySelector('.day-temp-hi') : null
      const todayIconEl = document.getElementById('forecast-icon-0')
      if (todayNameEl) todayNameEl.textContent = days[today.getDay()]
      if (todayHiEl)   todayHiEl.textContent   = data.temp + '°'
      if (todayIconEl && typeof getWeatherIcon === 'function') {
        todayIconEl.innerHTML = getWeatherIcon(data.weatherMain || data.condition, 18)
      }

      // Slots 1-3: next 3 forecast days
      if (data.forecast) {
        data.forecast.slice(0, 3).forEach((f, i) => {
          const slot = forecastDays[i + 1]
          if (!slot) return
          const nameEl        = slot.querySelector('.day-name')
          const hiEl          = slot.querySelector('.day-temp-hi')
          const forecastIconEl = document.getElementById('forecast-icon-' + (i + 1))
          if (nameEl) nameEl.textContent = f.day
          if (hiEl)   hiEl.textContent   = f.temp + '°'
          if (forecastIconEl && typeof getWeatherIcon === 'function') {
            forecastIconEl.innerHTML = getWeatherIcon(f.condition || data.weatherMain || data.condition, 18)
          }
        })
      }
    }

    // Humidity tag
    if (data.humidity) {
      const humidityTag = document.querySelector('.weather-tag .tag-text')
      if (humidityTag) humidityTag.textContent = data.humidity + '% Humidity'
    }
  } catch (err) {
    console.error('[main] fetchWeather error:', err)
  }
}

// ── Calendar ───────────────────────────────
async function fetchCalendar() {
  try {
    const res = await fetch('/api/calendar')
    const data = await res.json()

    const container = document.querySelector('.schedule-widget')
    if (!container || !data.events) return

    container.querySelectorAll('.schedule-event').forEach(el => el.remove())
    container.querySelectorAll('.no-events').forEach(el => el.remove())

    if (data.events.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'no-events'
      empty.style.cssText = 'color:var(--dimmer); font-size:12px; margin-top:12px;'
      empty.textContent = 'No events today'
      container.appendChild(empty)
      return
    }

    const now = new Date()

    data.events.forEach((event, i) => {
      const [rawH, rawM] = event.time.split(':')
      const h = parseInt(rawH, 10)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const displayH = h > 12 ? h - 12 : h || 12

      // Determine if past: event time < current time (same day assumed)
      const eventMinutes = h * 60 + parseInt(rawM, 10)
      const nowMinutes   = now.getHours() * 60 + now.getMinutes()
      const isPast = !event.current && (eventMinutes < nowMinutes)

      const stateClass = event.current ? ' active' : (isPast ? ' past' : '')

      const isLast = (i === data.events.length - 1)

      const row = document.createElement('div')
      row.className = 'schedule-event' + stateClass
      row.dataset.index = String(i)

      const dotClass = event.current ? 'active' : (isPast ? 'done' : 'inactive')
      const lineClass = event.current ? 'event-line active-line' : 'event-line'

      row.innerHTML = `
        <div class="event-time-block">
          <span class="event-time-h">${displayH}:${rawM}</span>
          <span class="event-time-ampm">${ampm}</span>
        </div>
        <div class="event-dot-col">
          <div class="event-dot ${dotClass}"></div>
          ${!isLast ? `<div class="${lineClass}"></div>` : ''}
        </div>
        <div class="event-details">
          <span class="event-name${event.current ? ' active' : ''}">${event.title}${event.current ? '<span class="event-now-tag">Now</span>' : ''}</span>
          <span class="event-location${event.current ? ' active' : ''}">${event.location || ''}</span>
        </div>
      `
      container.appendChild(row)
    })
  } catch (err) {
    console.error('[main] fetchCalendar error:', err)
  }
}

// ── Tasks render ─────────────────────────────
function renderTasks(tasks) {
  const list = document.getElementById('tasks-list')
  if (!list) return

  list.innerHTML = ''

  const done  = tasks.filter(t => t.done)
  const total = tasks.length

  // Update done counter
  const counterEl  = document.getElementById('tasks-done-counter')
  if (counterEl) counterEl.textContent = total > 0 ? `${done.length}/${total} done` : ''

  // Update progress bar
  const progressEl = document.getElementById('tasks-progress-fill')
  if (progressEl) progressEl.style.width = total > 0 ? (done.length / total * 100) + '%' : '0%'

  if (total === 0) {
    list.innerHTML = '<div class="task-item" style="color:var(--dimmer)">No tasks</div>'
    return
  }

  tasks.forEach(task => {
    const item = document.createElement('div')
    item.className = 'task-item' + (task.done ? ' done' : '')
    item.innerHTML = `
      <span class="task-priority ${task.priority || 'low'}"></span>
      <span class="task-check">${task.done ? SVG_ICONS.check : ''}</span>
      <span class="task-text">${task.text}</span>
    `
    list.appendChild(item)
  })
}

// ── Widget highlight ────────────────────────
function highlightWidget(widgetName) {
  document.querySelectorAll('.widget-highlight')
    .forEach(el => el.classList.remove('widget-highlight'))

  if (!widgetName || widgetName === 'ai-bar') return

  if (widgetName === 'all') {
    ['weather', 'calendar', 'tasks', 'notifications'].forEach(w => {
      const el = document.getElementById('widget-' + w)
      if (el) el.classList.add('widget-highlight')
    })
  } else {
    const el = document.getElementById('widget-' + widgetName)
    if (el) el.classList.add('widget-highlight')
  }

  setTimeout(() => {
    document.querySelectorAll('.widget-highlight')
      .forEach(el => el.classList.remove('widget-highlight'))
  }, 6000)
}

// ── Screen state ───────────────────────────
function setState(state) {
  document.body.className = 'state-' + state

  // Nav tab highlight (+1 offset: "State" label is tabs[0])
  const tabs = document.querySelectorAll('.nav-tab')
  const idx = ['idle', 'listening', 'responding'].indexOf(state)
  tabs.forEach(t => t.classList.remove('active'))
  if (tabs[idx + 1]) tabs[idx + 1].classList.add('active')

  if (state === 'idle') {
    const hint = document.querySelector('.ai-card-hint')
    if (hint && !hint.querySelector('span')) {
      hint.textContent = 'Say \u201cHey Mirror\u201d to begin.'
    }
  }

  if (state === 'listening') {
    const hint = document.querySelector('.ai-card-hint')
    if (hint) hint.textContent = 'Listening...'
  }
}

// ── AI query (text) ────────────────────────
async function sendTextQuery(text) {
  if (!text.trim()) return
  _queryInFlight = true
  setState('listening')

  const safetyTimer = setTimeout(() => { _queryInFlight = false; setState('idle') }, 15000)

  try {
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() })
    })
    const data = await res.json()
    clearTimeout(safetyTimer)
    _queryInFlight = false

    if (data.tool) console.log(`[main] tool used: ${data.tool}`)

    if (data.reply) {
      const hint = document.querySelector('.ai-card-hint')
      if (hint) {
        setState('responding')
        typewriter(hint, data.reply)
        const widget = TOOL_TO_WIDGET[data.tool] || null
        if (widget) {
          highlightWidget(widget)
          if (widget === 'tasks') fetchTasks()
          if (widget === 'calendar') fetchCalendar()
        }
      }
    } else if (data.error) {
      console.error('[main] voice error:', data.error)
      setState('idle')
    }
  } catch (err) {
    clearTimeout(safetyTimer)
    _queryInFlight = false
    console.error('[main] sendTextQuery error:', err)
    setState('idle')
  }
}

// ── Test input bar ──────────────────────────
function initTestInput() {
  const card = document.querySelector('.ai-card')
  if (!card) return

  const wrap = document.createElement('div')
  wrap.style.cssText = 'margin-top:10px;display:flex;gap:6px;'

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Type a query to test Claude...'
  input.style.cssText = `
    flex:1; background:#111; border:1px solid #333; color:#fff;
    padding:6px 10px; border-radius:4px; font-size:12px; font-family:inherit;
    outline:none;
  `

  const btn = document.createElement('button')
  btn.textContent = '→'
  btn.style.cssText = `
    background:#00D4FF; color:#000; border:none; border-radius:4px;
    padding:6px 12px; cursor:pointer; font-weight:bold;
  `

  const send = () => {
    const q = input.value.trim()
    if (!q) return
    input.value = ''
    sendTextQuery(q)
  }

  input.addEventListener('keydown', e => { if (e.key === 'Enter') send() })
  btn.addEventListener('click', send)

  wrap.appendChild(input)
  wrap.appendChild(btn)
  card.appendChild(wrap)
}

// ── Status bar ─────────────────────────────
async function fetchStatus() {
  try {
    const res = await fetch('/api/status')
    const data = await res.json()

    if (data.nextBriefing) {
      const briefingEl = document.querySelector('.status-value')
      if (briefingEl) {
        const t = new Date(data.nextBriefing)
        const h = String(t.getHours()).padStart(2, '0')
        const m = String(t.getMinutes()).padStart(2, '0')
        briefingEl.textContent = `Briefing · ${h}:${m}`
      }
    }

    const versionEl = document.querySelector('.status-bar-left span:first-child')
    if (versionEl) versionEl.textContent = `v1.4.1 · Node ${data.nodeVersion}`
  } catch (err) {
    console.error('[main] fetchStatus error:', err)
  }
}

// ── Auth Status ────────────────────────────
async function fetchAuthStatus() {
  try {
    const res = await fetch('/api/auth-status')
    const data = await res.json()

    const toggle = (id, isActive) => {
      const dot = document.getElementById(id)
      if (dot) dot.className = 'conn-dot ' + (isActive ? 'active' : '')
    }

    toggle('conn-dot-google', data.google)
    toggle('conn-dot-weather', data.weather)
    toggle('conn-dot-claude', data.claude)
    toggle('conn-dot-whatsapp', data.whatsapp)
  } catch (err) {
    console.error('[main] fetchAuthStatus error:', err)
  }
}

// ── Relative time for notification badges ────
function _notifTimeLabel(dateVal) {
  if (!dateVal) return null
  const date = new Date(dateVal)
  if (isNaN(date.getTime())) return null
  const diffMs  = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1)   return 'now'
  if (diffMin < 60)  return diffMin + 'm'
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)    return diffH + 'h'
  return Math.floor(diffH / 24) + 'd'
}

// ── Gmail / Notifications ───────────────────
async function fetchGmail() {
  try {
    const res  = await fetch('/api/gmail')
    const data = await res.json()

    // Update ALL greeting elements with real Google account name
    if (data.name) {
      const hour = new Date().getHours()
      const tod  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
      const text = `${tod}, ${data.name}`

      const todGreeting   = document.getElementById('tod-greeting')
      const clockGreeting = document.getElementById('clock-greeting')
      const aiGreeting    = document.querySelector('.ai-card-greeting')

      if (todGreeting)   todGreeting.textContent   = text
      if (clockGreeting) clockGreeting.textContent = text
      if (aiGreeting)    aiGreeting.textContent    = text
    }

    // Notifications widget
    const widget = document.getElementById('widget-notifications')
    if (!widget || !data.previews) return

    widget.querySelectorAll('.notif-item').forEach(el => el.remove())

    // Label stays as "Notifications" — no unread count in header (Figma spec)

    data.previews.forEach(p => {
      const timeLabel = _notifTimeLabel(p.date)
      const isUnread  = p.unread !== false
      const item = document.createElement('div')
      item.className = 'notif-item'
      item.innerHTML = `
        <div class="notif-icon email">${SVG_ICONS.gmail}</div>
        <div class="notif-content">
          <div class="notif-sender">${p.sender}</div>
          <div class="notif-message">${p.subject}</div>
        </div>
        ${timeLabel ? `<span class="notif-time">${timeLabel}</span>` : `<span class="notif-meta">${isUnread ? '<span class="notif-badge-new"></span>' : ''}</span>`}
      `
      widget.appendChild(item)
    })

    if (data.previews.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'notif-item'
      empty.style.color = 'var(--dimmer)'
      empty.textContent = 'No unread emails'
      widget.appendChild(empty)
    }
  } catch (err) {
    console.error('[main] fetchGmail error:', err)
  }
}

// ── Tasks fetch ─────────────────────────────
async function fetchTasks() {
  try {
    const res = await fetch('/api/tasks')
    const data = await res.json()
    if (data.tasks) renderTasks(data.tasks)
  } catch (err) {
    console.error('[main] fetchTasks error:', err)
  }
}

// ── Slideshow ──────────────────────────────
const slideshow = new Slideshow()
slideshow.init()

if (typeof socket !== 'undefined') {
  socket.on('photos-updated', () => slideshow.refresh())
  socket.on('slideshow-settings', (s) => slideshow.applySettings(s))
  socket.on('slideshow-control', (data) => {
    if (!window.slideshowInstance) return
    const ss = window.slideshowInstance
    switch (data.action) {
      case 'next':   ss.next();   break
      case 'prev':   ss.prev();   break
      case 'pause':  ss.pause();  break
      case 'resume': ss.resume(); break
    }
  })
}

// ── Music Widget ────────────────────────────
const musicWidget = new MusicWidget()
musicWidget.init()

// Socket events for music (Spotify playback)
if (typeof socket !== 'undefined') {
  socket.on('music-update', () => {
    if (musicWidget && typeof musicWidget._fetchAndUpdate === 'function') {
      musicWidget._fetchAndUpdate()
    }
  })

  socket.on('spotify-play', async (data) => {
    const play = () => {
      if (window.spotifyPlayUri && typeof window.spotifyPlayUri === 'function') {
        window.spotifyPlayUri(data.uri)
      }
    }
    if (window.isSpotifyReady && window.isSpotifyReady()) {
      play()
    } else {
      let attempts = 0
      const poll = setInterval(() => {
        attempts++
        if (window.isSpotifyReady && window.isSpotifyReady()) {
          clearInterval(poll)
          play()
        } else if (attempts > 20) {
          clearInterval(poll)
        }
      }, 500)
    }
  })

  socket.on('spotify-control', (data) => {
    if (window.spotifyControl && typeof window.spotifyControl === 'function') {
      window.spotifyControl(data.action, data.value)
    }
  })
}

// ── News Ticker ────────────────────────────
const ticker = new NewsTicker()
ticker.init()

function fetchNews() {
  fetch('/api/news')
    .then(r => r.json())
    .then(data => ticker.load(data.headlines))
    .catch(() => { })
}

// ── Daily Quote ────────────────────────────
function updateQuoteDOM(data) {
  const textEl   = document.getElementById('quote-text')
  const authorEl = document.getElementById('quote-author-name')
  if (!textEl || !authorEl) return

  textEl.classList.add('updating')
  setTimeout(() => {
    textEl.textContent   = data.text   || ''
    authorEl.textContent = data.author || ''
    textEl.classList.remove('updating')
  }, 400)
}

const FALLBACK_QUOTES = [
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { text: 'Arise, awake, and stop not till the goal is reached.', author: 'Swami Vivekananda' },
  { text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' }
]

async function fetchQuote() {
  try {
    const res  = await fetch('/api/quote')
    const data = await res.json()
    // If server returns 'MirrorOS' as author or no real author, use a real quote
    if (!data.author || data.author === 'MirrorOS') {
      const q = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)]
      updateQuoteDOM(q)
    } else {
      updateQuoteDOM(data)
    }
  } catch (e) {
    const q = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)]
    updateQuoteDOM(q)
  }
}

// Real-time quote push (TOD change or voice refresh)
if (typeof socket !== 'undefined') {
  socket.on('quote-update', (data) => updateQuoteDOM(data))
}

// ── Media command bridge (HTML onclick → Spotify) ────
function mediaCommand(action) {
  if (typeof spotifyControl === 'function') {
    if (action === 'toggle') spotifyControl('toggle')
    else if (action === 'prev') spotifyControl('previous')
    else if (action === 'next') spotifyControl('next')
  }
}

// ── Boot ───────────────────────────────────
async function fetchAll() {
  await Promise.all([
    fetchWeather(),
    fetchCalendar(),
    fetchStatus(),
    fetchAuthStatus(),
    fetchTasks(),
    fetchGmail(),
    fetchQuote()
  ])
}

// ── Wallpaper ──────────────────────────────
function applyWallpaper(dataUrl) {
  // Only show image inside the Ambient Art widget frame, not as full-screen background
  const thumb = document.getElementById('wallpaper-thumb')
  const text  = document.getElementById('wallpaper-drop-text')
  const clear = document.getElementById('wallpaper-clear')
  if (thumb) { thumb.style.backgroundImage = `url(${dataUrl})`; thumb.style.display = 'block' }
  if (text)  text.textContent = 'Change wallpaper'
  if (clear) clear.style.display = 'block'
}

function clearWallpaper() {
  localStorage.removeItem('mirror-wallpaper')
  const thumb = document.getElementById('wallpaper-thumb')
  const text  = document.getElementById('wallpaper-drop-text')
  const clear = document.getElementById('wallpaper-clear')
  if (thumb) { thumb.style.backgroundImage = ''; thumb.style.display = 'none' }
  if (text)  text.textContent = 'Drop image or click'
  if (clear) clear.style.display = 'none'
}

function processWallpaperFile(file) {
  if (!file || !file.type.startsWith('image/')) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const MAX = 1920
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
      try { localStorage.setItem('mirror-wallpaper', dataUrl) } catch (e) { /* storage full */ }
      applyWallpaper(dataUrl)
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
}

function initWallpaper() {
  const input = document.getElementById('wallpaper-input')
  const drop  = document.getElementById('wallpaper-drop')
  const clear = document.getElementById('wallpaper-clear')
  if (!input || !drop) return

  // Restore saved wallpaper
  const saved = localStorage.getItem('mirror-wallpaper')
  if (saved) applyWallpaper(saved)

  // Click to open file picker
  input.addEventListener('change', (e) => {
    processWallpaperFile(e.target.files[0])
    input.value = ''
  })

  // Drag and drop
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag-over') })
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'))
  drop.addEventListener('drop', (e) => {
    e.preventDefault()
    drop.classList.remove('drag-over')
    processWallpaperFile(e.dataTransfer.files[0])
  })

  if (clear) clear.addEventListener('click', (e) => { e.preventDefault(); clearWallpaper() })
}

fetchAll()
fetchNews()

setInterval(fetchAll, 5 * 60 * 1000)
setInterval(fetchNews, 15 * 60 * 1000)

initTestInput()
initWallpaper()
