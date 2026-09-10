#!/usr/bin/env node
/**
 * MirrorOS — Workout ID Remapper (one-shot migration)
 *
 * The curated workouts in data/workouts/ were authored against invented
 * ExerciseDB ids: 48 of 58 entries pointed at a completely different movement
 * than their label ("Plank" -> id 1472 = "forward jump"), so every animation
 * would have shown the wrong exercise.
 *
 * This rewrites each workout to reference real ids from data/exercises.json
 * and DROPS the duplicated name/target/secondaryMuscles/instructions fields —
 * those now come from exercises.json at request time (see
 * server/fitness/exercise-library.js), so a label can never drift from its GIF
 * again. Workout-specific fields (sets, reps, restSeconds, formTip, metValue)
 * are preserved.
 *
 *   node scripts/remap-workouts.js --dry-run   # show the plan
 *   node scripts/remap-workouts.js             # apply (writes .bak files)
 *
 * Run once after `npm run setup:fitness`. Re-running is a no-op.
 */

const fs   = require('fs')
const path = require('path')

const DATA_DIR       = path.join(__dirname, '../data')
const WORKOUTS_DIR   = path.join(DATA_DIR, 'workouts')
const EXERCISES_PATH = path.join(DATA_DIR, 'exercises.json')

const DRY = process.argv.includes('--dry-run')

// ── Curated mapping: the label used in the workout files -> real dataset id ──
//
// Chosen by hand against the dataset. Where the dataset has no exact movement
// (it is gym-oriented, so it carries no plain air squat, plank hold, or yoga
// asana) the nearest real exercise is used and the workout inherits that
// exercise's own name — a slightly different movement with a correct animation
// beats the right word with the wrong picture.
const MAP = {
  // Cardio / full body
  'Burpee':                    '1160', // burpee
  'Jumping Jack':              '3220', // astride jumps — the jumping-jack motion
  'High Knees':                '3636', // high knee against wall
  'Squat Jump':                ['0514', '3222'], // jump squat, then semi squat jump
  'Jump Squat':                ['0514', '3222'],
  // Where a value is a list, the first id not already used in the same workout
  // wins — two slots that both mapped to "mountain climber" would otherwise
  // collapse into the same movement twice.
  'Mountain Climber':          ['0630', '2466'], // mountain climber, then cross-body bridge variant

  // Legs
  'Bodyweight Squat':          '1685', // squat to overhead reach (no plain air squat in dataset)
  'Forward Lunge':             '3470', // forward lunge
  'Glute Bridge':              '3013', // low glute bridge on floor
  'Romanian Deadlift':         '1459', // dumbbell romanian deadlift
  'Standing Calf Raise':       '1373', // bodyweight standing calf raise

  // Push / pull
  'Push Up':                   '0662', // push-up
  'Dumbbell Shoulder Press':   '0426', // dumbbell standing overhead press
  'Dumbbell Bicep Curl':       '0294', // dumbbell biceps curl
  'Dumbbell Tricep Extension': '0430', // dumbbell standing triceps extension
  'Tricep Dip':                '0814', // triceps dip

  // Core
  'Plank':                     '0464', // front plank with twist (no static plank in dataset)
  'Lying Leg Raise':           '0620', // lying leg raise flat bench
  'Russian Twist':             '0687', // russian twist
  'Bicycle Crunch':            '0003', // air bike

  // Yoga / stretching — no asanas in the dataset, so these become the nearest
  // real mobility work rather than a label with no matching animation.
  'Downward Dog':              '1362', // sphinx
  'Cobra Stretch':             '1366', // upward facing dog
  'Seated Forward Bend':       '1511', // hamstring stretch
  'Neck Side Stretch':         '1403', // neck side stretch (exact match)
  'Tree Pose':                 '1548', // chair leg extended stretch
  'Savasana':                  '2571'  // rocking frog stretch
}

