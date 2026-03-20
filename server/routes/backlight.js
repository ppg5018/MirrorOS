const express = require('express')
const router  = express.Router()
const { exec } = require('child_process')
const path   = require('path')

const LED_SCRIPT = path.join(__dirname, '../../server/led/controller.py')

let currentMode       = 'warm'
let currentBrightness = 80

router.post('/', (req, res) => {
  const { mode, brightness } = req.body
  const io = req.app.get('io')

  if (!mode) return res.status(400).json({ error: 'mode required' })

  currentMode = mode
  if (brightness != null) currentBrightness = brightness

  const brt = brightness != null ? brightness : currentBrightness
  const cmd = `python3 "${LED_SCRIPT}" ${mode} ${brt}`

  exec(cmd, (err, stdout) => {
    if (err) console.error('[backlight] LED error:', err.message)
    else if (stdout.trim()) console.log('[backlight]', stdout.trim())
  })

  console.log(`[backlight] mode=${mode}, brightness=${brt}`)
  if (io) io.emit('backlight-change', { mode, brightness: brt })

  res.json({ success: true, mode, brightness: brt })
})

router.get('/', (req, res) => {
  res.json({ mode: currentMode, brightness: currentBrightness })
})

module.exports = router
