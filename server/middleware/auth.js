// ── MirrorOS API authentication ──────────────────────────────
// A single shared secret protects every /api/* route and the
// Socket.io handshake. The secret is presented in one of:
//   • X-API-Key header
//   • ?key= query param
//   • mirror_key cookie (set automatically on any page the mirror serves,
//     so same-origin browser requests authenticate transparently)
//   • Socket.io handshake auth/query { key }
//
// Loopback requests (the Pi kiosk, wakeword.py, the scheduler, and the
// internal get()/post() helpers all hit http://localhost) are trusted so
// nothing on the device breaks. Everything else — including drive-by
// requests from a malicious website — must present the key. Restricted
// CORS + a SameSite cookie stop cross-site browsers from reading it.

const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')

const KEY_FILE    = path.join(__dirname, '../../config/api-key')
const COOKIE_NAME = 'mirror_key'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function loadOrCreateKey() {
  const fromEnv = (process.env.MIRROR_API_KEY || '').trim()
  if (fromEnv) return fromEnv

  try {
    if (fs.existsSync(KEY_FILE)) {
      const saved = fs.readFileSync(KEY_FILE, 'utf8').trim()
      if (saved) return saved
    }
  } catch (e) { /* fall through and regenerate */ }

  const key = crypto.randomBytes(32).toString('hex')
  try {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true })
    fs.writeFileSync(KEY_FILE, key, { mode: 0o600 })
    console.log('[auth] Generated API key → config/api-key')
  } catch (e) {
    console.error('[auth] Could not persist API key:', e.message)
  }
  return key
}

const API_KEY = loadOrCreateKey()

function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

function isLoopback(addr) {
  return LOOPBACK.has(addr)
}

// Hand the shared secret to same-origin browser pages via a SameSite cookie.
// Cross-site requests (a malicious page) won't have it and are rejected.
function issueKeyCookie(req, res, next) {
  const cookies = parseCookies(req.headers.cookie)
  if (cookies[COOKIE_NAME] !== API_KEY) {
    res.cookie(COOKIE_NAME, API_KEY, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000
    })
  }
  next()
}

function presentedKey(req) {
  return (
    req.get('x-api-key') ||
    (req.query && req.query.key) ||
    parseCookies(req.headers.cookie)[COOKIE_NAME] ||
    null
  )
}

function apiKeyGuard(req, res, next) {
  if (isLoopback(req.socket && req.socket.remoteAddress)) return next()
  const key = presentedKey(req)
  if (safeEqual(key, API_KEY)) return next()
  return res.status(401).json({ error: 'unauthorized' })
}

function socketAuth(socket, next) {
  if (isLoopback(socket.handshake.address)) return next()
  const cookies = parseCookies(socket.handshake.headers.cookie)
  const key =
    (socket.handshake.auth  && socket.handshake.auth.key) ||
    (socket.handshake.query && socket.handshake.query.key) ||
    cookies[COOKIE_NAME] ||
    null
  if (safeEqual(key, API_KEY)) return next()
  return next(new Error('unauthorized'))
}

// Allow same-origin / no-origin and private-LAN browsers; block the public web.
function isAllowedOrigin(origin) {
  if (!origin) return true // curl, native apps, same-origin server calls
  let host
  try { host = new URL(origin).hostname } catch (e) { return false }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  return false
}

const corsOptions = {
  origin(origin, cb) { cb(null, isAllowedOrigin(origin)) },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}

module.exports = {
  API_KEY,
  COOKIE_NAME,
  issueKeyCookie,
  apiKeyGuard,
  socketAuth,
  corsOptions,
  isAllowedOrigin
}
