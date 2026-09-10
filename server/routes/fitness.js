const express = require('express')
const router  = express.Router()
const fs      = require('fs')
const path    = require('path')

const { safeWorkoutPath } = require('../utils/safe-path')
const exerciseLib = require('../fitness/exercise-library')

const DATA_DIR     = path.join(__dirname, '../../data')
const WORKOUTS_DIR = path.join(DATA_DIR, 'workouts')
const GIFS_DIR     = path.join(DATA_DIR, 'gifs')
const THUMBS_DIR   = path.join(DATA_DIR, 'thumbs')

function countFiles(dir, ext) {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith(ext)).length
  } catch (e) {
    return 0
  }
}

// ── GET /api/fitness/workouts — list all workout summaries ──
router.get('/workouts', (req, res) => {
  try {
    if (!fs.existsSync(WORKOUTS_DIR)) return res.json([])

    const files = fs.readdirSync(WORKOUTS_DIR).filter(f => f.endsWith('.json'))
    const summaries = files.map(f => {
      try {
        const workout = JSON.parse(fs.readFileSync(path.join(WORKOUTS_DIR, f), 'utf8'))
        const exercises = workout.exercises || []
        return {
          id:                workout.id || path.basename(f, '.json'),
          name:              workout.name,
          category:          workout.category   || 'custom',
          difficulty:        workout.difficulty || 'intermediate',
          durationMinutes:   workout.durationMinutes,
          estimatedCalories: workout.estimatedCalories,
          description:       workout.description,
          exerciseCount:     exercises.length,
          custom:            /^custom-/.test(workout.id || ''),
          // A couple of names + a thumbnail let the companion render a real
          // card without a second request per workout.
          preview: exercises.slice(0, 3).map(e => {
            const ex = exerciseLib.getById(e.exerciseId)
            return ex ? { id: ex.id, name: ex.name, thumb: ex.thumb } : null
          }).filter(Boolean)
        }
      } catch (e) {
        console.error(`[fitness] Bad workout file ${f}:`, e.message)
        return null
      }
    }).filter(Boolean)

    // Curated first, then custom, each alphabetical.
    summaries.sort((a, b) =>
      (a.custom === b.custom) ? String(a.name).localeCompare(String(b.name)) : (a.custom ? 1 : -1))

    res.json(summaries)
  } catch (err) {
    console.error('[fitness] workouts list error:', err.message)
    res.status(500).json({ error: 'Failed to load workouts' })
  }
})

// ── GET /api/fitness/exercises/facets — filter options + counts ──
// Declared before /exercises/:id so "facets" is not read as an id.
router.get('/exercises/facets', (req, res) => {
  try {
    res.json(exerciseLib.facets())
  } catch (err) {
    console.error('[fitness] facets error:', err.message)
    res.status(500).json({ error: 'Failed to load facets' })
  }
})

// ── GET /api/fitness/exercises/search — paginated library search ──
// q, bodyPart, equipment, target, limit (max 200), offset
router.get('/exercises/search', (req, res) => {
  try {
    res.json(exerciseLib.search(req.query))
  } catch (err) {
    console.error('[fitness] search error:', err.message)
    res.status(500).json({ error: 'Search failed' })
  }
})

// ── GET /api/fitness/exercises/:id — one full exercise record ──
router.get('/exercises/:id', (req, res) => {
  const ex = exerciseLib.getById(req.params.id)
  if (!ex) return res.status(404).json({ error: 'Exercise not found' })
  res.json(ex)
})

// ── GET /api/fitness/workouts/:id — full enriched workout ──
router.get('/workouts/:id', (req, res) => {
  try {
    const filePath = safeWorkoutPath(WORKOUTS_DIR, req.params.id)
    if (!filePath) return res.status(400).json({ error: 'Invalid workout id' })
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Workout not found' })
    }

    const workout = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    res.json(exerciseLib.enrichWorkout(workout))
  } catch (err) {
    console.error('[fitness] workout detail error:', err.message)
    res.status(500).json({ error: 'Failed to load workout' })
  }
})

// ── GET /api/fitness/status — data readiness check ──
router.get('/status', (req, res) => {
  const total = exerciseLib.count()
  res.json({
    exercisesLoaded:   total,
    gifsDownloaded:    countFiles(GIFS_DIR, '.gif'),
    thumbsDownloaded:  countFiles(THUMBS_DIR, '.jpg'),
    workoutsAvailable: countFiles(WORKOUTS_DIR, '.json'),
    setupComplete:     total > 100
  })
})

