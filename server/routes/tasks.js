const express = require('express')
const router  = express.Router()
const { google } = require('googleapis')
const { getAuthClient } = require('../google-auth')

// In-memory fallback tasks (used when Google Tasks not connected)
let localTasks = [
  { id: '1', text: 'Morning workout', done: true,  priority: 'normal' },
  { id: '2', text: 'Send Q1 report',  done: false, priority: 'high'   },
  { id: '3', text: 'Call accountant', done: false, priority: 'medium' },
  { id: '4', text: 'Buy groceries',   done: false, priority: 'normal' }
]
let nextLocalId = 5

// Map Google Tasks priority notes → our priority levels
function parsePriority(notes) {
  if (!notes) return 'normal'
  const n = notes.toLowerCase()
  if (n.includes('high'))   return 'high'
  if (n.includes('medium')) return 'medium'
  if (n.includes('low'))    return 'low'
  return 'normal'
}

const CACHE_MS = 2 * 60 * 1000  // 2 minutes
let cache = null, cacheAt = 0

// GET /api/tasks
router.get('/', async (req, res) => {
  if (cache && Date.now() - cacheAt < CACHE_MS) return res.json(cache)

  const auth = getAuthClient()
  if (!auth) return res.json({ tasks: localTasks, mock: true })

  try {
    const tasksApi = google.tasks({ version: 'v1', auth })

    // Get first task list
    const listsRes = await tasksApi.tasklists.list({ maxResults: 1 })
    const lists    = listsRes.data.items || []
    if (!lists.length) return res.json({ tasks: [], source: 'google' })

    const listId   = lists[0].id
    const taskRes  = await tasksApi.tasks.list({
      tasklist: listId,
      showCompleted: false,
      maxResults: 20
    })

    const tasks = (taskRes.data.items || []).map(t => ({
      id:       t.id,
      text:     t.title,
      done:     t.status === 'completed',
      priority: parsePriority(t.notes),
      due:      t.due || null
    }))

    cache = { tasks, source: 'google' }
    cacheAt = Date.now()
    res.json(cache)

  } catch (err) {
    console.error('[tasks] API error:', err.message)
    res.json({ tasks: localTasks, mock: true, error: err.message })
  }
})

// POST /api/tasks — add a task (Google Tasks if connected, local otherwise)
router.post('/', async (req, res) => {
  const { task, priority = 'normal' } = req.body

  if (!task || typeof task !== 'string' || !task.trim()) {
    return res.status(400).json({ error: 'task text is required' })
  }

  const auth = getAuthClient()

  if (auth) {
    try {
      const tasksApi = google.tasks({ version: 'v1', auth })

      const listsRes = await tasksApi.tasklists.list({ maxResults: 1 })
      const lists    = listsRes.data.items || []
      if (!lists.length) throw new Error('No task list found')

      const listId = lists[0].id
      const created = await tasksApi.tasks.insert({
        tasklist: listId,
        requestBody: {
          title: task.trim(),
          notes: `priority:${priority}`
        }
      })

      // Bust cache so next GET returns fresh data
      cache = null

      const newTask = { id: created.data.id, text: task.trim(), done: false, priority }
      const io = req.app.get('io')
      if (io) {
        // Fetch updated list to push to UI
        const updated = await tasksApi.tasks.list({ tasklist: listId, showCompleted: false, maxResults: 20 })
        const tasks = (updated.data.items || []).map(t => ({
          id: t.id, text: t.title, done: t.status === 'completed', priority: parsePriority(t.notes)
        }))
        io.emit('tasks-updated', { tasks })
      }

      res.status(201).json({ task: newTask, source: 'google' })
      return
    } catch (err) {
      console.error('[tasks] add via Google failed:', err.message)
      // Fall through to local
    }
  }

  // Local fallback
  const newTask = {
    id:       String(nextLocalId++),
    text:     task.trim(),
    done:     false,
    priority: ['high', 'medium', 'low', 'normal'].includes(priority) ? priority : 'normal'
  }
  localTasks.push(newTask)

  const io = req.app.get('io')
  if (io) io.emit('tasks-updated', { tasks: localTasks })

  res.status(201).json({ task: newTask, tasks: localTasks, mock: true })
})

// DELETE /api/tasks — remove a task by text match
router.delete('/', async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'text is required' })

  const auth = getAuthClient()

  if (auth) {
    try {
      const tasksApi = google.tasks({ version: 'v1', auth })
      const listsRes = await tasksApi.tasklists.list({ maxResults: 1 })
      const lists    = listsRes.data.items || []
      if (!lists.length) throw new Error('No task list found')

      const listId  = lists[0].id
      const taskRes = await tasksApi.tasks.list({ tasklist: listId, showCompleted: false, maxResults: 20 })
      const match   = (taskRes.data.items || []).find(t =>
        t.title.toLowerCase().includes(text.toLowerCase())
      )

      if (!match) return res.status(404).json({ error: 'Task not found' })

      await tasksApi.tasks.delete({ tasklist: listId, task: match.id })
      cache = null

      const io = req.app.get('io')
      if (io) {
        const updated = await tasksApi.tasks.list({ tasklist: listId, showCompleted: false, maxResults: 20 })
        const tasks = (updated.data.items || []).map(t => ({
          id: t.id, text: t.title, done: t.status === 'completed', priority: parsePriority(t.notes)
        }))
        io.emit('tasks-updated', { tasks })
      }

      return res.json({ success: true, deleted: match.title, source: 'google' })
    } catch (err) {
      console.error('[tasks] delete via Google failed:', err.message)
    }
  }

  // Local fallback
  const idx = localTasks.findIndex(t => t.text.toLowerCase().includes(text.toLowerCase()))
  if (idx === -1) return res.status(404).json({ error: 'Task not found' })

  const deleted = localTasks.splice(idx, 1)[0]
  const io = req.app.get('io')
  if (io) io.emit('tasks-updated', { tasks: localTasks })

  res.json({ success: true, deleted: deleted.text, mock: true })
})

module.exports = router
