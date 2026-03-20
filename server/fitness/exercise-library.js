const fs   = require('fs')
const path = require('path')

const EXERCISES_PATH = path.join(__dirname, '../../data/exercises.json')
let cache = null

const DEFAULT_INSTRUCTIONS = [
  'Perform the movement with controlled form',
  'Keep your core braced throughout',
  'Exhale on exertion, inhale on return'
]

function loadAll() {
  if (cache) return cache
  try {
    if (fs.existsSync(EXERCISES_PATH)) {
      cache = JSON.parse(fs.readFileSync(EXERCISES_PATH, 'utf8'))
    }
  } catch (e) {
    console.error('[exercise-library] Failed to load exercises.json:', e.message)
  }
  return cache || []
}

function getById(id) {
  const all = loadAll()
  return all.find(ex => String(ex.id) === String(id)) || null
}

function enrichWorkout(workout) {
  const enriched = { ...workout }
  enriched.exercises = (workout.exercises || []).map(entry => {
    const full = getById(entry.exerciseId)

    if (full) {
      // exercises.json has this ID — use full data, but let workout entry override
      return {
        ...entry,
        exercise: {
          ...full,
          // Workout-level overrides (name in workout JSON takes precedence if present)
          name: entry.name || full.name,
          instructions: (full.instructions && full.instructions.length) ? full.instructions : (entry.instructions || DEFAULT_INSTRUCTIONS),
          target: full.target || entry.target || 'full body',
          secondaryMuscles: (full.secondaryMuscles && full.secondaryMuscles.length) ? full.secondaryMuscles : (entry.secondaryMuscles || [])
        }
      }
    }

    // exercises.json missing or ID not found — build from workout entry fields
    return {
      ...entry,
      exercise: {
        id: entry.exerciseId,
        name: entry.name || entry.exerciseId,
        target: entry.target || 'full body',
        secondaryMuscles: entry.secondaryMuscles || [],
        instructions: entry.instructions || DEFAULT_INSTRUCTIONS,
        bodyPart: entry.target || 'full body',
        equipment: 'body weight',
        gifUrl: null
      }
    }
  })
  return enriched
}

module.exports = { getById, enrichWorkout, loadAll }
