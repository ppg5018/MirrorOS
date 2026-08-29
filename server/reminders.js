// ── One-shot, persistent reminders ───────────────────────────
// The old set_reminder created a DAILY-recurring cron that was never
// cancelled and was lost on restart. This module instead schedules each
// reminder to fire exactly once, persists them to disk, and reloads any
// still-pending reminders on startup. Times are interpreted in the mirror's
// local timezone (the device runs in Pune / IST).

const fs   = require('fs')
const path = require('path')

const STORE = path.join(__dirname, '../config/reminders.json')

let io = null
let reminders = []            // [{ id, message, fireAt (ISO) }]
const timers = new Map()      // id → timeout handle

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    reminders = Array.isArray(parsed) ? parsed : []
  } catch (e) {
    reminders = []
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true })
    fs.writeFileSync(STORE, JSON.stringify(reminders, null, 2))
  } catch (e) {
    console.error('[reminders] save failed:', e.message)
  }
}

function announce(message) {
  console.log('[reminder] firing:', message)
  if (io) io.emit('ai-response', { text: `Reminder: ${message}`, isReminder: true })
}

function fire(rem) {
  announce(rem.message)
  reminders = reminders.filter(r => r.id !== rem.id)
  const t = timers.get(rem.id)
  if (t) { clearTimeout(t); timers.delete(rem.id) }
  save()
}

function scheduleOne(rem) {
  const delay = new Date(rem.fireAt).getTime() - Date.now()
  if (delay <= 0) { fire(rem); return }
  const t = setTimeout(() => fire(rem), delay)
  if (t.unref) t.unref()          // don't keep the process alive just for this
  timers.set(rem.id, t)
}

// Called once at startup. Reschedules pending reminders; fires (best-effort)
// any that came due while the mirror was offline in the last 2h, drops older.
function init(_io) {
  io = _io
  load()
  const now  = Date.now()
  const kept = []
  reminders.forEach(rem => {
    const at = new Date(rem.fireAt).getTime()
    if (isNaN(at)) return
    if (at <= now) {
      if (now - at < 2 * 60 * 60 * 1000) announce(rem.message)
      return                        // don't keep — it has passed
    }
    kept.push(rem)
  })
  reminders = kept
  save()
  reminders.forEach(scheduleOne)
}

// message: string, time: 'HH:MM' (24h). Schedules the next occurrence.
function addReminder(message, time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim())
  if (!m) return { error: 'Invalid time format. Use HH:MM' }

  const hh = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (hh > 23 || mm > 59) return { error: 'Invalid time. Use 00:00–23:59.' }

  const now    = new Date()
  const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0)
  if (fireAt.getTime() <= now.getTime()) fireAt.setDate(fireAt.getDate() + 1) // next occurrence

  const rem = {
    id:      Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    message: String(message || 'Reminder'),
    fireAt:  fireAt.toISOString()
  }
  reminders.push(rem)
  save()
  scheduleOne(rem)
  return { success: true, fireAt: rem.fireAt }
}

module.exports = { init, addReminder }
