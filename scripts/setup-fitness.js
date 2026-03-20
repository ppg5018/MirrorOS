#!/usr/bin/env node
/**
 * MirrorOS — Fitness Data Setup
 *
 * Fetches exercises from ExerciseDB (RapidAPI) and saves locally.
 * Run once: npm run setup:fitness
 * Uses ~24 of 100 free monthly API calls.
 */

const fs   = require('fs')
const path = require('path')
const readline = require('readline')

// ── Load .env ─────────────────────────────────────────────
const envPath = path.join(__dirname, '../.env')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    line = line.trim()
    if (line && !line.startsWith('#') && line.includes('=')) {
      const [k, ...v] = line.split('=')
      process.env[k.trim()] = v.join('=').trim()
    }
  })
}

const API_KEY  = process.env.EXERCISEDB_API_KEY
const API_HOST = process.env.EXERCISEDB_HOST || 'exercisedb.p.rapidapi.com'

const DATA_DIR      = path.join(__dirname, '../data')
const GIFS_DIR      = path.join(DATA_DIR, 'gifs')
const EXERCISES_PATH = path.join(DATA_DIR, 'exercises.json')

const ALLOWED_EQUIPMENT = new Set([
  'body weight', 'dumbbell', 'barbell', 'band', 'medicine ball', 'ez barbell'
])

// Separate bodyPart and equipment endpoint lists.
// Spaces in URL path segments must be %20, NOT + signs.
const BODY_PART_ENDPOINTS = [
  'chest', 'back', 'waist',
  'upper%20legs', 'lower%20legs',
  'shoulders', 'upper%20arms',
  'cardio', 'neck'
]

const EQUIPMENT_ENDPOINTS = [
  'body%20weight', 'dumbbell', 'barbell'
]

// ── Helpers ───────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()) })
  })
}

