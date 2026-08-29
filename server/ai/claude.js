const Anthropic = require('@anthropic-ai/sdk')
const functions = require('./functions')

// Verbose per-query tracing (full history/message JSON dumps) is expensive on a
// Pi and only useful while debugging. Off unless DEBUG_AI=1.
const AI_DEBUG = process.env.DEBUG_AI === '1'
function dbg(...args) { if (AI_DEBUG) console.log(...args) }

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

SPOTIFY RULES:
- The user is logged in to Spotify with their own account.
- You have access to their personal library: recently played, liked songs, top tracks, and playlists.
- Intent mapping:
  "play something" / "play music" / "play a song"      → play_music with action: play_top_tracks
  "play my liked songs" / "play favourites"             → play_music with action: play_liked_songs
  "what was I listening to" / "play that again"         → play_music with action: play_recently_played
  "play my [name] playlist"                             → play_music with action: play_playlist, query=name
  "play [song/artist/album]"     → play_music with action: search_and_play
  "pause" / "stop music"                                → play_music with action: pause
  "resume" / "continue playing"                         → play_music with action: resume
  "next song" / "skip"                                  → play_music with action: next
  "previous" / "go back"                                → play_music with action: prev
  "set volume to N" / "volume N"                        → play_music with action: volume, volume=N
- Never say "I cannot play music" — always try an action.
- Never mention tokens, OAuth, or API to the user.

WHATSAPP RULES:
- get_whatsapp_messages with no input → returns all unread messages across contacts
- get_whatsapp_messages with contact:'Mom' → messages from Mom only
- If WhatsApp not connected → tell user to scan the QR code shown in the terminal or at /api/whatsapp/qr
- Never say you cannot read WhatsApp — always try the tool first.

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
- Never say you can't show lyrics — always try.

ALARM RULES (wall-clock alarms that ring at a set time — separate from set_reminder, which speaks a one-off message):
- "set an alarm for 7" / "wake me at 6:30" / "alarm for 7 am"        → alarm_control action: set, time in HH:MM 24h (convert spoken times: "7 am"→"07:00", "6:30 pm"→"18:30"). Default repeat: once.
- "every day at 7" / "daily alarm at 6:45"                            → alarm_control action: set, repeat: daily
- "on weekdays at 7" / "every weekday"                                → alarm_control action: set, repeat: weekdays
- "on weekends at 9"                                                  → alarm_control action: set, repeat: weekends
- name it if the user gives one: "gym alarm at 6" → label: "gym"
- "what alarms do I have" / "list my alarms" / "when's my alarm"      → alarm_control action: list
- "delete the 7 am alarm" / "remove my gym alarm" / "cancel all alarms" → alarm_control action: delete, query="7:00" or label or "all"
- "turn off the 7 alarm" / "disable my alarms"                        → alarm_control action: disable, query=...
- "turn on the 7 alarm" / "enable my morning alarm"                   → alarm_control action: enable, query=...
- "snooze" / "snooze for 5 minutes" / "5 more minutes"               → alarm_control action: snooze, minutes (default 9)
- "stop" / "dismiss" / "turn it off" / "I'm up" (while an alarm is ringing) → alarm_control action: stop
- When listing, say it warmly in one sentence: each alarm's time, whether it repeats, and if any is off.
- Never say you can't set an alarm — always try.

SCREENSAVER RULES:
- "screensaver" / "start screensaver" / "go to sleep" / "sleep mode" / "screen off" / "lights off" / "start sleep mode" / "goodnight mirror" → screensaver_control action: enter
- "wake up" / "I'm back" / "exit screensaver" / "turn on" → screensaver_control action: exit

WIDGET / PANEL CONTROL — anything visible on screen can be shown, hidden, or highlighted:
- "hide the [panel]" / "remove [panel]" / "get rid of [panel]"   → control_widget action: hide, widget=[name]
- "show the [panel]" / "bring back [panel]" / "display [panel]"  → control_widget action: show, widget=[name]
- "highlight [panel]" / "point out [panel]" / "focus [panel]"    → control_widget action: highlight, widget=[name]
- "hide everything" / "clean screen" / "declutter"               → control_widget action: hide, widget=all
- "show everything" / "bring it all back"                        → control_widget action: show, widget=all
- Valid widget names: clock, weather, calendar, tasks, notifications, music, quote, news, photos, wallpaper, ai-bar.
  Map synonyms yourself: messages/whatsapp/email → notifications; schedule/agenda/events → calendar; todos → tasks; song/spotify → music; headlines → news; ambient art/slideshow/photos → photos.

