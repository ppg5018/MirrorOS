/**
 * MirrorOS — Google OAuth client helper
 * Shared by gmail.js, calendar.js, tasks.js routes
 *
 * To set up / re-authenticate:
 *   1. Start the server:  npm start
 *   2. Run this file:     node server/google-auth.js
 *   3. Open the printed URL in your browser and sign in
 *   4. Token saved automatically to config/google-token.json
 */

const { google } = require('googleapis')
const fs   = require('fs')
const path = require('path')

const TOKEN_PATH   = path.join(__dirname, '../config/google-token.json')
const REDIRECT_URI = 'http://localhost:3000/auth/callback'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
]

function getAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null
  if (!fs.existsSync(TOKEN_PATH)) return null

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH))
  oauth2Client.setCredentials(token)

  // Persist refreshed tokens automatically
  oauth2Client.on('tokens', (tokens) => {
    try {
      const current = JSON.parse(fs.readFileSync(TOKEN_PATH))
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...tokens }, null, 2))
    } catch (e) { /* ignore */ }
  })

  return oauth2Client
}

module.exports = { getAuthClient }

// ─── CLI setup: node server/google-auth.js ───────────────────────────────────
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../.env') })

  const id     = process.env.GOOGLE_CLIENT_ID
  const secret = process.env.GOOGLE_CLIENT_SECRET

  if (!id || !secret) {
    console.error('\n[google-auth] ERROR: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing in .env\n')
    process.exit(1)
  }

  const oauth2Client = new google.auth.OAuth2(id, secret, REDIRECT_URI)

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',     // force re-consent so we always get a refresh_token
    scope: SCOPES,
  })

  console.log('\n╔══ MirrorOS — Google Auth Setup ══════════════════════════════╗')
  console.log('║                                                              ║')
  console.log('║  1. Make sure the server is running:  npm start             ║')
  console.log('║  2. Open this URL in your browser:                          ║')
  console.log('║                                                              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')
  console.log(url)
  console.log('\nAfter signing in, the token will be saved automatically.')
  console.log('You should see "MirrorOS Connected!" in the browser.\n')

  // Try to auto-open the browser
  import('open')
    .then(m => {
      console.log('Opening browser...')
      return m.default(url)
    })
    .catch(() => {
      console.log('(Could not auto-open — copy the URL above into your browser)')
    })
}
