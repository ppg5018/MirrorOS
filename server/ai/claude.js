const Anthropic = require('@anthropic-ai/sdk')
const functions = require('./functions')

const SYSTEM_PROMPT = `You are MirrorOS, an AI assistant built into a smart mirror in Pune, India.

STRICT RULES for every response:
- Maximum 2-3 sentences. Never longer.
- Responses will be spoken aloud through speakers AND displayed on a mirror screen. Keep it natural and brief.
- No markdown, no bullet points, no lists ever.
- No asterisks, no bold, no formatting of any kind.
- Speak like a helpful friend, not a robot.
- If user speaks Hindi or Hinglish, respond the same way.
- For morning briefing: cover weather, first meeting, urgent tasks, unread messages — in one flowing paragraph.
- Always end morning briefing with something warm like "Have a great day!" or "Aaj ka din accha ho!"
- You remember the last few things said in this conversation. Use that context naturally — no need to mention it explicitly.
- If user says "change X to Y" or "replace X with Y" for a task: call complete_task for X, then add_task for Y. Do both in sequence.
- To finish/remove/delete/complete any task always use complete_task — it crosses it off with a checkmark.

YOUTUBE RULES:
- The user is signed in with their Google account which includes YouTube access.
- You have access to their YouTube watch history and subscriptions via that account.
- When they say "play that video I was watching" or "continue where I left off" → use action: play_from_history.
- When they say "play something from [channel name]" → use action: play_from_subscriptions with query = channel name.
- When they say "play [song/video name] on YouTube" → use action: search_and_play.
- Never mention API keys, tokens, or OAuth to the user.

SPOTIFY RULES:
- The user is logged in to Spotify with their own account.
- You have access to their personal library: recently played, liked songs, top tracks, and playlists.
- Intent mapping:
  "play something" / "play music" / "play a song"      → play_music with action: play_top_tracks
  "play my liked songs" / "play favourites"             → play_music with action: play_liked_songs
  "what was I listening to" / "play that again"         → play_music with action: play_recently_played
  "play my [name] playlist"                             → play_music with action: play_playlist, query=name
  "play [song/artist/album]" (no YouTube mentioned)     → play_music with action: search_and_play
  "pause" / "stop music"                                → play_music with action: pause
  "resume" / "continue playing"                         → play_music with action: resume
  "next song" / "skip"                                  → play_music with action: next
  "previous" / "go back"                                → play_music with action: prev
  "set volume to N" / "volume N"                        → play_music with action: volume, volume=N
- Never say "I cannot play music" — always try an action.
- Never mention tokens, OAuth, or API to the user.

SLIDESHOW RULES:
- "next photo" / "skip photo"   → control_slideshow action:next
- "previous photo"               → control_slideshow action:prev
- "pause slideshow"              → control_slideshow action:pause
- "resume slideshow"             → control_slideshow action:resume
- "show my photos" / "show photos" → control_slideshow action:show
- "hide photos" / "hide slideshow" → control_slideshow action:hide

QUOTE RULES:
- When user says "give me a quote", "new quote", "inspire me", "motivate me", or "read me the quote" → use get_quote tool.
- refresh: true generates a brand new quote.
- refresh: false reads the current one aloud.

FITNESS RULES:
- "start a workout" / "let's work out" / "begin exercise"     → fitness_control action: list_workouts (show options first)
- "start [workout name]" / "start HIIT" / "do the quickie"    → fitness_control action: start, workoutId=matching-id
- "pause workout" / "hold on"                                  → fitness_control action: pause
- "resume workout" / "continue" / "keep going"                 → fitness_control action: resume
- "skip exercise" / "next exercise"                            → fitness_control action: skip
- "stop workout" / "end workout" / "I'm done"                  → fitness_control action: stop
- "workout status" / "how am I doing" / "how many calories"    → fitness_control action: status
- "show me workouts" / "what workouts do you have"             → fitness_control action: list_workouts
- Workout IDs: hiit-circuit, upper-body, lower-body, core-crusher, full-body-burn, morning-yoga, stretching, 5-minute-quickie
- Default weight is 70kg. Only ask for weight if user mentions it.

KARAOKE RULES:
- "karaoke mode" / "show lyrics" / "sing along"          → karaoke_control action: open
- "lyrics for this song" / "open karaoke"                → karaoke_control action: fetch_lyrics
- "play [song] in karaoke" / "play [song] with lyrics"   → karaoke_control action: play, query=song name
- "close karaoke" / "exit lyrics" / "go back"            → karaoke_control action: close
- Never say you can't show lyrics — always try.`

