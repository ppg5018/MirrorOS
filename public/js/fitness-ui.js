/* ============================================
   MirrorOS — Fitness UI (connects to WorkoutEngine via Socket.io)
   ============================================ */

// ── Viewport scaling ──
;(function applyScale() {
  document.documentElement.style.zoom = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
})()
window.addEventListener('resize', function () {
  document.documentElement.style.zoom = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
})

var socket = io()
var currentState    = null
var isPaused        = false
var _restTotal      = 0   // total seconds for current rest period
var _completionTimer = null

var CATEGORY_EMOJI = {
  hiit: '🔥', strength: '💪', flexibility: '🧘', quick: '⚡',
  upper: '🏋️', lower: '🦵', core: '🎯', cardio: '❤️',
  yoga: '🧘', full: '💪'
}
function getCategoryEmoji(cat) {
  if (!cat) return '🏋️'
  var lo = cat.toLowerCase()
  for (var k in CATEGORY_EMOJI) { if (lo.includes(k)) return CATEGORY_EMOJI[k] }
  return '🏋️'
}

// ── SOCKET LISTENERS ──

socket.on('fitness:state', function (data) {
  currentState = data
  if (data.state === 'idle')     { window.location.href = '/'; return }
  if (data.state === 'complete') return
  if (data.state === 'active')   hideRestOverlay()
  hideSelector()
  renderAll(data)
})

socket.on('fitness:timer_tick', function (data) {
  document.getElementById('elapsed-text').textContent = formatElapsed(data.elapsed)
  updateCalories(data.calories)

  var timerEl    = document.getElementById('timer-display')
  var timerLabel = document.getElementById('timer-label')

  if (data.state === 'warmup') {
    timerLabel.textContent  = 'WARMUP'
    timerEl.textContent     = data.warmupRemaining + ''
    timerEl.className       = 'warmup'
    var wo = document.getElementById('warmup-overlay')
    if (wo && !wo.classList.contains('hidden')) {
      var cd = wo.querySelector('.warmup-countdown')
      if (cd) cd.textContent = data.warmupRemaining
    }
  } else if (data.state === 'rest') {
    timerLabel.textContent = 'REST TIMER'
    timerEl.textContent    = formatTime(data.restRemaining)
    timerEl.className      = 'rest'
    updateRestOverlay(data.restRemaining)
  } else if (data.state === 'active') {
    timerLabel.textContent = 'ELAPSED'
    timerEl.textContent    = formatTime(data.elapsed)
    timerEl.className      = 'active'
  }

  if (data.state !== 'warmup') hideWarmupOverlay()

  if (currentState && currentState.currentExercise) {
    var sets = currentState.currentExercise.sets || 1
    document.getElementById('current-set-display').textContent = data.currentSet + '/' + sets
  }

  updateNextSetBtn(data)
})

socket.on('fitness:next_exercise', function (data) {
  hideRestOverlay()
  if (data.exercise) renderExercise(data.exercise)
  if (currentState) {
    currentState.currentExerciseIndex = data.index
    currentState.currentSet           = data.set
    renderProgressDots(currentState)
    renderProgressList(currentState)
    renderUpNext(currentState)
    if (window._workoutExercises) preloadNextImage(window._workoutExercises, data.index)
  }
})

socket.on('fitness:rest_start', function (data) {
  var badge = document.getElementById('active-badge')
  badge.textContent = 'REST'
  badge.className   = 'rest'
  showRestOverlay(data)
  if (data.nextUp && data.nextUp.type === 'next_exercise' && data.nextUp.exercise) {
    renderUpNextExercise(data.nextUp.exercise)
  }
})

socket.on('fitness:complete', function (session) {
  hideRestOverlay()
  showCompletionScreen(session)
})

// ── RENDER FUNCTIONS ──

