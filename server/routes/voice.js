const express = require('express')
const router = express.Router()
const { processQuery, clearHistory, getHistory } = require('../ai/claude')

// POST /api/voice — process transcribed text through Claude
router.post('/', async (req, res) => {
  const { text } = req.body
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }

  try {
    const result = await processQuery(text.trim(), req.app.get('io'))
    res.json({ success: true, reply: result.reply, tool: result.toolUsed || null, historyDepth: result.historyDepth || 0 })
  } catch (err) {
    console.error('[voice] error:', err.message)
    res.status(500).json({ error: 'AI processing failed', details: err.message })
  }
})

// POST /api/voice/state — called by wakeword.py to sync UI state
// body: { event: 'listening'|'transcribing'|'thinking'|'speaking'|'idle', text?: string }
router.post('/state', (req, res) => {
  const { event, text } = req.body
  const io = req.app.get('io')

  console.log(`[voice/state] ${event}${text ? ` — "${text}"` : ''}`)

  switch (event) {
    case 'listening':
    case 'transcribing':
      io.emit('voice-state', { state: 'listening' })
      break
    case 'thinking':
      io.emit('voice-state', { state: 'listening', text: text ? `"${text}"` : null })
      break
    case 'speaking':
      io.emit('voice-state', { state: 'responding' })
      break
    case 'idle':
      io.emit('voice-state', { state: 'idle' })
      break
    default:
      return res.status(400).json({ error: 'unknown event' })
  }

  res.json({ success: true })
})

// GET /api/voice/history — returns conversation history
router.get('/history', (req, res) => {
  res.json({ history: getHistory() })
})

// POST /api/voice/history/clear — clears conversation history
router.post('/history/clear', (req, res) => {
  clearHistory()
  res.json({ success: true })
})

module.exports = router
