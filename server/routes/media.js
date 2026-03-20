const express = require('express')
const router = express.Router()

// POST /api/media/pause — called by wakeword.py before STT starts
// Emits 'media-pause' socket event so the browser pauses YouTube/Spotify
router.post('/pause', (req, res) => {
  const io = req.app.get('io')
  io.emit('media-pause')
  console.log('[media] pause signal sent to browser')
  res.json({ ok: true })
})

// POST /api/media/resume — called after voice pipeline finishes
router.post('/resume', (req, res) => {
  const io = req.app.get('io')
  io.emit('media-resume')
  console.log('[media] resume signal sent to browser')
  res.json({ ok: true })
})

module.exports = router