function renderAll(data) {
  if (!data) return

  var badge = document.getElementById('active-badge')
  badge.textContent = data.state.toUpperCase()
  badge.className   = data.state

  isPaused = data.state === 'paused'
  document.getElementById('btn-pause').textContent = isPaused ? '▶' : '⏸'

  if (data.currentExercise) {
    renderExercise(data.currentExercise)
    var sets = data.currentExercise.sets || 1
    document.getElementById('current-set-display').textContent = data.currentSet + '/' + sets
    document.getElementById('rest-seconds').textContent = (data.currentExercise.restSeconds || 0) + 's'
  }

  document.getElementById('elapsed-text').textContent = formatElapsed(data.elapsedSeconds)
  updateCalories(data.caloriesBurned || 0)
  renderProgressDots(data)
  renderProgressList(data)
  renderUpNext(data)
  updateNextSetBtn(data)

  if (data.state === 'warmup') showWarmupOverlay(data)
  else hideWarmupOverlay()
}

var FALLBACK_INSTRUCTIONS = [
  'Perform the movement with controlled form',
  'Keep your core braced throughout',
  'Exhale on exertion, inhale on return'
]

function renderExercise(entry) {
  var ex   = entry.exercise || entry
  var name = ex.name || entry.name || entry.exerciseId || 'Exercise'

  document.getElementById('exercise-name').textContent = name
  document.getElementById('exercise-sets-reps').textContent =
    (entry.sets || 1) + ' sets × ' + (entry.reps || 10) + ' reps'
  document.getElementById('form-tip-text').textContent = entry.formTip || ''

  // Image with crossfade
  var img  = document.getElementById('exercise-image')
  var wrap = document.getElementById('exercise-image-wrap')
  var ph   = wrap.querySelector('.exercise-placeholder')
  if (ph) ph.remove()

  var gifSrc = ''
  if (ex.id)             gifSrc = '/data/gifs/' + ex.id + '.gif'
  else if (entry.exerciseId) gifSrc = '/data/gifs/' + entry.exerciseId + '.gif'
  if (ex.gifUrl)         gifSrc = ex.gifUrl || gifSrc

  img.style.opacity = '0'
  if (gifSrc) {
    img.style.display = 'block'
    img.alt  = name
    img.onload  = function () { this.style.opacity = '1' }
    img.onerror = function () { this.style.display = 'none'; showImagePlaceholder(wrap, name) }
    img.src = gifSrc
  } else {
    img.style.display = 'none'
    showImagePlaceholder(wrap, name)
  }

  // Instructions
  var instList  = document.getElementById('instructions-list')
  var instructions = (ex.instructions    && ex.instructions.length)    ? ex.instructions
                   : (entry.instructions && entry.instructions.length) ? entry.instructions
                   : FALLBACK_INSTRUCTIONS
  instList.innerHTML = instructions.map(function (step, i) {
    return '<div class="instruction-row"><div class="instruction-num">' + (i + 1) +
           '</div><div class="instruction-text">' + step + '</div></div>'
  }).join('')

  // Muscles
  var muscleList = document.getElementById('muscles-list')
  var tags = []
  var target = ex.target || entry.target
  if (target) tags.push(target)
  tags = tags.concat(ex.secondaryMuscles || entry.secondaryMuscles || [])
  muscleList.innerHTML = tags.filter(Boolean).map(function (m) {
    return '<div class="muscle-tag">' + m + '</div>'
  }).join('')

  document.getElementById('rest-seconds').textContent = (entry.restSeconds || 0) + 's'
}

function showImagePlaceholder(wrap, name) {
  var ex = wrap.querySelector('.exercise-placeholder')
  if (ex) ex.remove()
  var div = document.createElement('div')
  div.className = 'exercise-placeholder'
  div.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'font-family:"Space Grotesk",sans-serif;font-size:28px;font-weight:300;color:rgba(255,255,255,0.15);' +
    'text-align:center;padding:32px;text-transform:capitalize;z-index:1;'
  div.textContent = name
  wrap.appendChild(div)
}

