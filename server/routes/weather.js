const express = require('express')
const router = express.Router()
const fetch = require('node-fetch')

const MOCK = {
  temp: 28,
  condition: 'Partly Cloudy',
  city: 'Pune',
  humidity: 65,
  icon: '⛅',
  forecast: [
    { day: 'MON', temp: 31, condition: 'Clear', icon: '🌤' },
    { day: 'TUE', temp: 29, condition: 'Clouds', icon: '⛅' },
    { day: 'WED', temp: 33, condition: 'Clear', icon: '☀️' },
    { day: 'THU', temp: 27, condition: 'Rain', icon: '🌧' }
  ]
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

    const data = {
      temp: Math.round(current.main.temp),
      weatherMain: current.weather[0]?.main,
      condition: current.weather[0]?.description
        ? current.weather[0].description.charAt(0).toUpperCase() + current.weather[0].description.slice(1)
        : 'Clear',
      city: current.name || city,
      humidity: current.main.humidity,
      icon: getIcon(current.weather[0]?.description),
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
