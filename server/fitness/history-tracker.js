const fs   = require('fs')
const path = require('path')

const HISTORY_PATH = path.join(__dirname, '../../data/workout-history.ndjson')

function saveSession(session) {
  const line = JSON.stringify(session) + '\n'
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true })
  fs.appendFileSync(HISTORY_PATH, line, 'utf8')
  console.log('[history] saved session:', session.workoutName)
}

function getHistory(limit = 20) {
  if (!fs.existsSync(HISTORY_PATH)) return []
  const content = fs.readFileSync(HISTORY_PATH, 'utf8').trim()
  if (!content) return []
  const lines = content.split('\n').filter(Boolean)
  const sessions = lines.map(line => {
    try { return JSON.parse(line) } catch { return null }
  }).filter(Boolean)
  sessions.reverse()
  return limit ? sessions.slice(0, limit) : sessions
}

function getStats() {
  const all = getHistory(0)
  const empty = {
    totalWorkouts: 0, totalCalories: 0, totalMinutes: 0,
    streak: 0, currentStreak: 0,
    thisWeek: { workouts: 0, calories: 0, minutes: 0 },
    thisMonth: { workouts: 0, calories: 0 },
    recentSessions: []
  }
  if (!all.length) return empty

  const totalWorkouts = all.length
  const totalCalories = Math.round(all.reduce((sum, s) => sum + (s.caloriesBurned || 0), 0))
  const totalMinutes  = Math.round(all.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / 60)

  // Streak: consecutive calendar days going back from today
  const workoutDays = new Set(all.map(s => {
    const d = new Date(s.completedAt || s.startedAt)
    d.setHours(0, 0, 0, 0)
    return d.toISOString().slice(0, 10)
  }))
  let currentStreak = 0
  const check = new Date()
  check.setHours(0, 0, 0, 0)
  while (true) {
    const key = check.toISOString().slice(0, 10)
    if (workoutDays.has(key)) { currentStreak++; check.setDate(check.getDate() - 1) }
    else break
  }

  // This week (Mon–Sun)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const dayOfWeek = (now.getDay() + 6) % 7 // 0=Mon
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek)
  const weekSessions = all.filter(s => new Date(s.completedAt || s.startedAt) >= weekStart)
  const thisWeek = {
    workouts: weekSessions.length,
    calories: Math.round(weekSessions.reduce((sum, s) => sum + (s.caloriesBurned || 0), 0)),
    minutes:  Math.round(weekSessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / 60)
  }

  // This month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthSessions = all.filter(s => new Date(s.completedAt || s.startedAt) >= monthStart)
  const thisMonth = {
    workouts: monthSessions.length,
    calories: Math.round(monthSessions.reduce((sum, s) => sum + (s.caloriesBurned || 0), 0))
  }

  const recentSessions = all.slice(0, 10)

  return {
    totalWorkouts, totalCalories, totalMinutes,
    streak: currentStreak, currentStreak,
    thisWeek, thisMonth, recentSessions
  }
}

function getWeekly(numDays) {
  numDays = numDays || 7
  const all = getHistory(0)
  const days = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const daySessions = all.filter(s => {
      const sd = new Date(s.completedAt || s.startedAt)
      sd.setHours(0, 0, 0, 0)
      return sd.toISOString().slice(0, 10) === key
    })
    days.push({
      date:     key,
      workouts: daySessions.length,
      calories: Math.round(daySessions.reduce((sum, s) => sum + (s.caloriesBurned  || 0), 0)),
      minutes:  Math.round(daySessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / 60)
    })
  }
  return days
}

module.exports = { saveSession, getHistory, getStats, getWeekly }
