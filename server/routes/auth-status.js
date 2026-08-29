const express = require('express')
const router  = express.Router()
const { getAuthClient } = require('../google-auth')
const fs   = require('fs')
const path = require('path')

router.get('/', (req, res) => {
  const auth           = getAuthClient()
  const googleConnected = !!auth

  res.json({
    google:   googleConnected,
    weather:  !!process.env.OPENWEATHER_API_KEY,
    claude:   !!process.env.CLAUDE_API_KEY,
    whatsapp: false
  })
})

module.exports = router
