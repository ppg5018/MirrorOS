const fs   = require('fs')
const path = require('path')
const { calculateCalories, DEFAULT_WEIGHT_KG } = require('./calorie-calculator')
const exerciseLib = require('./exercise-library')
const history     = require('./history-tracker')

const WORKOUTS_DIR   = path.join(__dirname, '../../data/workouts')
const WARMUP_SECONDS = 15
const SECONDS_PER_REP = 3

class WorkoutEngine {
  constructor(io) {
    this.io = io
    this._reset()
  }

  _reset() {
    this.state = 'idle'
    this.workoutId = null
    this.workoutData = null
    this.currentExerciseIndex = 0
    this.currentSet = 1
    this.elapsedSeconds = 0
    this.restRemaining = 0
    this.caloriesBurned = 0
    this.userWeightKg = DEFAULT_WEIGHT_KG
    this.timer = null
    this.pausedState = null
    this.startedAt = null
    this.warmupRemaining = 0
    this.activeSecondsInSet = 0
  }

  start(workoutId, userWeightKg) {
    if (this.state !== 'idle') {
      throw new Error('Workout already in progress. Stop current workout first.')
    }

    const filePath = path.join(WORKOUTS_DIR, workoutId + '.json')
    if (!fs.existsSync(filePath)) {
      throw new Error('Workout not found: ' + workoutId)
    }

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    this.workoutData = exerciseLib.enrichWorkout(raw)
    this.workoutId = workoutId
    this.userWeightKg = userWeightKg || DEFAULT_WEIGHT_KG
    this.startedAt = new Date().toISOString()
    this.currentExerciseIndex = 0
    this.currentSet = 1
    this.elapsedSeconds = 0
    this.caloriesBurned = 0
    this.activeSecondsInSet = 0

    // Enter warmup
    this.state = 'warmup'
    this.warmupRemaining = WARMUP_SECONDS

    this._startTimer()
    this._emit('fitness:state', this.getState())
    this._emit('fitness:backlight', { color: 'red', mode: 'warmup' })

    console.log(`[workout] started: ${this.workoutData.name}`)
    return this.getState()
  }

  tick() {
    if (this.state === 'warmup') {
      this.warmupRemaining--
      if (this.warmupRemaining <= 0) {
        this.state = 'active'
        this.activeSecondsInSet = 0
        const ex = this._currentExercise()
        this._emit('fitness:next_exercise', {
          index: this.currentExerciseIndex,
          set: this.currentSet,
          exercise: ex,
          total: this.workoutData.exercises.length
        })
        this._emit('fitness:backlight', { color: 'green', mode: 'active' })
        this._emit('fitness:state', this.getState())
      }
    } else if (this.state === 'active') {
      this.elapsedSeconds++
      this.activeSecondsInSet++

      // Accumulate calories for this tick
      const entry = this.workoutData.exercises[this.currentExerciseIndex]
      const met = entry.metValue || 5.0
      this.caloriesBurned += calculateCalories(met, this.userWeightKg, 1)

      // Check if set duration reached (reps * seconds per rep)
      const targetSeconds = (entry.reps || 10) * SECONDS_PER_REP
      if (this.activeSecondsInSet >= targetSeconds) {
        this._enterRest()
      }
    } else if (this.state === 'rest') {
      this.restRemaining--
      if (this.restRemaining <= 0) {
        this._advance()
      }
    }

    this._emit('fitness:timer_tick', {
      elapsed: this.elapsedSeconds,
      restRemaining: this.restRemaining,
      warmupRemaining: this.warmupRemaining,
      calories: Math.round(this.caloriesBurned),
      state: this.state,
      currentExerciseIndex: this.currentExerciseIndex,
      currentSet: this.currentSet
    })
  }

  _enterRest() {
    const entry = this.workoutData.exercises[this.currentExerciseIndex]
    this.restRemaining = entry.restSeconds || 0

    if (this.restRemaining <= 0) {
      this._advance()
      return
    }

    this.state = 'rest'
    this._emit('fitness:rest_start', {
      duration: this.restRemaining,
      nextUp: this._peekNext()
    })
    this._emit('fitness:backlight', { color: 'blue', mode: 'rest' })
    this._emit('fitness:state', this.getState())
  }

  _advance() {
    const entry = this.workoutData.exercises[this.currentExerciseIndex]

    if (this.currentSet < (entry.sets || 1)) {
      // Next set of same exercise
      this.currentSet++
      this.state = 'active'
      this.activeSecondsInSet = 0
      this._emit('fitness:backlight', { color: 'green', mode: 'active' })
      this._emit('fitness:state', this.getState())
    } else if (this.currentExerciseIndex < this.workoutData.exercises.length - 1) {
      // Next exercise
      this.currentExerciseIndex++
      this.currentSet = 1
      this.state = 'active'
      this.activeSecondsInSet = 0
      const ex = this._currentExercise()
      this._emit('fitness:next_exercise', {
        index: this.currentExerciseIndex,
        set: this.currentSet,
        exercise: ex,
        total: this.workoutData.exercises.length
      })
      this._emit('fitness:backlight', { color: 'green', mode: 'active' })
      this._emit('fitness:state', this.getState())
    } else {
      // All exercises done
      this._complete()
    }
  }