function preloadNextImage(exercises, currentIdx) {
  var nextIdx = currentIdx + 1
  if (nextIdx >= exercises.length) return
  var next = exercises[nextIdx]
  var nex  = next.exercise || next
  var id   = nex.id || next.exerciseId
  if (id) { var img = new Image(); img.src = '/data/gifs/' + id + '.gif' }
}

function updateNextSetBtn(data) {
  var btn = document.getElementById('btn-next-set')
  if (!btn || !data || !data.currentExercise) return
  var lastSet = (data.currentSet || 1) >= (data.currentExercise.sets || 1)
  var lastEx  = ((data.currentExerciseIndex || 0) + 1) >= (data.totalExercises || 1)
  btn.disabled = lastSet && lastEx
}

function renderUpNext(data) {
  var card = document.getElementById('up-next-card')
  if (!data || !data.currentExercise) { card.style.opacity = '0.5'; return }

  var exercises  = window._workoutExercises || []
  var currentIdx = data.currentExerciseIndex || 0
  var nextIdx    = currentIdx + 1

  if (exercises.length && nextIdx < exercises.length) {
    renderUpNextExercise(exercises[nextIdx])
  } else if (nextIdx >= (data.totalExercises || 0)) {
    card.style.opacity = '1'
    document.getElementById('up-next-name').textContent = 'Workout Complete!'
    document.getElementById('up-next-sets').textContent = 'Almost there — finish strong'
    document.getElementById('up-next-image').style.display = 'none'
  } else if (data.workoutId && !window._fetchingWorkout) {
    window._fetchingWorkout = true
    fetch('/api/fitness/workouts/' + data.workoutId)
      .then(function (r) { return r.json() })
      .then(function (w) {
        window._workoutExercises = w.exercises || []
        window._fetchingWorkout  = false
        renderUpNext(data)
        preloadNextImage(window._workoutExercises, currentIdx)
      })
      .catch(function () { window._fetchingWorkout = false })
  }
}

function renderUpNextExercise(entry) {
  var card = document.getElementById('up-next-card')
  card.style.opacity = '1'
  var ex   = entry.exercise || entry
  var name = ex.name || entry.name || entry.exerciseId || 'Next exercise'
  document.getElementById('up-next-name').textContent = name
  document.getElementById('up-next-sets').textContent =
    (entry.sets || 1) + ' sets × ' + (entry.reps || 10) + ' reps'
  var img    = document.getElementById('up-next-image')
  var gifSrc = ''
  if (ex.id)             gifSrc = '/data/gifs/' + ex.id + '.gif'
  else if (entry.exerciseId) gifSrc = '/data/gifs/' + entry.exerciseId + '.gif'
  if (gifSrc) {
    img.src = gifSrc; img.style.display = 'block'
    img.onerror = function () { this.style.display = 'none' }
  } else {
    img.style.display = 'none'
  }
}

function renderProgressList(data) {
  var list = document.getElementById('exercise-list')
  if (!list || !data) return
  if (!window._workoutExercises && data.workoutId) {
    fetch('/api/fitness/workouts/' + data.workoutId)
      .then(function (r) { return r.json() })
      .then(function (w) {
        window._workoutExercises = w.exercises || []
        _renderProgressListInner(list, data)
        preloadNextImage(window._workoutExercises, data.currentExerciseIndex || 0)
      })
    return
  }
  _renderProgressListInner(list, data)
}