// ── Conversation memory ──────────────────────────────────────
const MAX_EXCHANGES = 5
const CONTEXT_TTL   = 10 * 60 * 1000

let conversationHistory = []
// Always plain { role: "user"|"assistant", content: string }.
// Never contains tool_use objects — those only live inside a single processQuery call.

let lastToolContext = null
// Stores the most recent tool action so follow-up queries can reference it precisely.
// { toolName, toolInput, toolResult }

let lastActivityAt = Date.now()

const RESET_PHRASES = ['clear history', 'forget that', 'start over', 'nevermind', 'never mind', 'reset', 'new conversation']

const CLOSE_VIDEO_PHRASES = ['close video', 'close youtube', 'go back', 'stop video', 'exit video', 'back to mirror', 'dismiss', 'close player']

function pruneHistory() {
  if (Date.now() - lastActivityAt > CONTEXT_TTL) {
    conversationHistory = []
    lastToolContext = null
    console.log('[claude] context cleared (TTL expired)')
  }
  const max = MAX_EXCHANGES * 2
  if (conversationHistory.length > max) {
    conversationHistory = conversationHistory.slice(-max)
  }
}

function addExchange(userText, assistantReply) {
  // Always saves both turns together as plain strings — never tool_use blocks.
  lastActivityAt = Date.now()
  conversationHistory.push({ role: 'user',      content: userText })
  conversationHistory.push({ role: 'assistant', content: assistantReply })
  pruneHistory()
}

function clearHistory() {
  conversationHistory = []
  lastToolContext = null
  lastActivityAt = Date.now()
  console.log('[claude] conversation history cleared')
}

function getHistory() {
  return conversationHistory.slice()
}

// Builds the messages array for the first Claude call.
// If there was a recent tool action, inject it explicitly into the user message
// so Claude knows exactly what "that" / "it" refers to — no guessing needed.
function buildMessages(userText) {
  let enrichedText = userText
  if (lastToolContext) {
    const ctx = lastToolContext
    enrichedText =
      userText +
      ' [Context: just executed ' + ctx.toolName +
      ' with ' + JSON.stringify(ctx.toolInput) +
      ', result: ' + ctx.toolResult + ']'
  }
  return [
    ...conversationHistory,
    { role: 'user', content: enrichedText }
  ]
}

// ── Tool → widget mapping ────────────────────────────────────
const TOOL_TO_WIDGET = {
  get_tasks:             'tasks',
  get_weather:           'weather',
  get_calendar_events:   'calendar',
  get_whatsapp_messages: 'notifications',
  add_task:              'tasks',
  complete_task:         'tasks',
  play_youtube:          'youtube',
  play_music:            'music',
  set_backlight:         'backlight',
  morning_briefing:      'all',
  get_news:              'ai-bar',
  set_reminder:          'ai-bar',
  get_quote:             'quote',
  control_slideshow:     null,
  fitness_control:       'fitness',
  karaoke_control:       null
}

