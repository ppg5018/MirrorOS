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

// Escape untrusted text before it goes into innerHTML. Message subjects,
// senders, event titles etc. are attacker-controllable and must never be
// interpreted as HTML.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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
  get_tasks: 'tasks',
  add_task: 'tasks',
  complete_task: 'tasks',
  delete_task: 'tasks',
  set_backlight: 'backlight',
  morning_briefing: 'all',
  get_news: 'ai-bar',
  set_reminder: 'ai-bar',
  play_music: 'music',
  get_quote:  'quote',
  manage_habits: 'habits',
  alarm_control: 'alarm',
  fitness_control: 'fitness'
}

// ── Typewriter animation ────────────────────
function typewriter(el, text, speed = 28) {
  if (!el) return
  text = String(text == null ? '' : text)

  // Cancel any animation still running on this element. Without this, an
  // overlapping call wipes the element (removing the old cursor) while the old
  // interval keeps calling insertBefore(node, oldCursor) \u2014 which throws every
  // tick forever because oldCursor is no longer a child.
  if (el._twTimer)    { clearInterval(el._twTimer); el._twTimer = null }
  if (el._twEndTimer) { clearTimeout(el._twEndTimer); el._twEndTimer = null }

  el.textContent = ''
  let i = 0
  const cursor = document.createElement('span')
  cursor.style.cssText = 'color:var(--accent);animation:blink 0.8s step-end infinite;'
  cursor.textContent = '|'
  el.appendChild(cursor)

  el._twTimer = setInterval(() => {
    // If the cursor was detached (element reused elsewhere), stop cleanly.
    if (cursor.parentNode !== el) {
      clearInterval(el._twTimer); el._twTimer = null
      return
    }
    el.insertBefore(document.createTextNode(text[i++]), cursor)
    if (i >= text.length) {
      clearInterval(el._twTimer); el._twTimer = null
      el._twEndTimer = setTimeout(() => {
        el._twEndTimer = null
        if (cursor.parentNode === el) cursor.remove()
        setState('idle')
        el.textContent = 'Say \u201cHey Mirror\u201d to begin.'
      }, 7000)
    }
  }, speed)
}

// ── Clock (12-hour, Mira style) ─────────────
function updateClock() {
  const now = new Date()
  const rawH = now.getHours()
  let h12 = rawH % 12
  if (h12 === 0) h12 = 12
  const m = String(now.getMinutes()).padStart(2, '0')
  const ampm = rawH < 12 ? 'AM' : 'PM'

  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

  const hEl = document.getElementById('clock-h')
  const mEl = document.getElementById('clock-m')
  const apEl = document.getElementById('clock-ampm')
  if (hEl) hEl.textContent = String(h12)
  if (mEl) mEl.textContent = m
  if (apEl) apEl.textContent = ampm

  const dateEl = document.getElementById('clock-date')
  if (dateEl) dateEl.textContent =
    days[now.getDay()] + ' · ' + months[now.getMonth()] + ' ' + now.getDate()
}

updateClock()
setInterval(updateClock, 5000) // Pi: 5s is fine — we only display HH:MM

// ── Greeting (time-of-day + owner name) ─────
// fetchGmail() supplies the real Google account name; until then we keep
// whatever name is already in the markup and just fix the time-of-day prefix.
let _ownerName = null
function updateGreeting() {
  const el = document.querySelector('.ai-card-greeting')
  if (!el) return
  const hour = new Date().getHours()
  const tod = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  if (!_ownerName) {
    const m = (el.textContent || '').match(/,\s*(.+)$/)
    if (m) _ownerName = m[1].trim()
  }
  el.textContent = _ownerName ? `${tod}, ${_ownerName}` : tod
}
updateGreeting()
setInterval(updateGreeting, 60 * 1000)

// ── Weather ────────────────────────────────
// Map an OpenWeather condition string → a Material Symbols Rounded glyph name.
function weatherSymbol(cond) {
  const c = String(cond || '').toLowerCase()
  if (c.includes('thunder')) return 'thunderstorm'
  if (c.includes('drizzle')) return 'rainy'
  if (c.includes('rain'))    return 'rainy'
  if (c.includes('snow'))    return 'weather_snowy'
  if (c.includes('mist') || c.includes('fog') || c.includes('haze') ||
      c.includes('smoke') || c.includes('dust')) return 'foggy'
  if (c.includes('partly') || c.includes('few') || c.includes('scatter')) return 'partly_cloudy_day'
  if (c.includes('cloud') || c.includes('overcast')) return 'cloud'
  if (c.includes('clear') || c.includes('sun')) return 'clear_day'
  return 'partly_cloudy_day'
}