function _renderProgressListInner(list, data) {
  var exercises  = window._workoutExercises || []
  if (!exercises.length) return
  var current    = data.currentExerciseIndex || 0
  var currentSet = data.currentSet || 1

  list.innerHTML = exercises.map(function (entry, i) {
    var ex       = entry.exercise || entry
    var name     = ex.name || entry.name || entry.exerciseId || 'Exercise'
    var sets     = entry.sets || 1
    var reps     = entry.reps || 10
    var isDone   = i < current
    var isCurr   = i === current
    var fill     = isCurr ? Math.round((currentSet / sets) * 100) : (isDone ? 100 : 0)
    var cls      = 'exercise-row' + (isCurr ? ' current' : isDone ? ' done' : '')

    var statusHtml = isDone
      ? '<div class="exercise-done-check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></div>'
      : isCurr ? '<div class="exercise-in-progress">IN PROGRESS</div>' : ''
    var progressHtml = isCurr
      ? '<div class="exercise-set-progress"><div class="exercise-set-fill" style="width:' + fill + '%"></div></div>'
      : ''

    return '<div class="' + cls + '"><div class="exercise-row-top"><div>' +
      '<div class="exercise-row-name">' + name + '</div>' +
      '<div class="exercise-row-sets">' + sets + ' × ' + reps + '</div>' +
      '</div>' + statusHtml + '</div>' + progressHtml + '</div>'
  }).join('')

  var cur = list.querySelector('.exercise-row.current')
  if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function renderProgressDots(data) {
  var container = document.getElementById('progress-dots')
  if (!container || !data) return
  var total   = data.totalExercises || 0
  var current = data.currentExerciseIndex || 0

  container.innerHTML = ''
  for (var i = 0; i < total; i++) {
    var dot = document.createElement('div')
    dot.className = 'progress-dot' + (i < current ? ' done' : i === current ? ' current' : '')
    container.appendChild(dot)
  }

  var pctEl = document.getElementById('completion-pct')
  if (pctEl && total > 0) {
    pctEl.textContent = Math.round((current / total) * 100) + '%'
  }
}

function updateCalories(cal) {
  var r = Math.round(cal)
  document.getElementById('calories-value').textContent  = r
  document.getElementById('top-cal-text').textContent    = r + ' cal'
  document.getElementById('calories-bar-fill').style.width = Math.min(100, (r / 500) * 100) + '%'
}

// ── WARMUP OVERLAY ──

function showWarmupOverlay(data) {
  var overlay = document.getElementById('warmup-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'warmup-overlay'
    document.getElementById('fitness-app').appendChild(overlay)
  }
  overlay.className = ''
  var exName = 'Get Ready'
  if (data.currentExercise) {
    var ex = data.currentExercise.exercise || data.currentExercise
    exName = ex.name || data.currentExercise.name || data.currentExercise.exerciseId || 'First Exercise'
  }
  overlay.innerHTML =
    '<div class="warmup-label">GET READY</div>' +
    '<div class="warmup-countdown">' + (data.warmupRemaining || 15) + '</div>' +
    '<div class="warmup-exercise-name">Up first: ' + exName + '</div>'
}

function hideWarmupOverlay() {
  var overlay = document.getElementById('warmup-overlay')
  if (overlay) overlay.className = 'hidden'
}

// ── REST OVERLAY ──

function showRestOverlay(data) {
  var overlay = document.getElementById('rest-overlay')
  if (!overlay) return

  _restTotal = data.duration || 30

  var nextName = '—', nextGif = ''
  if (data.nextUp) {
    var ex, exId
    if (data.nextUp.type === 'next_set' && data.nextUp.exercise) {
      ex = data.nextUp.exercise.exercise || data.nextUp.exercise
      nextName = ex.name || data.nextUp.exercise.name || 'Same exercise'
    } else if (data.nextUp.type === 'next_exercise' && data.nextUp.exercise) {
      ex   = data.nextUp.exercise.exercise || data.nextUp.exercise
      exId = ex.id || data.nextUp.exercise.exerciseId
      nextName = ex.name || data.nextUp.exercise.name || 'Next exercise'
      if (exId) nextGif = '/data/gifs/' + exId + '.gif'
    } else if (data.nextUp.type === 'complete') {
      nextName = 'Finish strong!'
    }
  }

  document.getElementById('rest-overlay-countdown').textContent = _restTotal
  document.getElementById('rest-up-next-name').textContent      = nextName

  var img = document.getElementById('rest-up-next-img')
  if (nextGif) {
    img.src = nextGif; img.style.display = 'block'
    img.onerror = function () { this.style.display = 'none' }
  } else {
    img.style.display = 'none'; img.src = ''
  }

  updateRestRing(_restTotal, _restTotal)
  overlay.style.background = 'rgba(0,10,40,0.92)'
  overlay.style.display    = 'flex'
  overlay.offsetHeight     // force reflow for transition
  overlay.classList.remove('hidden')
}

function hideRestOverlay() {
  var overlay = document.getElementById('rest-overlay')
  if (!overlay || overlay.style.display === 'none') return
  overlay.classList.add('hidden')
  setTimeout(function () {
    if (overlay.classList.contains('hidden')) overlay.style.display = 'none'
  }, 400)
}

function updateRestOverlay(restRemaining) {
  var overlay = document.getElementById('rest-overlay')
  if (!overlay || overlay.style.display === 'none') return
  document.getElementById('rest-overlay-countdown').textContent = restRemaining
  updateRestRing(restRemaining, _restTotal)
  if (restRemaining <= 3 && restRemaining > 0) {
    overlay.style.background = 'rgba(40,0,0,0.92)'
  }
}

function updateRestRing(current, total) {
  var ring = document.getElementById('rest-ring-fill')
  if (!ring || total <= 0) return
  var circumference = 2 * Math.PI * 88 // ≈ 553
  ring.style.strokeDashoffset = circumference * (1 - current / total)
}

// ── COMPLETION SCREEN ──

var MOTIVATIONAL = [
  'Outstanding effort — you crushed it today!',
  "That's how champions train. See you tomorrow!",
  "Every rep builds the person you're becoming.",
  'Consistency is the key — and you just proved it.',
  'Your future self thanks you for this workout.',
  'Discipline beats motivation every time. Well done.',
  'Progress is progress, no matter the pace. Keep going.'
]

function showCompletionScreen(session) {
  var durationMin = Math.round((session.durationSeconds || 0) / 60)
  fetch('/api/fitness/stats')
    .then(function (r) { return r.json() })
    .then(function (stats) { _renderCompletion(session, durationMin, stats.streak || 0) })
    .catch(function ()    { _renderCompletion(session, durationMin, 0) })
}

function _renderCompletion(session, durationMin, streak) {
  var line = MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)]

  document.getElementById('fitness-app').innerHTML =
    '<div class="completion-screen">' +
      '<div class="completion-label">WORKOUT COMPLETE</div>' +
      '<div class="completion-emoji">🏆</div>' +
      '<div class="completion-stats">' +
        '<div class="completion-stat"><div class="completion-stat-value calories">' +
          Math.round(session.caloriesBurned || 0) + '</div><div class="completion-stat-label">CALORIES</div></div>' +
        '<div class="completion-stat"><div class="completion-stat-value minutes">' +
          durationMin + '</div><div class="completion-stat-label">MINUTES</div></div>' +
        '<div class="completion-stat"><div class="completion-stat-value exercises">' +
          (session.exercisesCompleted || 0) + '</div><div class="completion-stat-label">EXERCISES</div></div>' +
      '</div>' +
      '<div class="completion-streak">' +
        '<div class="completion-streak-label">YOUR STREAK</div>' +
        '<div class="completion-streak-days">' + streak + ' DAYS</div>' +
      '</div>' +
      '<div class="completion-motivational">' + line + '</div>' +
      '<button class="completion-back-btn" onclick="window.location.href=\'/\'">GO BACK TO MIRROR</button>' +
      '<div class="completion-redirect" id="completion-redirect">Returning in 12s...</div>' +
    '</div>'

  // TTS
  if (window.speechSynthesis) {
    var utt = new SpeechSynthesisUtterance('Workout complete! ' + line)
    utt.rate = 0.9
    window.speechSynthesis.speak(utt)
  }

  // Countdown
  var count = 12
  if (_completionTimer) clearInterval(_completionTimer)
  _completionTimer = setInterval(function () {
    count--
    var el = document.getElementById('completion-redirect')
    if (el) el.textContent = 'Returning in ' + count + 's...'
    if (count <= 0) { clearInterval(_completionTimer); window.location.href = '/' }
  }, 1000)
}

