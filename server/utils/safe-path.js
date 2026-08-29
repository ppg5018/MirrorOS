// ── Safe workout-id resolution ───────────────────────────────
// Workout ids come from HTTP params, request bodies, and AI tool input.
// Left unchecked they let ".." / absolute paths escape data/workouts and
// read or overwrite arbitrary JSON on disk (e.g. OAuth tokens). Only allow
// a strict [A-Za-z0-9_-] id AND verify the resolved path stays inside dir.

const path = require('path')

const ID_RE = /^[A-Za-z0-9_-]+$/

function isValidWorkoutId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && ID_RE.test(id)
}

// Returns the absolute path to <dir>/<id>.json, or null if id is unsafe or
// the resolved path would land outside dir.
function safeWorkoutPath(dir, id) {
  if (!isValidWorkoutId(id)) return null
  const base = path.resolve(dir)
  const full = path.resolve(base, id + '.json')
  if (full !== path.join(base, id + '.json')) return null
  if (full !== base && !full.startsWith(base + path.sep)) return null
  return full
}

module.exports = { isValidWorkoutId, safeWorkoutPath }