const tools = [
  {
    name: 'get_weather',
    description: "Get current weather and forecast for the user's city",
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Forecast days (1-7)' }
      }
    }
  },
  {
    name: 'get_calendar_events',
    description: "Get today's calendar events and upcoming schedule",
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_whatsapp_messages',
    description: 'Read and summarise recent WhatsApp messages',
    input_schema: {
      type: 'object',
      properties: {
        contact: { type: 'string', description: 'Specific contact name, optional' }
      }
    }
  },
  {
    name: 'get_tasks',
    description: "Get the user's current task list with priorities and completion status",
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done. Use for ANY intent to finish or remove a task — "mark X done", "X done", "finish X", "remove X", "delete X", "I did X", "X ho gaya", "X complete karo". The task shows crossed out with a checkmark.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text of the task (partial match is fine)' }
      },
      required: ['text']
    }
  },
  {
    name: 'add_task',
    description: "Add a task to the user's task list",
    input_schema: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'] }
      },
      required: ['task']
    }
  },
  {
    name: 'set_backlight',
    description: 'Change the mirror backlight colour or mode',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['warm', 'cool', 'red', 'green', 'blue', 'music_sync', 'off', 'night', 'party']
        },
        brightness: { type: 'number', description: '0-100' }
      }
    }
  },
  {
    name: 'play_music',
    description: 'Control Spotify — search and play songs/artists/playlists, play from liked songs, recently played, or top tracks, or control playback',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'search_and_play',
            'play_liked_songs',
            'play_recently_played',
            'play_top_tracks',
            'play_playlist',
            'pause',
            'resume',
            'next',
            'prev',
            'volume',
            'shuffle'
          ]
        },
        query: {
          type: 'string',
          description: 'Song name, artist, album, or playlist name. Required for search_and_play and play_playlist.'
        },
        volume: {
          type: 'number',
          description: 'Volume level 0-100. Only for action=volume.'
        },
        shuffle: {
          type: 'boolean',
          description: 'true/false. Only for action=shuffle.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'set_reminder',
    description: 'Set a timed reminder that will speak aloud at the given time',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        time: { type: 'string', description: 'Time in HH:MM 24-hour format' }
      },
      required: ['message', 'time']
    }
  },
  {
    name: 'get_news',
    description: "Get today's top news headlines",
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'morning_briefing',
    description: 'Generate and deliver a full morning briefing with weather, calendar, tasks and messages',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'control_slideshow',
    description: 'Control the photo slideshow displayed on the mirror',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['next', 'prev', 'pause', 'resume', 'show', 'hide']
        }
      },
      required: ['action']
    }
  },
  {
    name: 'get_quote',
    description: 'Get or refresh the daily inspirational quote on the mirror',
    input_schema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'true to generate a brand new quote, false to read the current one'
        }
      },
      required: ['refresh']
    }
  },
  {
    name: 'play_youtube',
    description: "Search and play YouTube videos on the mirror, or play from the user's watch history or subscriptions",
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search_and_play', 'play_from_history', 'play_from_subscriptions', 'close'],
          description: 'search_and_play: search by query | play_from_history: play from watch history | play_from_subscriptions: play from a subscribed channel | close: dismiss player'
        },
        query: {
          type: 'string',
          description: "Search term, history keyword, or channel name depending on action. e.g. 'lo-fi hip hop', 'Kesariya', 'Tanmay Bhat'"
        }
      },
      required: ['action']
    }
  },
  {
    name: 'fitness_control',
    description: 'Control fitness workouts — start, pause, resume, skip, stop, or check status',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'pause', 'resume', 'skip', 'stop', 'status', 'list_workouts']
        },
        workoutId: { type: 'string', description: 'Workout ID for start action (e.g. hiit-circuit, 5-minute-quickie)' },
        weightKg: { type: 'number', description: 'User weight in kg for calorie calculation' }
      },
      required: ['action']
    }
  },
  {
    name: 'karaoke_control',
    description: 'Control karaoke mode — open, close, play a specific song in karaoke, or fetch lyrics for the current track',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['open', 'close', 'fetch_lyrics', 'play'],
          description: 'open: go to karaoke screen | close: return to dashboard | fetch_lyrics: fetch lyrics for current song and open karaoke | play: search and play a song then open karaoke'
        },
        query: {
          type: 'string',
          description: 'Song name / artist for play action (e.g. "Tum Hi Ho" or "Coldplay Yellow")'
        }
      },
      required: ['action']
    }
  }
]

