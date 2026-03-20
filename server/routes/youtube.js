const express       = require('express')
const { google }    = require('googleapis')
const { getAuthClient } = require('../google-auth')
const router        = express.Router()

const SEARCH_TTL = 30 * 60 * 1000  // 30 min
const TREND_TTL  = 60 * 60 * 1000  // 1 hour

let searchCache   = {}    // query → { results, fetchedAt }
let trendingCache = null  // { results, fetchedAt }

// Returns an authenticated YouTube API client, or null if not connected
function getYouTube() {
  const auth = getAuthClient()
  if (!auth) return null
  return google.youtube({ version: 'v3', auth })
}

// Shared mock fallback for when OAuth isn't set up yet
// jNQXAC9IVRw = "Me at the zoo" (first YouTube video, always embeddable)
const MOCK_RESULTS = [
  { videoId: 'jNQXAC9IVRw', title: 'Demo Video — sign in with Google to search YouTube', channel: 'MirrorOS Demo', thumbnail: '', publishedAt: '' }
]

function mapSearchItems(items) {
  return (items || [])
    .filter(item => item.id?.videoId)  // skip non-video results
    .map(item => ({
      videoId:     item.id.videoId,
      title:       item.snippet.title,
      channel:     item.snippet.channelTitle,
      thumbnail:   item.snippet.thumbnails?.medium?.url || '',
      publishedAt: item.snippet.publishedAt
    }))
}

async function ytSearch(yt, query) {
  const res = await yt.search.list({
    part:              ['snippet'],
    q:                 query,
    type:              ['video'],
    maxResults:        5,
    regionCode:        'IN',
    relevanceLanguage: 'en',
    safeSearch:        'moderate'
  })
  return mapSearchItems(res.data.items)
}

// GET /api/youtube/search?q=<query>
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'q is required' })

  const cached = searchCache[q]
  if (cached && Date.now() - cached.fetchedAt < SEARCH_TTL) {
    return res.json({ results: cached.results, query: q, cached: true, source: 'google_account' })
  }

  const yt = getYouTube()
  if (!yt) {
    return res.json({ results: MOCK_RESULTS, query: q, source: 'mock' })
  }

  try {
    const results = await ytSearch(yt, q)
    searchCache[q] = { results, fetchedAt: Date.now() }
    res.json({ results, query: q, source: 'google_account' })
  } catch (err) {
    console.error('[youtube] search error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/youtube/trending
router.get('/trending', async (req, res) => {
  if (trendingCache && Date.now() - trendingCache.fetchedAt < TREND_TTL) {
    return res.json({ results: trendingCache.results, cached: true, source: 'google_account' })
  }

  const yt = getYouTube()
  if (!yt) {
    return res.json({ results: MOCK_RESULTS, source: 'mock' })
  }

  try {
    const results = await ytSearch(yt, 'India trending music today')
    trendingCache = { results, fetchedAt: Date.now() }
    res.json({ results, source: 'google_account' })
  } catch (err) {
    console.error('[youtube] trending error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/youtube/history
// Returns activities from the user's YouTube account.
// Note: YouTube Data API v3 removed direct watch history access for privacy.
// This returns the user's recent channel activities (uploads, likes) instead.
// For full history, the History playlist (playlistId: "HL") is used.
router.get('/history', async (req, res) => {
  const yt = getYouTube()
  if (!yt) return res.json({ results: [], source: 'mock', note: 'Not connected to Google account' })

  try {
    // Try the History playlist first (playlistId "HL" = watch history)
    const plRes = await yt.playlistItems.list({
      part:       ['snippet', 'contentDetails'],
      playlistId: 'HL',
      maxResults: 10
    }).catch(() => null)

    if (plRes && plRes.data.items?.length) {
      const results = (plRes.data.items || []).map(item => ({
        videoId:     item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || '',
        title:       item.snippet?.title || '',
        channel:     item.snippet?.videoOwnerChannelTitle || '',
        thumbnail:   item.snippet?.thumbnails?.medium?.url || '',
        publishedAt: item.snippet?.publishedAt || ''
      })).filter(v => v.videoId)

      return res.json({ results, source: 'watch_history' })
    }

    // Fallback: recent activities
    const actRes = await yt.activities.list({
      part:       ['snippet', 'contentDetails'],
      mine:       true,
      maxResults: 10
    })

    const results = (actRes.data.items || [])
      .filter(item => item.contentDetails?.upload?.videoId)
      .map(item => ({
        videoId:     item.contentDetails.upload.videoId,
        title:       item.snippet.title,
        channel:     item.snippet.channelTitle,
        thumbnail:   item.snippet.thumbnails?.medium?.url || '',
        publishedAt: item.snippet.publishedAt
      }))

    res.json({ results, source: 'activities' })
  } catch (err) {
    console.error('[youtube] history error:', err.message)
    // History paused or access denied — return graceful empty
    res.json({ results: [], source: 'unavailable', note: 'Watch history may be paused in Google settings.' })
  }
})

// GET /api/youtube/subscriptions
router.get('/subscriptions', async (req, res) => {
  const yt = getYouTube()
  if (!yt) return res.json({ subscriptions: [], source: 'mock' })

  try {
    const subRes = await yt.subscriptions.list({
      part:      ['snippet'],
      mine:      true,
      maxResults: 10,
      order:     'alphabetical'
    })

    const subscriptions = (subRes.data.items || []).map(item => ({
      channelId:   item.snippet.resourceId?.channelId || '',
      channelName: item.snippet.title,
      thumbnail:   item.snippet.thumbnails?.default?.url || ''
    }))

    res.json({ subscriptions, source: 'google_account' })
  } catch (err) {
    console.error('[youtube] subscriptions error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/youtube/status
router.get('/status', (req, res) => {
  const yt = getYouTube()
  res.json({ connected: !!yt, source: 'google_oauth' })
})

module.exports = router