  pause() {
    if (!['warmup', 'active', 'rest'].includes(this.state)) {
      throw new Error('Cannot pause — workout is ' + this.state)
    }
    this.pausedState = this.state
    this.state = 'paused'
    this._stopTimer()
    this._emit('fitness:state', this.getState())
    console.log('[workout] paused')
  }

  resume() {
    if (this.state !== 'paused') {
      throw new Error('Workout is not paused')
    }
    this.state = this.pausedState
    this.pausedState = null
    this._startTimer()

    const colors = { warmup: 'red', active: 'green', rest: 'blue' }
    this._emit('fitness:backlight', { color: colors[this.state] || 'green', mode: this.state })
    this._emit('fitness:state', this.getState())
    console.log('[workout] resumed')
  }

  skip() {
    if (!['active', 'rest', 'warmup'].includes(this.state)) {
      throw new Error('Cannot skip — workout is ' + this.state)
    }

    if (this.state === 'warmup') {
      this.warmupRemaining = 0
      this.state = 'active'
      this.activeSecondsInSet = 0
      const ex = this._currentExercise()
      this._emit('fitness:next_exercise', {
        index: this.currentExerciseIndex,
        set: this.currentSet,
        exercise: ex,
        total: this.workoutData.exercises.length
      })
      this._emit('fitness:backlight', { color: 'green', mode: 'active' })
      this._emit('fitness:state', this.getState())
      return
    }

    // Skip current set — advance to next set or next exercise
    this.restRemaining = 0
    this._advance()
  }

  stop() {
    if (this.state === 'idle') {
      throw new Error('No workout in progress')
    }
    this._complete(true)
  }

  _complete(early = false) {
    this._stopTimer()
    this.state = 'complete'

    const session = {
      workoutId:          this.workoutId,
      workoutName:        this.workoutData.name,
      startedAt:          this.startedAt,
      completedAt:        new Date().toISOString(),
      durationSeconds:    this.elapsedSeconds,
      caloriesBurned:     Math.round(this.caloriesBurned),
      exercisesCompleted: early ? this.currentExerciseIndex : this.workoutData.exercises.length,
      totalExercises:     this.workoutData.exercises.length,
      early
    }

    history.saveSession(session)

    this._emit('fitness:complete', session)
    this._emit('fitness:backlight', { color: 'off', mode: 'complete' })
    this._emit('fitness:state', this.getState())

    console.log(`[workout] ${early ? 'stopped early' : 'completed'}: ${session.workoutName} — ${session.caloriesBurned} cal`)

    // Auto-reset to idle after 5 seconds
    setTimeout(() => {
      this._reset()
      this._emit('fitness:state', this.getState())
    }, 5000)
  }

  getState() {
    const base = {
      state:                this.state,
      workoutId:            this.workoutId,
      workoutName:          this.workoutData?.name || null,
      currentExerciseIndex: this.currentExerciseIndex,
      currentSet:           this.currentSet,
      totalExercises:       this.workoutData?.exercises?.length || 0,
      elapsedSeconds:       this.elapsedSeconds,
      restRemaining:        this.restRemaining,
      warmupRemaining:      this.warmupRemaining,
      caloriesBurned:       Math.round(this.caloriesBurned),
      startedAt:            this.startedAt
    }

    if (this.workoutData && this.workoutData.exercises[this.currentExerciseIndex]) {
      base.currentExercise = this.workoutData.exercises[this.currentExerciseIndex]
    }

    return base
  }

  _currentExercise() {
    if (!this.workoutData) return null
    return this.workoutData.exercises[this.currentExerciseIndex] || null
  }

  _peekNext() {
    if (!this.workoutData) return null
    const entry = this.workoutData.exercises[this.currentExerciseIndex]
    if (this.currentSet < (entry.sets || 1)) {
      return { type: 'next_set', set: this.currentSet + 1, exercise: entry }
    }
    const next = this.workoutData.exercises[this.currentExerciseIndex + 1]
    return next ? { type: 'next_exercise', exercise: next } : { type: 'complete' }
  }

  _startTimer() {
    this._stopTimer()
    this.timer = setInterval(() => this.tick(), 1000)
  }

  _stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  _emit(event, data) {
    if (this.io) this.io.emit(event, data)
  }
}

module.exports = WorkoutEngine
