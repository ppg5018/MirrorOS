const fetch = require('node-fetch')
const reminders = require('../reminders')

const BASE = `http://localhost:${process.env.PORT || 3000}`

// ── Widget control ───────────────────────────────────────────
// Canonical panel names the dashboard understands (see public/js/socket.js).
const WIDGET_NAMES = [
  'clock', 'weather', 'calendar', 'tasks', 'notifications',
  'music', 'quote', 'news', 'wallpaper', 'ai-bar', 'habits', 'alarm'
]
// "all" targets content panels only (keep the clock and the AI bar visible).
const ALL_WIDGETS = ['weather', 'calendar', 'tasks', 'notifications', 'music', 'quote', 'news', 'wallpaper']
// Spoken synonyms → canonical name.
const WIDGET_ALIASES = {
  messages: 'notifications', message: 'notifications', notification: 'notifications',
  whatsapp: 'notifications', email: 'notifications', gmail: 'notifications', notifs: 'notifications',
  schedule: 'calendar', agenda: 'calendar', events: 'calendar', event: 'calendar', meetings: 'calendar',
  todo: 'tasks', todos: 'tasks', task: 'tasks', 'to-do': 'tasks', 'to do': 'tasks',
  song: 'music', songs: 'music', spotify: 'music', 'now playing': 'music', track: 'music',
  headlines: 'news', 'news ticker': 'news',
  temperature: 'weather', forecast: 'weather',
  photos: 'wallpaper', photo: 'wallpaper', slideshow: 'wallpaper', 'ambient art': 'wallpaper',
  art: 'wallpaper', picture: 'wallpaper', pictures: 'wallpaper',
  time: 'clock',
  'ai': 'ai-bar', 'ai bar': 'ai-bar', assistant: 'ai-bar',
  alarms: 'alarm', 'alarm clock': 'alarm', habit: 'habits', streaks: 'habits'
}
function normalizeWidget(name) {
  const n = String(name || '').trim().toLowerCase()
  if (n === 'all' || n === 'everything') return 'all'
  if (WIDGET_NAMES.includes(n)) return n
  return WIDGET_ALIASES[n] || null
}

// Tracks the last volume we set so "louder"/"quieter" can step relative to it.
let lastVolume = 50

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} returned ${res.status}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`POST ${path} returned ${res.status}`)
  return res.json()
}