async function fetchWeather() {
  try {
    const res = await fetch('/api/weather')
    const data = await res.json()

    const tempEl = document.querySelector('.weather-temp')
    const condEl = document.querySelector('.weather-condition')
    const iconEl = document.querySelector('.weather-icon')

    if (tempEl) tempEl.textContent = data.temp + '°'
    if (condEl) {
      // Match the design: "Clear · feels 16°"
      condEl.textContent = (data.feelsLike != null)
        ? data.condition + ' · feels ' + data.feelsLike + '°'
        : data.city + ' · ' + data.condition
    }
    if (iconEl) iconEl.textContent = weatherSymbol(data.weatherMain || data.condition)

    // Hi / lo
    const hiEl = document.getElementById('wx-high')
    const loEl = document.getElementById('wx-low')
    if (hiEl && data.high != null) hiEl.textContent = data.high
    if (loEl && data.low  != null) loEl.textContent = data.low

    // Forecast strip — prefer the hourly strip (design), fall back to daily forecast
    const fc = document.getElementById('weather-forecast')
    const strip = Array.isArray(data.hourly) && data.hourly.length
      ? data.hourly.map(f => ({ label: f.label, temp: f.temp, condition: f.condition }))
      : (Array.isArray(data.forecast) ? data.forecast.map(f => ({ label: f.day, temp: f.temp, condition: f.condition })) : [])
    if (fc && strip.length) {
      fc.innerHTML = strip.map(f => `
        <div class="wx-hour">
          <div class="wx-h-label">${escapeHtml(f.label || '')}</div>
          <span class="msr">${weatherSymbol(f.condition)}</span>
          <div class="wx-h-temp">${f.temp}°</div>
        </div>
      `).join('')
    }
  } catch (err) {
    console.error('[main] fetchWeather error:', err)
  }
}

// ── Calendar ───────────────────────────────
async function fetchCalendar(fresh) {
  try {
    const res = await fetch('/api/calendar' + (fresh ? '?fresh=1' : ''))
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

      // Mira-style colored chip, cycling accent colors
      const palette = [
        { color: '#f4b183', bg: 'rgba(244,177,131,.15)', icon: 'groups' },
        { color: '#8ec5ff', bg: 'rgba(142,197,255,.15)', icon: 'draw' },
        { color: '#b8f0c8', bg: 'rgba(184,240,200,.15)', icon: 'restaurant' }
      ]
      const p = palette[i % palette.length]

      const row = document.createElement('div')
      row.className = 'schedule-event' + stateClass
      row.dataset.index = String(i)

      row.innerHTML = `
        <span class="sched-chip" style="color:${p.color};background:${p.bg};">
          <span class="msr">${p.icon}</span>
        </span>
        <div class="sched-body">
          <span class="event-name">${escapeHtml(event.title)}${event.current ? '<span class="event-now-tag">Now</span>' : ''}</span>
          <span class="event-location">${displayH}:${rawM} ${ampm}${event.location ? ' · ' + escapeHtml(event.location) : ''}</span>
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
      <span class="task-icon msr">${reminderIcon(task.text)}</span>
      <span class="task-text">${escapeHtml(task.text)}</span>
    `
    list.appendChild(item)
  })
}

// Pick a small muted glyph for a reminder, matching the design's iconography.
function reminderIcon(text) {
  const t = String(text || '').toLowerCase()
  if (/(meditat|stretch|yoga|breath|mindful)/.test(t)) return 'self_improvement'
  if (/(walk|leave|go |commute|run |jog|gym|workout)/.test(t)) return 'directions_walk'
  if (/(water|plant|flower|garden)/.test(t)) return 'local_florist'
  if (/(call|phone|ring)/.test(t)) return 'call'
  if (/(buy|shop|grocery|groceries|pick up|order)/.test(t)) return 'shopping_cart'
  if (/(email|mail|reply|send)/.test(t)) return 'mail'
  if (/(pay|bill|rent|invoice)/.test(t)) return 'payments'
  if (/(read|book|study)/.test(t)) return 'menu_book'
  return 'radio_button_unchecked'
}

