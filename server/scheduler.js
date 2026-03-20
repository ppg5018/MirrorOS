const cron = require('node-cron')
const path = require('path')
const { spawn } = require('child_process')
const fetch = require('node-fetch')
const logger = require('./logger')

const BASE = `http://localhost:${process.env.PORT || 3000}`
const SPEAK_SCRIPT = path.join(__dirname, 'voice/speak.py')

// Override via .env: e.g. BRIEFING_CRON="30 6 * * *" for 6:30am
const BRIEFING_CRON = process.env.BRIEFING_CRON || '0 7 * * *'

let scheduledJob = null

// ── Data aggregation ───────────────────────────────────────
async function getData() {
  const [weather, calendar, tasks, whatsapp] = await Promise.all([
    fetch(`${BASE}/api/weather`).then(r => r.json()).catch(() => ({})),
    fetch(`${BASE}/api/calendar`).then(r => r.json()).catch(() => ({ events: [] })),
    fetch(`${BASE}/api/tasks`).then(r => r.json()).catch(() => ({ tasks: [] })),
    fetch(`${BASE}/api/whatsapp`).then(r => r.json()).catch(() => ({ unread: 0 }))
  ])
  return { weather, calendar, tasks, whatsapp }
}

// ── Fallback template (used when Claude API has no credits) ──
function buildFallbackText(data) {
  const { weather, calendar, tasks, whatsapp } = data
  const pending = (tasks.tasks || []).filter(t => !t.done).length
  const events  = (calendar.events || []).length
  const unread  = whatsapp.unread || 0
  const high    = (tasks.tasks || []).find(t => !t.done && t.priority === 'high')

  let text = `Good morning! It's ${weather.temp || '--'}°C and ${weather.condition || 'clear'} in ${weather.city || 'Pune'}. `

  if (events > 0) {
    const first = calendar.events[0]
    text += `First up: ${first.title} at ${first.time}. `
  } else {
    text += `No events scheduled today. `
  }

  if (high) text += `High priority: ${high.text}. `
  else if (pending > 0) text += `${pending} task${pending !== 1 ? 's' : ''} on your list. `

  if (unread > 0) text += `You have ${unread} unread WhatsApp message${unread !== 1 ? 's' : ''}.`

  return text.trim()
}

// ── Claude-powered briefing with template fallback ─────────
async function buildBriefingText(data) {
  if (process.env.CLAUDE_API_KEY) {
    try {
      const { processQuery } = require('./ai/claude')
      const prompt =
        `Morning briefing data: ${JSON.stringify(data)}. ` +
        `Generate a warm, energetic spoken morning briefing in under 4 sentences. ` +
        `Mention the weather, the first calendar event, and any high-priority tasks.`
      const result = await processQuery(prompt, null)
      if (result.reply) return result.reply
    } catch (err) {
      logger.warn(`[scheduler] Claude unavailable (${err.message}) — using template`)
    }
  }
  return buildFallbackText(data)
}

// ── speak.py wrapper ───────────────────────────────────────
function speakText(text) {
  return new Promise((resolve) => {
    const proc = spawn('python3', [SPEAK_SCRIPT, text], { stdio: 'inherit' })
    proc.on('close', resolve)
    proc.on('error', (err) => {
      logger.warn(`[scheduler] speak.py unavailable: ${err.message}`)
      resolve()
    })
  })
}

// ── Main trigger function (exported for manual + tool use) ──
async function triggerBriefing(io) {
  logger.info('[scheduler] Morning briefing triggered')

  try {
    const data = await getData()
    const text = await buildBriefingText(data)

    logger.info(`[scheduler] Briefing text: "${text}"`)

    // Push to mirror UI via socket
    if (io) {
      io.emit('ai-response', { text })
      io.emit('notification', { type: 'briefing', message: 'Morning briefing' })
    }

    // Speak aloud via pyttsx3
    await speakText(text)

    return { success: true, text }
  } catch (err) {
    logger.error(`[scheduler] Briefing failed: ${err.message}`)
    return { success: false, error: err.message }
  }
}

// ── Next 7am in IST ────────────────────────────────────────
function getNextBriefingTime() {
  // Calculate next 7:00am IST (UTC+5:30)
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)

  const next = new Date(istNow)
  next.setUTCHours(1, 30, 0, 0) // 7:00am IST = 01:30 UTC
  if (next <= istNow) next.setUTCDate(next.getUTCDate() + 1)

  return new Date(next.getTime() - istOffset).toISOString()
}

// ── Start scheduler ────────────────────────────────────────
function start(io) {
  if (scheduledJob) return

  scheduledJob = cron.schedule(BRIEFING_CRON, () => {
    triggerBriefing(io)
  }, { scheduled: true, timezone: 'Asia/Kolkata' })

  logger.info(`[scheduler] Morning briefing scheduled: "${BRIEFING_CRON}" (Asia/Kolkata)`)
  logger.info(`[scheduler] Next briefing: ${getNextBriefingTime()}`)
}

function stop() {
  if (scheduledJob) {
    scheduledJob.stop()
    scheduledJob = null
    logger.info('[scheduler] Stopped')
  }
}

module.exports = { start, stop, triggerBriefing, getNextBriefingTime }
