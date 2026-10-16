import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import pool from './db.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const commonsImageCache = new Map()
const wikipediaImageCache = new Map()
const wikidataImageCache = new Map()

const externalPlacesCache = new Map()
const EXTERNAL_PLACES_CACHE_TTL = 30 * 60 * 1000

let lastCommonsRequestTime = 0
let commonsRequestQueue = Promise.resolve()
let commonsRateLimitedUntil = 0
let openTripMapRateLimitedUntil = 0

function waitForCommonsRateLimit() {
  const wait = commonsRequestQueue.then(async () => {
    if (Date.now() < commonsRateLimitedUntil) return false

    const minimumDelay = 1500
    const elapsed = Date.now() - lastCommonsRequestTime

    if (elapsed < minimumDelay) {
      await new Promise((resolve) =>
        setTimeout(resolve, minimumDelay - elapsed),
      )
    }

    lastCommonsRequestTime = Date.now()
    return true
  })

  commonsRequestQueue = wait.catch(() => false)
  return wait
}

async function findWikidataImage(wikidataId) {
  if (!wikidataId || !/^Q\d+$/.test(wikidataId)) return null

  if (wikidataImageCache.has(wikidataId)) {
    return wikidataImageCache.get(wikidataId)
  }

  try {
    const response = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`,
      {
        headers: {
          'User-Agent': 'TripWiseTravelPlanner/1.0 (student project)',
        },
        signal: AbortSignal.timeout(6000),
      },
    )

    if (!response.ok) return null

    const result = await response.json()
    const filename =
      result.entities?.[wikidataId]?.claims?.P18?.[0]
        ?.mainsnak?.datavalue?.value

    if (typeof filename !== 'string' || !filename.trim()) {
      wikidataImageCache.set(wikidataId, null)
      return null
    }

    const imageUrl = new URL(
      `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`,
    )

    imageUrl.searchParams.set('width', '500')

    wikidataImageCache.set(wikidataId, imageUrl.toString())
    return imageUrl.toString()
  } catch (error) {
    console.warn('[Wikidata] Image lookup failed:', error.message)
    return null
  }
}

async function findWikipediaImage(wikipediaUrl) {
  if (!wikipediaUrl) return null

  try {
    const articleUrl = new URL(wikipediaUrl)

    if (articleUrl.hostname !== 'en.wikipedia.org') return null

    const title = decodeURIComponent(
      articleUrl.pathname.replace(/^\/wiki\//, ''),
    )

    if (!title) return null

    const cacheKey = title.toLowerCase()

    if (wikipediaImageCache.has(cacheKey)) {
      return wikipediaImageCache.get(cacheKey)
    }

    const summaryUrl = new URL(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    )

    const response = await fetch(summaryUrl, {
      headers: {
        'User-Agent': 'TripWiseTravelPlanner/1.0 (student project)',
      },
      signal: AbortSignal.timeout(6000),
    })

    if (!response.ok) return null

    const article = await response.json()

    if (article.type === 'disambiguation') {
      wikipediaImageCache.set(cacheKey, null)
      return null
    }

    const imageUrl =
      article.originalimage?.source ||
      article.thumbnail?.source ||
      null

    if (
      !imageUrl ||
      !/^https:\/\/upload\.wikimedia\.org\//.test(imageUrl)
    ) {
      wikipediaImageCache.set(cacheKey, null)
      return null
    }

    wikipediaImageCache.set(cacheKey, imageUrl)
    return imageUrl
  } catch (error) {
    console.warn('[Wikipedia] Image lookup failed:', error.message)
    return null
  }
}

async function findCommonsImage(placeName, cityName) {
  const cacheKey = `${placeName}|${cityName}`.toLowerCase()

  if (commonsImageCache.has(cacheKey)) {
    return commonsImageCache.get(cacheKey)
  }

  const normalize = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const ignoredWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'of', 'in', 'at',
    'street', 'road', 'building', 'historic', 'place',
    'church', 'mosque', 'temple', 'temples', 'statue',
    'city', 'india', 'csi', 'near', 'de', 'du', 'des',
    'la', 'le', 'les', 'un', 'une', 'aux', 'saint', 'ste',
    'monument', 'memorial', 'museum', 'park', 'garden',
  ])

  const importantWords = normalize(placeName)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !ignoredWords.has(word))

  if (!importantWords.length) return null

  const normalizedPlace = normalize(placeName)
  const normalizedCity = normalize(cityName)

  const queries = [
    `"${placeName}" "${cityName}"`,
    `"${placeName}"`,
  ]

  const locationMarkers = [
    'westminster', 'london', 'paris', 'chicago', 'illinois',
    'new york', 'los angeles', 'california', 'texas', 'florida',
    'england', 'scotland', 'wales', 'australia', 'canada',
    'new delhi', 'mumbai', 'kolkata', 'bengaluru',
    'hyderabad', 'coimbatore', 'madurai', 'tiruchirappalli',
    'vellore',
  ].map(normalize)

  const requiresCityMatch = [
    'king george v statue',
    'the stirrupless majesty',
    'Chennai Fort Museum',
  ].map(normalize).includes(normalizedPlace)

  try {
    for (const query of [...new Set(queries)]) {
      if (!(await waitForCommonsRateLimit())) return null

      const searchUrl = new URL(
        'https://commons.wikimedia.org/w/api.php',
      )

      searchUrl.search = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrnamespace: '6',
        gsrlimit: '30',
        prop: 'imageinfo',
        iiprop: 'url|mime',
        iiurlwidth: '500',
        format: 'json',
      }).toString()

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'TripWiseTravelPlanner/1.0 (student project)',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (response.status === 429) {
        commonsRateLimitedUntil = Date.now() + 60_000
        return null
      }

      if (!response.ok) continue

      const result = await response.json()
      const pages = Object.values(result.query?.pages || {})

      const candidates = pages.map((page) => {
        const info = page.imageinfo?.[0]
        const rawTitle = String(page.title || '')
        const title = normalize(rawTitle)
        const mime = info?.thumbmime || info?.mime || ''

        if (
          !info?.thumburl ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(mime) ||
          !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(
            info.thumburl,
          )
        ) {
          return null
        }

        const filename = title.replace(
          /\.(jpg|jpeg|png|webp|gif|tif|tiff)$/i,
          '',
        )

        if (
          normalizedPlace === normalize('Chennai Fort Museum') &&
          filename.includes('cornwallis memorial')
        ) {
          return null
        }

        const titleWords = new Set(filename.split(/\s+/))
        const matchingWords = importantWords.filter(
          (word) => titleWords.has(word),
        ).length

        const placeScore = matchingWords / importantWords.length
        const minimumScore = importantWords.length <= 2 ? 1 : 0.75

        if (placeScore < minimumScore) return null

        const cityMatched =
          normalizedCity.length >= 3 &&
          filename.includes(normalizedCity)

        const mentionsOtherLocation = locationMarkers.some(
          (location) =>
            location !== normalizedCity && filename.includes(location),
        )

        if (mentionsOtherLocation) return null
        if (requiresCityMatch && !cityMatched) return null

        const fullNameMatched =
          normalizedPlace.length > 0 &&
          filename.includes(normalizedPlace)

        return {
          title: rawTitle,
          url: info.thumburl,
          score:
            placeScore +
            (cityMatched ? 0.5 : 0) +
            (fullNameMatched ? 0.5 : 0),
        }
      }).filter(Boolean).sort((a, b) => b.score - a.score)

      if (candidates.length) {
        commonsImageCache.set(cacheKey, candidates[0].url)
        return candidates[0].url
      }
    }

    commonsImageCache.set(cacheKey, null)
    return null
  } catch (error) {
    console.warn('[Commons] Image search failed:', error.message)
    return null
  }
}

async function isImageUrlUsable(imageUrl) {
  if (!imageUrl) return false

  try {
    const response = await fetch(imageUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })

    return (
      response.ok &&
      (response.headers.get('content-type') || '')
        .toLowerCase()
        .startsWith('image/')
    )
  } catch {
    return false
  }
}

async function refreshWikimediaThumbnail(imageUrl) {
  try {
    const parsedUrl = new URL(imageUrl)

    if (
      !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(
        parsedUrl.hostname,
      ) ||
      !parsedUrl.pathname.includes('/thumb/')
    ) {
      return imageUrl
    }

    if (!(await waitForCommonsRateLimit())) return null

    const parts = parsedUrl.pathname.split('/')
    const thumbIndex = parts.indexOf('thumb')
    const filename = parts[thumbIndex + 3]

    if (!filename) return null

    const decodedFilename = decodeURIComponent(filename)

    const params = new URLSearchParams({
      action: 'query',
      titles: `File:${decodedFilename}`,
      prop: 'imageinfo',
      iiprop: 'url|mime',
      iiurlwidth: '500',
      format: 'json',
    })

    const response = await fetch(
      `https://commons.wikimedia.org/w/api.php?${params}`,
      {
        headers: {
          'User-Agent': 'TripWiseTravelPlanner/1.0 (student project)',
        },
        signal: AbortSignal.timeout(8000),
      },
    )

    if (response.status === 429) {
      commonsRateLimitedUntil = Date.now() + 60_000
      return null
    }

    if (!response.ok) return null

    const result = await response.json()
    const info = Object.values(result.query?.pages || {})[0]
      ?.imageinfo?.[0]

    if (!info?.thumburl) return null

    const thumbnailUrl = new URL(info.thumburl)

    if (
      !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(
        thumbnailUrl.hostname,
      )
    ) {
      return null
    }

    const mime = info.thumbmime || info.mime

    if (mime && !mime.startsWith('image/')) return null

    return info.thumburl
  } catch (error) {
    console.warn('[Wikimedia] Thumbnail refresh failed:', error.message)
    return null
  }
}

