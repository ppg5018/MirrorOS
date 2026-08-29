// ── Alarm routes ─────────────────────────────────────────────
// Thin HTTP surface over server/alarms.js. Every mutating route lets the engine
// emit the `alarms-updated` socket event so the widget refreshes in real time.
// The engine is initialised once at startup in server/index.js.

const express = require('express')
const router  = express.Router()
const alarms  = require('../alarms')

// GET /api/alarm — full list + next upcoming + ringing state
router.get('/', (req, res) => {
  res.json(alarms.list())
})

// POST /api/alarm — create an alarm
// body: { time:'HH:MM', label?, repeat?:'once'|'daily'|'weekdays'|'weekends', days?:[names] }
router.post('/', (req, res) => {
  const { time, label = '', repeat = 'once', days } = req.body || {}
  const result = alarms.addAlarm(time, label, repeat, days)
  if (result.error) return res.status(400).json(result)
  res.status(201).json(result)
})

// DELETE /api/alarm — remove alarm(s) by time, label, or "all"
// body: { query }
router.delete('/', (req, res) => {
  const result = alarms.deleteAlarm((req.body || {}).query)
  if (result.error) return res.status(404).json(result)
  res.json(result)
})

// PATCH /api/alarm — enable/disable alarm(s) matching a query
// body: { query, enabled:boolean }
router.patch('/', (req, res) => {
  const { query, enabled } = req.body || {}
  const result = alarms.setEnabled(query, enabled)
  if (result.error) return res.status(404).json(result)
  res.json(result)
})

// POST /api/alarm/snooze — snooze the ringing alarm
// body: { minutes? }
router.post('/snooze', (req, res) => {
  res.json(alarms.snooze((req.body || {}).minutes))
})

// POST /api/alarm/stop — dismiss the ringing alarm
router.post('/stop', (req, res) => {
  res.json(alarms.stopRinging())
})

module.exports = router
