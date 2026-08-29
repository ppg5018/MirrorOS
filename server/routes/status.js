const express = require('express')
const router  = express.Router()
const { getNextBriefingTime } = require('../scheduler')
const { getAuthClient } = require('../google-auth')
const { isConnected: spotifyConnected, getUserInfo: spotifyUser } = require('../helpers/spotify-auth')
const { getConnectionStatus: whatsappConnected } = require('../whatsapp/client')
const fs   = require('fs')
const path = require('path')

router.get('/', (req, res) => {
  // Google OAuth connection — check if token file exists and auth client initialises
  const auth = getAuthClient()
  const googleConnected = !!auth

  // Fitness data status
  let fitnessStatus = { setupComplete: false, exercisesLoaded: 0, workoutsAvailable: 0 }
  try {
    const exercisesPath = path.join(__dirname, '../../data/exercises.json')
    const workoutsDir   = path.join(__dirname, '../../data/workouts')
    const exercisesLoaded = fs.existsSync(exercisesPath)
      ? JSON.parse(fs.readFileSync(exercisesPath, 'utf8')).length
      : 0
    const workoutsAvailable = fs.existsSync(workoutsDir)
      ? fs.readdirSync(workoutsDir).filter(f => f.endsWith('.json')).length
      : 0
    fitnessStatus = {
      setupComplete: exercisesLoaded > 100,
      exercisesLoaded,
      workoutsAvailable
    }
  } catch (e) { /* non-fatal */ }

  res.json({
    uptime:      process.uptime(),
    memory:      process.memoryUsage(),
    nodeVersion: process.version,
    timestamp:   new Date().toISOString(),
    status:      'online',
    nextBriefing: getNextBriefingTime(),
    fitness:     fitnessStatus,
    integrations: {
      google:   { connected: googleConnected,  source: 'google_oauth' },
      weather:  { connected: !!process.env.OPENWEATHER_API_KEY },
      claude:   { connected: !!process.env.CLAUDE_API_KEY },
      whatsapp: { connected: whatsappConnected() },
      spotify:  { connected: spotifyConnected(), user: spotifyUser() }
    }
  })
})

module.exports = router
