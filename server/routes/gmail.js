const express = require('express')
const router  = express.Router()
const { google } = require('googleapis')
const { getAuthClient } = require('../google-auth')

const MOCK = {
  unread: 2,
  previews: [
    { sender: 'Rahul', subject: 'Project update'    },
    { sender: 'Bank',  subject: 'Transaction alert' }
  ],
  mock: true
}

const CACHE_MS = 5 * 60 * 1000   // 5 minutes
let cache = null, cacheAt = 0

// Clear cache on startup so name re-fetches immediately after server restart
cache = null; cacheAt = 0

router.get('/', async (req, res) => {
  // Serve cache if fresh
  if (cache && Date.now() - cacheAt < CACHE_MS) return res.json(cache)

  const auth = getAuthClient()
  if (!auth) return res.json(MOCK)

  try {
    const gmail = google.gmail({ version: 'v1', auth })

    // Unread count
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread is:inbox',
      maxResults: 10
    })

    const messages = list.data.messages || []
    const unread   = list.data.resultSizeEstimate || 0

    // Fetch subject + sender for first 3 unread
    const previews = []
    for (const msg of messages.slice(0, 3)) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject']
      })
      const headers = detail.data.payload.headers
      const from    = headers.find(h => h.name === 'From')?.value    || ''
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)'

      // Extract name from "Name <email@domain.com>"
      const sender = from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || from

      previews.push({ sender, subject })
    }

    // Fetch user's real display name + email via OAuth2 userinfo
    let name = null, email = null
    try {
      const oauth2   = google.oauth2({ version: 'v2', auth })
      const userinfo = await oauth2.userinfo.get()
      name  = userinfo.data.given_name || userinfo.data.name || null
      email = userinfo.data.email || null
    } catch (e) { /* non-fatal */ }

    cache = { unread, previews, name, email }
    cacheAt = Date.now()
    res.json(cache)

  } catch (err) {
    console.error('[gmail] API error:', err.message)
    res.json({ ...MOCK, error: err.message })
  }
})

module.exports = router