// ── POST /api/fitness/start — begin a workout session ──
router.post('/start', (req, res) => {
  const engine = req.app.get('workoutEngine')
  if (!engine) return res.status(500).json({ error: 'Workout engine not initialized' })
  const { workoutId, weightKg } = req.body
  if (!workoutId) return res.status(400).json({ error: 'workoutId required' })
  try {
    const result = engine.start(workoutId, weightKg)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ── POST /api/fitness/action — pause/resume/skip/stop ──
router.post('/action', (req, res) => {
  const engine = req.app.get('workoutEngine')
  if (!engine) return res.status(500).json({ error: 'Workout engine not initialized' })
  const { action } = req.body
  const valid = ['pause', 'resume', 'skip', 'stop']
  if (!valid.includes(action)) return res.status(400).json({ error: 'Invalid action' })
  try {
    engine[action]()
    res.json(engine.getState())
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ── GET /api/fitness/state — current engine state ──
router.get('/state', (req, res) => {
  const engine = req.app.get('workoutEngine')
  if (!engine) return res.status(500).json({ error: 'Workout engine not initialized' })
  res.json(engine.getState())
})

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

// ── POST /api/fitness/workouts — save a custom workout ──
// Body: { id?, name, category?, difficulty?, description?,
//         exercises: [{ exerciseId, sets, reps, restSeconds, formTip? }] }
router.post('/workouts', (req, res) => {
  try {
    const body = req.body || {}
    const name = String(body.name || '').trim().slice(0, 60)
    if (!name) return res.status(400).json({ error: 'name required' })

    if (!Array.isArray(body.exercises) || body.exercises.length === 0) {
      return res.status(400).json({ error: 'At least one exercise required' })
    }
    if (body.exercises.length > 40) {
      return res.status(400).json({ error: 'A workout can hold at most 40 exercises' })
    }

    // Every id must exist in the library, or the workout would play with a
    // blank animation — the exact failure this data migration removed.
    const unknown = []
    const exercises = body.exercises.map(raw => {
      const id = String(raw.exerciseId || '').trim()
      if (!exerciseLib.getById(id)) { unknown.push(id || '(blank)'); return null }
      const entry = {
        exerciseId:  id,
        sets:        clampInt(raw.sets, 1, 20, 3),
        reps:        clampInt(raw.reps, 1, 500, 10),
        restSeconds: clampInt(raw.restSeconds, 0, 600, 45)
      }
      if (raw.formTip)  entry.formTip  = String(raw.formTip).slice(0, 140)
      if (raw.metValue) entry.metValue = Number(raw.metValue) || undefined
      return entry
    })

    if (unknown.length) {
      return res.status(400).json({ error: 'Unknown exercise ids: ' + unknown.join(', ') })
    }

    const id = body.id ? String(body.id) : ('custom-' + Date.now())
    // Reject ids containing path separators / .. so a write can never escape
    // the workouts directory.
    const filePath = safeWorkoutPath(WORKOUTS_DIR, id)
    if (!filePath) return res.status(400).json({ error: 'Invalid workout id' })

    // Rest between exercises plus roughly 3s per rep, rounded to a minute.
    const estSeconds = exercises.reduce((sum, e) =>
      sum + e.sets * (e.reps * 3 + e.restSeconds), 0)

    const workout = {
      id,
      name,
      category:        String(body.category   || 'custom').slice(0, 24),
      difficulty:      String(body.difficulty || 'intermediate').slice(0, 24),
      durationMinutes: Math.max(1, Math.round(estSeconds / 60)),
      description:     String(body.description || 'Custom workout built on the companion app').slice(0, 200),
      exercises
    }

    fs.mkdirSync(WORKOUTS_DIR, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(workout, null, 2) + '\n')

    const io = req.app.get('io')
    if (io) io.emit('workouts-updated', { id, name })

    console.log('[fitness] saved custom workout:', id, `(${exercises.length} exercises)`)
    res.json({ success: true, id, workout })
  } catch (err) {
    console.error('[fitness] save workout error:', err.message)
    res.status(500).json({ error: 'Failed to save workout' })
  }
})

// ── DELETE /api/fitness/workouts/:id — remove a custom workout ──
router.delete('/workouts/:id', (req, res) => {
  try {
    const id = String(req.params.id)
    // Only workouts created from the companion may be deleted; the curated
    // set ships with the mirror.
    if (!/^custom-/.test(id)) {
      return res.status(403).json({ error: 'Only custom workouts can be deleted' })
    }
    const filePath = safeWorkoutPath(WORKOUTS_DIR, id)
    if (!filePath) return res.status(400).json({ error: 'Invalid workout id' })
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Workout not found' })

    fs.unlinkSync(filePath)
    const io = req.app.get('io')
    if (io) io.emit('workouts-updated', { id, deleted: true })
    res.json({ success: true, id })
  } catch (err) {
    console.error('[fitness] delete workout error:', err.message)
    res.status(500).json({ error: 'Failed to delete workout' })
  }
})

// ── GET /api/fitness/history — past workout sessions ──
router.get('/history', (req, res) => {
  const historyTracker = require('../fitness/history-tracker')
  const limit = parseInt(req.query.limit) || 20
  res.json(historyTracker.getHistory(limit))
})

// ── GET /api/fitness/stats — aggregate stats and streak ──
router.get('/stats', (req, res) => {
  const historyTracker = require('../fitness/history-tracker')
  res.json(historyTracker.getStats())
})

// ── GET /api/fitness/stats/weekly — per-day breakdown (last N days) ──
router.get('/stats/weekly', (req, res) => {
  const historyTracker = require('../fitness/history-tracker')
  const days = Math.min(parseInt(req.query.days) || 7, 365)
  res.json(historyTracker.getWeekly(days))
})

module.exports = router
