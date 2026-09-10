const fs   = require('fs')
const path = require('path')

/**
 * Single owner of data/exercises.json (the imported open exercises dataset —
 * see scripts/setup-fitness.js). Both the fitness routes and the workout
 * engine read through here so the ~3 MB file is parsed once, not once per
 * consumer — the Pi runs Node with --max-old-space-size=256.
 *
 * This module is also the single source of truth for an exercise's name,
 * target, muscles and instructions. Workout files in data/workouts/ carry only
 * the workout-specific fields (sets/reps/restSeconds/formTip/metValue) plus an
 * exerciseId, so a label can never drift out of sync with its animation.
 */

const EXERCISES_PATH = path.join(__dirname, '../../data/exercises.json')

let cache   = null   // full records, sorted by id
let byId    = null   // id -> record
let index   = null   // [{ ex, norm, wordCount }] for search
let facetsCache = null

// "Push-up" and "push up" must compare equal, so punctuation collapses to a
// single space before any name matching.
function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const DEFAULT_INSTRUCTIONS = [
  'Perform the movement with controlled form',
  'Keep your core braced throughout',
  'Exhale on exertion, inhale on return'
]

function loadAll() {
  if (cache) return cache
  try {
    if (fs.existsSync(EXERCISES_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(EXERCISES_PATH, 'utf8'))
      cache = Array.isArray(parsed) ? parsed : []
    } else {
      cache = []
      console.warn('[exercise-library] data/exercises.json missing — run `npm run setup:fitness`')
    }
  } catch (e) {
    console.error('[exercise-library] Failed to load exercises.json:', e.message)
    cache = []
  }
  byId = new Map(cache.map(ex => [String(ex.id), ex]))
  // Normalize each name once — search runs on every keystroke from the
  // companion app.
  index = cache.map(ex => {
    const norm = normalizeName(ex.searchName || ex.name)
    return { ex, norm, wordCount: norm ? norm.split(' ').length : 0 }
  })
  return cache
}

function getById(id) {
  loadAll()
  return byId.get(String(id)) || null
}

function count() {
  return loadAll().length
}

// ── Projections ───────────────────────────────────────────
// Search results and pickers never need the instruction text; sending it for
// 50 results would push a ~200 KB payload over the LAN for no reason.
function slim(ex) {
  return {
    id:        ex.id,
    name:      ex.name,
    bodyPart:  ex.bodyPart,
    target:    ex.target,
    equipment: ex.equipment,
    thumb:     ex.thumb   || ('/data/thumbs/' + ex.id + '.jpg'),
    gif:       ex.localGif || ('/data/gifs/' + ex.id + '.gif')
  }
}

// ── Search ────────────────────────────────────────────────
/**
 * Filter the library. Scores name matches so "push up" surfaces "Push-up"
 * ahead of "Push-up to Side Plank".
 * @returns {{ total:number, items:Array, offset:number, limit:number }}
 */
function search(opts = {}) {
  const all = loadAll()
  const limit  = Math.min(Math.max(parseInt(opts.limit, 10) || 30, 1), 200)
  const offset = Math.max(parseInt(opts.offset, 10) || 0, 0)

  const q         = (opts.q || '').trim().toLowerCase()
  const bodyPart  = (opts.bodyPart  || '').trim().toLowerCase()
  const equipment = (opts.equipment || '').trim().toLowerCase()
  const target    = (opts.target    || '').trim().toLowerCase()

  let rows = index
  if (bodyPart)  rows = rows.filter(r => String(r.ex.bodyPart  || '').toLowerCase() === bodyPart)
  if (equipment) rows = rows.filter(r => String(r.ex.equipment || '').toLowerCase() === equipment)
  if (target)    rows = rows.filter(r => String(r.ex.target    || '').toLowerCase() === target)

  let results
  if (q) {
    const nq     = normalizeName(q)
    const tokens = nq.split(' ').filter(Boolean)
    const scored = []
    for (const r of rows) {
      // Every token must appear in the name — an AND match keeps "dumbbell
      // curl" from returning every dumbbell exercise.
      if (!tokens.every(t => r.norm.includes(t))) continue
      let score = 0
      if (r.norm === nq)            score += 100
      else if (r.norm.startsWith(nq)) score += 40
      else if (r.norm.includes(nq))   score += 20
      // Prefer the plainest movement: "Push-up" over "Push-up to Side Plank".
      score -= Math.max(0, r.wordCount - tokens.length)
      scored.push({ r, score })
    }
    scored.sort((a, b) => b.score - a.score || a.r.ex.name.localeCompare(b.r.ex.name))
    results = scored.map(s => s.r.ex)
  } else {
    results = rows.map(r => r.ex)
  }

  return {
    total:  results.length,
    offset,
    limit,
    items:  results.slice(offset, offset + limit).map(slim)
  }
}

// ── Facets (for the companion's filter chips) ─────────────
function facets() {
  if (facetsCache) return facetsCache
  const all = loadAll()
  const tally = key => {
    const counts = new Map()
    for (const ex of all) {
      const v = ex[key]
      if (!v) continue
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }))
  }
  facetsCache = {
    total:     all.length,
    bodyParts: tally('bodyPart'),
    equipment: tally('equipment'),
    targets:   tally('target')
  }
  return facetsCache
}

// ── Workout enrichment ────────────────────────────────────
/**
 * Attach the full exercise record to each entry of a workout. Workout entries
 * are the authority on sets/reps/rest/formTip; exercises.json is the authority
 * on everything describing the movement itself.
 */
function enrichWorkout(workout) {
  const enriched = { ...workout }
  enriched.exercises = (workout.exercises || []).map(entry => resolveEntry(entry))
  return enriched
}

function resolveEntry(entry) {
  const full = getById(entry.exerciseId)

  if (full) {
    return {
      ...entry,
      exercise: {
        ...full,
        instructions: (full.instructions && full.instructions.length)
          ? full.instructions
          : DEFAULT_INSTRUCTIONS
      }
    }
  }

  // Unknown id — keep the workout playable with whatever the entry carries
  // rather than throwing and taking the whole session down.
  return {
    ...entry,
    exercise: {
      id:               entry.exerciseId,
      name:             entry.name || 'Exercise ' + entry.exerciseId,
      target:           entry.target || 'full body',
      bodyPart:         entry.target || 'full body',
      equipment:        'body weight',
      secondaryMuscles: entry.secondaryMuscles || [],
      instructions:     entry.instructions || DEFAULT_INSTRUCTIONS,
      instructionsHi:   [],
      localGif:         null,
      thumb:            null,
      missing:          true
    }
  }
}

module.exports = {
  loadAll, getById, count, slim, search, facets, enrichWorkout, resolveEntry
}