// Fields that used to be copied into each workout entry and are now sourced
// from exercises.json instead.
const INHERITED = ['name', 'target', 'secondaryMuscles', 'instructions']

function main() {
  if (!fs.existsSync(EXERCISES_PATH)) {
    console.error('❌ data/exercises.json not found — run `npm run setup:fitness` first.')
    process.exit(1)
  }

  const exercises = JSON.parse(fs.readFileSync(EXERCISES_PATH, 'utf8'))
  const byId = new Map(exercises.map(e => [String(e.id), e]))

  // Every mapping target must actually exist, or we would swap one broken
  // reference for another.
  const badTargets = []
  for (const [label, val] of Object.entries(MAP)) {
    for (const id of [].concat(val)) if (!byId.has(id)) badTargets.push([label, id])
  }
  if (badTargets.length) {
    console.error('❌ mapping points at ids missing from the dataset:')
    badTargets.forEach(([label, id]) => console.error(`   ${label} -> ${id}`))
    process.exit(1)
  }

  const files = fs.readdirSync(WORKOUTS_DIR).filter(f => f.endsWith('.json'))
  let changedFiles = 0, remapped = 0, alreadyOk = 0, unresolved = 0

  for (const file of files) {
    const filePath = path.join(WORKOUTS_DIR, file)
    let workout
    try {
      workout = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (e) {
      console.log(`  ⚠ ${file}: unreadable (${e.message}) — skipped`)
      continue
    }

    const lines = []
    let touched = false
    const usedInFile = new Set()

    workout.exercises = (workout.exercises || []).map(entry => {
      const label   = entry.name || ''
      const current = String(entry.exerciseId || '')
      const choices = MAP[label] ? [].concat(MAP[label]) : null
      // Prefer the first candidate this workout has not already used.
      const mapped  = choices && (choices.find(id => !usedInFile.has(id)) || choices[0])

      let targetId = mapped
      if (!targetId) {
        // No curated entry — keep the id if it already resolves, else flag it.
        if (byId.has(current)) {
          targetId = current
        } else {
          unresolved++
          lines.push(`     ? ${label || '(unnamed)'} — id ${current} not in dataset and no mapping; left as-is`)
          return entry
        }
      }

      const ds = byId.get(targetId)
      usedInFile.add(targetId)
      const slim = { exerciseId: targetId }
      for (const [k, v] of Object.entries(entry)) {
        if (k === 'exerciseId' || INHERITED.includes(k)) continue
        slim[k] = v
      }

      if (targetId !== current) {
        remapped++
        touched = true
        lines.push(`     ${current} -> ${targetId}   "${label}" becomes "${ds.name}"`)
      } else {
        alreadyOk++
        // Still strip the inherited fields so nothing can drift later.
        if (INHERITED.some(k => k in entry)) {
          touched = true
          lines.push(`     ${current} kept ("${ds.name}") — inlined fields removed`)
        }
      }
      return slim
    })

    if (!touched) {
      console.log(`  = ${file}: nothing to do`)
      continue
    }

    console.log(`  ${DRY ? '~' : '✓'} ${file}`)
    lines.forEach(l => console.log(l))

    if (!DRY) {
      fs.copyFileSync(filePath, filePath + '.bak')
      fs.writeFileSync(filePath, JSON.stringify(workout, null, 2) + '\n')
    }
    changedFiles++
  }

  console.log('\n── Summary ─────────────────────────────')
  console.log(`  files ${DRY ? 'to change' : 'changed'}: ${changedFiles}`)
  console.log(`  ids remapped:   ${remapped}`)
  console.log(`  ids already ok: ${alreadyOk}`)
  if (unresolved) console.log(`  ⚠ unresolved:   ${unresolved} (add them to MAP in this script)`)
  if (DRY) console.log('\n  dry run — nothing written. Re-run without --dry-run to apply.')
  else if (changedFiles) console.log('\n  originals saved as data/workouts/*.json.bak')
  console.log()
}

main()
