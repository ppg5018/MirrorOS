#!/usr/bin/env node
/**
 * MirrorOS — Fitness Data Setup
 *
 * Imports the open exercises dataset (hasaneyldrm/exercises-dataset) into
 * data/exercises.json and downloads the 180x180 animation GIFs + thumbnails
 * into data/gifs/ and data/thumbs/.
 *
 * Replaces the old ExerciseDB/RapidAPI flow — no API key, no monthly call
 * quota, 1324 exercises with English *and* Hindi instructions.
 *
 *   npm run setup:fitness                # metadata + thumbs + all GIFs
 *   npm run setup:fitness -- --no-media  # metadata only
 *   npm run setup:fitness -- --thumbs    # metadata + thumbs, skip GIFs
 *   npm run setup:fitness -- --only=0662,0630   # media for specific ids
 *   npm run setup:fitness -- --used      # media only for ids used by data/workouts
 *
 * Media is © Gym visual (https://gymvisual.com/), redistributed by the dataset
 * at 180x180. It is cached locally for this mirror only — data/gifs/ and
 * data/thumbs/ are gitignored and must not be re-published.
 */

const fs   = require('fs')
const path = require('path')

const RAW_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main'

const DATA_DIR       = path.join(__dirname, '../data')
const GIFS_DIR       = path.join(DATA_DIR, 'gifs')
const THUMBS_DIR     = path.join(DATA_DIR, 'thumbs')
const WORKOUTS_DIR   = path.join(DATA_DIR, 'workouts')
const EXERCISES_PATH = path.join(DATA_DIR, 'exercises.json')

const CONCURRENCY = 6

// ── CLI flags ─────────────────────────────────────────────
const argv       = process.argv.slice(2)
const NO_MEDIA   = argv.includes('--no-media')
const THUMBS_ONLY = argv.includes('--thumbs')
const USED_ONLY  = argv.includes('--used')
const ONLY_ARG   = argv.find(a => a.startsWith('--only='))
const ONLY_IDS   = ONLY_ARG ? ONLY_ARG.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean) : null

// ── Helpers ───────────────────────────────────────────────

