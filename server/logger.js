const fs = require('fs')
const path = require('path')

// Use /var/log/mirroros in production (Orange Pi), ./logs in dev
const LOG_DIR = process.env.NODE_ENV === 'production'
  ? '/var/log/mirroros'
  : path.join(__dirname, '../logs')

// Create log dir on startup — ignore failures (e.g. no write permission in some envs)
try { fs.mkdirSync(LOG_DIR, { recursive: true }) } catch (_) {}

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
  return path.join(LOG_DIR, `mirroros-${date}.log`)
}

function write(level, message) {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level.padEnd(5)}] ${message}\n`
  process.stdout.write(line)
  try { fs.appendFileSync(getLogFile(), line) } catch (_) {}
}

const logger = {
  info:  (msg) => write('INFO',  msg),
  warn:  (msg) => write('WARN',  msg),
  error: (msg) => write('ERROR', msg),
  // Express request logger middleware
  middleware: (req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
      write('HTTP', `${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`)
    })
    next()
  }
}

module.exports = logger
