const express = require('express')
const router  = express.Router()

const imapMail = require('../helpers/imap-mail')

const CACHE_MS = 5 * 60 * 1000   // 5 minutes
let cache = null, cacheAt = 0

// Clear cache on startup so it re-fetches immediately after server restart
cache = null; cacheAt = 0

// Email is read over IMAP (app password). Gmail API is intentionally not used
// (that scope is "restricted" and would require Google's CASA assessment).
async function fromImap() {
  const data = await imapMail.getUnreadSummary()
  return { ...data, configured: true, source: 'imap' }
}

router.get('/', async (req, res) => {
  // Email not set up → clean empty state, NO warning on the dashboard
  if (!imapMail.isConfigured()) {
    return res.json({ unread: 0, previews: [], configured: false })
  }

  // Serve cache if fresh
  if (cache && Date.now() - cacheAt < CACHE_MS) return res.json(cache)

  try {
    cache   = await fromImap()
    cacheAt = Date.now()
    return res.json(cache)
  } catch (err) {
    console.error('[gmail] IMAP error:', err.message)
    // Configured but currently failing — surface a real, email-specific warning
    return res.json({ unread: 0, previews: [], configured: true, error: err.message })
  }
})

module.exports = router