// ── WORKOUT SELECTOR ──

function showSelector() {
  document.getElementById('workout-selector').style.display = 'flex'
  document.getElementById('top-bar').style.display   = 'none'
  document.getElementById('main-grid').style.display = 'none'
  document.getElementById('bottom-bar').style.display = 'none'

  fetch('/api/fitness/workouts')
    .then(function (r) { return r.json() })
    .then(function (workouts) {
      var grid = document.getElementById('selector-grid')
      grid.innerHTML = workouts.map(function (w) {
        return '<div class="selector-card" data-id="' + w.id + '">' +
          '<div class="selector-card-emoji">' + getCategoryEmoji(w.category) + '</div>' +
          '<div class="selector-card-name">' + w.name + '</div>' +
          '<div class="selector-card-desc">' + (w.description || '') + '</div>' +
          '<div class="selector-card-meta">' +
            '<span>⏱ ' + w.durationMinutes + ' min</span>' +
            '<span>🔥 ' + (w.estimatedCalories || '—') + ' cal</span>' +
            '<span>' + (w.exerciseCount || '—') + ' exercises</span>' +
          '</div></div>'
      }).join('')
      grid.querySelectorAll('.selector-card').forEach(function (card) {
        card.addEventListener('click', function () { startWorkout(this.dataset.id) })
      })
    })
}

