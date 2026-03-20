const fs   = require('fs')
const path = require('path')

const TOKEN_PATH = path.join(__dirname, '../../config/spotify-token.json')
const TOKEN_URL  = 'https://accounts.spotify.com/api/token'

function loadToken() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
  } catch (e) {
    return null
  }
}

async function saveToken(data) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2))
}

async function refreshAccessToken(tokenData) {
  const creds = Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
  ).toString('base64')

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: {
      'Authorization': 'Basic ' + creds,
      'Content-Type':  'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: tokenData.refreshToken
    }).toString()
  })

  const data = await res.json()
  if (data.error) throw new Error('Spotify refresh failed: ' + data.error)

  tokenData.accessToken = data.access_token
  tokenData.expiresAt   = Date.now() + (data.expires_in * 1000)
  if (data.refresh_token) tokenData.refreshToken = data.refresh_token
  await saveToken(tokenData)
  console.log('[Spotify] Token refreshed successfully')
  return tokenData
}

async function getValidToken() {
  const tokenData = loadToken()
  if (!tokenData) {
    console.warn('[Spotify] No token file. Run: npm run setup:spotify')
    return null
  }
  // Refresh if expiring within 2 minutes
  if (Date.now() > tokenData.expiresAt - 120000) {
    try {
      const refreshed = await refreshAccessToken(tokenData)
      return refreshed.accessToken
    } catch (err) {
      console.error('[Spotify] Auto-refresh failed:', err.message)
      return null
    }
  }
  return tokenData.accessToken
}

function isConnected() {
  const t = loadToken()
  return !!(t && t.accessToken && t.refreshToken)
}

function getUserInfo() {
  const t = loadToken()
  if (!t) return null
  return {
    displayName: t.displayName,
    email:       t.email,
    country:     t.country
  }
}

module.exports = { getValidToken, isConnected, getUserInfo, loadToken }
