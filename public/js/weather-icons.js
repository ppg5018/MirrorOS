/* ============================================
   MirrorOS — weather-icons.js
   Figma-exact thin-stroke weather SVG icons
   ============================================ */

function getWeatherIcon(condition, size = 64) {
  if (!condition) condition = 'default'
  const cond = condition.toLowerCase()

  // For the main weather icon (size ~72), use the "large" partly-cloudy variant
  // For forecast icons (size ~36), use the small variants
  const isLarge = size > 40

  // ── Clear / Sunny ──
  if (cond.includes('clear') || cond.includes('sunny')) {
    const s = size
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="rgba(255,210,80,1.0)" stroke-width="1.1" stroke-linecap="round">
      <circle cx="12" cy="12" r="4.5"/>
      <line x1="12" y1="2" x2="12" y2="4.5"/>
      <line x1="12" y1="19.5" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="4.5" y2="12"/>
      <line x1="19.5" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="4.93" x2="6.64" y2="6.64"/>
      <line x1="17.36" y1="17.36" x2="19.07" y2="19.07"/>
      <line x1="4.93" y1="19.07" x2="6.64" y2="17.36"/>
      <line x1="17.36" y1="6.64" x2="19.07" y2="4.93"/>
    </svg>`
  }

  // ── Partly Cloudy (check before pure cloud) ──
  if (cond.includes('partly') || (cond.includes('cloud') && (cond.includes('sun') || cond.includes('few') || cond.includes('scatter')))) {
    if (isLarge) {
      // Figma PartlyCloudyLargeIcon — 72.8×52
      const w = Math.round(size * 1.4)
      const h = size
      return `<svg width="${w}" height="${h}" viewBox="0 0 70 50" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="26" cy="18" r="9" stroke="rgba(255,210,80,0.95)" stroke-width="1.2"/>
        <line x1="26" y1="4" x2="26" y2="8" stroke="rgba(255,210,80,0.75)" stroke-width="1.1"/>
        <line x1="14" y1="18" x2="18" y2="18" stroke="rgba(255,210,80,0.75)" stroke-width="1.1"/>
        <line x1="17" y1="9" x2="20" y2="12" stroke="rgba(255,210,80,0.75)" stroke-width="1.1"/>
        <line x1="35" y1="9" x2="32" y2="12" stroke="rgba(255,210,80,0.75)" stroke-width="1.1"/>
        <path d="M20 36 a11 11 0 0 1 0-22 a9 9 0 0 1 17 4 a8 8 0 0 1 1 16 Z" stroke="rgba(255,255,255,0.85)" stroke-width="1.2"/>
      </svg>`
    } else {
      // Figma PartlyCloudyIcon — small
      const w = Math.round(size * 1.4)
      const h = size
      return `<svg width="${w}" height="${h}" viewBox="0 0 32 22" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="13" cy="9" r="4" stroke="rgba(255,210,80,0.95)" stroke-width="1.1"/>
        <line x1="13" y1="3" x2="13" y2="5" stroke="rgba(255,210,80,0.80)" stroke-width="1"/>
        <line x1="7" y1="9" x2="9" y2="9" stroke="rgba(255,210,80,0.80)" stroke-width="1"/>
        <line x1="8.5" y1="4.5" x2="10" y2="6" stroke="rgba(255,210,80,0.80)" stroke-width="1"/>
        <path d="M10 17 a5 5 0 0 1 0-10 a4 4 0 0 1 7.5 2 a3.5 3.5 0 0 1 .5 7 Z" stroke="rgba(255,255,255,0.85)" stroke-width="1.1"/>
      </svg>`
    }
  }

  // ── Cloudy / Overcast ──
  if (cond.includes('cloud') || cond.includes('overcast')) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 10a6 6 0 0 0-10.9-3.4A4 4 0 1 0 7 18h11a3 3 0 0 0 0-8Z"/>
    </svg>`
  }

  // ── Rain / Shower / Drizzle ──
  if (cond.includes('rain') || cond.includes('shower') || cond.includes('drizzle')) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="rgba(130,200,255,0.90)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 13a6 6 0 0 0-10.3-4.2A4 4 0 1 0 5 17h11a3 3 0 0 0 0-4Z"/>
      <line x1="8" y1="20" x2="8" y2="22"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="16" y1="20" x2="16" y2="22"/>
    </svg>`
  }

  // ── Thunderstorm ──
  if (cond.includes('thunder') || cond.includes('storm')) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 10a6 6 0 0 0-10.9-3.4A4 4 0 1 0 7 18h11a3 3 0 0 0 0-8Z" stroke="rgba(255,255,255,0.65)" stroke-width="1.2"/>
      <polyline points="13,16 11,20 14,20 12,24" stroke="rgba(255,210,80,0.95)" stroke-width="1.3" fill="none"/>
    </svg>`
  }

  // ── Snow ──
  if (cond.includes('snow')) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="rgba(200,220,255,0.90)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 10a6 6 0 0 0-10.9-3.4A4 4 0 1 0 7 18h11a3 3 0 0 0 0-8Z"/>
      <line x1="8" y1="20" x2="8" y2="20.5"/>
      <line x1="12" y1="21" x2="12" y2="21.5"/>
      <line x1="16" y1="20" x2="16" y2="20.5"/>
    </svg>`
  }

  // ── Mist / Haze / Fog ──
  if (cond.includes('mist') || cond.includes('haze') || cond.includes('fog')) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.2" stroke-linecap="round">
      <line x1="4" y1="8" x2="20" y2="8"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="6" y1="16" x2="18" y2="16"/>
      <line x1="3" y1="20" x2="21" y2="20"/>
    </svg>`
  }

  // ── Default ──
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.40)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 10a6 6 0 0 0-10.9-3.4A4 4 0 1 0 7 18h11a3 3 0 0 0 0-8Z"/>
  </svg>`
}

// Make accessible globally
if (typeof window !== 'undefined') {
  window.getWeatherIcon = getWeatherIcon
}
