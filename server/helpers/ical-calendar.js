/**
 * MirrorOS — iCal calendar fetcher
 * Reads today's events from a Google Calendar "Secret address in iCal format"
 * (.ics) URL instead of the Calendar API. Plain read-only feed — no OAuth, no
 * app verification, no token expiry.
 *
 * Config: config/calendar.json
 *   { "icalUrl": "https://calendar.google.com/calendar/ical/<id>/private-<key>/basic.ics" }
 * Also accepts { "icalUrls": [ ... ] } for multiple calendars.
 */

const fs   = require('fs')
const path = require('path')

const CONFIG_PATH = path.join(__dirname, '../../config/calendar.json')

function loadUrls() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    if (Array.isArray(cfg.icalUrls)) return cfg.icalUrls.filter(Boolean)
    if (cfg.icalUrl) return [cfg.icalUrl]
    return []
  } catch (e) {
    return []
  }
}

function isConfigured() {
  return loadUrls().length > 0
}

function two(n) { return String(n).padStart(2, '0') }

function fmtTime(d, allDay) {
  if (allDay) return 'All day'
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/**
 * Fetch today's events across all configured iCal URLs.
 * @returns { events:[{time,title,current,location,allDay}] }
 */
async function getTodayEvents({ timeoutMs = 12000 } = {}) {
  const urls = loadUrls()
  if (!urls.length) throw new Error('iCal not configured')

  const ical = require('node-ical')

  const now      = new Date()
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
  const dayEnd   = new Date(now); dayEnd.setHours(23, 59, 59, 999)
  const nowMs    = now.getTime()

  const out = []

  for (const url of urls) {
    let data
    try {
      data = await ical.async.fromURL(url, { timeout: timeoutMs })
    } catch (err) {
      console.error('[calendar] iCal fetch failed:', err.message)
      continue
    }

    for (const key in data) {
      const ev = data[key]
      if (!ev || ev.type !== 'VEVENT') continue

      const allDay = ev.datetype === 'date'
      const title  = ev.summary || 'Untitled'
      const loc    = ev.location || null

      const pushAt = (startDate) => {
        out.push({
          time:     fmtTime(startDate, allDay),
          _ms:      startDate.getTime(),
          title,
          current:  !allDay && Math.abs(startDate.getTime() - nowMs) < 30 * 60 * 1000,
          location: loc,
          allDay
        })
      }

      if (ev.rrule) {
        // Expand recurrences that land today
        let occurrences = []
        try { occurrences = ev.rrule.between(dayStart, dayEnd, true) } catch (_) {}

        // Skip cancelled instances (EXDATE)
        const exdates = ev.exdate ? Object.values(ev.exdate).map(d => new Date(d).toDateString()) : []

        for (const occ of occurrences) {
          if (exdates.includes(new Date(occ).toDateString())) continue
          // Preserve the event's wall-clock time on the recurrence date
          const s = new Date(occ)
          if (!allDay) { s.setHours(ev.start.getHours(), ev.start.getMinutes(), 0, 0) }
          pushAt(s)
        }
      } else if (ev.start) {
        const s = new Date(ev.start)
        if (s >= dayStart && s <= dayEnd) pushAt(s)
      }
    }
  }

  out.sort((a, b) => a._ms - b._ms)
  const events = out.map(({ _ms, ...rest }) => rest)
  return { events }
}

module.exports = { getTodayEvents, isConfigured, loadUrls }
