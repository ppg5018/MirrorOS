/* ============================================
   MirrorOS — socket.js
   Socket.io client — real-time event handling
   ============================================ */

const socket = io(window.location.origin)

socket.on('connect', () => {
  console.log('[socket] connected:', socket.id)
})

socket.on('disconnect', () => {
  console.log('[socket] disconnected')
})

// ── Memory dots ─────────────────────────────
function updateMemoryDots(depth) {
  const dots = document.querySelectorAll('#memory-dots .mdot')
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i < depth)
  })
}

// ── AI response ────────────────────────────
// Handles SERVER-PUSH events only (morning briefing, reminders).
// Direct user queries are handled by sendTextQuery in main.js via HTTP response.
// Skip if a direct query is in flight to prevent double-animation.
socket.on('ai-response', ({ text, highlightWidget: widget, historyDepth }) => {
  if (typeof historyDepth === 'number') updateMemoryDots(historyDepth)
  if (!text) return
  // Skip during direct queries — sendTextQuery handles those via HTTP
  if (typeof _queryInFlight !== 'undefined' && _queryInFlight) return

  const hint = document.querySelector('.ai-card-hint')
  if (!hint) return

  console.log('[socket] ai-response (server-push):', text.slice(0, 60) + '...', widget ? `[highlight: ${widget}]` : '')
  if (typeof setState === 'function') setState('responding')
  if (typeof typewriter === 'function') typewriter(hint, text)
  if (widget && typeof highlightWidget === 'function') highlightWidget(widget)
})

// ── Voice state (from wakeword.py via /api/voice/state) ────
// Wake word detected → UI goes listening → processing → idle
socket.on('voice-state', ({ state, text }) => {
  console.log(`[socket] voice-state: ${state}`)
  if (typeof setState === 'function') {
    if (state === 'listening')   setState('listening')
    if (state === 'processing')  setState('listening')  // keep glow while Claude thinks
    if (state === 'idle')        setState('idle')
  }
  // Show transcribed text in hint while processing
  if (state === 'processing' && text) {
    const hint = document.querySelector('.ai-card-hint')
    if (hint) hint.textContent = `"${text}"`
  }
})

// ── Tasks updated ──────────────────────────
socket.on('tasks-updated', ({ tasks }) => {
  console.log('[socket] tasks-updated:', tasks.length, 'tasks')
  if (typeof renderTasks === 'function') renderTasks(tasks)
})

// ── Backlight change ───────────────────────
socket.on('backlight-change', ({ mode, brightness }) => {
  console.log(`[socket] backlight-change: mode=${mode}, brightness=${brightness}`)
})

// ── Announcement (pushed from companion app) ────────────────
socket.on('announcement', ({ text }) => {
  console.log('[socket] announcement:', text)
  const hint = document.querySelector('.ai-card-hint')
  if (!hint) return
  if (typeof setState === 'function') setState('responding')
  if (typeof typewriter === 'function') typewriter(hint, text)
})

// ── Widget toggle (companion app on/off switches) ───────────
socket.on('widget-toggle', ({ widget, visible }) => {
  console.log(`[socket] widget-toggle: ${widget} → ${visible}`)
  const el = document.getElementById('widget-' + widget)
  if (el) el.style.display = visible ? '' : 'none'
})

// ── PIR motion sensor — screen fade in/out ─────────────────
socket.on('motion', ({ screenOn }) => {
  console.log(`[socket] motion: screenOn=${screenOn}`)
  document.body.style.transition = 'opacity 2s'
  document.body.style.opacity    = screenOn ? '1' : '0'
})

// ── Notification ───────────────────────────
socket.on('notification', (data) => {
  console.log('[socket] notification:', data)
})

// ── Morning briefing lifecycle ─────────────
socket.on('briefing:starting', (data) => {
  console.log('[socket] briefing starting:', data.source)
  document.dispatchEvent(new CustomEvent('briefing:starting', { detail: data }))
})

socket.on('briefing:complete', (data) => {
  console.log('[socket] briefing complete')
  document.dispatchEvent(new CustomEvent('briefing:complete', { detail: data }))
})
