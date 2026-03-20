const express = require('express')
const router  = express.Router()
const { google } = require('googleapis')
const { getAuthClient } = require('../google-auth')

const MOCK = {
  events: [
    { time: '10:00', title: 'Team Standup',           current: true  },
    { time: '15:00', title: 'Client Presentation',    current: false },
    { time: '19:30', title: 'Dinner · Koregaon Park', current: false }
  ],
  mock: true
}

const CACHE_MS = 10 * 60 * 1000  // 10 minutes
let cache = null, cacheAt = 0

router.get('/', async (req, res) => {
  if (cache && Date.now() - cacheAt < CACHE_MS) return res.json(cache)

  const auth = getAuthClient()
  if (!auth) return res.json(MOCK)

  try {
    const cal = google.calendar({ version: 'v3', auth })

    const now      = new Date()
    const dayEnd   = new Date(now)
    dayEnd.setHours(23, 59, 59, 999)

    const response = await cal.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 8
    })

    const items  = response.data.items || []
    const nowMs  = now.getTime()

    const events = items.map(item => {
      const start = item.start.dateTime || item.start.date
      const d     = new Date(start)
      const h     = String(d.getHours()).padStart(2, '0')
      const m     = String(d.getMinutes()).padStart(2, '0')

      // Mark as current if happening right now (±30 min window)
      const diff    = Math.abs(d.getTime() - nowMs)
      const current = diff < 30 * 60 * 1000

      return {
        time:    `${h}:${m}`,
        title:   item.summary || 'Untitled',
        current,
        location: item.location || null
      }
    })

    cache = { events }
    cacheAt = Date.now()
    res.json(cache)

  } catch (err) {
    console.error('[calendar] API error:', err.message)
    res.json({ ...MOCK, error: err.message })
  }
})

module.exports = router