app.get('/api/external/places', async (req, res) => {
  const requestStartedAt = Date.now()
  const streaming = req.query.stream === '1'

  const logTiming = (step) => {
    console.log(
      `[Timing] ${step}: ${((Date.now() - requestStartedAt) / 1000).toFixed(2)} seconds`,
    )
  }

  function sendEvent(event, data) {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: ${event}\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }
  }

  function startStream() {
    if (res.headersSent) return

    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    })

    res.flushHeaders()
  }

  try {
    const city = String(req.query.city || '').trim()
    const apiKey = process.env.OPENTRIPMAP_API_KEY

    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a city name.',
      })
    }

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: 'OpenTripMap API key is not configured.',
      })
    }

    const cacheKey = city.toLowerCase()
    const cachedEntry = externalPlacesCache.get(cacheKey)

    if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
      console.log(`[Places] Cache hit for "${city}"`)

      if (streaming) {
        startStream()

        sendEvent('meta', {
          city: cachedEntry.data.city,
          country: cachedEntry.data.country,
          count: cachedEntry.data.count,
        })

        // Cached cards are already fully enriched.
        for (const place of cachedEntry.data.data) {
          sendEvent('place', place)
        }

        sendEvent('done', { success: true })
        return res.end()
      }

      res.set('X-Cache', 'HIT')
      return res.json(cachedEntry.data)
    }

    if (cachedEntry) externalPlacesCache.delete(cacheKey)

    console.log(`[Places] Cache miss for "${city}"`)

    const cityUrl = new URL(
      'https://api.opentripmap.com/0.1/en/places/geoname',
    )

    cityUrl.search = new URLSearchParams({
      name: city,
      apikey: apiKey,
    }).toString()

    const cityResponse = await fetch(cityUrl, {
      signal: AbortSignal.timeout(10000),
    })

    const cityData = await cityResponse.json()
    logTiming('City lookup completed')

    if (
      !cityResponse.ok ||
      cityData.error ||
      cityData.status === 'NOT_FOUND'
    ) {
      return res.status(404).json({
        success: false,
        message: `Could not find the city "${city}". Try another city name.`,
      })
    }

    if (
      typeof cityData.lat !== 'number' ||
      typeof cityData.lon !== 'number'
    ) {
      return res.status(404).json({
        success: false,
        message: 'The API did not return coordinates for that city.',
      })
    }

    const placesUrl = new URL(
      'https://api.opentripmap.com/0.1/en/places/radius',
    )

    placesUrl.search = new URLSearchParams({
      lat: String(cityData.lat),
      lon: String(cityData.lon),
      radius: '10000',
      limit: '50',
      rate: '1',
      format: 'json',
      apikey: apiKey,
    }).toString()

    const placesResponse = await fetch(placesUrl, {
      signal: AbortSignal.timeout(15000),
    })

    const placesData = await placesResponse.json()
    logTiming('Nearby places fetched')

    if (!placesResponse.ok || !Array.isArray(placesData)) {
      return res.status(502).json({
        success: false,
        message: 'OpenTripMap could not return places right now.',
      })
    }

    const normalizePlaceName = (value) =>
      String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()

    const places = placesData
      .filter((place) => {
        if (!place.name || !place.name.trim()) return false

        const name = place.name.toLowerCase().trim()

        const unwantedPatterns = [
          /^churchyard walls?\b/,
          /^drinking fountain attached\b/,
          /^churchyard wall and railings\b/,
          /^\d+,\s*\d+/,
          /\bmedical college\b/,
          /\bhospital\b/,
          /\bclinic\b/,
          /\bschool\b/,
          /\bcollege\b/,
          /\buniversity\b/,
          /\btraining institute\b/,
          /\btower\b/,
          /\bsannathi\b/,
          /^old marriage hall$/,
          /^marriage hall$/,
        ]

        return !unwantedPatterns.some((pattern) => pattern.test(name))
      })
      .map((place) => {
        const kinds = String(place.kinds || '')
          .toLowerCase()
          .split(',')
          .map((kind) => kind.trim())

        let score = Number(place.rate) || 0

        const preferredKinds = [
          'museums', 'monuments_and_memorials', 'historic',
          'archaeology', 'cultural', 'fortifications',
          'gardens_and_parks', 'natural', 'interesting_places',
          'architecture', 'religion', 'churches',
        ]

        for (const kind of preferredKinds) {
          if (kinds.includes(kind)) score += 3
        }

        const lowerPriorityKinds = [
          'industrial_facilities', 'defensive_walls', 'transport',
          'other', 'unclassified_objects', 'theatres_and_entertainments',
        ]

        for (const kind of lowerPriorityKinds) {
          if (kinds.includes(kind)) score -= 3
        }

        return { ...place, selectionScore: score }
      })
      .sort((a, b) => b.selectionScore - a.selectionScore)
      .filter((place, index, sortedPlaces) => {
        const name = normalizePlaceName(place.name)

        const ignoredWords = new Set([
          'the', 'and', 'of', 'at', 'in', 'temple',
          'temples', 'attraction',
        ])

        const words = new Set(
          name.split(/\s+/).filter(
            (word) => word.length > 2 && !ignoredWords.has(word),
          ),
        )

        if (
          typeof place.point?.lat !== 'number' ||
          typeof place.point?.lon !== 'number'
        ) {
          return !sortedPlaces.slice(0, index).some(
            (previous) =>
              normalizePlaceName(previous.name) === name,
          )
        }

        const isDuplicate = sortedPlaces
          .slice(0, index)
          .some((previous) => {
            if (
              typeof previous.point?.lat !== 'number' ||
              typeof previous.point?.lon !== 'number'
            ) {
              return normalizePlaceName(previous.name) === name
            }

            const previousName = normalizePlaceName(previous.name)
            if (previousName === name) return true

            const previousWords = new Set(
              previousName.split(/\s+/).filter(
                (word) => word.length > 2 && !ignoredWords.has(word),
              ),
            )

            if (!words.size || !previousWords.size) return false

            let commonWords = 0

            for (const word of words) {
              if (previousWords.has(word)) commonWords++
            }

            const similarity =
              commonWords / Math.max(words.size, previousWords.size)

            const latDifference =
              (place.point.lat - previous.point.lat) * 111320

            const averageLatitude =
              ((place.point.lat + previous.point.lat) / 2) *
              (Math.PI / 180)

            const lonDifference =
              (place.point.lon - previous.point.lon) *
              111320 *
              Math.cos(averageLatitude)

            const distance = Math.sqrt(
              latDifference ** 2 + lonDifference ** 2,
            )

            return similarity >= 0.7 && distance <= 100
          })

        return !isDuplicate
      })
      .slice(0, 20)

    logTiming(`Selected ${places.length} attractions`)

    const resolvedCity = cityData.name || city
    const resolvedCountry = cityData.country || ''

    if (streaming) {
      startStream()

      sendEvent('meta', {
        city: resolvedCity,
        country: resolvedCountry,
        count: places.length,
      })

      // Send every card immediately. Images and descriptions are filled in later.
      for (const place of places) {
        sendEvent('place', {
          ...place,
          image: null,
          description: '',
          wikipedia: '',
          url: '',
        })
      }
    }

    let commonsFallbackAttempts = 0
    const usedImageUrls = new Set()
    const placesWithDetails = []

    function getImageKey(imageUrl) {
      if (!imageUrl) return null

      try {
        const parsed = new URL(imageUrl)
        parsed.search = ''
        parsed.hash = ''
        return parsed.toString()
      } catch {
        return imageUrl
      }
    }

    function addPlaceResult(placeResult) {
      placesWithDetails.push(placeResult)

      if (streaming) {
        sendEvent('update', placeResult)
      }
    }

    for (const place of places) {
      if (res.destroyed) return

      const emptyDetails = {
        ...place,
        image: null,
        description: '',
        wikipedia: '',
        url: '',
      }

      if (
        !place.xid ||
        Date.now() < openTripMapRateLimitedUntil
      ) {
        addPlaceResult(emptyDetails)
        continue
      }

      try {
        const detailUrl = new URL(
          `https://api.opentripmap.com/0.1/en/places/xid/${encodeURIComponent(place.xid)}`,
        )

        detailUrl.search = new URLSearchParams({
          apikey: apiKey,
        }).toString()

        const detailResponse = await fetch(detailUrl, {
          signal: AbortSignal.timeout(8000),
        })

        if (detailResponse.status === 429) {
          openTripMapRateLimitedUntil = Date.now() + 60_000
          console.warn('[OpenTripMap] Rate limited for 60 seconds.')
          addPlaceResult(emptyDetails)
          continue
        }

        if (!detailResponse.ok) {
          addPlaceResult(emptyDetails)
          continue
        }

        const details = await detailResponse.json()
        let image = details.preview?.source || null

        if (image) {
          try {
            const imageUrl = new URL(image)

            if (
              ['upload.wikimedia.org', 'thumb.wikimedia.org']
                .includes(imageUrl.hostname) &&
              imageUrl.pathname.includes('/thumb/')
            ) {
              image = (await refreshWikimediaThumbnail(image)) || image
            }
          } catch {
            image = null
          }
        }

        let imageKey = getImageKey(image)

        if (imageKey && usedImageUrls.has(imageKey)) {
          image = null
          imageKey = null
        }

        if (!image && place.wikidata) {
          const candidate = await findWikidataImage(place.wikidata)
          const candidateKey = getImageKey(candidate)

          if (candidateKey && !usedImageUrls.has(candidateKey)) {
            image = candidate
          }
        }

        if (!image && details.wikipedia) {
          const candidate = await findWikipediaImage(details.wikipedia)
          const candidateKey = getImageKey(candidate)

          if (candidateKey && !usedImageUrls.has(candidateKey)) {
            image = candidate
          }
        }

        if (!image && commonsFallbackAttempts < 6) {
          commonsFallbackAttempts++

          const candidate = await findCommonsImage(
            place.name,
            resolvedCity,
          )

          const candidateKey = getImageKey(candidate)

          if (candidateKey && !usedImageUrls.has(candidateKey)) {
            image = candidate
          }
        }

        const finalImageKey = getImageKey(image)

        if (finalImageKey) usedImageUrls.add(finalImageKey)

        addPlaceResult({
          ...place,
          image: image || null,
          description:
            details.wikipedia_extracts?.text ||
            details.info?.descr ||
            '',
          wikipedia: details.wikipedia || '',
          url: details.url || '',
        })
      } catch (detailError) {
        console.error(
          `[Places] Could not load details for ${place.xid}:`,
          detailError.message,
        )

        addPlaceResult(emptyDetails)
      }

      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    const responseData = {
      success: true,
      city: resolvedCity,
      country: resolvedCountry,
      count: placesWithDetails.length,
      data: placesWithDetails,
    }

    externalPlacesCache.set(cacheKey, {
      data: responseData,
      expiresAt: Date.now() + EXTERNAL_PLACES_CACHE_TTL,
    })

    logTiming('All attraction details and image checks completed')

    if (streaming) {
      sendEvent('done', { success: true })
      return res.end()
    }

    res.set('X-Cache', 'MISS')
    return res.json(responseData)
  } catch (error) {
    console.error('[Places] External places error:', error.message)

    if (streaming && res.headersSent) {
      sendEvent('streamError', {
        success: false,
        message: 'Unable to contact OpenTripMap. Please try again.',
      })

      return res.end()
    }

    return res.status(502).json({
      success: false,
      message: 'Unable to contact OpenTripMap. Please try again.',
    })
  }
})

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the TripWise API!',
    status: 'running',
  })
})

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'TripWise backend is healthy',
  })
})

