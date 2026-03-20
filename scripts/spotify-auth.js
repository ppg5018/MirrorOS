#!/usr/bin/env node
/**
 * MirrorOS — Spotify OAuth Setup (run once)
 * Opens browser, gets permission, saves token to config/spotify-token.json
 *
 * Usage: npm run setup:spotify
 */

require('dotenv').config()

const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const REDIRECT_URI = 'http://127.0.0.1:3001/callback'
const TOKEN_PATH = path.join(__dirname, '../config/spotify-token.json')

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
  'user-read-recently-played'
].join(' ')

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing Spotify credentials in .env')
  console.error('   1. Go to developer.spotify.com/dashboard')
  console.error('   2. Create app → App name: MirrorOS')
  console.error('   3. Add Redirect URI: http://localhost:3001/callback')
  console.error('   4. Copy Client ID and Client Secret to .env')
  process.exit(1)
}

if (fs.existsSync(TOKEN_PATH)) {
  console.log('ℹ️  Token file already exists at config/spotify-token.json')
  console.log('   Delete it first if you want to re-authenticate.')
  console.log('   Exiting.')
  process.exit(0)
}

async function main() {
  const state = crypto.randomBytes(16).toString('hex')
  const authUrl =
    'https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    '&client_id=' + encodeURIComponent(CLIENT_ID) +
    '&scope=' + encodeURIComponent(SCOPES) +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
    '&state=' + state +
    '&show_dialog=false'

  console.log('\n🎵 Opening Spotify login in your browser...')
  console.log('   If it didn\'t open, visit:\n   ' + authUrl + '\n')

  try {
    const { default: open } = await import('open')
    await open(authUrl)
  } catch (e) {
    // User will open manually from URL above
  }

  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url.startsWith('/callback')) return

      const params = new URLSearchParams(req.url.split('?')[1] || '')
      const error = params.get('error')
      const code = params.get('code')
      const stateBack = params.get('state')

      if (error) {
        res.writeHead(400); res.end('Error: ' + error)
        console.error('❌ Spotify returned error:', error)
        server.close(); process.exit(1)
      }

      if (stateBack !== state) {
        res.writeHead(400); res.end('State mismatch')
        console.error('❌ State mismatch — possible CSRF')
        server.close(); process.exit(1)
      }

      try {
        // Exchange code for tokens
        const creds = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + creds,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI
          }).toString()
        })
        const tokenData = await tokenRes.json()
        if (tokenData.error) {
          throw new Error('Token exchange failed: ' + (tokenData.error_description || tokenData.error))
        }

        // Fetch user profile
        const profileRes = await fetch('https://api.spotify.com/v1/me', {
          headers: { 'Authorization': 'Bearer ' + tokenData.access_token }
        })
        const profile = await profileRes.json()

        // Build and save token
        const token = {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: Date.now() + (tokenData.expires_in * 1000),
          scope: tokenData.scope,
          displayName: profile.display_name,
          email: profile.email,
          country: profile.country,
          savedAt: new Date().toISOString()
        }
        fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true })
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2))

        // Success page in browser
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
          <body style="font-family:sans-serif;text-align:center;padding:60px;background:#000;color:#fff">
            <div style="font-size:60px;margin-bottom:20px">✓</div>
            <h2 style="color:#1DB954">Spotify connected!</h2>
            <p style="color:#888;margin-top:10px">You can close this tab and return to the terminal.</p>
          </body>
          </html>
        `)

        console.log('\n✅ Spotify connected!')
        console.log('👤 Logged in as: ' + profile.display_name + ' (' + profile.email + ')')
        console.log('📍 Country: ' + profile.country)
        console.log('🎵 Scopes granted: streaming, user-library-read, ...')
        console.log('💾 Token saved to config/spotify-token.json')
        console.log('\n▶  Start MirrorOS: node server/index.js')
        console.log('   Then say: "Hey Mirror, play some music"\n')

        server.close()
        resolve()
      } catch (err) {
        res.writeHead(500); res.end('Error: ' + err.message)
        console.error('❌ Auth failed:', err.message)
        server.close(); reject(err)
      }
    })

    server.listen(3001, () => {
      console.log('Waiting for Spotify sign-in on http://localhost:3001 ...')
    })

    server.on('error', (err) => {
      console.error('Server error:', err.message)
      reject(err)
    })
  })
}

main().catch(err => {
  console.error('OAuth failed:', err.message)
  process.exit(1)
})
