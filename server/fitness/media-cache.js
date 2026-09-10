const fs   = require('fs')
const path = require('path')
const https = require('https')

const exerciseLib = require('./exercise-library')

/**
 * Lazy fallback for exercise media.
 *
 * `npm run setup:fitness` downloads all 1324 GIFs + thumbnails up front, but a
 * download can be interrupted, an individual file can fail, or the mirror can
 * be set up with `--no-media` on a small SD card. Rather than showing a blank
 * exercise panel mid-workout, these handlers fetch the one missing file from
 * the dataset, cache it to disk, and serve it. Every later request is a plain
 * static hit.
 *
 * Mounted AFTER express.static for the same prefix, so it only ever runs on a
 * miss. Media is © Gym visual (https://gymvisual.com/) and cached locally
 * only — see scripts/setup-fitness.js.
 */

const RAW_BASE   = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main'
const GIFS_DIR   = path.join(__dirname, '../../data/gifs')
const THUMBS_DIR = path.join(__dirname, '../../data/thumbs')

// One in-flight fetch per file, so a dashboard and a phone asking for the same
// exercise at once do not both download it.
const inflight = new Map()

// Remember ids the dataset does not have media for, so a broken exercise does
// not re-hit the network on every render.
const notFound = new Set()

function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('too many redirects'))
    const req = https.get(url, { timeout: 15000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return fetchBuffer(new URL(res.headers.location, url).toString(), redirects + 1)
          .then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        const err = new Error('HTTP ' + res.statusCode)
        err.statusCode = res.statusCode
        return reject(err)
      }
      const chunks = []
      let bytes = 0
      res.on('data', c => {
        bytes += c.length
        // A 180x180 GIF is ~90 KB; anything past 8 MB is not our file.
        if (bytes > 8 * 1024 * 1024) {
          req.destroy(new Error('response too large'))
          return
        }
        chunks.push(c)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

/**
 * @param {'gif'|'thumb'} kind
 */
function makeHandler(kind) {
  const dir      = kind === 'gif' ? GIFS_DIR : THUMBS_DIR
  const ext      = kind === 'gif' ? '.gif' : '.jpg'
  const mime     = kind === 'gif' ? 'image/gif' : 'image/jpeg'
  const remoteDir = kind === 'gif' ? 'videos' : 'images'

  return async function mediaFallback(req, res) {
    // Only ever a bare 4-digit dataset id — never anything from the URL that
    // could walk the filesystem or point the fetch at another host.
    const id = String(req.params.id || '')
    if (!/^[0-9]{4}$/.test(id)) return res.status(400).end()

    const dest = path.join(dir, id + ext)

    // express.static already missed, but another request may have just filled
    // it in.
    try {
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        res.setHeader('Cache-Control', 'public, max-age=604800')
        return res.type(mime).send(fs.readFileSync(dest))
      }
    } catch (e) { /* fall through to fetch */ }

    if (notFound.has(kind + id)) return res.status(404).end()

    const ex = exerciseLib.getById(id)
    if (!ex || !ex.mediaId) {
      notFound.add(kind + id)
      return res.status(404).end()
    }

    const key = kind + id
    let job = inflight.get(key)
    if (!job) {
      const url = `${RAW_BASE}/${remoteDir}/${id}-${ex.mediaId}${ext}`
      job = fetchBuffer(url)
        .then(buf => {
          try {
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(dest, buf)
          } catch (e) {
            // Read-only or full disk — still serve this response from memory.
            console.warn(`[media-cache] could not cache ${id}${ext}:`, e.message)
          }
          return buf
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, job)
    }

    try {
      const buf = await job
      console.log(`[media-cache] lazily fetched ${id}${ext} (${Math.round(buf.length / 1024)} KB)`)
      res.setHeader('Cache-Control', 'public, max-age=604800')
      res.type(mime).send(buf)
    } catch (err) {
      if (err.statusCode === 404) notFound.add(key)
      console.warn(`[media-cache] fetch failed for ${id}${ext}:`, err.message)
      // The UI falls back to a text placeholder on a failed image load.
      res.status(502).end()
    }
  }
}

module.exports = {
  gifHandler:   makeHandler('gif'),
  thumbHandler: makeHandler('thumb')
}
