// ── Voice-controlled alarms ──────────────────────────────────
// One-time and recurring alarms, fully voice-controllable. Each alarm stores a
// wall-clock time (HH:MM) and an optional set of weekdays it repeats on. A
// single low-frequency checker fires alarms whose minute has arrived; a ringing
// alarm can be dismissed ("stop") or snoozed by voice. Alarms are persisted to
// config/alarms.json and reloaded on startup. Times are interpreted in the
// mirror's local timezone (the device runs in Pune / IST) — same as reminders.js.

const fs   = require('fs')
const path = require('path')

const STORE = path.join(__dirname, '../config/alarms.json')

// How often the checker wakes to compare the clock against each alarm. 15s is
// comfortably below a minute so no alarm is ever missed, while staying cheap on
// the Pi.
const CHECK_INTERVAL_MS = 15 * 1000

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

let io = null
let alarms = []            // [{ id, time:'HH:MM', label, enabled, days:[0-6], lastFired:'YYYY-MM-DDTHH:MM' }]
let ringing = null         // { id, time, label } — the alarm currently sounding, or null
let checkTimer = null

// ── Persistence ─────────────────────────────────────────────
function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    alarms = Array.isArray(parsed) ? parsed : []
  } catch (e) {
    alarms = []
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true })
    fs.writeFileSync(STORE, JSON.stringify(alarms, null, 2))
  } catch (e) {
    console.error('[alarms] save failed:', e.message)
  }
}

function mkId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── Time helpers (local wall-clock, matches the device timezone) ──
function pad(n) { return String(n).padStart(2, '0') }

function nowParts(d = new Date()) {
  return {
    hhmm: pad(d.getHours()) + ':' + pad(d.getMinutes()),
    date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    dow:  d.getDay()
  }
}

// Parse a spoken/ISO time into 'HH:MM' 24h, or null if invalid.
function normalizeTime(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim())
  if (!m) return null
  const hh = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (hh > 23 || mm > 59) return null
  return pad(hh) + ':' + pad(mm)
}

// Turn a repeat keyword or list of day names into an array of weekday numbers.
// [] means a one-time alarm (fires at the next occurrence, then removes itself).
function normalizeDays(repeat, days) {
  if (Array.isArray(days) && days.length) {
    const out = []
    days.forEach(d => {
      const idx = DAY_NAMES.indexOf(String(d).toLowerCase().trim())
      if (idx >= 0 && !out.includes(idx)) out.push(idx)
    })
    if (out.length) return out.sort()
  }
  switch (String(repeat || 'once').toLowerCase().trim()) {
    case 'daily':    return [0, 1, 2, 3, 4, 5, 6]
    case 'weekdays': return [1, 2, 3, 4, 5]
    case 'weekends': return [0, 6]
    default:         return []   // 'once'
  }
}

function repeatLabel(days) {
  if (!days || !days.length) return 'once'
  if (days.length === 7) return 'daily'
  const wd = [1, 2, 3, 4, 5], we = [0, 6]
  if (days.length === 5 && wd.every(d => days.includes(d))) return 'weekdays'
  if (days.length === 2 && we.every(d => days.includes(d))) return 'weekends'
  return days.map(d => DAY_NAMES[d].slice(0, 3)).join(', ')
}

// Next fire time as an ISO string (for display / sorting). null if disabled.
function nextFireISO(alarm) {
  if (!alarm.enabled) return null
  const [hh, mm] = alarm.time.split(':').map(Number)
  const now = new Date()
  for (let i = 0; i < 8; i++) {
    const cand = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh, mm, 0, 0)
    if (cand.getTime() <= now.getTime()) continue
    if (!alarm.days.length || alarm.days.includes(cand.getDay())) return cand.toISOString()
  }
  return null
}

// ── View (shape sent to the widget + AI) ───────────────────
function viewAlarm(a) {
  return {
    id:      a.id,
    time:    a.time,
    label:   a.label || '',
    enabled: a.enabled !== false,
    days:    a.days || [],
    repeat:  repeatLabel(a.days),
    nextFire: nextFireISO(a)
  }
}

function view() {
  const list = alarms
    .map(viewAlarm)
    .sort((a, b) => a.time.localeCompare(b.time))
  // Soonest upcoming enabled alarm, for the widget headline.
  const upcoming = list
    .filter(a => a.nextFire)
    .sort((a, b) => new Date(a.nextFire) - new Date(b.nextFire))[0] || null
  return {
    alarms:  list,
    next:    upcoming,
    count:   list.length,
    ringing: ringing ? { ...ringing } : null
  }
}

function emitUpdate() {
  if (io) io.emit('alarms-updated', view())
}

// ── Ringing lifecycle ──────────────────────────────────────
function fire(alarm) {
  ringing = { id: alarm.id, time: alarm.time, label: alarm.label || '' }
  console.log('[alarm] ringing:', alarm.time, alarm.label || '')

  if (io) {
    io.emit('alarm:ring', { ...ringing })
    // Also surface it through the AI card so it is spoken aloud.
    const spoken = alarm.label ? `Alarm: ${alarm.label}.` : `It's ${alarm.time}. Alarm ringing.`
    io.emit('ai-response', { text: spoken, isAlarm: true })
  }

  // One-time alarms are consumed once they fire; recurring ones stay.
  if (!alarm.days.length) {
    alarms = alarms.filter(a => a.id !== alarm.id)
  }
  save()
  emitUpdate()
}