// Get all destinations from PostgreSQL.
app.get('/api/destinations', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, country, category, price, description, image
       FROM destinations
       ORDER BY id`,
    )

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    })
  } catch (error) {
    console.error('Error fetching destinations:', error.message)

    res.status(500).json({
      success: false,
      message: 'Could not fetch destinations from the database',
    })
  }
})

// Get one destination by ID.
app.get('/api/destinations/:id', async (req, res) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid destination ID',
    })
  }

  try {
    const result = await pool.query(
      `SELECT id, name, country, category, price, description, image
       FROM destinations
       WHERE id = $1`,
      [id],
    )

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Destination not found',
      })
    }

    res.json({
      success: true,
      data: result.rows[0],
    })
  } catch (error) {
    console.error('Error fetching destination:', error.message)

    res.status(500).json({
      success: false,
      message: 'Could not fetch destination from the database',
    })
  }
})

// Get all saved itinerary destinations.
app.get('/api/itinerary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        i.id AS itinerary_id,
        i.created_at,
        d.id,
        d.name,
        d.country,
        d.category,
        d.price,
        d.description,
        d.image
      FROM itinerary i
      JOIN destinations d ON d.id = i.destination_id
      ORDER BY i.created_at DESC
    `)

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    })
  } catch (error) {
    console.error('Error fetching itinerary:', error.message)

    res.status(500).json({
      success: false,
      message: 'Could not fetch itinerary',
    })
  }
})

