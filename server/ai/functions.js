const fetch = require('node-fetch')
const cron = require('node-cron')

const BASE = `http://localhost:${process.env.PORT || 3000}`

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
      await post('/api/spotify/control', { action: 'volume', value: v })
      return { success: true, message: 'Volume set to ' + v + '%.' }
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
    if (io) io.emit('spotify-play', { uri: top.uri })
    return { success: true, message: 'Playing ' + top.title + ' by ' + top.artist + ' on Spotify.' }
  },

  set_reminder: async (input, io) => {
    const [hours, minutes] = input.time.split(':')
    if (!hours || !minutes) {
      return { error: 'Invalid time format. Use HH:MM' }
    }

    const cronExpr = `${parseInt(minutes)} ${parseInt(hours)} * * *`
    cron.schedule(cronExpr, () => {
      console.log(`[reminder] firing: ${input.message}`)
      if (io) io.emit('ai-response', { text: `Reminder: ${input.message}`, isReminder: true })
    }, { scheduled: true, timezone: 'Asia/Kolkata' })

    return { success: true, message: `Reminder set for ${input.time}: "${input.message}"` }
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

  play_youtube: async (input, io) => {
    if (input.action === 'close') {
      if (io) io.emit('youtube-close')
      return { success: true, message: 'Closing the video.' }
    }

    if (input.action === 'play_from_history') {
      const histData = await get('/api/youtube/history')
      const history  = histData.results || []

      if (history.length === 0) {
        return { success: false, message: 'No watch history found. History may be paused in Google settings.' }
      }

      // Match keyword in title if provided, else pick most recent
      let match = history[0]
      if (input.query) {
        const q = input.query.toLowerCase()
        match = history.find(v => v.title.toLowerCase().includes(q)) || history[0]
      }

      if (io) io.emit('youtube-play', { videoId: match.videoId, title: match.title, channel: match.channel })
      return { success: true, message: `Playing "${match.title}" from your watch history.` }
    }

    if (input.action === 'play_from_subscriptions') {
      const subData = await get('/api/youtube/subscriptions')
      const subs    = subData.subscriptions || []

      if (subs.length === 0) {
        return { success: false, message: 'No subscriptions found on your YouTube account.' }
      }

      const q = (input.query || '').toLowerCase()
      const channel = subs.find(s => s.channelName.toLowerCase().includes(q))
      if (!channel) {
        return { success: false, message: `Could not find a subscription matching "${input.query}".` }
      }

      // Search for latest video from that channel
      const searchData = await get('/api/youtube/search?q=' + encodeURIComponent(channel.channelName + ' latest'))
      const results    = searchData.results || []

      if (results.length === 0) {
        return { success: false, message: `No videos found for ${channel.channelName}.` }
      }

      const top = results[0]
      if (io) io.emit('youtube-play', { videoId: top.videoId, title: top.title, channel: top.channel })
      return { success: true, message: `Playing the latest from ${channel.channelName} on YouTube.` }
    }

    // Default: search_and_play
    if (!input.query) return { error: 'query is required for search_and_play' }

    const data    = await get('/api/youtube/search?q=' + encodeURIComponent(input.query))
    const results = data.results || []

    if (results.length === 0) {
      return { success: false, message: `No YouTube videos found for: ${input.query}` }
    }

    // If not authenticated, results come back as mock — don't try to play, just inform
    if (data.source === 'mock') {
      return { success: false, message: 'YouTube is not connected yet. Run node scripts/google-auth.js to sign in with Google.' }
    }

    const top = results[0]
    if (io) io.emit('youtube-play', { videoId: top.videoId, title: top.title, channel: top.channel })
    return { success: true, message: `Playing "${top.title}" by ${top.channel} on YouTube.` }
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
