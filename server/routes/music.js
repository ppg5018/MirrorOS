const express = require('express')
const router  = express.Router()

const TRACKS = [
  { title: 'Tum Se Hi',        artist: 'Mohit Chauhan',  album: 'Jab We Met',    source: 'youtube', duration: 214, coverColor: '#4a9cf0' },
  { title: 'Blinding Lights',  artist: 'The Weeknd',     album: 'After Hours',   source: 'spotify', duration: 200, coverColor: '#f04a4a' },
  { title: 'Raataan Lambiyan', artist: 'Jubin Nautiyal', album: 'Shershaah OST', source: 'youtube', duration: 253, coverColor: '#4af0c4' },
]

let trackIndex = 0

let musicState = {
  playing:    false,
  progress:   0,
  ...TRACKS[trackIndex]
}

// Tick progress forward on the server so polling clients stay in sync
setInterval(() => {
  if (musicState.playing) {
    musicState.progress++
    if (musicState.progress >= musicState.duration) {
      // Auto-advance to next track
      trackIndex = (trackIndex + 1) % TRACKS.length
      musicState = { playing: true, progress: 0, ...TRACKS[trackIndex] }
    }
  }
}, 1000)

// GET /api/music/now-playing
router.get('/now-playing', (req, res) => {
  if (!musicState.playing) return res.json({ playing: false })
  res.json({ ...musicState })
})

// POST /api/music/control
router.post('/control', (req, res) => {
  const { action } = req.body
  const io = req.app.get('io')

  switch (action) {
    case 'play':
      musicState.playing  = true
      musicState.progress = 0
      break
    case 'pause':
      musicState.playing = false
      break
    case 'next':
      trackIndex = (trackIndex + 1) % TRACKS.length
      musicState = { playing: true, progress: 0, ...TRACKS[trackIndex] }
      break
    case 'prev':
      trackIndex = (trackIndex - 1 + TRACKS.length) % TRACKS.length
      musicState = { playing: true, progress: 0, ...TRACKS[trackIndex] }
      break
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` })
  }

  console.log(`[music] ${action} → "${musicState.title}" playing=${musicState.playing}`)
  if (io) io.emit('music-update', { ...musicState })

  res.json({ success: true, state: { ...musicState } })
})

// Expose for voice AI
router.setMusicState = (patch) => {
  musicState = { ...musicState, ...patch }
}

module.exports = router
