#!/usr/bin/env node
/**
 * MirrorOS — Google OAuth Setup (run once)
 * Opens browser, gets permission, saves token to config/google-token.json
 *
 * Usage: node scripts/google-auth.js
 */

console.log('ℹ️  If you are re-running this to add YouTube scopes,')
console.log('   delete config/google-token.json first, then run this script.')
console.log('   You will need to sign in again.\n')

require('dotenv').config()
const { google } = require('googleapis')
const http  = require('http')
const url   = require('url')
const fs    = require('fs')
const path  = require('path')

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl'
]

const TOKEN_PATH   = path.join(__dirname, '../config/google-token.json')
const REDIRECT_URI = 'http://localhost:3000/auth/callback'

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env')
  console.error('See scripts/setup-google-oauth.md for setup instructions.')
  process.exit(1)
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
)

async function main() {
  // Check if token already exists and is valid
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH))
    oauth2Client.setCredentials(token)

    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
      await gmail.users.getProfile({ userId: 'me' })
      console.log('Token is valid — Google OAuth is already set up.')
      console.log('Gmail, Calendar, Tasks, and YouTube will show real data.')
      process.exit(0)
    } catch (e) {
      console.log('Token expired or revoked — getting a new one...')
    }
  }

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  })

  console.log('\n=== MirrorOS Google OAuth Setup ===\n')
  console.log('Opening browser for Google sign-in...')
  console.log('If browser does not open, visit this URL manually:\n')
  console.log(authUrl + '\n')

  // Try to open browser
  try {
    const { default: open } = await import('open')
    await open(authUrl)
  } catch (e) {
    // User will open manually from URL above
  }

  // Try to start a temporary server on port 3000 to catch the OAuth callback.
  // If port 3000 is already in use (e.g. MirrorOS server is running via node/pm2),
  // fall back to polling for the token file — the main server handles /auth/callback.
  const tokenSaved = await new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true)
      if (parsed.pathname !== '/auth/callback') return

      const code = parsed.query.code
      if (!code) {
        res.writeHead(400)
        res.end('Error: no code in callback')
        return
      }

      try {
        const { tokens } = await oauth2Client.getToken(code)
        oauth2Client.setCredentials(tokens)
        fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true })
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
        console.log('\nToken saved to config/google-token.json')

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
          <body style="font-family:sans-serif;text-align:center;padding:60px;background:#000;color:#fff">
            <h2 style="color:#4af0c4">MirrorOS Connected!</h2>
            <p>Gmail, Calendar, Tasks, and YouTube are now connected.</p>
            <p style="color:#888">You can close this tab.</p>
          </body>
          </html>
        `)
        server.close()
        resolve(true)
      } catch (err) {
        res.writeHead(500)
        res.end('Error: ' + err.message)
      }
    })

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Main MirrorOS server is already on port 3000 and will handle /auth/callback.
        // Poll for the token file every second until it appears (max 2 min).
        console.log('Port 3000 in use — MirrorOS server will handle the callback.')
        console.log('Waiting for sign-in...')
        let attempts = 0
        const poll = setInterval(() => {
          attempts++
          if (fs.existsSync(TOKEN_PATH)) {
            clearInterval(poll)
            console.log('\nToken detected at config/google-token.json')
            resolve(true)
          } else if (attempts >= 120) {
            clearInterval(poll)
            console.error('Timed out waiting for token. Try again.')
            resolve(false)
          }
        }, 1000)
      } else {
        console.error('Server error:', err.message)
        resolve(false)
      }
    })

    server.listen(3000, () => {
      console.log('Waiting for Google sign-in on http://localhost:3000 ...')
    })
  })

  console.log('\nGoogle OAuth complete!')
  console.log('Gmail, Calendar, Tasks, and YouTube will now show real data.')
  console.log('\nRestart the server: npm start')
}

main().catch(err => {
  console.error('OAuth failed:', err.message)
  process.exit(1)
})
