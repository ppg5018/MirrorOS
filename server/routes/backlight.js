const express = require('express')
const router  = express.Router()
const { execFile } = require('child_process')
const path   = require('path')

const LED_SCRIPT = path.join(__dirname, '../../server/led/controller.py')

// Only these modes are ever passed to the LED script. Must match controller.py MODES.
const ALLOWED_MODES = new Set([
  'warm', 'cool', 'night', 'party', 'music_sync', 'red', 'green', 'blue', 'off'
])

let currentMode       = 'warm'
let currentBrightness = 80

function clampBrightness(value, fallback) {
  const n = parseInt(value, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(100, Math.max(0, n))
}

router.post('/', (req, res) => {
  const { mode, brightness } = req.body
  const io = req.app.get('io')

  if (!mode) return res.status(400).json({ error: 'mode required' })
  if (!ALLOWED_MODES.has(mode)) {
    return res.status(400).json({ error: 'invalid mode' })
  }

  currentMode = mode
  if (brightness != null) currentBrightness = clampBrightness(brightness, currentBrightness)

  const brt = brightness != null ? clampBrightness(brightness, currentBrightness) : currentBrightness

  // execFile with an argument array — no shell, so user input can never be
  // interpreted as a command. mode is whitelisted and brt is an integer.
  execFile('python3', [LED_SCRIPT, mode, String(brt)], (err, stdout) => {
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
