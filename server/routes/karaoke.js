const express = require('express')
const router  = express.Router()

const LRCLIB = 'https://lrclib.net/api/get'

// ── In-memory cache — key: "artist::track", TTL: 24h ────────
const lyricsCache = {}
const CACHE_TTL   = 24 * 60 * 60 * 1000

// Convert LRC timestamp [mm:ss.xx] or inline <mm:ss.xx> → ms
function lrcTimeToMs(mm, ss, cs) {
  const cents = cs.length === 2 ? parseInt(cs, 10) * 10 : parseInt(cs, 10)
  return parseInt(mm, 10) * 60000 + parseInt(ss, 10) * 1000 + cents
}

// Parse LRC (standard + Enhanced/word-level) → [{ time, text, words? }]
// Enhanced LRC:  [00:12.00]<00:12.00>Word1 <00:12.50>Word2 <00:13.20>Word3
// Standard LRC:  [00:12.00]Some lyric line
function parseLrc(lrc) {
  const lines      = []
  const linePattern = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/
  const wordPattern = /<(\d{2}):(\d{2})\.(\d{2,3})>([^<]*)/g

  lrc.split('\n').forEach(raw => {
    const m = raw.match(linePattern)
    if (!m) return

    const lineMs = lrcTimeToMs(m[1], m[2], m[3])
    const rest   = m[4]

    // Check for inline word timestamps
    const wordMatches = [...rest.matchAll(wordPattern)]
    if (wordMatches.length > 1) {
      const words = wordMatches
        .map(wm => ({ time: lrcTimeToMs(wm[1], wm[2], wm[3]), text: wm[4].trim() }))
        .filter(w => w.text)
      const text = words.map(w => w.text).join(' ')
      if (text) lines.push({ time: lineMs, text, words })
    } else {
      const text = rest.replace(/<[^>]+>/g, '').trim()
      if (text) lines.push({ time: lineMs, text })
    }
  })

  // Add estimated word timings for any line that lacks real word data
  lines.forEach((line, i) => {
    if (line.words) return
    const words = line.text.split(/\s+/).filter(Boolean)
    if (!words.length) return
    const nextMs   = lines[i + 1] ? lines[i + 1].time : line.time + 3000
    const duration = Math.max(nextMs - line.time, 500)
    line.words = words.map((text, wi) => ({
      time: line.time + Math.round(duration * wi / words.length),
      text
    }))
  })

  return lines
}

// GET /api/karaoke/lyrics?artist=&track=&album=
router.get('/lyrics', async (req, res) => {
  const { artist, track, album } = req.query
  if (!artist || !track) {
    return res.status(400).json({ error: 'artist and track are required' })
  }

  const cacheKey = (artist + '::' + track).toLowerCase()
  const cached   = lyricsCache[cacheKey]
  if (cached && Date.now() - cached.t < CACHE_TTL) {
    return res.json(cached.data)
  }

  try {
    const url = new URL(LRCLIB)
    url.searchParams.set('artist_name', artist)
    url.searchParams.set('track_name', track)
    if (album) url.searchParams.set('album_name', album)

    const resp = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MirrorOS/1.0 (github.com/mirrorios)' }
    })

    if (resp.status === 404) {
      const result = { error: 'not_found' }
      lyricsCache[cacheKey] = { data: result, t: Date.now() }
      return res.json(result)
    }

    if (!resp.ok) {
      return res.status(502).json({ error: 'lrclib_error', status: resp.status })
    }

    const data = await resp.json()

    let result
    if (data.syncedLyrics) {
      result = { synced: true, lines: parseLrc(data.syncedLyrics) }
    } else if (data.plainLyrics) {
      const lines = data.plainLyrics
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(text => ({ time: null, text }))
      result = { synced: false, lines }
    } else {
      result = { error: 'not_found' }
    }

    lyricsCache[cacheKey] = { data: result, t: Date.now() }
    res.json(result)

  } catch (err) {
    console.error('[karaoke] lyrics fetch error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
