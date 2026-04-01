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

const TOKEN_PATH = path.join(__dirname, '../config/google-token.json')

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
]

function getAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null
  if (!fs.existsSync(TOKEN_PATH)) return null

  // localhost redirect — works from Pi's own browser or CLI setup
  const REDIRECT_URI = `http://localhost:${process.env.PORT || 3000}/auth/google/callback`

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

function getGoogleAuthURL() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null

  const REDIRECT_URI = `http://localhost:${process.env.PORT || 3000}/auth/google/callback`

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  })
}

module.exports = { getAuthClient, getGoogleAuthURL }

// ─── CLI setup: node server/google-auth.js ───────────────────────────────────
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../.env') })

  const id     = process.env.GOOGLE_CLIENT_ID
  const secret = process.env.GOOGLE_CLIENT_SECRET

  if (!id || !secret) {
    console.error('\n[google-auth] ERROR: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing in .env\n')
    process.exit(1)
  }

  const { getGoogleRedirectURI } = require('./utils/network')
  const redirectURI = getGoogleRedirectURI()

  const oauth2Client = new google.auth.OAuth2(id, secret, redirectURI)

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  })

  console.log('\n╔══ MirrorOS — Google Auth Setup ══════════════════════════════╗')
  console.log('║                                                              ║')
  console.log('║  1. Make sure the server is running:  npm start             ║')
  console.log('║  2. Add this redirect URI to Google Cloud Console:          ║')
  console.log('║                                                              ║')
  console.log(`║  ${redirectURI.padEnd(62)}║`)
  console.log('║                                                              ║')
  console.log('║  3. Open this URL in your browser:                          ║')
  console.log('║                                                              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')
  console.log(url)
  console.log('\nAfter signing in, the token will be saved automatically.')
  console.log('You should see "MirrorOS Connected!" in the browser.\n')

  import('open')
    .then(m => {
      console.log('Opening browser...')
      return m.default(url)
    })
    .catch(() => {
      console.log('(Could not auto-open — copy the URL above into your browser)')
    })
}
