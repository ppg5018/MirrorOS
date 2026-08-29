const fs = require('fs')
const path = require('path')

// Use /var/log/mirroros in production (Pi), ./logs in dev
const LOG_DIR = process.env.NODE_ENV === 'production'
  ? '/var/log/mirroros'
  : path.join(__dirname, '../logs')

// Create log dir on startup — ignore failures (e.g. no write permission in some envs)
try { fs.mkdirSync(LOG_DIR, { recursive: true }) } catch (_) {}

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
  return path.join(LOG_DIR, `mirroros-${date}.log`)
}

// ── Buffered disk writes ─────────────────────────────────────
// The old logger did a synchronous fs.appendFileSync on EVERY log line —
// including one per HTTP request. During karaoke the frontend polls
// /api/spotify/position twice a second, so that was ~2 blocking SD-card writes
// per second on the event loop. Instead we buffer lines and flush them
// asynchronously in batches, and skip logging high-frequency/no-op requests.
let buffer = []
let flushTimer = null
const FLUSH_MS = 2000
const MAX_BUFFER = 200          // hard cap so a write outage can't grow RAM

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(flush, FLUSH_MS)
  if (flushTimer.unref) flushTimer.unref()
}

function flush() {
  flushTimer = null
  if (!buffer.length) return
  const chunk = buffer.join('')
  buffer = []
  fs.appendFile(getLogFile(), chunk, () => {
    /* disk full / no perms — drop rather than crash */
  })
}

function write(level, message) {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level.padEnd(5)}] ${message}\n`
  process.stdout.write(line)
  buffer.push(line)
  if (buffer.length >= MAX_BUFFER) flush()
  else scheduleFlush()
}

// Requests we never want in the logs — high-frequency polling and static
// assets that would otherwise dominate disk I/O and log volume.
const SKIP_LOG = /^\/(api\/spotify\/position|api\/spotify\/now-playing|css|js|uploads|data\/gifs|screensaver|socket\.io)(\/|$)/

const logger = {
  info:  (msg) => write('INFO',  msg),
  warn:  (msg) => write('WARN',  msg),
  error: (msg) => write('ERROR', msg),
  // Express request logger middleware
  middleware: (req, res, next) => {
    if (SKIP_LOG.test(req.path)) return next()
    const start = Date.now()
    res.on('finish', () => {
      write('HTTP', `${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`)
    })
    next()
  }
}

module.exports = logger