async function processQuery(userText, io) {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) throw new Error('CLAUDE_API_KEY missing from .env')

  const client = new Anthropic({ apiKey })

  // ── DIAGNOSTIC LOGS (remove after confirming context works) ──
  console.log('\n─── NEW QUERY ───')
  console.log('Input:', userText)
  console.log('History before this query:', JSON.stringify(conversationHistory, null, 2))
  console.log('lastToolContext:', JSON.stringify(lastToolContext))
  // ─────────────────────────────────────────────────────────────

  // 1. Prune stale history
  pruneHistory()

  const lowerText = userText.toLowerCase()

  // 2. Reset phrases — clear and return immediately
  if (RESET_PHRASES.some(p => lowerText.includes(p))) {
    clearHistory()
    const reply = 'Got it — starting fresh!'
    if (io) io.emit('ai-response', { text: reply, highlightWidget: null, historyDepth: 0 })
    return { reply, historyDepth: 0 }
  }

  // 2b. Close video phrases — dismiss YouTube overlay immediately
  if (CLOSE_VIDEO_PHRASES.some(p => lowerText.includes(p))) {
    if (io) io.emit('youtube-close')
    const reply = 'Going back to the mirror.'
    if (io) io.emit('ai-response', { text: reply, highlightWidget: null, historyDepth: Math.floor(conversationHistory.length / 2) })
    return { reply, historyDepth: Math.floor(conversationHistory.length / 2) }
  }

  // 3. Cached system prompt
  const cachedSystem = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]

  // 4. Build enriched messages — injects lastToolContext into the user message
  const messages = buildMessages(userText)

  // ── DIAGNOSTIC LOG ──
  console.log('Messages sent to Claude (1st call):', JSON.stringify(messages, null, 2))
  // ───────────────────

  // 5. First Claude call
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: cachedSystem,
    messages,
    tools
  })

  // ── DIAGNOSTIC LOG ──
  console.log('Claude 1st response stop_reason:', response.stop_reason)
  console.log('Claude 1st response content[0] type:', response.content[0]?.type)
  // ───────────────────

  console.log('[claude] Tokens:', JSON.stringify(response.usage))

  let finalReply = ''
  let toolUsedName = null

  if (response.stop_reason === 'tool_use') {
    const toolUse  = response.content.find(b => b.type === 'tool_use')
    toolUsedName   = toolUse.name
    const toolInput = toolUse.input

    console.log(`[claude] tool selected: ${toolUsedName}`, toolInput)

    // 6. Execute the tool
    const toolResult    = await functions.execute(toolUsedName, toolInput, io)
    const toolResultStr = JSON.stringify(toolResult)
    console.log(`[claude] tool result:`, toolResultStr.slice(0, 200))

    // 7. Save tool context so the NEXT query can reference "that" / "it" precisely
    lastToolContext = {
      toolName:   toolUsedName,
      toolInput,
      toolResult: toolResultStr
    }

    // 8. Second Claude call — uses original (non-enriched) user text + proper tool turn structure
    //    conversationHistory only has plain strings so this messages array is always valid
    const messages2 = [
      ...conversationHistory,
      { role: 'user', content: userText },
      { role: 'assistant', content: response.content },   // tool_use block — valid here only
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: toolResultStr
        }]
      }
    ]

    // ── DIAGNOSTIC LOG ──
    console.log('Messages sent to Claude (2nd call):', JSON.stringify(messages2, null, 2))
    // ───────────────────

    const finalResponse = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: cachedSystem,
      messages: messages2,
      tools
    })

    console.log('[claude] Tokens (final turn):', JSON.stringify(finalResponse.usage))
    finalReply = finalResponse.content.find(b => b.type === 'text')?.text || 'Done.'

  } else {
    // Plain text — no tool used, clear stale tool context
    finalReply     = response.content.find(b => b.type === 'text')?.text || 'Sure.'
    lastToolContext = null
  }

  // ── DIAGNOSTIC LOG ──
  console.log('Saving to history — user:', userText)
  console.log('Saving to history — assistant:', finalReply)
  // ───────────────────

  // 9. Save exchange as plain text strings — always valid for future API calls
  addExchange(userText, finalReply)

  // ── DIAGNOSTIC LOG ──
  console.log('History after this query:', JSON.stringify(conversationHistory, null, 2))
  // ───────────────────

  const historyDepth   = Math.floor(conversationHistory.length / 2)
  const highlightWidget = TOOL_TO_WIDGET[toolUsedName] || null

  if (io) io.emit('ai-response', { text: finalReply, highlightWidget, historyDepth })

  return { reply: finalReply, toolUsed: toolUsedName, historyDepth }
}

module.exports = { processQuery, clearHistory, getHistory }
