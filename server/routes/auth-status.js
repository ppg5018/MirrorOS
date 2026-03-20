const express = require('express')
const router  = express.Router()
const { getAuthClient } = require('../google-auth')
const fs   = require('fs')
const path = require('path')

router.get('/', (req, res) => {
  const auth           = getAuthClient()
  const googleConnected = !!auth

  let youtubeConnected = false
  if (googleConnected) {
    try {
      const tokenPath = path.join(__dirname, '../../config/google-token.json')
      const token = JSON.parse(fs.readFileSync(tokenPath))
      youtubeConnected = (token.scope || '').includes('youtube')
    } catch (e) { /* ignore */ }
  }

  res.json({
    google:   googleConnected,
    youtube:  youtubeConnected,
    weather:  !!process.env.OPENWEATHER_API_KEY,
    claude:   !!process.env.CLAUDE_API_KEY,
    whatsapp: false
  })
})

module.exports = router