const functions = {

  get_weather: async (_input) => {
    return get('/api/weather')
  },

  get_calendar_events: async (_input) => {
    return get('/api/calendar')
  },

  get_whatsapp_messages: async (input) => {
    const {
      getMessages,
      getMessagesFromContact,
      getConnectionStatus
    } = require('../whatsapp/client')

    if (!getConnectionStatus()) {
      return {
        connected: false,
        error: 'WhatsApp not connected. Ask user to scan QR at /api/whatsapp/qr'
      }
    }

    if (input.contact) {
      const data = getMessagesFromContact(input.contact)
      if (!data) return { error: `No messages found from ${input.contact}` }
      return data
    }

    return getMessages()
  },

  get_tasks: async (_input) => {
    return get('/api/tasks')
  },

  add_task: async (input, _io) => {
    return post('/api/tasks', {
      task: input.task,
      priority: input.priority || 'normal'
    })
  },

  delete_task: async (input) => {
    const res = await fetch(`${BASE}/api/tasks`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.text })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `DELETE /api/tasks returned ${res.status}`)
    }
    return res.json()
  },

  complete_task: async (input) => {
    const res = await fetch(`${BASE}/api/tasks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.text })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `PATCH /api/tasks returned ${res.status}`)
    }
    return res.json()
  },

  manage_habits: async (input, _io) => {
    const action = input.action

    if (action === 'list' || action === 'status') {
      const data = await get('/api/habits')
      const list = data.habits || []
      if (!list.length) return { success: true, habits: [], message: "You don't have any habits yet. Just say \"add a habit\" to start one." }
      return {
        success: true,
        doneToday: data.doneToday,
        total: data.total,
        habits: list.map(h => ({ name: h.name, doneToday: h.doneToday, streak: h.streak }))
      }
    }

    if (action === 'add') {
      if (!input.name) return { success: false, message: 'What habit would you like to add?' }
      const body = { name: input.name }
      if (input.emoji)  body.emoji  = input.emoji
      if (input.target) body.target = input.target
      const res = await fetch(`${BASE}/api/habits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.status === 409) return { success: false, message: `You already have a "${input.name}" habit.` }
      if (!res.ok) throw new Error(`POST /api/habits returned ${res.status}`)
      const data = await res.json()
      return { success: true, message: `Added "${data.habit.name}" to your habits. I'll help you keep the streak going.` }
    }

    // check / uncheck / remove all target an existing habit by name
    if (!input.name) return { success: false, message: 'Which habit?' }

    if (action === 'check') {
      const res = await fetch(`${BASE}/api/habits/check`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name })
      })
      if (res.status === 404) return { success: false, message: `I couldn't find a habit called "${input.name}".` }
      if (!res.ok) throw new Error(`PATCH /api/habits/check returned ${res.status}`)
      const d = await res.json()
      const streakMsg = d.streak > 1 ? ` That's a ${d.streak}-day streak!` : ''
      return { success: true, message: `Nice — marked "${d.name}" done for today.${streakMsg}` }
    }

    if (action === 'uncheck') {
      const res = await fetch(`${BASE}/api/habits/uncheck`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name })
      })
      if (res.status === 404) return { success: false, message: `I couldn't find a habit called "${input.name}".` }
      if (!res.ok) throw new Error(`PATCH /api/habits/uncheck returned ${res.status}`)
      const d = await res.json()
      return { success: true, message: `Okay, unmarked "${d.name}" for today.` }
    }

    if (action === 'remove') {
      const res = await fetch(`${BASE}/api/habits`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name })
      })
      if (res.status === 404) return { success: false, message: `I couldn't find a habit called "${input.name}".` }
      if (!res.ok) throw new Error(`DELETE /api/habits returned ${res.status}`)
      const d = await res.json()
      return { success: true, message: `Removed the "${d.deleted}" habit.` }
    }

    return { success: false, message: 'Unknown habit action: ' + action }
  },

  set_backlight: async (input, _io) => {
    return post('/api/backlight', {
      mode: input.mode,
      brightness: input.brightness || 80
    })
  },

  play_music: async (input, io) => {
    const { action, query, volume, shuffle } = input

    // Simple playback controls
    if (['pause', 'resume', 'next', 'prev'].includes(action)) {
      await post('/api/spotify/control', { action })
      const msgs = { pause: 'Paused.', resume: 'Resuming.', next: 'Skipping to next track.', prev: 'Going back.' }
      return { success: true, message: msgs[action] }
    }

    if (action === 'volume') {
      const v = Math.min(100, Math.max(0, parseInt(volume) || 50))
      lastVolume = v
      await post('/api/spotify/control', { action: 'volume', value: v })
      return { success: true, message: 'Volume set to ' + v + '%.' }
    }

    if (action === 'volume_up' || action === 'volume_down') {
      const step = action === 'volume_up' ? 10 : -10
      lastVolume = Math.min(100, Math.max(0, lastVolume + step))
      await post('/api/spotify/control', { action: 'volume', value: lastVolume })
      return { success: true, message: (step > 0 ? 'Turning it up to ' : 'Turning it down to ') + lastVolume + '%.' }
    }

    if (action === 'shuffle') {
      await post('/api/spotify/control', { action: 'shuffle', value: !!shuffle })
      return { success: true, message: shuffle ? 'Shuffle on.' : 'Shuffle off.' }
    }

    if (action === 'play_recently_played') {
      const data   = await get('/api/spotify/recently-played')
      const tracks = data.tracks || []
      if (!tracks.length) return { success: false, message: 'No recently played tracks found.' }
      let pick = tracks[0]
      if (query) {
        const q = query.toLowerCase()
        pick = tracks.find(t =>
          t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
        ) || tracks[0]
      }
      if (io) io.emit('spotify-play', { uri: pick.uri })
      return { success: true, message: 'Playing ' + pick.title + ' by ' + pick.artist + '.' }
    }

    if (action === 'play_liked_songs') {
      const data   = await get('/api/spotify/liked-songs')
      const tracks = data.tracks || []
      if (!tracks.length) return { success: false, message: 'No liked songs found.' }
      const pick = tracks[Math.floor(Math.random() * Math.min(tracks.length, 10))]
      if (io) io.emit('spotify-play', { uri: pick.uri })
      return { success: true, message: 'Playing ' + pick.title + ' from your liked songs.' }
    }

    if (action === 'play_top_tracks') {
      const data   = await get('/api/spotify/top-tracks')
      const tracks = data.tracks || []
      if (!tracks.length) return { success: false, message: 'No top tracks found. Try searching for a song.' }
      const pick = tracks[0]
      if (io) io.emit('spotify-play', { uri: pick.uri })
      return { success: true, message: 'Playing ' + pick.title + ', one of your most played tracks.' }
    }

    if (action === 'play_playlist') {
      const data      = await get('/api/spotify/playlists')
      const playlists = data.playlists || []
      if (!playlists.length) return { success: false, message: 'No playlists found.' }
      const q     = (query || '').toLowerCase()
      const match = playlists.find(p => p.name.toLowerCase().includes(q)) || playlists[0]
      if (io) io.emit('spotify-play', { uri: match.uri })
      return { success: true, message: 'Playing your ' + match.name + ' playlist.' }
    }

    // Default: search_and_play
    if (!query) return { success: false, message: 'What would you like to play?' }
    const results = await get('/api/spotify/search?q=' + encodeURIComponent(query))
    if (!results.length) return { success: false, message: 'Could not find "' + query + '" on Spotify.' }
    const top = results[0]
    // Start playback server-side (targets the Mira Connect device, else whatever
    // device is active). Works headless — no browser/SDK needed.
    try {
      await post('/api/spotify/play', { uri: top.uri })
      if (io) io.emit('spotify-play', { uri: top.uri })  // refresh any open dashboard
      return { success: true, message: 'Playing ' + top.title + ' by ' + top.artist + ' on Spotify.' }
    } catch (e) {
      return {
        success: false,
        message: 'Found ' + top.title + ', but no Spotify speaker is active. Open Spotify on a device (or start Mira) and try again.'
      }
    }
  },

  set_reminder: async (input, _io) => {
    // Fires exactly once at the next occurrence of input.time and persists
    // across restarts — see server/reminders.js.
    const result = reminders.addReminder(input.message, input.time)
    if (result.error) return result
    return { success: true, message: `Reminder set for ${input.time}: "${input.message}"` }
  },

  alarm_control: async (input, _io) => {
    const action = input.action

    if (action === 'list') {
      const data = await get('/api/alarm')
      const list = data.alarms || []
      if (!list.length) return { success: true, alarms: [], message: "You don't have any alarms set." }
      return {
        success: true,
        count:   list.length,
        alarms:  list.map(a => ({ time: a.time, label: a.label, repeat: a.repeat, enabled: a.enabled })),
        next:    data.next ? { time: data.next.time, label: data.next.label } : null
      }
    }

    if (action === 'set') {
      if (!input.time) return { success: false, message: 'What time should I set the alarm for?' }
      const res = await fetch(`${BASE}/api/alarm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time:   input.time,
          label:  input.label || '',
          repeat: input.repeat || 'once'
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { success: false, message: err.error || 'Could not set that alarm.' }
      }
      const data = await res.json()
      const a = data.alarm
      const rep = a.repeat && a.repeat !== 'once' ? ` (${a.repeat})` : ''
      const lbl = a.label ? ` for "${a.label}"` : ''
      return { success: true, message: `Alarm set for ${a.time}${rep}${lbl}.` }
    }

    if (action === 'snooze') {
      const data = await post('/api/alarm/snooze', { minutes: input.minutes })
      return data
    }

    if (action === 'stop') {
      const data = await post('/api/alarm/stop', {})
      return data
    }

    if (action === 'delete') {
      const res = await fetch(`${BASE}/api/alarm`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input.query || 'all' })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { success: false, message: err.error || 'No matching alarm found.' }
      }
      const data = await res.json()
      const n = (data.deleted || []).length
      return { success: true, message: n > 1 ? `Deleted ${n} alarms.` : `Deleted the ${(data.deleted[0] || {}).time || ''} alarm.` }
    }

    if (action === 'enable' || action === 'disable') {
      const res = await fetch(`${BASE}/api/alarm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input.query || 'all', enabled: action === 'enable' })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { success: false, message: err.error || 'No matching alarm found.' }
      }
      const data = await res.json()
      const n = (data.updated || []).length
      const verb = action === 'enable' ? 'Turned on' : 'Turned off'
      return { success: true, message: n > 1 ? `${verb} ${n} alarms.` : `${verb} the ${(data.updated[0] || {}).time || ''} alarm.` }
    }

    return { success: false, message: 'Unknown alarm action: ' + action }
  },

  get_news: async (_input) => {
    // Mock headlines — real NewsAPI integration coming later
    return {
      headlines: [
        'Sensex rises 200 points in early trade',
        'India weather: Monsoon expected early this year',
        'IPL 2026: Mumbai Indians win by 6 wickets',
        'RBI holds repo rate steady at 6.5%'
      ]
    }
  },

  control_slideshow: async (input, io) => {
    if (io) io.emit('slideshow-control', { action: input.action })
    const msgs = {
      next:   'Next photo.',
      prev:   'Previous photo.',
      pause:  'Slideshow paused.',
      resume: 'Slideshow resumed.',
      show:   'Showing your photos.',
      hide:   'Photos hidden.'
    }
    return { success: true, message: msgs[input.action] || 'Done.' }
  },

  get_quote: async (input) => {
    const q = input.refresh
      ? await post('/api/quote/refresh', {})
      : await get('/api/quote')
    return { text: q.text, author: q.author, reply: `"${q.text}" — ${q.author}` }
  },

  fitness_control: async (input, _io) => {
    if (input.action === 'list_workouts') {
      return get('/api/fitness/workouts')
    }
    if (input.action === 'status') {
      return get('/api/fitness/state')
    }
    if (input.action === 'start') {
      return post('/api/fitness/start', {
        workoutId: input.workoutId,
        weightKg: input.weightKg
      })
    }
    // pause, resume, skip, stop
    return post('/api/fitness/action', { action: input.action })
  },

  screensaver_control: async (input, io) => {
    if (io) io.emit('screensaver:' + input.action)
    return { success: true, message: input.action === 'enter' ? 'Screensaver started.' : 'Screensaver stopped.' }
  },

  control_widget: async (input, io) => {
    const action = input.action
    const target = normalizeWidget(input.widget)
    if (!target) {
      return { success: false, message: `I don't have a panel called "${input.widget}".` }
    }

    const widgets = target === 'all' ? ALL_WIDGETS : [target]
    const label = target === 'all' ? 'everything' : target.replace('-', ' ')

    if (action === 'highlight') {
      if (io) widgets.forEach(w => io.emit('widget-highlight', { widget: w }))
      return { success: true, message: `Highlighting ${label}.` }
    }

    const visible = action === 'show'
    if (io) widgets.forEach(w => io.emit('widget-toggle', { widget: w, visible }))
    return { success: true, message: `${visible ? 'Showing' : 'Hiding'} ${label}.` }
  },

  control_display: async (input, io) => {
    const action = input.action

    if (action === 'clear_wallpaper') {
      if (io) io.emit('wallpaper-control', { action: 'clear' })
      return { success: true, message: 'Cleared the ambient art.' }
    }

    // Brightness — the dashboard keeps the actual level and applies a dim overlay.
    if (action === 'set_brightness') {
      const level = Math.min(100, Math.max(10, parseInt(input.value, 10) || 100))
      if (io) io.emit('display-brightness', { action: 'set', level })
      return { success: true, message: `Screen brightness set to ${level}%.` }
    }
    if (action === 'dim' || action === 'brighten') {
      if (io) io.emit('display-brightness', { action })
      return { success: true, message: action === 'dim' ? 'Dimming the screen.' : 'Brightening the screen.' }
    }

    return { success: false, message: 'Unknown display action.' }
  },

  karaoke_control: async (input, io) => {
    if (input.action === 'open') {
      if (io) io.emit('mode:karaoke', {})
      return { success: true, message: 'Opening karaoke mode.' }
    }
    if (input.action === 'close') {
      if (io) io.emit('mode:dashboard', {})
      return { success: true, message: 'Closing karaoke.' }
    }
    if (input.action === 'play') {
      if (!input.query) return { success: false, message: 'What song would you like to play?' }
      const results = await get('/api/spotify/search?q=' + encodeURIComponent(input.query))
      if (!results.length) return { success: false, message: `Could not find "${input.query}" on Spotify.` }
      const top = results[0]
      // Start playback via REST API (reliable — doesn't need SDK active device)
      await post('/api/spotify/play', { uri: top.uri }).catch(() => {
        // Fallback to Web Playback SDK if REST fails
        if (io) io.emit('spotify-play', { uri: top.uri })
      })
      // Navigate to karaoke page after Spotify has a moment to start
      const track = {
        name:        top.title,
        artist:      top.artist,
        album:       top.album || '',
        duration_ms: (top.duration || 0) * 1000
      }
      setTimeout(() => {
        if (io) io.emit('mode:karaoke', { track })
      }, 1500)
      return { success: true, message: `Playing ${top.title} by ${top.artist} in karaoke mode.` }
    }
    if (input.action === 'fetch_lyrics') {
      // Fetch currently playing track then return lyrics status
      try {
        const pos = await get('/api/spotify/position')
        if (!pos.track) return { success: false, message: 'Nothing is playing on Spotify right now.' }
        const params = new URLSearchParams({
          artist: pos.track.artist,
          track:  pos.track.name,
          album:  pos.track.album || ''
        })
        const lyrics = await get('/api/karaoke/lyrics?' + params)
        if (lyrics.error === 'not_found') {
          return { success: false, message: `No lyrics found for ${pos.track.name}.` }
        }
        if (io) io.emit('mode:karaoke', {})
        return {
          success: true,
          synced: lyrics.synced,
          lineCount: lyrics.lines ? lyrics.lines.length : 0,
          message: `Found ${lyrics.synced ? 'synced' : 'unsynced'} lyrics for ${pos.track.name} — opening karaoke mode.`
        }
      } catch (err) {
        return { success: false, message: 'Could not fetch lyrics: ' + err.message }
      }
    }
    return { error: 'Unknown karaoke action: ' + input.action }
  },

  morning_briefing: async (_input, _io) => {
    const [weather, calendar, whatsapp, tasksRes] = await Promise.all([
      get('/api/weather'),
      get('/api/calendar'),
      get('/api/whatsapp'),
      get('/api/tasks')
    ])

    const pendingTasks = (tasksRes.tasks || []).filter(t => !t.done)
    const urgentTasks  = pendingTasks.filter(t => t.priority === 'high')

    return {
      weather: {
        temp:      weather.temp,
        condition: weather.condition,
        city:      weather.city || 'Pune'
      },
      calendar: {
        eventCount: (calendar.events || []).length,
        firstEvent: (calendar.events || [])[0] || null,
        events:     calendar.events || []
      },
      whatsapp: {
        unread:   whatsapp.unread || 0,
        contacts: (whatsapp.contacts || []).map(c => c.name)
      },
      tasks: {
        pending: pendingTasks.length,
        urgent:  urgentTasks.map(t => t.text)
      }
    }
  }
}

async function execute(toolName, toolInput, io) {
  if (!functions[toolName]) {
    console.error(`[functions] unknown tool: ${toolName}`)
    return { error: `Unknown tool: ${toolName}` }
  }
  try {
    return await functions[toolName](toolInput, io)
  } catch (err) {
    console.error(`[functions] ${toolName} failed:`, err.message)
    return { error: err.message }
  }
}

module.exports = { execute }
