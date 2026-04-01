const express = require('express')
const router = express.Router()
const { triggerBriefing, getBriefingStatus, getNextBriefingTime } = require('../scheduler')
const logger = require('../logger')

// POST /api/briefing — trigger via curl or companion app (e.g. curl -X POST localhost:3000/api/briefing)
router.post('/', async (req, res) => {
  logger.info('[briefing] Manual POST trigger')
  const io = req.app.get('io')
  try {
    const { processQuery } = require('../ai/claude')
    const result = await processQuery('morning briefing', io)
    res.json({ success: true, reply: result.reply })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/briefing/trigger — manually fire briefing (dev/test + companion app button)
router.get('/trigger', async (req, res) => {
  logger.info('[briefing] Manual trigger via API')
  const io = req.app.get('io')
  const result = await triggerBriefing(io)
  res.json(result)
})

// GET /api/briefing/status — next scheduled time + PIR trigger state
router.get('/status', (req, res) => {
  res.json({
    ...getBriefingStatus(),
    nextBriefing: getNextBriefingTime(),
    scheduledTime: process.env.BRIEFING_CRON || '0 7 * * *',
    timezone: 'Asia/Kolkata'
  })
})

module.exports = router