async function apiFetch(endpoint) {
  // Dynamic import for node-fetch (project uses v2 which is CJS-compatible)
  const fetch = require('node-fetch')
  const url = `https://${API_HOST}${endpoint}`
  console.log(`  → GET ${endpoint}`)
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key':  API_KEY,
      'x-rapidapi-host': API_HOST
    }
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText} for ${endpoint}`)
  return res.json()
}

// Download a URL as a binary Buffer using native https/http (no external deps)
function downloadBinary(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http')
    lib.get(url, (res) => {
      // Follow redirects (up to 3)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBinary(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end',  ()    => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function dirSize(dir) {
  let total = 0
  try {
    fs.readdirSync(dir).forEach(f => {
      const stat = fs.statSync(path.join(dir, f))
      if (stat.isFile()) total += stat.size
    })
  } catch (e) { /* dir may not exist */ }
  return total
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  console.log('\n🏋️  MirrorOS Fitness Setup\n')

  // 1. Check API key
  if (!API_KEY) {
    console.log('❌ EXERCISEDB_API_KEY not found in .env\n')
    console.log('   1. Go to: rapidapi.com/justin-WFnsXH_t6/api/exercisedb')
    console.log('   2. Subscribe to the free plan (100 requests/month)')
    console.log('   3. Copy your API key')
    console.log('   4. Add to .env:  EXERCISEDB_API_KEY=your_key_here')
    console.log('   5. Run again:    npm run setup:fitness\n')
    process.exit(1)
  }

  // Ensure directories exist
  fs.mkdirSync(GIFS_DIR, { recursive: true })

  // 2. Check if data already exists
  let exercises = null
  let skipFetch = false

  if (fs.existsSync(EXERCISES_PATH)) {
    try {
      exercises = JSON.parse(fs.readFileSync(EXERCISES_PATH, 'utf8'))
      const answer = await ask(`Exercise data already exists (${exercises.length} exercises). Re-download? (y/n) `)
      if (answer !== 'y' && answer !== 'yes') {
        console.log('Skipping download, using existing data.\n')
        skipFetch = true
      }
    } catch (e) {
      console.log('Existing exercises.json is corrupt, re-downloading.\n')
    }
  }

  // 3-6. Fetch exercises
  if (!skipFetch) {
    console.log('Fetching exercises from ExerciseDB...\n')

    const allRaw = []

    const fetchEndpoints = async (list, type) => {
      for (const seg of list) {
        const endpoint = `/exercises/${type}/${seg}?limit=100`
        try {
          const data = await apiFetch(endpoint)
          if (Array.isArray(data)) {
            allRaw.push(...data)
            console.log(`    ✓ ${seg.replace('%20', ' ')}: ${data.length} exercises`)
          } else {
            console.log(`    ⚠ Unexpected response for ${seg}:`, JSON.stringify(data).slice(0, 80))
          }
        } catch (err) {
          console.error(`    ❌ ${seg}: ${err.message}`)
        }
        await sleep(600)
      }
    }

    console.log('── bodyPart endpoints ──')
    await fetchEndpoints(BODY_PART_ENDPOINTS, 'bodyPart')
    console.log('\n── equipment endpoints ──')
    await fetchEndpoints(EQUIPMENT_ENDPOINTS, 'equipment')

    // 4. Deduplicate by id
    const seen = new Set()
    const deduped = []
    for (const ex of allRaw) {
      if (!ex.id || seen.has(ex.id)) continue
      seen.add(ex.id)
      deduped.push(ex)
    }
    console.log(`\nTotal unique exercises: ${deduped.length}`)

    // Filter to home-friendly equipment
    const filtered = deduped.filter(ex => ALLOWED_EQUIPMENT.has(ex.equipment))
    console.log(`After equipment filter: ${filtered.length}`)

    // 5. Normalise
    exercises = filtered.map(ex => ({
      id:               ex.id,
      name:             ex.name,
      bodyPart:         ex.bodyPart,
      target:           ex.target,
      equipment:        ex.equipment,
      secondaryMuscles: ex.secondaryMuscles || [],
      instructions:     ex.instructions || [],
      gifUrl:           ex.gifUrl || '',
      localGif:         '/data/gifs/' + ex.id + '.gif'
    }))

    // 6. Save
    fs.writeFileSync(EXERCISES_PATH, JSON.stringify(exercises, null, 2))
    console.log(`\nSaved ${exercises.length} exercises to data/exercises.json`)
  }

  // 7. Download GIFs
  if (exercises && exercises.length > 0) {
    // Ensure gifs dir exists
    fs.mkdirSync(GIFS_DIR, { recursive: true })

    const withGif    = exercises.filter(ex => ex.gifUrl && ex.gifUrl.startsWith('http'))
    const missingUrl = exercises.length - withGif.length
    console.log(`\nDownloading GIFs (${withGif.length} have URL, ${missingUrl} have no URL)...\n`)

    if (missingUrl > 0) {
      console.log(`  ⚠ ${missingUrl} exercises have no gifUrl — these will be skipped`)
    }

    let downloaded = 0
    let skipped    = 0
    let failed     = 0
    let noUrl      = missingUrl
    let firstError = null

    // Download one at a time to avoid overwhelming the CDN
    for (let i = 0; i < withGif.length; i++) {
      const ex      = withGif[i]
      const gifPath = path.join(GIFS_DIR, ex.id + '.gif')

      if (fs.existsSync(gifPath) && fs.statSync(gifPath).size > 0) {
        skipped++
        process.stdout.write(`\r  ${i + 1}/${withGif.length} — skipped ${skipped}, downloaded ${downloaded}, failed ${failed}`)
        continue
      }

      try {
        const buffer = await downloadBinary(ex.gifUrl)
        fs.writeFileSync(gifPath, buffer)
        downloaded++
      } catch (err) {
        if (!firstError) firstError = `${ex.id} (${ex.gifUrl}): ${err.message}`
        failed++
      }

      process.stdout.write(`\r  ${i + 1}/${withGif.length} — skipped ${skipped}, downloaded ${downloaded}, failed ${failed}`)
      await sleep(50) // small delay to avoid CDN rate limit
    }

    console.log(`\n\n  Downloaded:            ${downloaded}`)
    console.log(`  Skipped (already had): ${skipped}`)
    console.log(`  No gifUrl:             ${noUrl}`)
    console.log(`  Failed:                ${failed}`)
    if (firstError) console.log(`  First error: ${firstError}`)
  }

  // 8. Summary
  const exerciseCount = exercises ? exercises.length : 0
  const gifCount = fs.existsSync(GIFS_DIR)
    ? fs.readdirSync(GIFS_DIR).filter(f => f.endsWith('.gif')).length
    : 0
  const storageMB = ((dirSize(GIFS_DIR) + (fs.existsSync(EXERCISES_PATH) ? fs.statSync(EXERCISES_PATH).size : 0)) / 1024 / 1024).toFixed(1)

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Fitness data ready!')
  console.log(`   Exercises saved:  ${exerciseCount}`)
  console.log(`   GIFs downloaded:  ${gifCount}`)
  console.log(`   Storage used:     ~${storageMB} MB`)
  console.log('   Run: node server/index.js to start MirrorOS')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err.message)
  process.exit(1)
})
