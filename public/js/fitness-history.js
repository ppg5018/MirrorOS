/* MirrorOS — Fitness History Page */
;(function () {
  function init() {
    Promise.all([
      fetch('/api/fitness/stats').then(function (r) { return r.json() }),
      fetch('/api/fitness/history?limit=100').then(function (r) { return r.json() }),
      fetch('/api/fitness/stats/weekly?days=56').then(function (r) { return r.json() })
    ])
    .then(function (results) {
      renderStats(results[0])
      renderWeeklyChart(results[2])
      renderSessions(results[1])
    })
    .catch(function (err) { console.error('[history] load error:', err) })
  }

  function renderStats(stats) {
    var el = document.getElementById('history-stats-row')
    if (!el) return
    var items = [
      { value: stats.totalWorkouts || 0, label: 'WORKOUTS',   color: '#fff' },
      { value: stats.totalMinutes  || 0, label: 'MINUTES',    color: '#5EE8C0' },
      { value: stats.totalCalories || 0, label: 'CALORIES',   color: '#FF3C00' },
      { value: (stats.streak || 0) + ' 🔥', label: 'DAY STREAK', color: '#5EE8C0' }
    ]
    el.innerHTML = items.map(function (s) {
      return '<div class="history-stat-card">' +
        '<div class="history-stat-value" style="color:' + s.color + '">' + s.value + '</div>' +
        '<div class="history-stat-label">' + s.label + '</div>' +
      '</div>'
    }).join('')
  }

  function renderWeeklyChart(days) {
    // days = 56 daily entries; group into 8 weeks newest-first-reversed
    var weeks = []
    for (var i = 0; i < 56; i += 7) {
      var slice = days.slice(i, i + 7)
      var cal   = slice.reduce(function (s, d) { return s + (d.calories || 0) }, 0)
      var work  = slice.reduce(function (s, d) { return s + (d.workouts || 0) }, 0)
      var lbl   = slice[0] ? slice[0].date.slice(5).replace('-', '/') : ''
      weeks.push({ calories: cal, workouts: work, label: lbl })
    }

    var maxCal = Math.max.apply(null, weeks.map(function (w) { return w.calories })) || 1
    var barsEl = document.getElementById('weekly-bars')
    if (!barsEl) return

    barsEl.innerHTML = weeks.map(function (week) {
      var h    = Math.max(4, Math.round((week.calories / maxCal) * 180))
      var color = week.workouts > 0 ? '#5EE8C0' : 'rgba(255,255,255,0.06)'
      return '<div class="weekly-bar-col">' +
        '<div class="weekly-bar-fill" style="height:' + h + 'px;background:' + color + '"></div>' +
        '<div class="weekly-bar-label">' + week.label + '</div>' +
      '</div>'
    }).join('')
  }

  function renderSessions(sessions) {
    var el = document.getElementById('sessions-list')
    if (!el) return
    if (!sessions || !sessions.length) {
      el.innerHTML = '<div class="no-sessions">No workouts yet. Start your first workout!</div>'
      return
    }
    el.innerHTML = sessions.map(function (s) {
      var date = new Date(s.completedAt || s.startedAt)
      var dateStr = date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
      var mins    = Math.round((s.durationSeconds || 0) / 60)
      var done    = !s.early && (s.exercisesCompleted || 0) >= (s.totalExercises || 1)
      var pct     = Math.round(((s.exercisesCompleted || 0) / Math.max(s.totalExercises || 1, 1)) * 100)
      return '<div class="session-row">' +
        '<div class="session-date">' + dateStr + '</div>' +
        '<div class="session-name">' + (s.workoutName || '—') + '</div>' +
        '<div class="session-meta">' +
          '<span>' + mins + ' min</span><span>·</span>' +
          '<span class="session-cal">' + (s.caloriesBurned || 0) + ' cal</span>' +
        '</div>' +
        '<div class="session-badge ' + (done ? 'complete' : 'partial') + '">' +
          (done ? '✓ DONE' : pct + '% done') +
        '</div>' +
      '</div>'
    }).join('')
  }

  init()
})()
