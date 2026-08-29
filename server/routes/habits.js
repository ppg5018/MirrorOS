// ── Habit tracker ────────────────────────────────────────────
// User-defined daily habits, fully voice-controllable. Each habit stores a
// per-date completion history so streaks and the weekly grid are derived, not
// stored. Persisted to data/habits.json and reloaded on startup. Dates use the
// mirror's local timezone (the device runs in Pune / IST).

const express = require('express')
const router  = express.Router()
const fs      = require('fs')
const path    = require('path')

const STORE = path.join(__dirname, '../../data/habits.json')

let habits = []   // [{ id, name, emoji, target, history: { 'YYYY-MM-DD': count } }]

// ── Persistence ────────────────────────────────────────────
function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    habits = Array.isArray(parsed) ? parsed : []
  } catch (e) {
    // First run — seed with a couple of examples so the widget isn't empty.
    habits = [
      { id: mkId(), name: 'Drink water',  emoji: '💧', target: 1, history: {} },
      { id: mkId(), name: 'Meditate',     emoji: '🧘', target: 1, history: {} }
    ]
    save()
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true })
    fs.writeFileSync(STORE, JSON.stringify(habits, null, 2))
  } catch (e) {
    console.error('[habits] save failed:', e.message)
  }
}

function mkId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── Date helpers (IST-aware, no external deps) ─────────────
// 'en-CA' locale formats as YYYY-MM-DD, which sorts and compares cleanly.
function dateStr(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function shiftDay(baseStr, deltaDays) {
  const [y, m, d] = baseStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return dt.toISOString().slice(0, 10)
}

// ── Derived fields ─────────────────────────────────────────
function isDone(habit, day) {
  return (habit.history[day] || 0) >= (habit.target || 1)
}

// Streak = consecutive completed days ending today. If today isn't done yet the
// streak isn't broken — it just counts up to yesterday, so a fresh morning keeps
// yesterday's streak alive until the day ends.
function computeStreak(habit) {
  const today = dateStr()
  let cursor  = isDone(habit, today) ? today : shiftDay(today, -1)
  let streak  = 0
  while (isDone(habit, cursor)) {
    streak++
    cursor = shiftDay(cursor, -1)
  }
  return streak
}

// Last 7 days (oldest → today) as booleans for the weekly dot grid.
function weekGrid(habit) {
  const today = dateStr()
  const out = []
  for (let i = 6; i >= 0; i--) out.push(isDone(habit, shiftDay(today, -i)))
  return out
}

function view() {
  const today = dateStr()
  const list = habits.map(h => ({
    id:         h.id,
    name:       h.name,
    emoji:      h.emoji || '',
    target:     h.target || 1,
    todayCount: h.history[today] || 0,
    doneToday:  isDone(h, today),
    streak:     computeStreak(h),
    week:       weekGrid(h)
  }))
  return {
    date:      today,
    habits:    list,
    doneToday: list.filter(h => h.doneToday).length,
    total:     list.length
  }
}

function emit(req) {
  const io = req.app.get('io')
  if (io) io.emit('habits-updated', view())
}

function findHabit(text) {
  if (!text) return null
  const q = String(text).toLowerCase().trim()
  return habits.find(h => h.name.toLowerCase() === q) ||
         habits.find(h => h.name.toLowerCase().includes(q)) ||
         habits.find(h => q.includes(h.name.toLowerCase())) ||
         null
}

// ── Routes ─────────────────────────────────────────────────

// GET /api/habits — full view with derived streaks
router.get('/', (req, res) => {
  res.json(view())
})

// POST /api/habits — create a habit
router.post('/', (req, res) => {
  const { name, emoji = '', target } = req.body || {}
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' })
  }
  const clean = name.trim()

  if (findHabit(clean) && habits.some(h => h.name.toLowerCase() === clean.toLowerCase())) {
    return res.status(409).json({ error: 'Habit already exists', name: clean })
  }

  const t = parseInt(target, 10)
  const habit = {
    id:      mkId(),
    name:    clean,
    emoji:   String(emoji || '').slice(0, 4),
    target:  (Number.isFinite(t) && t > 0) ? t : 1,
    history: {}
  }
  habits.push(habit)
  save()
  emit(req)
  res.status(201).json({ success: true, habit: { id: habit.id, name: habit.name, target: habit.target } })
})

// PATCH /api/habits/check — mark a habit done for today (increments counter)
router.patch('/check', (req, res) => {
  const habit = findHabit((req.body || {}).name)
  if (!habit) return res.status(404).json({ error: 'Habit not found' })

  const today = dateStr()
  habit.history[today] = (habit.history[today] || 0) + 1
  save()
  emit(req)
  res.json({
    success:   true,
    name:      habit.name,
    todayCount: habit.history[today],
    target:    habit.target || 1,
    doneToday: isDone(habit, today),
    streak:    computeStreak(habit)
  })
})

// PATCH /api/habits/uncheck — undo today's completion
router.patch('/uncheck', (req, res) => {
  const habit = findHabit((req.body || {}).name)
  if (!habit) return res.status(404).json({ error: 'Habit not found' })

  const today = dateStr()
  delete habit.history[today]
  save()
  emit(req)
  res.json({ success: true, name: habit.name, doneToday: false, streak: computeStreak(habit) })
})

// DELETE /api/habits — remove a habit entirely
router.delete('/', (req, res) => {
  const habit = findHabit((req.body || {}).name)
  if (!habit) return res.status(404).json({ error: 'Habit not found' })

  habits = habits.filter(h => h.id !== habit.id)
  save()
  emit(req)
  res.json({ success: true, deleted: habit.name })
})

load()

module.exports = router