function hideSelector() {
  document.getElementById('workout-selector').style.display  = 'none'
  document.getElementById('top-bar').style.display    = 'flex'
  document.getElementById('main-grid').style.display  = 'grid'
  document.getElementById('bottom-bar').style.display = 'flex'
}

function startWorkout(workoutId) {
  fetch('/api/fitness/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workoutId: workoutId })
  })
  .then(function (r) { return r.json() })
  .then(function (data) {
    if (data.error) { console.error('[fitness] start error:', data.error); return }
    hideSelector()
    currentState = data
    window._workoutExercises = null
    renderAll(data)
  })
}

// ── BUTTON HANDLERS ──

document.getElementById('btn-pause').addEventListener('click', function () {
  isPaused = !isPaused
  this.textContent = isPaused ? '▶' : '⏸'
  fetch('/api/fitness/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: isPaused ? 'pause' : 'resume' })
  })
})

document.getElementById('btn-next-set').addEventListener('click', function () {
  fetch('/api/fitness/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'skip' })
  })
})

document.getElementById('btn-next-exercise').addEventListener('click', function () {
  fetch('/api/fitness/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'skip' })
  })
})

document.getElementById('btn-skip').addEventListener('click', function () {
  fetch('/api/fitness/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'skip' })
  })
})

document.getElementById('rest-skip-btn').addEventListener('click', function () {
  fetch('/api/fitness/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'skip' })
  })
})

document.getElementById('exit-btn').addEventListener('click', function () {
  fetch('/api/fitness/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop' })
  }).then(function () { window.location.href = '/' })
})

// ── HELPERS ──

function formatTime(s) {
  if (s <= 0) return '0:00'
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

function formatElapsed(s) {
  if (!s || s <= 0) return '0h 0m'
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm'
}

// ── INIT ──

;(function init() {
  var selectMode = new URLSearchParams(window.location.search).get('select') === '1'
  fetch('/api/fitness/state')
    .then(function (r) { return r.json() })
    .then(function (data) {
      if (data.state === 'idle') {
        if (selectMode) showSelector()
        else window.location.href = '/'
        return
      }
      currentState = data
      renderAll(data)
    })
    .catch(function () {
      if (selectMode) showSelector()
      else window.location.href = '/'
    })
})()
