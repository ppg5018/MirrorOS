/* ============================================
   MirrorOS — alarm-widget.js
   Alarm list widget + fullscreen ring overlay with a Web Audio tone.
   Voice controls everything; this file is display + sound only.
   Socket wiring lives in socket.js (renderAlarms / showAlarmRing / hideAlarmRing).
   ============================================ */

// Self-contained escape (alarm-widget.js parses before main.js).
function alarmEscape(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function repeatBadge(repeat) {
  if (!repeat || repeat === 'once') return 'Once'
  if (repeat === 'daily')    return 'Daily'
  if (repeat === 'weekdays') return 'Weekdays'
  if (repeat === 'weekends') return 'Weekends'
  return repeat // explicit day list, e.g. "mon, wed"
}

// ── Render the widget ───────────────────────
// data: { alarms:[{time,label,repeat,enabled,nextFire}], next, count }
function renderAlarms(data) {
  const list = document.getElementById('alarm-list')
  if (!list) return

  const alarms = (data && data.alarms) || []
  const next   = data && data.next

  const nextEl = document.getElementById('alarm-next')
  if (nextEl) nextEl.textContent = next ? `Next ${next.time}` : ''

  list.innerHTML = ''

  if (!alarms.length) {
    list.innerHTML = '<div class="alarm-empty">No alarms set</div>'
    return
  }

  alarms.forEach(a => {
    const item = document.createElement('div')
    item.className = 'alarm-item' + (a.enabled ? '' : ' off')
    item.innerHTML = `
      <span class="alarm-dot"></span>
      <span class="alarm-time">${alarmEscape(a.time)}</span>
      <span class="alarm-meta">
        ${a.label ? `<span class="alarm-label">${alarmEscape(a.label)}</span>` : ''}
        <span class="alarm-repeat">${alarmEscape(repeatBadge(a.repeat))}</span>
      </span>
      <span class="alarm-toggle">${a.enabled ? 'ON' : 'OFF'}</span>
    `
    list.appendChild(item)
  })
}

async function fetchAlarms() {
  try {
    const res  = await fetch('/api/alarm')
    const data = await res.json()
    renderAlarms(data)
    // If an alarm is already ringing (e.g. page reloaded mid-ring), resume it.
    if (data && data.ringing) showAlarmRing(data.ringing)
  } catch (err) {
    console.error('[alarm] fetchAlarms error:', err)
  }
}

// ── Ring tone (Web Audio) ───────────────────
let _alarmCtx  = null
let _alarmLoop = null

function alarmBeep() {
  try {
    if (!_alarmCtx) _alarmCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (_alarmCtx.state === 'suspended') _alarmCtx.resume()

    const now = _alarmCtx.currentTime
    // Two short rising beeps per cycle.
    ;[0, 0.28].forEach((offset, i) => {
      const osc  = _alarmCtx.createOscillator()
      const gain = _alarmCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = i === 0 ? 880 : 1046
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.5, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22)
      osc.connect(gain).connect(_alarmCtx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.24)
    })
  } catch (e) {
    // Autoplay may be blocked outside a kiosk — the visual overlay still shows.
  }
}

function startAlarmSound() {
  if (_alarmLoop) return
  alarmBeep()
  _alarmLoop = setInterval(alarmBeep, 1400)
}

function stopAlarmSound() {
  if (_alarmLoop) { clearInterval(_alarmLoop); _alarmLoop = null }
}

// ── Ring overlay ────────────────────────────
function showAlarmRing(data) {
  const overlay = document.getElementById('alarm-overlay')
  if (!overlay) return
  const timeEl  = document.getElementById('alarm-ring-time')
  const labelEl = document.getElementById('alarm-ring-label')
  if (timeEl)  timeEl.textContent  = (data && data.time)  || ''
  if (labelEl) labelEl.textContent = (data && data.label) || 'Alarm'
  overlay.classList.add('active')
  startAlarmSound()
}

function hideAlarmRing() {
  const overlay = document.getElementById('alarm-overlay')
  if (overlay) overlay.classList.remove('active')
  stopAlarmSound()
}

// ── Manual dismiss / snooze (tap the ring, for testing) ──
// Voice normally drives these, but the overlay hint words are clickable too.
async function dismissAlarm() {
  hideAlarmRing()   // optimistic — the alarm:stop socket event confirms it
  try {
    await fetch('/api/alarm/stop', { method: 'POST' })
  } catch (err) {
    console.error('[alarm] stop error:', err)
  }
}

async function snoozeAlarm(minutes) {
  hideAlarmRing()
  try {
    await fetch('/api/alarm/snooze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: minutes || 9 })
    })
  } catch (err) {
    console.error('[alarm] snooze error:', err)
  }
}

function alarmIsRinging() {
  const overlay = document.getElementById('alarm-overlay')
  return !!(overlay && overlay.classList.contains('active'))
}

function wireAlarmButtons() {
  const snoozeBtn = document.getElementById('alarm-snooze-btn')

  // Snooze: tapping the word (if the hit lands) snoozes without dismissing.
  if (snoozeBtn) {
    snoozeBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      snoozeAlarm(9)
    })
  }

  // Stop: listen on the document, NOT the overlay. main.js applies
  // document.documentElement.style.zoom, and under root CSS zoom a fixed
  // overlay's clickable area is offset from where it paints — so a click on
  // the visible overlay may never reach the overlay element. A document-level
  // listener still fires because the click lands on *some* element and bubbles.
  document.addEventListener('click', (e) => {
    if (!alarmIsRinging()) return
    if (snoozeBtn && snoozeBtn.contains(e.target)) return
    console.log('[alarm] dismiss via click')
    dismissAlarm()
  })

  // Keyboard fallback — bypasses hit-testing entirely.
  // Esc / S = stop, Z = snooze.
  document.addEventListener('keydown', (e) => {
    if (!alarmIsRinging()) return
    const k = e.key.toLowerCase()
    if (k === 'escape' || k === 's') { e.preventDefault(); console.log('[alarm] dismiss via key'); dismissAlarm() }
    else if (k === 'z')             { e.preventDefault(); snoozeAlarm(9) }
  })
}

// ── Boot ────────────────────────────────────
// Scripts run after the DOM is parsed (bottom of <body>), so no DOMContentLoaded.
wireAlarmButtons()
fetchAlarms()