// ── Habits render ───────────────────────────
// Accepts the /api/habits view: { habits:[{name,doneToday,streak,week[]}], doneToday, total }
function renderHabits(data) {
  const list = document.getElementById('habits-list')
  if (!list) return

  const habits = (data && data.habits) || []
  const done   = (data && typeof data.doneToday === 'number') ? data.doneToday : habits.filter(h => h.doneToday).length
  const total  = (data && typeof data.total === 'number') ? data.total : habits.length

  const counterEl = document.getElementById('habits-done-counter')
  if (counterEl) counterEl.textContent = total > 0 ? `${done}/${total} done` : ''

  const progressEl = document.getElementById('habits-progress-fill')
  if (progressEl) progressEl.style.width = total > 0 ? (done / total * 100) + '%' : '0%'

  list.innerHTML = ''

  if (total === 0) {
    list.innerHTML = '<div class="habit-item" style="color:var(--dimmer)">No habits yet</div>'
    return
  }

  habits.forEach(habit => {
    const week = Array.isArray(habit.week) ? habit.week : []
    const dots = week.map(on => `<span class="habit-dot ${on ? 'on' : ''}"></span>`).join('')
    const streak = habit.streak || 0

    const item = document.createElement('div')
    item.className = 'habit-item' + (habit.doneToday ? ' done' : '')
    item.innerHTML = `
      <span class="habit-check">${SVG_ICONS.check}</span>
      <span class="habit-name">${escapeHtml(habit.name)}</span>
      <span class="habit-week">${dots}</span>
      <span class="habit-streak ${streak > 0 ? '' : 'zero'}">${streak > 0 ? streak + 'd' : '—'}</span>
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
          if (widget === 'habits') fetchHabits()
          if (widget === 'alarm' && typeof fetchAlarms === 'function') fetchAlarms()
          if (widget === 'calendar') fetchCalendar(true)
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

// Keep the header badge (#notif-count) in sync with the number of live items.
function _updateNotifCount(widget) {
  const w = widget || document.getElementById('widget-notifications')
  if (!w) return
  const n = w.querySelectorAll('.notif-item:not(.notif-empty)').length
  const badge = document.getElementById('notif-count')
  if (badge) {
    badge.textContent = n > 0 ? String(n) : ''
    badge.style.display = n > 0 ? '' : 'none'
  }
}

// ── Gmail / Notifications ───────────────────
async function fetchGmail() {
  try {
    const res  = await fetch('/api/gmail')
    const data = await res.json()

    // Update ALL greeting elements with real Google account name
    if (data.name) {
      _ownerName = data.name
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
    widget.querySelectorAll('.notif-auth-warn').forEach(el => el.remove())

    // Warn ONLY when email is actually set up but currently failing — never
    // when it's simply not configured (that's a normal, quiet state).
    if (data.configured && data.error) {
      const warn = document.createElement('div')
      warn.className = 'notif-auth-warn'
      warn.style.cssText = 'font-size:10px;color:rgba(255,100,100,0.7);padding:4px 0 8px;font-family:var(--font-mono)'
      warn.textContent = '⚠ Email sync failed — recheck it in setup'
      widget.appendChild(warn)
      return
    }

    data.previews.forEach(p => {
      const timeLabel = _notifTimeLabel(p.date)
      const item = document.createElement('div')
      item.className = 'notif-item'
      item.innerHTML = `
        <div class="notif-icon" style="color:#f4b183;background:rgba(244,177,131,.15)"><span class="msr">mail</span></div>
        <div class="notif-content">
          <div class="notif-sender">${escapeHtml(p.sender)}</div>
          <div class="notif-message">${escapeHtml(p.subject)}</div>
        </div>
        ${timeLabel ? `<span class="notif-time">${escapeHtml(timeLabel)}</span>` : ''}
        <button class="notif-dismiss" aria-label="Dismiss">×</button>
      `
      item.querySelector('.notif-dismiss').addEventListener('click', () => {
        item.remove()
        _updateNotifCount(widget)
      })
      widget.appendChild(item)
    })

    _updateNotifCount(widget)

    if (data.previews.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'notif-item notif-empty'
      empty.style.color = 'var(--dimmer)'
      empty.textContent = "You're all caught up."
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

// ── Habits fetch ────────────────────────────
async function fetchHabits() {
  try {
    const res = await fetch('/api/habits')
    const data = await res.json()
    renderHabits(data)
  } catch (err) {
    console.error('[main] fetchHabits error:', err)
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

// ── News list (Mira card) ──────────────────
let _newsHeadlines = []
let _newsIdx = 0
let _newsTimer = null

function renderNews() {
  const list = document.getElementById('news-list')
  if (!list) return
  if (_newsHeadlines.length === 0) {
    list.innerHTML = '<div class="news-item"><span class="news-text" style="color:var(--dimmer)">No headlines</span></div>'
    return
  }
  list.innerHTML = _newsHeadlines.slice(0, 4).map((h, i) => `
    <div class="news-item${i === _newsIdx ? ' active' : ''}">
      <span class="news-dot"></span>
      <span class="news-text">${escapeHtml(h.title || h)}</span>
    </div>
  `).join('')
}

function fetchNews() {
  fetch('/api/news')
    .then(r => r.json())
    .then(data => {
      _newsHeadlines = (data && data.headlines) || []
      _newsIdx = 0
      renderNews()
      if (_newsTimer) clearInterval(_newsTimer)
      const n = Math.min(4, _newsHeadlines.length)
      if (n > 1) {
        _newsTimer = setInterval(() => {
          _newsIdx = (_newsIdx + 1) % n
          renderNews()
        }, 5000)
      }
    })
    .catch(() => { })
}

// ── Photo Gallery (Mira carousel) ──────────
let _galleryPhotos = []
let _galleryIdx = 0
let _galleryTimer = null

function renderGallery() {
  const frame = document.getElementById('gallery-frame')
  const dots  = document.getElementById('gallery-dots')
  if (!frame) return

  // Rebuild only slides (keep the scrim)
  frame.querySelectorAll('.gallery-slide, .gallery-empty').forEach(el => el.remove())

  if (_galleryPhotos.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'gallery-empty'
    empty.innerHTML = '<span class="msr">add_photo_alternate</span><span>Add photos from the companion app</span>'
    frame.insertBefore(empty, frame.firstChild)
    if (dots) dots.innerHTML = ''
    return
  }

  _galleryPhotos.forEach((p, i) => {
    const slide = document.createElement('div')
    slide.className = 'gallery-slide' + (i === _galleryIdx ? ' active' : '')
    slide.style.backgroundImage = `url("${p.url}")`
    frame.insertBefore(slide, frame.firstChild)
  })

  if (dots) {
    dots.innerHTML = ''
    _galleryPhotos.forEach((_, i) => {
      const d = document.createElement('span')
      d.className = 'gallery-dot' + (i === _galleryIdx ? ' active' : '')
      d.addEventListener('click', () => { _galleryIdx = i; renderGallery(); _scheduleGallery() })
      dots.appendChild(d)
    })
  }
}

function _scheduleGallery() {
  if (_galleryTimer) clearInterval(_galleryTimer)
  if (_galleryPhotos.length > 1) {
    _galleryTimer = setInterval(() => {
      _galleryIdx = (_galleryIdx + 1) % _galleryPhotos.length
      renderGallery()
    }, 6000)
  }
}

function fetchGallery() {
  fetch('/api/photos')
    .then(r => r.json())
    .then(data => {
      _galleryPhotos = (data && data.photos) || []
      _galleryIdx = 0
      renderGallery()
      _scheduleGallery()
    })
    .catch(() => {})
}

// ── Ask Mira orb ───────────────────────────
function initOrb() {
  const wrap  = document.getElementById('widget-ai-bar')
  const btn   = document.getElementById('orb-btn')
  const input = document.getElementById('orb-input')
  const send  = document.getElementById('orb-send')
  if (!wrap || !btn) return

  const openOrb  = () => { wrap.classList.add('open'); if (input) setTimeout(() => input.focus(), 60) }
  const closeOrb = () => wrap.classList.remove('open')
  const toggle   = () => wrap.classList.contains('open') ? closeOrb() : openOrb()

  btn.addEventListener('click', toggle)

  const submit = () => {
    if (!input) return
    const q = input.value.trim()
    if (!q) return
    input.value = ''
    openOrb()
    sendTextQuery(q)
  }
  if (send)  send.addEventListener('click', submit)
  if (input) input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') closeOrb()
  })

  // Auto-open the panel whenever Mira is listening or responding so the
  // reply/voice status is visible even if the user didn't tap the orb.
  const body = document.body
  new MutationObserver(() => {
    if (body.classList.contains('state-listening') || body.classList.contains('state-responding')) {
      openOrb()
    }
  }).observe(body, { attributes: true, attributeFilter: ['class'] })
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
// Map dashboard buttons onto the actions /api/spotify/control accepts:
// pause | resume | next | prev. 'toggle' becomes pause/resume based on the
// widget's current playing state; 'prev' must be 'prev' (not 'previous').
function mediaCommand(action) {
  if (typeof spotifyControl !== 'function') return
  if (action === 'next') return spotifyControl('next')
  if (action === 'prev') return spotifyControl('prev')
  if (action === 'toggle') {
    const playing = !!(window.musicWidgetInstance &&
      window.musicWidgetInstance.lastData &&
      window.musicWidgetInstance.lastData.playing)
    return spotifyControl(playing ? 'pause' : 'resume')
  }
}

// ── Voice-driven display controls ───────────
// Screen "brightness" is a dimming overlay (a mirror can only get darker).
let _screenBrightness = 100
function _ensureDimEl() {
  let el = document.getElementById('screen-dim')
  if (!el) {
    el = document.createElement('div')
    el.id = 'screen-dim'
    el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;' +
      'pointer-events:none;z-index:90000;transition:opacity 0.4s ease;'
    document.body.appendChild(el)
  }
  return el
}
function applyScreenBrightness(level) {
  _screenBrightness = Math.min(100, Math.max(10, level))
  _ensureDimEl().style.opacity = String((100 - _screenBrightness) / 100)
}

if (typeof socket !== 'undefined') {
  // Highlight any panel (voice: "highlight the calendar")
  socket.on('widget-highlight', ({ widget }) => {
    if (typeof highlightWidget === 'function') highlightWidget(widget)
  })

  // Clear ambient-art wallpaper (voice: "clear the wallpaper")
  socket.on('wallpaper-control', ({ action }) => {
    if (action === 'clear' && typeof clearWallpaper === 'function') clearWallpaper()
  })

  // Screen brightness (voice: "dim the screen" / "brightness 50")
  socket.on('display-brightness', ({ action, level }) => {
    if (action === 'set' && typeof level === 'number') applyScreenBrightness(level)
    else if (action === 'dim')      applyScreenBrightness(_screenBrightness - 20)
    else if (action === 'brighten') applyScreenBrightness(_screenBrightness + 20)
  })
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
    fetchQuote(),
    fetchGallery()
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

// ── Fitness mode redirect ────────────────
if (typeof socket !== 'undefined') {
  socket.on('fitness:state', function (data) {
    if (data.state && data.state !== 'idle' && data.state !== 'complete' && window.location.pathname === '/') {
      window.location.href = '/fitness'
    }
  })
  socket.on('fitness:redirect', function (data) {
    if (data.url) window.location.href = data.url
  })
}

// ── Screensaver ──────────────────────────
if (typeof socket !== 'undefined') {
  socket.on('screensaver:enter', () => window.screensaver && window.screensaver.enter())
  socket.on('screensaver:exit',  () => window.screensaver && window.screensaver.exit())
  socket.on('screensaver:library-updated', () => window.screensaver && window.screensaver.onLibraryUpdated())

  // PIR motion and wake word both exit screensaver
  socket.on('motion', () => window.screensaver && window.screensaver.isActive() && window.screensaver.exit())
  socket.on('voice-state', (data) => {
    if (data.state === 'listening' && window.screensaver && window.screensaver.isActive()) {
      window.screensaver.exit()
    }
  })
}

// ── Morning briefing indicator ──────────────
function showBriefingIndicator() {
  if (document.getElementById('briefing-indicator')) return
  const el = document.createElement('div')
  el.id = 'briefing-indicator'
  el.innerHTML = '<div class="briefing-dot"></div><span>Morning briefing...</span>'
  document.body.appendChild(el)
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')))
}

function hideBriefingIndicator() {
  const el = document.getElementById('briefing-indicator')
  if (!el) return
  el.classList.remove('visible')
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el) }, 800)
}

document.addEventListener('briefing:starting', () => {
  console.log('[main] morning briefing starting')
  const aiWidget = document.getElementById('widget-ai') ||
    document.getElementById('ai-bar') ||
    document.querySelector('.ai-pill') ||
    document.querySelector('[id*="ai"]')
  if (aiWidget) aiWidget.classList.add('briefing-active')
  showBriefingIndicator()
})

document.addEventListener('briefing:complete', () => {
  console.log('[main] morning briefing complete')
  const aiWidget = document.getElementById('widget-ai') ||
    document.getElementById('ai-bar') ||
    document.querySelector('.ai-pill') ||
    document.querySelector('[id*="ai"]')
  if (aiWidget) aiWidget.classList.remove('briefing-active')
  hideBriefingIndicator()
})

// ── WhatsApp real-time events ───────────────
if (typeof socket !== 'undefined') {
  socket.on('whatsapp:message', (data) => {
    const notifList = document.getElementById('widget-notifications')
    if (!notifList) return

    const item = document.createElement('div')
    item.className = 'notif-item notif-new'
    item.innerHTML = `
      <div class="notif-icon" style="color:#8ec5ff;background:rgba(142,197,255,.15)"><span class="msr">chat</span></div>
      <div class="notif-content">
        <div class="notif-sender">${escapeHtml(data.from)}</div>
        <div class="notif-message">${escapeHtml(data.text)}</div>
      </div>
      <span class="notif-time">now</span>
      <button class="notif-dismiss" aria-label="Dismiss">×</button>
    `
    item.querySelector('.notif-dismiss').addEventListener('click', () => {
      item.remove()
      if (typeof _updateNotifCount === 'function') _updateNotifCount(notifList)
    })
    const firstItem = notifList.querySelector('.notif-item')
    if (firstItem) notifList.insertBefore(item, firstItem)
    else notifList.appendChild(item)

    const items = notifList.querySelectorAll('.notif-item')
    if (items.length > 5) items[items.length - 1].remove()
    if (typeof _updateNotifCount === 'function') _updateNotifCount(notifList)

    notifList.classList.add('widget-highlight')
    setTimeout(() => notifList.classList.remove('widget-highlight'), 1000)
  })

  socket.on('whatsapp:status', (data) => {
    const dot = document.getElementById('conn-dot-whatsapp')
    if (dot) {
      dot.className = 'conn-dot ' + (data.connected ? 'active' : '')
    }
  })

  socket.on('whatsapp:qr', () => {
    console.log('[WhatsApp] QR received — scan from phone')
  })
}

// ── Setup check — show QR overlay on fresh install ──────────
fetch('/api/setup/qr-data')
  .then(r => r.json())
  .then(data => { if (!data.setupComplete) showSetupScreen(data.setupURL) })
  .catch(() => {})

function showSetupScreen(setupURL) {
  const overlay = document.createElement('div')
  overlay.id = 'setup-overlay'
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:#000',
    'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center',
    'z-index:99999', 'font-family:system-ui,sans-serif'
  ].join(';')

  overlay.innerHTML = `
    <p style="color:#4ecdc4;font-size:11px;letter-spacing:4px;margin-bottom:24px;text-transform:uppercase">Mira Setup</p>
    <h2 style="color:white;font-size:28px;font-weight:200;margin:0 0 8px">Scan to set up your mirror</h2>
    <p style="color:rgba(255,255,255,0.4);font-size:14px;margin:0 0 40px">Open the camera app on your phone</p>
    <canvas id="setup-qr-canvas" style="border-radius:12px"></canvas>
    <p style="color:rgba(255,255,255,0.25);font-size:12px;margin-top:24px">${setupURL}</p>
  `
  document.body.appendChild(overlay)

  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'
  script.onload = () => {
    QRCode.toCanvas(
      document.getElementById('setup-qr-canvas'),
      setupURL,
      { width: 220, margin: 2, color: { dark: '#000000', light: '#ffffff' } }
    )
  }
  document.head.appendChild(script)

  if (typeof socket !== 'undefined') {
    socket.on('setup:complete', (data) => {
      overlay.innerHTML = `
        <div style="text-align:center">
          <div style="width:80px;height:80px;border-radius:50%;background:rgba(78,205,196,0.15);border:2px solid #4ecdc4;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:36px;color:#4ecdc4">✓</div>
          <h2 style="color:white;font-size:28px;font-weight:200;margin:0 0 8px">Welcome, ${escapeHtml(data.name || 'to Mira')}!</h2>
          <p style="color:rgba(255,255,255,0.4);margin:0">Loading your dashboard...</p>
        </div>
      `
      setTimeout(() => overlay.remove(), 3000)
    })
  }
}

fetchAll()
fetchNews()

setInterval(fetchAll, 5 * 60 * 1000)
setInterval(fetchNews, 15 * 60 * 1000)

initOrb()

// Refresh the gallery when photos change (companion app upload)
if (typeof socket !== 'undefined') {
  socket.on('photos-updated', () => fetchGallery())
}

if (window.screensaver) window.screensaver.init()
