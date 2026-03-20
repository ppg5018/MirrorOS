/* ============================================
   MirrorOS — backlight.js
   LED backlight API calls → POST /api/backlight
   Real WS2812B Python control wired in Day 9
   ============================================ */

const BACKLIGHT_MODES = ['warm', 'cool', 'red', 'green', 'blue', 'music_sync', 'off', 'night', 'party']

async function setBacklight(mode, brightness = 80) {
  if (!BACKLIGHT_MODES.includes(mode)) {
    console.warn('[backlight] unknown mode:', mode)
    return
  }

  try {
    const res = await fetch('/api/backlight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, brightness })
    })
    const data = await res.json()
    console.log(`[backlight] set → mode=${data.mode}, brightness=${data.brightness}`)
    return data
  } catch (err) {
    console.error('[backlight] error:', err)
  }
}

// Convenience shortcuts
const backlight = {
  warm:      (b) => setBacklight('warm',       b ?? 80),
  cool:      (b) => setBacklight('cool',       b ?? 80),
  night:     (b) => setBacklight('night',      b ?? 20),
  off:       ()  => setBacklight('off',        0),
  party:     (b) => setBacklight('party',      b ?? 100),
  musicSync: (b) => setBacklight('music_sync', b ?? 80),
  set:       setBacklight
}
