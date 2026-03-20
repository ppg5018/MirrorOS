const express   = require('express')
const router    = express.Router()
const Anthropic = require('@anthropic-ai/sdk')
const cron      = require('node-cron')

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

let quoteCache = { text: null, author: null, generatedAt: null, tod: null }

function getTimeOfDay(hour) {
  if (hour >= 5  && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

const PROMPTS = {
  morning:   'Generate one short inspirational quote perfect for a productive morning. Make it motivating and energising.',
  afternoon: 'Generate one short thoughtful quote for midday. Make it grounding and focused.',
  evening:   'Generate one short reflective quote perfect for the evening. Make it calm and introspective.',
  night:     'Generate one short peaceful quote for late night. Make it gentle and soothing.'
}

const FALLBACKS = {
  morning:   { text: 'The secret of getting ahead is getting started.',                          author: 'Mark Twain'  },
  afternoon: { text: 'Focus on being productive instead of busy.',                               author: 'Tim Ferriss' },
  evening:   { text: 'Almost everything will work again if you unplug it for a few minutes.',   author: 'Anne Lamott' },
  night:     { text: 'Rest is not idleness.',                                                    author: 'John Lubbock' }
}

async function generateQuote(tod) {
  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 120,
    system:     'You generate beautiful, short quotes for a smart mirror display. Always respond with ONLY a JSON object in this exact format, nothing else, no markdown: {"text": "the quote here", "author": "Author Name"}. If it is an original quote, use "author": "MirrorOS". Keep quotes under 120 characters. Never use clichés. Make them feel fresh and thoughtful.',
    messages:   [{ role: 'user', content: PROMPTS[tod] }]
  })
  const raw    = response.content[0].text.trim()
  const clean  = raw.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean)
  return { text: parsed.text, author: parsed.author }
}

// GET /api/quote
router.get('/', async (req, res) => {
  const hour = new Date().getHours()
  const tod  = getTimeOfDay(hour)

  if (quoteCache.text &&
      quoteCache.tod === tod &&
      Date.now() - quoteCache.generatedAt < 3600000) {
    return res.json({ ...quoteCache, cached: true })
  }

  try {
    const quote = await generateQuote(tod)
    quoteCache  = { text: quote.text, author: quote.author, tod, generatedAt: Date.now() }
    res.json({ ...quoteCache, cached: false })
  } catch (err) {
    console.error('[quote] Generation failed:', err.message)
    res.json({ ...FALLBACKS[tod], tod, cached: false, fallback: true })
  }
})

// POST /api/quote/refresh — force new quote, emits socket event
router.post('/refresh', async (req, res) => {
  const hour = new Date().getHours()
  const tod  = getTimeOfDay(hour)
  quoteCache = { text: null, author: null, generatedAt: null, tod: null }

  try {
    const quote = await generateQuote(tod)
    quoteCache  = { text: quote.text, author: quote.author, tod, generatedAt: Date.now() }
    const data  = { ...quoteCache, cached: false }
    const io    = req.app.get('io')
    if (io) io.emit('quote-update', data)
    res.json(data)
  } catch (err) {
    console.error('[quote] Refresh failed:', err.message)
    const fallback = { ...FALLBACKS[tod], tod, cached: false, fallback: true }
    const io = req.app.get('io')
    if (io) io.emit('quote-update', fallback)
    res.json(fallback)
  }
})

// Called from server/index.js after listen() to set up TOD transition crons
function setupQuoteCron(io) {
  async function refreshAndEmit(tod) {
    quoteCache = { text: null, author: null, generatedAt: null, tod: null }
    try {
      const quote = await generateQuote(tod)
      quoteCache  = { text: quote.text, author: quote.author, tod, generatedAt: Date.now() }
      if (io) io.emit('quote-update', { ...quoteCache, cached: false })
      console.log(`[quote] TOD refreshed: ${tod}`)
    } catch (err) {
      console.error('[quote] TOD refresh failed:', err.message)
      if (io) io.emit('quote-update', { ...FALLBACKS[tod], tod, cached: false, fallback: true })
    }
  }

  cron.schedule('0 5  * * *', () => refreshAndEmit('morning'),   { timezone: 'Asia/Kolkata' })
  cron.schedule('0 12 * * *', () => refreshAndEmit('afternoon'), { timezone: 'Asia/Kolkata' })
  cron.schedule('0 17 * * *', () => refreshAndEmit('evening'),   { timezone: 'Asia/Kolkata' })
  cron.schedule('0 21 * * *', () => refreshAndEmit('night'),     { timezone: 'Asia/Kolkata' })
  console.log('[quote] TOD cron schedules active')
}

module.exports = { router, setupQuoteCron }
