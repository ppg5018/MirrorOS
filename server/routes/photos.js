const express = require('express')
const multer  = require('multer')
const fs      = require('fs')
const path    = require('path')
const router  = express.Router()

const PHOTOS_DIR = path.join(__dirname, '../../public/uploads/photos')
const ALLOWED    = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const MAX_SIZE   = 15 * 1024 * 1024   // 15MB per file
const MAX_FILES  = 50

if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase()
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 40)
    cb(null, base + '_' + Date.now() + ext)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ALLOWED.includes(ext)) cb(null, true)
    else cb(new Error('Only JPG, PNG, WEBP, GIF allowed'))
  }
})

// GET /api/photos
router.get('/', (req, res) => {
  try {
    const files = fs.readdirSync(PHOTOS_DIR)
      .filter(f => ALLOWED.includes(path.extname(f).toLowerCase()))
      .map(f => ({
        filename:   f,
        url:        '/uploads/photos/' + f,
        size:       fs.statSync(path.join(PHOTOS_DIR, f)).size,
        uploadedAt: fs.statSync(path.join(PHOTOS_DIR, f)).mtime.toISOString()
      }))
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    res.json({ photos: files, count: files.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/photos/upload
router.post('/upload', upload.array('photos', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' })
  }

  const existing = fs.readdirSync(PHOTOS_DIR)
    .filter(f => ALLOWED.includes(path.extname(f).toLowerCase()))
  if (existing.length > MAX_FILES) {
    req.files.forEach(f => fs.unlinkSync(f.path))
    return res.status(400).json({
      error: 'Maximum ' + MAX_FILES + ' photos allowed. Delete some first.'
    })
  }

  const uploaded = req.files.map(f => ({
    filename: f.filename,
    url:      '/uploads/photos/' + f.filename,
    size:     f.size
  }))

  const io = req.app.get('io')
  if (io) io.emit('photos-updated', { uploaded: uploaded.length })

  res.json({ success: true, uploaded, count: uploaded.length })
})

// DELETE /api/photos/all/clear
router.delete('/all/clear', (req, res) => {
  const files = fs.readdirSync(PHOTOS_DIR)
    .filter(f => ALLOWED.includes(path.extname(f).toLowerCase()))
  files.forEach(f => fs.unlinkSync(path.join(PHOTOS_DIR, f)))
  const io = req.app.get('io')
  if (io) io.emit('photos-updated', { cleared: true })
  res.json({ success: true, deleted: files.length })
})

// DELETE /api/photos/:filename
router.delete('/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)
  const filepath = path.join(PHOTOS_DIR, filename)

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' })
  }

  fs.unlinkSync(filepath)
  const io = req.app.get('io')
  if (io) io.emit('photos-updated', { deleted: filename })
  res.json({ success: true, deleted: filename })
})

// POST /api/photos/settings
router.post('/settings', (req, res) => {
  const { interval, transition, order, showOnIdle } = req.body
  const settings = {
    interval:   parseInt(interval)   || 10,
    transition: transition           || 'fade',
    order:      order                || 'random',
    showOnIdle: showOnIdle !== false,
    updatedAt:  new Date().toISOString()
  }
  const configPath = path.join(__dirname, '../../config/slideshow.json')
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2))
  const io = req.app.get('io')
  if (io) io.emit('slideshow-settings', settings)
  res.json({ success: true, settings })
})

// GET /api/photos/settings
router.get('/settings', (req, res) => {
  const configPath = path.join(__dirname, '../../config/slideshow.json')
  if (!fs.existsSync(configPath)) {
    return res.json({ interval: 10, transition: 'fade', order: 'random', showOnIdle: true })
  }
  res.json(JSON.parse(fs.readFileSync(configPath)))
})

module.exports = router
