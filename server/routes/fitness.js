const express = require('express')
const router  = express.Router()
const fs      = require('fs')
const path    = require('path')

const DATA_DIR       = path.join(__dirname, '../../data')
const WORKOUTS_DIR   = path.join(DATA_DIR, 'workouts')
const EXERCISES_PATH = path.join(DATA_DIR, 'exercises.json')
const GIFS_DIR       = path.join(DATA_DIR, 'gifs')

// ── Exercise cache (loaded once, stays in memory) ────────
let exercisesCache = null

function loadExercises() {
  if (exercisesCache) return exercisesCache
  try {
    if (fs.existsSync(EXERCISES_PATH)) {
      exercisesCache = JSON.parse(fs.readFileSync(EXERCISES_PATH, 'utf8'))
    }
  } catch (e) {
    console.error('[fitness] Failed to load exercises.json:', e.message)
  }
  return exercisesCache || []
}

function getExerciseById(id) {
  const all = loadExercises()
  return all.find(ex => String(ex.id) === String(id)) || null
}

// ── GET /api/fitness/workouts — list all workout summaries ──
router.get('/workouts', (req, res) => {
  try {
    if (!fs.existsSync(WORKOUTS_DIR)) return res.json([])

    const files = fs.readdirSync(WORKOUTS_DIR).filter(f => f.endsWith('.json'))
    const summaries = files.map(f => {
      try {
        const workout = JSON.parse(fs.readFileSync(path.join(WORKOUTS_DIR, f), 'utf8'))
        return {
          id:                workout.id,
          name:              workout.name,
          category:          workout.category,
          difficulty:        workout.difficulty,
          durationMinutes:   workout.durationMinutes,
          estimatedCalories: workout.estimatedCalories,
          description:       workout.description,
          exerciseCount:     (workout.exercises || []).length
        }
      } catch (e) {
        console.error(`[fitness] Bad workout file ${f}:`, e.message)
        return null
      }
    }).filter(Boolean)

    res.json(summaries)
  } catch (err) {
    console.error('[fitness] workouts list error:', err.message)
    res.status(500).json({ error: 'Failed to load workouts' })
  }
})

// ── GET /api/fitness/workouts/:id — full enriched workout ──
router.get('/workouts/:id', (req, res) => {
  try {
    const filePath = path.join(WORKOUTS_DIR, req.params.id + '.json')
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Workout not found' })
    }

    const workout = JSON.parse(fs.readFileSync(filePath, 'utf8'))

    // Enrich each exercise with full data from exercises.json
    workout.exercises = (workout.exercises || []).map(entry => {
      const full = getExerciseById(entry.exerciseId)
      return {
        ...entry,
        exercise: full || {
          id: entry.exerciseId,
          name: entry.name || entry.exerciseId,
          target: entry.target || 'full body',
          secondaryMuscles: entry.secondaryMuscles || [],
          instructions: entry.instructions || [],
          bodyPart: entry.target || 'full body',
          equipment: 'body weight'
        }
      }
    })

    res.json(workout)
  } catch (err) {
    console.error('[fitness] workout detail error:', err.message)
    res.status(500).json({ error: 'Failed to load workout' })
  }
})

// ── GET /api/fitness/exercises/search — filter exercises ──
router.get('/exercises/search', (req, res) => {
  try {
    const all = loadExercises()
    const { q, bodyPart, equipment } = req.query

    let results = all

    if (q) {
      const query = q.toLowerCase()
      results = results.filter(ex => ex.name.toLowerCase().includes(query))
    }
    if (bodyPart) {
      const bp = bodyPart.toLowerCase()
      results = results.filter(ex => ex.bodyPart.toLowerCase() === bp)
    }
    if (equipment) {
      const eq = equipment.toLowerCase()
      results = results.filter(ex => ex.equipment.toLowerCase() === eq)
    }

    res.json(results.slice(0, 20))
  } catch (err) {
    console.error('[fitness] search error:', err.message)
    res.status(500).json({ error: 'Search failed' })
  }
})

// ── GET /api/fitness/status — data readiness check ──
router.get('/status', (req, res) => {
  const exercises = loadExercises()
  let gifCount = 0
  try {
    if (fs.existsSync(GIFS_DIR)) {
      gifCount = fs.readdirSync(GIFS_DIR).filter(f => f.endsWith('.gif')).length
    }
  } catch (e) { /* dir missing */ }

  let workoutCount = 0
  try {
    if (fs.existsSync(WORKOUTS_DIR)) {
      workoutCount = fs.readdirSync(WORKOUTS_DIR).filter(f => f.endsWith('.json')).length
    }
  } catch (e) { /* dir missing */ }

  res.json({
    exercisesLoaded:    exercises.length,
    gifsDownloaded:     gifCount,
    workoutsAvailable:  workoutCount,
    setupComplete:      exercises.length > 100
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

// ── POST /api/fitness/workouts — save a custom workout ──
router.post('/workouts', (req, res) => {
  try {
    const workout = req.body
    if (!workout || !workout.name) return res.status(400).json({ error: 'name required' })

    const id       = workout.id || ('custom-' + Date.now())
    workout.id     = id
    const filename = id + '.json'
    const filePath = path.join(WORKOUTS_DIR, filename)

    fs.mkdirSync(WORKOUTS_DIR, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(workout, null, 2))

    const io = req.app.get('io')
    if (io) io.emit('workouts-updated', { id, name: workout.name })

    console.log('[fitness] saved custom workout:', id)
    res.json({ success: true, id, filename })
  } catch (err) {
    console.error('[fitness] save workout error:', err.message)
    res.status(500).json({ error: 'Failed to save workout' })
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
