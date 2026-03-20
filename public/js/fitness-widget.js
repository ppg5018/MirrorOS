/* MirrorOS — Fitness History Widget (main mirror dashboard) */
;(function () {
  function load() {
    Promise.all([
      fetch('/api/fitness/stats').then(function (r) { return r.json() }),
      fetch('/api/fitness/stats/weekly?days=7').then(function (r) { return r.json() })
    ])
    .then(function (res) { render(res[0], res[1]) })
    .catch(function () { /* silently skip if no data */ })
  }

  function render(stats, weekly) {
    var widget = document.getElementById('fitness-history-widget')
    if (!widget) return

    var weekWorkouts = weekly.reduce(function (s, d) { return s + (d.workouts || 0) }, 0)
    var weekCalories = weekly.reduce(function (s, d) { return s + (d.calories || 0) }, 0)
    var maxMins      = Math.max.apply(null, weekly.map(function (d) { return d.minutes || 0 })) || 1
    var today        = new Date().toISOString().slice(0, 10)

    var barsHtml = weekly.map(function (day) {
      var h       = Math.max(3, Math.round((day.minutes / maxMins) * 48))
      var isToday = day.date === today
      var active  = day.workouts > 0
      var color   = isToday && active ? '#7FFFD4' : active ? '#5EE8C0' : 'rgba(255,255,255,0.07)'
      return '<div style="width:12px;height:' + h + 'px;background:' + color +
             ';border-radius:2px;flex-shrink:0"></div>'
    }).join('')

    widget.innerHTML =
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:8px;letter-spacing:2px;' +
        'color:#5EE8C0;margin-bottom:10px">FITNESS</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span style="font-size:16px">🔥</span>' +
        '<span style="font-family:\'Space Grotesk\',sans-serif;font-size:18px;font-weight:300;color:#fff">' +
          (stats.streak || 0) + ' day streak</span>' +
      '</div>' +
      '<div style="font-size:11px;color:#666;margin-bottom:12px">' +
        weekWorkouts + ' workouts · ' + weekCalories + ' cal this week</div>' +
      '<div style="display:flex;align-items:flex-end;gap:4px;height:52px">' + barsHtml + '</div>'
  }

  document.addEventListener('DOMContentLoaded', function () {
    load()
    setInterval(load, 5 * 60 * 1000)
  })
})()