// Download a URL as a Buffer using native https (no external deps).
function downloadBinary(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('too many redirects'))
    const req = require('https').get(url, { timeout: 30000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return downloadBinary(new URL(res.headers.location, url).toString(), redirects + 1)
          .then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end',  () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

// Run `worker` over `items` with a bounded pool, reporting progress.
async function pool(items, worker, label) {
  let done = 0, ok = 0, failed = 0, skipped = 0
  let firstError = null
  const queue = items.slice()

  async function run() {
    for (;;) {
      const item = queue.shift()
      if (item === undefined) return
      try {
        const r = await worker(item)
        if (r === 'skip') skipped++; else ok++
      } catch (err) {
        failed++
        if (!firstError) firstError = `${item.id || item}: ${err.message}`
      }
      done++
      if (done % 25 === 0 || done === items.length) {
        const pct = Math.round((done / items.length) * 100)
        process.stdout.write(`\r  ${label}: ${done}/${items.length} (${pct}%)  ok=${ok} cached=${skipped} failed=${failed}   `)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length || 1) }, run))
  process.stdout.write('\n')
  if (firstError) console.log(`  first error: ${firstError}`)
  return { ok, failed, skipped }
}

function dirSize(dir) {
  let total = 0
  try {
    for (const f of fs.readdirSync(dir)) {
      const st = fs.statSync(path.join(dir, f))
      if (st.isFile()) total += st.size
    }
  } catch (e) { /* dir may not exist */ }
  return total
}

const mb = bytes => (bytes / 1024 / 1024).toFixed(1) + ' MB'

// Collect every exerciseId referenced by data/workouts/*.json
function idsUsedByWorkouts() {
  const ids = new Set()
  try {
    for (const f of fs.readdirSync(WORKOUTS_DIR).filter(f => f.endsWith('.json'))) {
      try {
        const w = JSON.parse(fs.readFileSync(path.join(WORKOUTS_DIR, f), 'utf8'))
        for (const e of (w.exercises || [])) if (e.exerciseId) ids.add(String(e.exerciseId))
      } catch (e) { /* skip bad file */ }
    }
  } catch (e) { /* no workouts dir */ }
  return ids
}

// Dataset names are lowercase and carry demo-model suffixes ("astride jumps
// (male)"). Clean them once here so every screen shows the same label.
const MINOR = new Set(['to', 'on', 'with', 'and', 'the', 'a', 'of', 'in', 'up', 'v'])

function cleanName(raw) {
  return String(raw)
    .replace(/\s*\((male|female)\)\s*$/i, '')
    .trim()
    .split(' ')
    .map((w, i) => {
      const bare = w.replace(/[^a-z]/gi, '').toLowerCase()
      if (i > 0 && MINOR.has(bare)) return w.toLowerCase()
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

// ── Normalize a dataset record to the MirrorOS exercise schema ──
// Frontend + server expect: id, name, bodyPart, target, equipment,
// secondaryMuscles[], instructions[] — keep those names stable.
function normalize(rec) {
  const steps = (rec.instruction_steps || {})
  const en = Array.isArray(steps.en) ? steps.en : []
  const hi = Array.isArray(steps.hi) ? steps.hi : []

  return {
    id:               rec.id,
    name:             cleanName(rec.name),
    searchName:       String(rec.name).toLowerCase(),
    bodyPart:         rec.body_part || rec.category || 'full body',
    target:           rec.target || rec.muscle_group || 'full body',
    equipment:        rec.equipment || 'body weight',
    muscleGroup:      rec.muscle_group || '',
    secondaryMuscles: Array.isArray(rec.secondary_muscles) ? rec.secondary_muscles : [],
    instructions:     en,
    instructionsHi:   hi,
    mediaId:          rec.media_id || '',
    // Media is stored by plain id so the UI can build paths without a lookup.
    localGif:         '/data/gifs/' + rec.id + '.gif',
    thumb:            '/data/thumbs/' + rec.id + '.jpg',
    gifUrl:           '',
    attribution:      rec.attribution || ''
  }
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  console.log('\n🏋️  MirrorOS Fitness Setup — open exercises dataset\n')

  // 1. Metadata
  console.log('Fetching dataset metadata (~17 MB)...')
  const raw = await downloadBinary(`${RAW_BASE}/data/exercises.json`)
  let dataset
  try {
    dataset = JSON.parse(raw.toString('utf8'))
  } catch (e) {
    throw new Error('dataset JSON did not parse: ' + e.message)
  }
  if (!Array.isArray(dataset) || !dataset.length) throw new Error('dataset was empty')

  const exercises = dataset
    .filter(r => r && r.id && r.name)
    .map(normalize)
    .sort((a, b) => a.id.localeCompare(b.id))

  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(EXERCISES_PATH, JSON.stringify(exercises, null, 2))

  const withHindi = exercises.filter(e => e.instructionsHi.length).length
  console.log(`✓ Wrote ${exercises.length} exercises → data/exercises.json (${mb(fs.statSync(EXERCISES_PATH).size)})`)
  console.log(`  ${withHindi} have Hindi instructions`)
  console.log(`  body parts: ${[...new Set(exercises.map(e => e.bodyPart))].join(', ')}`)
  console.log(`  equipment:  ${new Set(exercises.map(e => e.equipment)).size} kinds\n`)

  if (NO_MEDIA) {
    console.log('--no-media set — skipping GIF/thumbnail download.')
    console.log('The mirror will lazily fetch each GIF on first use instead.\n')
    return
  }

  // 2. Pick which media to fetch
  let targets = exercises
  if (ONLY_IDS) {
    const want = new Set(ONLY_IDS)
    targets = exercises.filter(e => want.has(e.id))
    console.log(`--only set — fetching media for ${targets.length} of ${ONLY_IDS.length} requested ids\n`)
  } else if (USED_ONLY) {
    const used = idsUsedByWorkouts()
    targets = exercises.filter(e => used.has(e.id))
    console.log(`--used set — fetching media for the ${targets.length} ids referenced by data/workouts/\n`)
  }

  if (!targets.length) {
    console.log('No matching exercises to fetch media for.\n')
    return
  }

  // 3. Thumbnails (small — always worth having for the companion browser)
  fs.mkdirSync(THUMBS_DIR, { recursive: true })
  console.log(`Downloading ${targets.length} thumbnails (180x180 JPEG, ~6 KB each)...`)
  await pool(targets, async ex => {
    const dest = path.join(THUMBS_DIR, ex.id + '.jpg')
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return 'skip'
    const buf = await downloadBinary(`${RAW_BASE}/images/${ex.id}-${ex.mediaId}.jpg`)
    fs.writeFileSync(dest, buf)
  }, 'thumbs')

  if (THUMBS_ONLY) {
    console.log('\n--thumbs set — skipping GIFs.')
    console.log(`data/thumbs: ${mb(dirSize(THUMBS_DIR))}\n`)
    return
  }

  // 4. GIFs
  fs.mkdirSync(GIFS_DIR, { recursive: true })
  console.log(`\nDownloading ${targets.length} animation GIFs (180x180, ~90 KB each)...`)
  const res = await pool(targets, async ex => {
    const dest = path.join(GIFS_DIR, ex.id + '.gif')
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return 'skip'
    const buf = await downloadBinary(`${RAW_BASE}/videos/${ex.id}-${ex.mediaId}.gif`)
    fs.writeFileSync(dest, buf)
  }, 'gifs')

  console.log('\n── Done ────────────────────────────────')
  console.log(`  exercises:   ${exercises.length}`)
  console.log(`  gifs:        ${fs.readdirSync(GIFS_DIR).filter(f => f.endsWith('.gif')).length}  (${mb(dirSize(GIFS_DIR))})`)
  console.log(`  thumbs:      ${fs.readdirSync(THUMBS_DIR).filter(f => f.endsWith('.jpg')).length}  (${mb(dirSize(THUMBS_DIR))})`)
  if (res.failed) {
    console.log(`\n  ⚠ ${res.failed} GIFs failed — the mirror will retry them lazily on first use.`)
    console.log('    Re-run this script to fill the gaps (already-downloaded files are skipped).')
  }
  console.log('\nMedia © Gym visual — https://gymvisual.com/ (cached locally, do not redistribute)\n')
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err.message)
  process.exit(1)
})