// Add a destination to the itinerary.
app.post('/api/itinerary', async (req, res) => {
  const destinationId = Number(req.body.destinationId)

  if (!Number.isInteger(destinationId) || destinationId < 1) {
    return res.status(400).json({
      success: false,
      message: 'A valid destinationId is required',
    })
  }

  try {
    const destination = await pool.query(
      'SELECT id FROM destinations WHERE id = $1',
      [destinationId],
    )

    if (!destination.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Destination not found',
      })
    }

    const result = await pool.query(
      `INSERT INTO itinerary (destination_id)
       VALUES ($1)
       ON CONFLICT (destination_id) DO NOTHING
       RETURNING id, destination_id, created_at`,
      [destinationId],
    )

    res.status(result.rowCount === 0 ? 200 : 201).json({
      success: true,
      message: result.rowCount === 0
        ? 'Destination is already in your trip'
        : 'Destination added to your trip',
      data: result.rows[0] || null,
    })
  } catch (error) {
    console.error('Error adding itinerary destination:', error.message)

    res.status(500).json({
      success: false,
      message: 'Could not add destination to itinerary',
    })
  }
})

// Remove a destination from the itinerary.
app.delete('/api/itinerary/:destinationId', async (req, res) => {
  const destinationId = Number(req.params.destinationId)

  if (!Number.isInteger(destinationId) || destinationId < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid destination ID',
    })
  }

  try {
    const result = await pool.query(
      'DELETE FROM itinerary WHERE destination_id = $1 RETURNING id',
      [destinationId],
    )

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: 'Destination is not in your trip',
      })
    }

    res.json({
      success: true,
      message: 'Destination removed from your trip',
    })
  } catch (error) {
    console.error('Error removing itinerary destination:', error.message)

    res.status(500).json({
      success: false,
      message: 'Could not remove destination from itinerary',
    })
  }
})

// Check whether attraction image URLs are accessible.
app.get('/api/debug/image-check', async (req, res) => {
  try {
    const city = String(req.query.city || 'Paris').trim()

    const apiResponse = await fetch(
      `http://localhost:${PORT}/api/external/places?city=${encodeURIComponent(city)}`,
    )

    const body = await apiResponse.json()

    if (!apiResponse.ok || !Array.isArray(body.data)) {
      return res.status(502).json({
        success: false,
        message: 'Could not fetch attraction data',
      })
    }

    const results = await Promise.all(
      body.data.map(async (place) => {
        if (!place.image) {
          return {
            name: place.name,
            image: null,
            status: 'NO_IMAGE_URL',
          }
        }

        const usable = await isImageUrlUsable(place.image)

        return {
          name: place.name,
          image: place.image,
          status: usable ? 'URL_ACCESSIBLE' : 'URL_FAILED_CHECK',
        }
      }),
    )

    res.json({
      success: true,
      city: body.city,
      checked: results.length,
      results,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
})

app.listen(PORT, () => {
  console.log(`TripWise backend running at http://localhost:${PORT}`)
})