DISPLAY CONTROL (the mirror's screen, NOT the LED backlight):
- "dim the screen" / "dim the mirror" / "darker" / "too bright"   → control_display action: dim
- "brighter" / "brighten" / "full brightness"                     → control_display action: brighten
- "set brightness to N" / "screen brightness N percent"           → control_display action: set_brightness, value=N
- "clear the wallpaper" / "remove the wallpaper" / "reset ambient art" → control_display action: clear_wallpaper
- NOTE: "backlight" / "LED" / colour words like "warm/party/red" → set_backlight (the light strip), NOT control_display.

HABIT RULES (recurring habits with streaks — separate from one-off tasks):
- Habits are things the user wants to do regularly (e.g. drink water, meditate, read, gym). Anything phrased as a "habit", a "streak", or "every day I..." maps to manage_habits, NOT tasks.
- "add a habit to [X]" / "track [X] every day" / "start a [X] habit"        → manage_habits action: add, name=X (optional emoji, optional target count)
- "mark [X] done" / "I did [X]" / "I drank water" / "[X] ho gaya" (when X is a habit) → manage_habits action: check, name=X
- "undo [X]" / "unmark [X]" / "I didn't do [X] after all"                    → manage_habits action: uncheck, name=X
- "remove the [X] habit" / "delete my [X] habit" / "stop tracking [X]"       → manage_habits action: remove, name=X
- "what are my habits" / "how are my habits" / "how's my streak" / "did I do everything today" → manage_habits action: list
- When listing, speak it warmly in one sentence: which are done, and call out any good streaks.
- If a name matches both a task and a habit, prefer the habit only when the user says "habit" or "streak"; otherwise treat it as a task.

TASK DELETE vs COMPLETE:
- "delete X" / "remove X from the list" / "erase X" / "get rid of the task X"  → delete_task (removes it entirely)
- "X done" / "finished X" / "mark X complete" / "X ho gaya"                    → complete_task (crosses it off with a checkmark)

VOLUME:
- "louder" / "turn it up" / "volume up"       → play_music action: volume_up
- "quieter" / "turn it down" / "volume down"  → play_music action: volume_down
- "set volume to N" / "volume N"              → play_music action: volume, volume=N

HELP / DISCOVERY:
- If asked "what can you do" / "what can I say" / "help" / "what are my commands": answer briefly in one flowing sentence that you can tell them the weather, calendar, tasks and messages; play music or karaoke; run workouts; set alarms, reminders and read the news or a quote; control the photo slideshow, wallpaper and screen brightness; change the backlight; and show, hide or highlight any panel on the mirror — then invite them to just say what they want. Do NOT call a tool for this.`

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
  play_music:            'music',
  set_backlight:         'backlight',
  morning_briefing:      'all',
  get_news:              'ai-bar',
  set_reminder:          'ai-bar',
  get_quote:             'quote',
  alarm_control:         'alarm',
  control_slideshow:     null,
  fitness_control:       'fitness',
  karaoke_control:       null,
  screensaver_control:   null,
  delete_task:           'tasks',
  manage_habits:         'habits',
  control_widget:        null,   // targets an arbitrary panel — handled by the tool itself
  control_display:       null
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
            'volume_up',
            'volume_down',
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
    name: 'alarm_control',
    description: 'Set, list, delete, enable/disable, snooze, or dismiss alarms. Everything about alarms is controlled here.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set', 'list', 'delete', 'enable', 'disable', 'snooze', 'stop'],
          description: 'set: create an alarm | list: read out alarms | delete: remove alarm(s) | enable/disable: turn alarm(s) on/off | snooze: snooze the ringing alarm | stop: dismiss the ringing alarm'
        },
        time: {
          type: 'string',
          description: 'Alarm time in HH:MM 24-hour format (e.g. "07:00", "18:30"). Required for action=set.'
        },
        label: {
          type: 'string',
          description: 'Optional name for the alarm (e.g. "gym", "wake up"). Only for action=set.'
        },
        repeat: {
          type: 'string',
          enum: ['once', 'daily', 'weekdays', 'weekends'],
          description: 'How often the alarm repeats. Defaults to once. Only for action=set.'
        },
        query: {
          type: 'string',
          description: 'Which alarm to target for delete/enable/disable — a time like "7:00", a label, or "all". Defaults to all.'
        },
        minutes: {
          type: 'number',
          description: 'Snooze duration in minutes. Only for action=snooze. Defaults to 9.'
        }
      },
      required: ['action']
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
    name: 'screensaver_control',
    description: 'Control screensaver mode on the mirror — enter to dim and show video wallpaper, exit to wake back up',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['enter', 'exit'],
          description: 'enter to start screensaver, exit to stop'
        }
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
  },
  {
    name: 'control_widget',
    description: 'Show, hide, or highlight any visible panel/widget on the mirror dashboard. Use for "hide the weather", "show my tasks", "highlight the calendar", "hide everything", etc.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['show', 'hide', 'highlight'],
          description: 'show or hide the panel, or briefly highlight it to draw attention'
        },
        widget: {
          type: 'string',
          description: 'Which panel: clock, weather, calendar, tasks, notifications, music, quote, news, photos, wallpaper, ai-bar, or "all" for every content panel. Map synonyms (messages→notifications, schedule→calendar, etc.).'
        }
      },
      required: ['action', 'widget']
    }
  },
  {
    name: 'control_display',
    description: "Control the mirror's screen brightness (a dimming overlay) and the ambient-art wallpaper. NOT the LED backlight strip.",
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['dim', 'brighten', 'set_brightness', 'clear_wallpaper'],
          description: 'dim/brighten step the screen; set_brightness uses value; clear_wallpaper removes the ambient art image'
        },
        value: {
          type: 'number',
          description: 'Brightness percent 10-100. Only for action=set_brightness.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task from the list (removes it entirely). Use for "delete X", "remove X from the list", "erase X". For marking something finished/done instead, use complete_task.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text of the task to delete (partial match is fine)' }
      },
      required: ['text']
    }
  },
  {
    name: 'manage_habits',
    description: 'Manage recurring daily habits with streaks (separate from one-off tasks). Create a habit, mark it done or undone for today, remove it, or list all habits with their streaks. Use for anything about "habits", "streaks", or things done "every day".',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'check', 'uncheck', 'remove', 'list', 'status'],
          description: 'add: create a habit | check: mark done today | uncheck: undo today | remove: delete the habit | list/status: read out all habits and streaks'
        },
        name: {
          type: 'string',
          description: 'Habit name (e.g. "drink water", "meditate"). Required for add, check, uncheck, remove.'
        },
        emoji: {
          type: 'string',
          description: 'Optional single emoji icon for the habit (only for action=add).'
        },
        target: {
          type: 'number',
          description: 'Optional daily target count, e.g. 8 for eight glasses of water. Defaults to 1. Only for action=add.'
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

  dbg('\n─── NEW QUERY ───')
  dbg('Input:', userText)
  dbg('History before this query:', JSON.stringify(conversationHistory, null, 2))
  dbg('lastToolContext:', JSON.stringify(lastToolContext))

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

  // 3. Cached system prompt
  const cachedSystem = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]

  // 4. Build enriched messages — injects lastToolContext into the user message
  const messages = buildMessages(userText)

  dbg('Messages sent to Claude (1st call):', JSON.stringify(messages, null, 2))

  // 5. First Claude call  (let — the tool loop below reassigns it)
  let response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: cachedSystem,
    messages,
    tools
  })

  dbg('Claude 1st response stop_reason:', response.stop_reason)
  dbg('Claude 1st response content[0] type:', response.content[0]?.type)
  dbg('[claude] Tokens:', JSON.stringify(response.usage))

  let finalReply = ''
  let toolUsedName = null
  let highlightWidget = null

  const MAX_TOOL_ITERATIONS = 5
  let iterations = 0

  // Agentic tool loop. A single assistant turn can contain MULTIPLE tool_use
  // blocks (e.g. "change X to Y" → complete_task + add_task), and the model may
  // need several rounds. Every tool_use in a turn must get a matching
  // tool_result back or the API 400s — so execute them all, then let the model
  // continue until it returns a plain text answer.
  while (response.stop_reason === 'tool_use') {
    const toolUses    = response.content.filter(b => b.type === 'tool_use')
    const toolResults = []

    for (const toolUse of toolUses) {
      console.log(`[claude] tool selected: ${toolUse.name}`, toolUse.input)

      const toolResult    = await functions.execute(toolUse.name, toolUse.input, io)
      const toolResultStr = JSON.stringify(toolResult)
      console.log(`[claude] tool result:`, toolResultStr.slice(0, 200))

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: toolResultStr
      })

      // Track most-recent tool for widget highlight + follow-up context
      // so a later "play that again" knows exactly what "that" was.
      toolUsedName = toolUse.name
      if (TOOL_TO_WIDGET[toolUse.name]) highlightWidget = TOOL_TO_WIDGET[toolUse.name]
      lastToolContext = {
        toolName:   toolUse.name,
        toolInput:  toolUse.input,
        toolResult: toolResultStr
      }
    }

    // Append the tool turn: assistant's tool_use blocks + our tool_results.
    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user',      content: toolResults })

    iterations++

    if (iterations >= MAX_TOOL_ITERATIONS) {
      // Safety cap — force a final text answer with no further tool calls.
      response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: cachedSystem,
        messages
      })
      break
    }

    response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: cachedSystem,
      messages,
      tools
    })
    dbg('[claude] Tokens (tool turn):', JSON.stringify(response.usage))
  }

  if (toolUsedName === null) {
    // No tool was ever used — clear any stale tool context.
    lastToolContext = null
  }

  finalReply = response.content.find(b => b.type === 'text')?.text ||
    (toolUsedName ? 'Done.' : 'Sure.')

  dbg('Saving to history — user:', userText)
  dbg('Saving to history — assistant:', finalReply)

  // 9. Save exchange as plain text strings — always valid for future API calls
  addExchange(userText, finalReply)

  dbg('History after this query:', JSON.stringify(conversationHistory, null, 2))

  const historyDepth = Math.floor(conversationHistory.length / 2)

  if (io) io.emit('ai-response', { text: finalReply, highlightWidget, historyDepth })

  return { reply: finalReply, toolUsed: toolUsedName, historyDepth }
}

module.exports = { processQuery, clearHistory, getHistory }
