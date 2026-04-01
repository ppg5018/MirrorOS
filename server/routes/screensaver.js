const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')

const UPLOAD_DIR = path.join(__dirname, '../../public/screensaver/uploads')
const THUMB_DIR  = path.join(__dirname, '../../public/screensaver/thumbnails')
const SETTINGS_PATH = path.join(__dirname, '../../config/screensaver.json')

// Ensure directories exist
fs.mkdirSync(UPLOAD_DIR, { recursive: true })
fs.mkdirSync(THUMB_DIR,  { recursive: true })

// Multer — temp storage before transcode
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Preserve original extension; fall back to .mp4
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4'
    cb(null, Date.now() + '_orig' + ext)
  }
})

const ALLOWED_EXTS  = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
const ALLOWED_MIMES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/avi', 'video/x-matroska']

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase()
    const mime = file.mimetype.toLowerCase()
    // Accept if either extension or MIME type looks like video
    if (ALLOWED_EXTS.includes(ext) || ALLOWED_MIMES.includes(mime) || mime.startsWith('video/')) {
      return cb(null, true)
    }
    cb(new Error('Only video files are accepted (mp4, webm, mov)'))
  }
})

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
  } catch (_) {
    return { mode: 'random', interval: 0 }
  }
}

// ── POST /api/screensaver/upload ──────────────────────────────
router.post('/upload', (req, res) => {
  // Run multer manually so we can catch fileFilter errors
  upload.single('video')(req, res, (err) => {
    if (err) {
      console.error('[screensaver] multer error:', err.message)
      return res.status(400).json({ error: err.message || 'Upload failed' })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No video file received. Make sure the field name is "video".' })
    }

    const io       = req.app.get('io')
    const origPath = req.file.path
    const outName  = Date.now() + '_720p.mp4'
    const outPath  = path.join(UPLOAD_DIR, outName)
    const thumbName = outName.replace('.mp4', '.jpg')

    function finishWithFile(finalPath, finalName) {
      // Generate thumbnail — best effort
      ffmpeg(finalPath)
        .screenshots({ timestamps: ['00:00:02'], filename: thumbName, folder: THUMB_DIR, size: '320x180' })
        .on('end', () => {
          const stat = fs.statSync(finalPath)
          if (io) io.emit('screensaver:library-updated')
          res.json({ success: true, filename: finalName, size: stat.size, url: '/screensaver/uploads/' + finalName })
        })
        .on('error', () => {
          // Thumbnail failed — still respond success
          const stat = fs.statSync(finalPath)
          if (io) io.emit('screensaver:library-updated')
          res.json({ success: true, filename: finalName, size: stat.size, url: '/screensaver/uploads/' + finalName })
        })
    }

    // Try to transcode to 720p mp4
    ffmpeg(origPath)
      .videoFilter('scale=1280:720')
      .videoCodec('libx264')
      .outputOption('-crf 23')
      .outputOption('-preset fast')
      .noAudio()
      .outputOption('-movflags +faststart')
      .on('end', () => {
        fs.unlink(origPath, () => {})
        finishWithFile(outPath, outName)
      })
      .on('error', (transcodeErr) => {
        console.warn('[screensaver] transcode failed, saving original:', transcodeErr.message)
        // Transcode failed — rename original to a .mp4 name and use it directly
        const fallbackName = Date.now() + '_raw.mp4'
        const fallbackPath = path.join(UPLOAD_DIR, fallbackName)
        fs.rename(origPath, fallbackPath, (renameErr) => {
          if (renameErr) {
            return res.status(500).json({ error: 'Upload failed: ' + transcodeErr.message })
          }
          finishWithFile(fallbackPath, fallbackName)
        })
      })
      .save(outPath)
  })
})

// ── GET /api/screensaver/list ─────────────────────────────────
router.get('/list', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.mp4'))
    const list = files.map(filename => {
      const stat = fs.statSync(path.join(UPLOAD_DIR, filename))
      const thumbFile = filename.replace('.mp4', '.jpg')
      const thumbExists = fs.existsSync(path.join(THUMB_DIR, thumbFile))
      return {
        filename,
        size: stat.size,
        url: '/screensaver/uploads/' + filename,
        thumbnail: thumbExists ? '/screensaver/thumbnails/' + thumbFile : null
      }
    })
    res.json(list)
  } catch (err) {
    res.json([])
  }
})

// ── DELETE /api/screensaver/:filename ─────────────────────────
router.delete('/:filename', (req, res) => {
  const io = req.app.get('io')
  const filename = path.basename(req.params.filename) // prevent path traversal
  const filePath  = path.join(UPLOAD_DIR, filename)
  const thumbPath = path.join(THUMB_DIR, filename.replace('.mp4', '.jpg'))

  fs.unlink(filePath,  () => {})
  fs.unlink(thumbPath, () => {})

  if (io) io.emit('screensaver:library-updated')
  res.json({ success: true })
})

// ── GET /api/screensaver/status ───────────────────────────────
router.get('/status', (req, res) => {
  const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.mp4'))
  res.json({ active: false, currentWallpaper: null, count: files.length })
})

// ── POST /api/screensaver/settings ───────────────────────────
router.post('/settings', (req, res) => {
  const { mode, interval } = req.body
  const settings = { mode: mode || 'random', interval: parseInt(interval) || 0 }
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2))
  res.json({ success: true, settings })
})

// ── POST /api/screensaver/trigger ─────────────────────────────
// Called by companion app Start/Stop buttons
router.post('/trigger', (req, res) => {
  const io = req.app.get('io')
  const { action } = req.body
  if (!['enter', 'exit'].includes(action)) {
    return res.status(400).json({ error: 'action must be enter or exit' })
  }
  if (io) io.emit('screensaver:' + action)
  res.json({ ok: true })
})

module.exports = router
