/**
 * MirrorOS — Google OAuth client helper
 * Shared by gmail.js, calendar.js, tasks.js routes
 */

const { google } = require('googleapis')
const fs   = require('fs')
const path = require('path')

const TOKEN_PATH   = path.join(__dirname, '../config/google-token.json')
const REDIRECT_URI = 'http://localhost:3000/auth/callback'

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