// Stop the currently ringing alarm (voice: "stop" / "dismiss" / "turn it off").
function stopRinging() {
  if (!ringing) return { success: false, message: 'No alarm is ringing right now.' }
  const was = ringing
  ringing = null
  if (io) io.emit('alarm:stop', {})
  emitUpdate()
  return { success: true, message: 'Alarm dismissed.', time: was.time }
}

// Snooze the ringing alarm for N minutes by scheduling a fresh one-time alarm.
function snooze(minutes) {
  const mins = Math.min(120, Math.max(1, parseInt(minutes, 10) || 9))
  const label = ringing && ringing.label ? ringing.label : ''
  // Clear the current ring first (whether or not one is active).
  if (ringing) { ringing = null; if (io) io.emit('alarm:stop', {}) }

  const t = new Date(Date.now() + mins * 60 * 1000)
  const time = pad(t.getHours()) + ':' + pad(t.getMinutes())
  const alarm = {
    id:        mkId(),
    time,
    label:     label || 'Snooze',
    enabled:   true,
    days:      [],
    lastFired: null
  }
  alarms.push(alarm)
  save()
  emitUpdate()
  return { success: true, message: `Snoozed for ${mins} minutes — I'll wake you at ${time}.`, time }
}

// ── The checker ────────────────────────────────────────────
function tick() {
  if (ringing) return               // don't stack rings — wait for dismiss/snooze
  const { hhmm, date, dow } = nowParts()
  const key = date + 'T' + hhmm

  const due = alarms.find(a =>
    a.enabled !== false &&
    a.time === hhmm &&
    a.lastFired !== key &&
    (!a.days || !a.days.length || a.days.includes(dow))
  )
  if (!due) return

  due.lastFired = key               // guard against re-firing within the same minute
  fire(due)
}

// ── Public API ─────────────────────────────────────────────

// Called once at startup. Loads alarms and starts the checker.
function init(_io) {
  io = _io
  load()
  // Never carry a stale "lastFired" from a previous minute into a missed fire.
  if (checkTimer) clearInterval(checkTimer)
  checkTimer = setInterval(tick, CHECK_INTERVAL_MS)
  if (checkTimer.unref) checkTimer.unref()
  console.log(`[alarms] loaded ${alarms.length} alarm(s), checker running`)
}

// time: 'HH:MM' 24h. repeat: 'once'|'daily'|'weekdays'|'weekends'. days: optional names.
function addAlarm(time, label, repeat, days) {
  const t = normalizeTime(time)
  if (!t) return { error: 'Invalid time. Use HH:MM, 00:00–23:59.' }

  const alarm = {
    id:        mkId(),
    time:      t,
    label:     String(label || '').trim().slice(0, 60),
    enabled:   true,
    days:      normalizeDays(repeat, days),
    lastFired: null
  }
  alarms.push(alarm)
  save()
  emitUpdate()
  return { success: true, alarm: viewAlarm(alarm) }
}

// Find alarms matching a spoken query: a time ("7:00"/"07:00"), a label
// substring, or "all". Returns an array (possibly empty).
function matchAlarms(query) {
  const q = String(query || '').toLowerCase().trim()
  if (!q || q === 'all' || q === 'everything') return alarms.slice()

  const asTime = normalizeTime(q)
  if (asTime) return alarms.filter(a => a.time === asTime)

  // Bare hour like "7" or "7 am" → match any alarm in that hour.
  const hourM = /^(\d{1,2})\s*(am|pm)?$/.exec(q)
  if (hourM) {
    let hh = parseInt(hourM[1], 10)
    if (hourM[2] === 'pm' && hh < 12) hh += 12
    if (hourM[2] === 'am' && hh === 12) hh = 0
    const prefix = pad(hh) + ':'
    const byHour = alarms.filter(a => a.time.startsWith(prefix))
    if (byHour.length) return byHour
  }

  return alarms.filter(a => a.label && a.label.toLowerCase().includes(q))
}

function deleteAlarm(query) {
  const matches = matchAlarms(query)
  if (!matches.length) return { error: 'No matching alarm found.' }
  const ids = new Set(matches.map(a => a.id))
  alarms = alarms.filter(a => !ids.has(a.id))
  // If the ringing alarm was deleted, silence it too.
  if (ringing && ids.has(ringing.id)) { ringing = null; if (io) io.emit('alarm:stop', {}) }
  save()
  emitUpdate()
  return { success: true, deleted: matches.map(viewAlarm) }
}

function setEnabled(query, enabled) {
  const matches = matchAlarms(query)
  if (!matches.length) return { error: 'No matching alarm found.' }
  matches.forEach(a => { a.enabled = !!enabled })
  save()
  emitUpdate()
  return { success: true, updated: matches.map(viewAlarm), enabled: !!enabled }
}

function list() {
  return view()
}

module.exports = {
  init,
  addAlarm,
  deleteAlarm,
  setEnabled,
  snooze,
  stopRinging,
  list,
  view
}
