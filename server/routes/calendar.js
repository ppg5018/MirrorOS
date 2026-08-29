const express = require('express')
const router  = express.Router()

const icalCalendar = require('../helpers/ical-calendar')

const MOCK = {
  events: [
    { time: '10:00', title: 'Team Standup',           current: true  },
    { time: '15:00', title: 'Client Presentation',    current: false },
    { time: '19:30', title: 'Dinner · Koregaon Park', current: false }
  ],
  mock: true
}

const CACHE_MS = 2 * 60 * 1000  // 2 minutes — new events show up quickly
let cache = null, cacheAt = 0

// ── Legacy fallback: Calendar API via OAuth (kept for existing installs) ──
async function fromCalendarApi() {
  const { google } = require('googleapis')
  const { getAuthClient } = require('../google-auth')

  const auth = getAuthClient()
  if (!auth) return null

  const cal = google.calendar({ version: 'v3', auth })

  const now    = new Date()
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999)

  const response = await cal.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 8
  })

  const items = response.data.items || []
  const nowMs = now.getTime()

  const events = items.map(item => {
    const start = item.start.dateTime || item.start.date
    const d     = new Date(start)
    const h     = String(d.getHours()).padStart(2, '0')
    const m     = String(d.getMinutes()).padStart(2, '0')
    const current = Math.abs(d.getTime() - nowMs) < 30 * 60 * 1000
    return { time: `${h}:${m}`, title: item.summary || 'Untitled', current, location: item.location || null }
  })

  return { events, source: 'calendar_api' }
}

router.get('/', async (req, res) => {
  // ?fresh=1 forces a live fetch (used by manual/voice refresh) — bypasses cache
  const forceFresh = req.query.fresh === '1' || req.query.fresh === 'true'
  if (!forceFresh && cache && Date.now() - cacheAt < CACHE_MS) return res.json(cache)

  // 1) iCal secret feed is the primary, product path
  if (icalCalendar.isConfigured()) {
    try {
      cache   = { ...(await icalCalendar.getTodayEvents()), source: 'ical' }
      cacheAt = Date.now()
      return res.json(cache)
    } catch (err) {
      console.error('[calendar] iCal error:', err.message)
      return res.json({ ...MOCK, error: err.message })
    }
  }

  // 2) Legacy Calendar API fallback
  try {
    const data = await fromCalendarApi()
    if (data) {
      cache = data; cacheAt = Date.now()
      return res.json(cache)
    }
    return res.json(MOCK)
  } catch (err) {
    console.error('[calendar] API error:', err.message)
    return res.json({ ...MOCK, error: err.message })
  }
})

module.exports = router
