const express = require('express')
const router = express.Router()
const fetch = require('node-fetch')

let newsCache = { headlines: [], fetchedAt: 0 }
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

const MOCK_HEADLINES = [
  { title: "India GDP grows 7.2% in Q3, beats analyst forecasts", source: "Economic Times" },
  { title: "ISRO successfully tests Gaganyaan crew module", source: "NDTV" },
  { title: "Mumbai rains: IMD issues orange alert for weekend", source: "Times of India" }
]

router.get('/', async (req, res) => {
  const apiKey = process.env.NEWSAPI_KEY

  if (Date.now() - newsCache.fetchedAt < CACHE_TTL && newsCache.headlines.length > 0) {
    return res.json({ headlines: newsCache.headlines, cached: true })
  }

  if (!apiKey) {
    console.log('[news] no API key — returning mock data')
    return res.json({ headlines: MOCK_HEADLINES, cached: false })
  }

  try {
    const url = `https://newsapi.org/v2/top-headlines?country=in&pageSize=5&apiKey=${apiKey}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`NewsAPI returned ${response.status}`)
    }

    const data = await response.json()
    
    if (data.articles && data.articles.length > 0) {
      const headlines = data.articles.map(a => {
        // Strip "- Source Name" suffix
        const rawTitle = a.title || ''
        const title = rawTitle.replace(/ - [^-]+$/, '').trim()
        const source = a.source.name || ''
        return { title, source }
      })

      newsCache = { headlines, fetchedAt: Date.now() }
      console.log('[news] fetched live headlines from NewsAPI')
      return res.json({ headlines, cached: false })
    }

    throw new Error('No articles found in response')
  } catch (err) {
    console.error('[news] fetch failed:', err.message, '— returning mock')
    res.json({ headlines: MOCK_HEADLINES, cached: false })
  }
})

module.exports = router
