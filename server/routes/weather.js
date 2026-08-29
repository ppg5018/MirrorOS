const express = require('express')
const router = express.Router()
const fetch = require('node-fetch')

const MOCK = {
  temp: 18,
  feelsLike: 16,
  high: 24,
  low: 12,
  weatherMain: 'Clear',
  condition: 'Clear',
  city: 'Pune',
  humidity: 65,
  icon: '☀️',
  // Hourly strip (matches the Mira design)
  hourly: [
    { label: '7a',  temp: 15, condition: 'Clear' },
    { label: '9a',  temp: 19, condition: 'Clear' },
    { label: '12p', temp: 23, condition: 'Clear' },
    { label: '3p',  temp: 24, condition: 'Clouds' },
    { label: '6p',  temp: 20, condition: 'Clouds' }
  ],
  forecast: [
    { day: 'MON', temp: 31, condition: 'Clear', icon: '🌤' },
    { day: 'TUE', temp: 29, condition: 'Clouds', icon: '⛅' },
    { day: 'WED', temp: 33, condition: 'Clear', icon: '☀️' },
    { day: 'THU', temp: 27, condition: 'Rain', icon: '🌧' }
  ]
}

// Format an hour (0-23) as the compact label the design uses: "7a", "12p", "3p".
function hourLabel(h) {
  const period = h < 12 ? 'a' : 'p'
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return h12 + period
}

let cache = { data: null, ts: 0 }
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes — Pi-friendly, weather barely changes

const CONDITION_ICONS = {
  'clear sky': '☀️', 'few clouds': '🌤', 'scattered clouds': '⛅',
  'broken clouds': '☁️', 'shower rain': '🌦', 'rain': '🌧',
  'thunderstorm': '⛈', 'snow': '🌨', 'mist': '🌫',
  'overcast clouds': '☁️', 'light rain': '🌦', 'moderate rain': '🌧',
  'haze': '🌫', 'smoke': '🌫', 'dust': '🌫', 'fog': '🌫'
}

function getIcon(desc) {
  if (!desc) return '⛅'
  const lower = desc.toLowerCase()
  for (const [key, icon] of Object.entries(CONDITION_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return '⛅'
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

router.get('/', async (req, res) => {
  const apiKey = process.env.OPENWEATHER_API_KEY
  const city = process.env.OPENWEATHER_CITY || 'Pune'

  // Return cached data if fresh
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return res.json(cache.data)
  }

  if (!apiKey) {
    console.log('[weather] no API key — returning mock data')
    return res.json(MOCK)
  }

  try {
    // Current weather
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&cnt=32`

    const [currentRes, forecastRes] = await Promise.all([
      fetch(currentUrl),
      fetch(forecastUrl)
    ])

    if (!currentRes.ok || !forecastRes.ok) {
      throw new Error(`API error: ${currentRes.status} / ${forecastRes.status}`)
    }

    const current = await currentRes.json()
    const forecastData = await forecastRes.json()

    // Build 4-day forecast from noon readings
    const seen = new Set()
    const forecast = []
    for (const item of forecastData.list) {
      const date = new Date(item.dt * 1000)
      const dayKey = date.toDateString()
      const hour = date.getHours()
      if (!seen.has(dayKey) && hour >= 11 && hour <= 14) {
        seen.add(dayKey)
        forecast.push({
          day: DAY_NAMES[date.getDay()],
          temp: Math.round(item.main.temp),
          condition: item.weather[0]?.main,
          icon: getIcon(item.weather[0]?.description)
        })
        if (forecast.length === 4) break
      }
    }

    // Fallback if noon readings insufficient
    if (forecast.length < 4) {
      const seenFallback = new Set()
      for (const item of forecastData.list) {
        const date = new Date(item.dt * 1000)
        const dayKey = date.toDateString()
        if (!seenFallback.has(dayKey)) {
          seenFallback.add(dayKey)
          if (!forecast.find(f => f.day === DAY_NAMES[date.getDay()])) {
            forecast.push({
              day: DAY_NAMES[date.getDay()],
              temp: Math.round(item.main.temp),
              condition: item.weather[0]?.main,
              icon: getIcon(item.weather[0]?.description)
            })
          }
          if (forecast.length === 4) break
        }
      }
    }

    // Hourly strip — next 5 three-hourly readings, labelled like the design (9a, 12p…)
    const hourly = forecastData.list.slice(0, 5).map(item => {
      const date = new Date(item.dt * 1000)
      return {
        label: hourLabel(date.getHours()),
        temp: Math.round(item.main.temp),
        condition: item.weather[0]?.main
      }
    })

    // Today's high / low — from the current reading plus every forecast slot
    // that falls on today. Falls back to the current reading's own min/max.
    const todayKey = new Date().toDateString()
    let high = current.main.temp_max
    let low  = current.main.temp_min
    for (const item of forecastData.list) {
      if (new Date(item.dt * 1000).toDateString() !== todayKey) continue
      if (item.main.temp_max > high) high = item.main.temp_max
      if (item.main.temp_min < low)  low  = item.main.temp_min
    }

    const data = {
      temp: Math.round(current.main.temp),
      feelsLike: Math.round(current.main.feels_like),
      high: Math.round(high),
      low: Math.round(low),
      weatherMain: current.weather[0]?.main,
      condition: current.weather[0]?.description
        ? current.weather[0].description.charAt(0).toUpperCase() + current.weather[0].description.slice(1)
        : 'Clear',
      city: current.name || city,
      humidity: current.main.humidity,
      icon: getIcon(current.weather[0]?.description),
      hourly,
      forecast: forecast.slice(0, 4)
    }

    cache = { data, ts: Date.now() }
    console.log(`[weather] fetched live data for ${city}: ${data.temp}°C, ${data.condition}`)
    res.json(data)
  } catch (err) {
    console.error('[weather] fetch failed:', err.message, '— returning mock')
    res.json(MOCK)
  }
})

module.exports = router
