/**
 * MirrorOS — IMAP mail reader
 * Reads unread inbox mail over plain IMAP using an app password, instead of the
 * Gmail API. This avoids Google restricted-scope OAuth verification / CASA and
 * the 7-day testing-token expiry entirely — the mirror only needs the customer's
 * email + a 16-digit Google App Password (2-Step Verification must be ON).
 *
 * Config: config/imap.json
 *   { "email": "you@gmail.com", "appPassword": "xxxxxxxxxxxxxxxx",
 *     "host": "imap.gmail.com", "port": 993, "name": "Arjun" }
 * host/port/name are optional (default to Gmail + email local-part).
 */

const fs   = require('fs')
const path = require('path')

const CONFIG_PATH = path.join(__dirname, '../../config/imap.json')

function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    if (!cfg.email || !cfg.appPassword) return null
    return {
      email:       cfg.email,
      appPassword: cfg.appPassword,
      host:        cfg.host || 'imap.gmail.com',
      port:        cfg.port || 993,
      name:        cfg.name || null
    }
  } catch (e) {
    return null
  }
}

function isConfigured() {
  return !!loadConfig()
}

// "Name <addr@x.com>" or {name,address} envelope entry → display name
function senderName(from) {
  if (!from) return ''
  const first = Array.isArray(from) ? from[0] : from
  if (!first) return ''
  if (first.name) return first.name.replace(/"/g, '').trim()
  return (first.address || '').split('@')[0]
}

/**
 * Fetch unread inbox summary.
 * @returns { unread, previews:[{sender,subject,date,unread}], name, email }
 * @throws on connection/auth failure (caller falls back to MOCK)
 */
async function getUnreadSummary({ previewCount = 3, timeoutMs = 12000 } = {}) {
  const cfg = loadConfig()
  if (!cfg) throw new Error('IMAP not configured')

  // Lazy require so the app still boots if the dep isn't installed yet.
  const { ImapFlow } = require('imapflow')

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.email, pass: cfg.appPassword },
    logger: false,
    // keep the Pi from hanging on a flaky network
    socketTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    connectionTimeout: timeoutMs
  })

  const fallbackName = cfg.name || cfg.email.split('@')[0]

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      // UIDs of all unseen messages
      const uids = await client.search({ seen: false }, { uid: true }) || []
      const unread = uids.length

      // Most-recent N (search returns ascending UID order)
      const recent = uids.slice(-previewCount).reverse()
      const previews = []
      for (const uid of recent) {
        const msg = await client.fetchOne(uid, { envelope: true }, { uid: true })
        if (!msg || !msg.envelope) continue
        previews.push({
          sender:  senderName(msg.envelope.from) || '(unknown)',
          subject: msg.envelope.subject || '(no subject)',
          date:    msg.envelope.date ? new Date(msg.envelope.date).toISOString() : null,
          unread:  true
        })
      }

      return { unread, previews, name: fallbackName, email: cfg.email }
    } finally {
      lock.release()
    }
  } finally {
    try { await client.logout() } catch (_) { try { client.close() } catch (__) {} }
  }
}

module.exports = { getUnreadSummary, isConfigured, loadConfig }
