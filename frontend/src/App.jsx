
import { useEffect, useState } from 'react'
import axios from 'axios'
import './App.css'

const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
).replace(/\/$/, '')

function App() {
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('name')
  const [selected, setSelected] = useState(null)
  const [itinerary, setItinerary] = useState([])
  const [itineraryLoading, setItineraryLoading] = useState(true)
  const [itineraryError, setItineraryError] = useState('')
  const [actionError, setActionError] = useState('')
  const [savingDestinationId, setSavingDestinationId] = useState(null)
  const [page, setPage] = useState('explore')

  // OpenTripMap discovery state
  const [externalCity, setExternalCity] = useState('')
  const [searchedCity, setSearchedCity] = useState('')
  const [externalPlaces, setExternalPlaces] = useState([])
  const [externalLoading, setExternalLoading] = useState(false)
  const [externalError, setExternalError] = useState('')

  async function fetchItinerary() {
    try {
      setItineraryLoading(true)
      setItineraryError('')

      const response = await axios.get(`${API_URL}/itinerary`)
      setItinerary(response.data.data)
    } catch (err) {
      console.error('Failed to fetch itinerary:', err)
      setItineraryError(
        'Could not load your trip from the database. Please try again.',
      )
    } finally {
      setItineraryLoading(false)
    }
  }

  useEffect(() => {
    async function fetchDestinations() {
      try {
        setLoading(true)
        setError('')

        const response = await axios.get(`${API_URL}/destinations`)
        setDestinations(response.data.data)
      } catch (err) {
        console.error('Failed to fetch destinations:', err)
        setError('Could not load destinations. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchDestinations()
    fetchItinerary()
  }, [])

    
  
  async function searchExternalPlaces(event) {
    event.preventDefault()

    const city = externalCity.trim()

    if (!city) {
      setExternalError('Please enter a city name.')
      return
    }

    setExternalLoading(true)
    setExternalError('')
    setExternalPlaces([])
    setSearchedCity(city)

    try {
      const response = await fetch(
        `${API_URL}/external/places?city=${encodeURIComponent(city)}&stream=1`,
        {
          headers: { Accept: 'text/event-stream' },
        },
      )

      if (!response.ok) {
        let message = 'Unable to fetch attractions.'

        try {
          const errorData = await response.json()
          message = errorData.message || message
        } catch {
          // The response might not contain JSON.
        }

        throw new Error(message)
      }

      if (!response.body) {
        throw new Error('Your browser does not support streaming responses.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      let buffer = ''
      let streamFinished = false

      function handleEvent(block) {
        let eventName = 'message'
        let dataText = ''

        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            dataText += `${dataText ? '\n' : ''}${line.slice(5).trim()}`
          }
        }

        if (!dataText) return

        let payload

        try {
          payload = JSON.parse(dataText)
        } catch {
          console.warn('Could not parse attraction event:', block)
          return
        }

        if (eventName === 'meta') {
          setSearchedCity(payload.city || city)
        }

        if (eventName === 'place' || eventName === 'update') {
          setExternalPlaces((current) => {
            const index = current.findIndex(
              (item) => item.xid === payload.xid,
            )

            if (index === -1) {
              return [...current, payload]
            }

            return current.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...payload } : item,
            )
          })
        }

        if (eventName === 'streamError') {
          setExternalError(
            payload.message || 'Unable to finish loading attractions.',
          )
        }

        if (eventName === 'done') {
          streamFinished = true
        }
      }

      while (true) {
        const { value, done } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })
        buffer = buffer.replace(/\r\n/g, '\n')

        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''

        for (const block of blocks) {
          handleEvent(block)
        }
      }

      buffer += decoder.decode()
      buffer = buffer.replace(/\r\n/g, '\n')

      if (buffer.trim()) {
        handleEvent(buffer)
      }

      if (!streamFinished) {
        setExternalError((current) =>
          current ||
          'The attraction stream ended before completion. Please try again.',
        )
      }
    } catch (error) {
      console.error('Attraction search failed:', error)

      setExternalError(
        error.message || 'Unable to fetch attractions. Please try again.',
      )
    } finally {
      setExternalLoading(false)
    }
  }


  async function addDestination(destination) {
    try {
      setActionError('')
      setSavingDestinationId(destination.id)

      await axios.post(`${API_URL}/itinerary`, {
        destinationId: destination.id,
      })

      await fetchItinerary()
      setSelected(null)
      setPage('trip')
    } catch (err) {
      console.error('Failed to add destination:', err)
      setActionError(
        err.response?.data?.message ||
          'Could not add this destination. Please try again.',
      )
    } finally {
      setSavingDestinationId(null)
    }
  }

  async function removeDestination(destinationId) {
    try {
      setActionError('')

      await axios.delete(`${API_URL}/itinerary/${destinationId}`)
      await fetchItinerary()
    } catch (err) {
      console.error('Failed to remove destination:', err)
      setActionError(
        err.response?.data?.message ||
          'Could not remove this destination. Please try again.',
      )
    }
  }

  const itineraryIds = new Set(itinerary.map((item) => item.id))

  const filteredDestinations = destinations
    .filter((destination) => {
      const matchesSearch =
        `${destination.name} ${destination.country}`
          .toLowerCase()
          .includes(search.toLowerCase())

      const matchesCategory =
        category === 'All' || destination.category === category

      return matchesSearch && matchesCategory
    })
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name),
    )

  return (
    <div className="app-shell">
      <header className="navbar">
        <button className="brand" onClick={() => setPage('explore')}>
          <span className="brand-icon">✳</span>
          TripWise<span className="brand-period">.</span>
        </button>

        <nav className="nav-links">
          <button
            className={page === 'explore' ? 'nav-link active' : 'nav-link'}
            onClick={() => setPage('explore')}
          >
            Explore
          </button>

          <button
            className={page === 'trip' ? 'nav-link active' : 'nav-link'}
            onClick={() => setPage('trip')}
          >
            My Trip <span className="trip-count">{itinerary.length}</span>
          </button>
        </nav>

        <span className="nav-note">YOUR NEXT ADVENTURE AWAITS</span>
      </header>

      <main>
        {page === 'explore' ? (
          <>
            <section className="hero">
              <div className="hero-content">
                <span className="eyebrow">✦ YOUR WORLD, YOUR WAY</span>

                <h1>
                  The world is
                  <br />
                  <span>yours to explore.</span>
                </h1>

                <p>
                  Discover extraordinary places, find your next adventure,
                  and bring every part of your journey together.
                </p>

                <button
                  className="primary-button"
                  onClick={() =>
                    document.getElementById('destinations')?.scrollIntoView({
                      behavior: 'smooth',
                    })
                  }
                >
                  Explore destinations <span>↘</span>
                </button>
              </div>

              <div className="hero-image">
                <img
                  src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=85"
                  alt="Dramatic mountain landscape"
                />

                <div className="image-caption">
                  <span>THE GREAT OUTDOORS</span>
                  <strong>Find your somewhere.</strong>
                </div>

                <div className="floating-note">
                  <span className="floating-icon">✈</span>
                  <div>
                    <strong>Adventure starts here</strong>
                    <p>One search away.</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="destinations-section" id="destinations">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">CURATED FOR THE CURIOUS</span>
                  <h2>
                    Find your next escape<span>.</span>
                  </h2>
                  <p>Places worth adding to your story.</p>
                </div>

                <span className="result-count">
                  {loading
                    ? 'LOADING...'
                    : `${filteredDestinations.length} PLACES`}
                </span>
              </div>

              <div className="filters">
                <div className="search-box">
                  <span>⌕</span>

                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search places or countries..."
                    aria-label="Search destinations"
                  />

                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  aria-label="Filter by category"
                >
                  <option value="All">All categories</option>
                  <option value="Beach">Beaches</option>
                  <option value="Mountain">Mountains</option>
                  <option value="Culture">Culture</option>
                  <option value="City">Cities</option>
                </select>

                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  aria-label="Sort destinations"
                >
                  <option value="name">Name: A–Z</option>
                  <option value="reverse">Name: Z–A</option>
                </select>
              </div>

              {loading ? (
                <div className="empty-state">
                  <h3>Loading destinations...</h3>
                  <p>Finding places for your next adventure.</p>
                </div>
              ) : error ? (
                <div className="empty-state">
                  <span>!</span>
                  <h3>Unable to load destinations</h3>
                  <p>{error}</p>
                  <button
                    className="secondary-button"
                    onClick={() => window.location.reload()}
                  >
                    Try again
                  </button>
                </div>
              ) : filteredDestinations.length === 0 ? (
                <div className="empty-state">
                  <span>⌕</span>
                  <h3>No destinations found</h3>
                  <p>Try another search or change your category filter.</p>

                  <button
                    className="secondary-button"
                    onClick={() => {
                      setSearch('')
                      setCategory('All')
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="destination-grid">
                  {filteredDestinations.map((destination) => (
                    <article
                      className="destination-card"
                      key={destination.id}
                    >
                      <button
                        className="card-image-button"
                        onClick={() => setSelected(destination)}
                        aria-label={`View ${destination.name} details`}
                      >
                        <img
                          className="card-image"
                          src={destination.image}
                          alt={destination.name}
                          loading="lazy"
                        />

                        <span className="category-tag">
                          {destination.category}
                        </span>

                        <span className="card-arrow">↗</span>
                      </button>

                      <div className="card-body">
                        <div className="card-title-row">
                          <div>
                            <h3>{destination.name}</h3>
                            <p className="location">
                              ⌖ {destination.country}
                            </p>
                          </div>

                          <span className="price">{destination.price}</span>
                        </div>

                        <p className="card-description">
                          {destination.description}
                        </p>

                        <button
                          className="text-button"
                          onClick={() => setSelected(destination)}
                        >
                          Discover place <span>→</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Real-time attraction discovery powered by OpenTripMap */}
            <section className="external-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">DISCOVER BEYOND THE LIST</span>
                  <h2>
                    Explore any city<span>.</span>
                  </h2>
                  <p>
                    Search real-world attractions using OpenTripMap.
                  </p>
                </div>

                <span className="result-count">LIVE DISCOVERY</span>
              </div>

              <form
                className="external-search-form"
                onSubmit={searchExternalPlaces}
              >
                <div className="search-box external-search-box">
                  <span>⌕</span>
                  <input
                    value={externalCity}
                    onChange={(event) => setExternalCity(event.target.value)}
                    placeholder="Try Paris, London, or Tokyo..."
                    aria-label="City to discover attractions in"
                    required
                  />
                </div>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={externalLoading}
                >
                  {externalLoading ? 'Searching...' : 'Discover attractions'}
                  {!externalLoading && <span> →</span>}
                </button>
              </form>



              {externalLoading && (
                <div className="empty-state">
                  <h3>
                    {externalPlaces.length > 0
                      ? `Found ${externalPlaces.length} attractions so far...`
                      : `Exploring ${searchedCity}...`}
                  </h3>
                  <p>
                    {externalPlaces.length > 0
                      ? 'More attractions and details are loading.'
                      : 'Finding nearby attractions. Your results will appear here as they arrive.'}
                  </p>
                </div>
              )}

              {externalError && (
                <div className="empty-state">
                  <span>!</span>
                  <h3>
                    {externalPlaces.length > 0
                      ? 'Some attractions could not be loaded'
                      : 'Unable to show attractions'}
                  </h3>
                  <p>{externalError}</p>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      searchExternalPlaces({ preventDefault: () => {} })
                    }
                  >
                    Try again
                  </button>
                </div>
              )}

              {externalPlaces.length > 0 ? (
                <>
                  <div className="external-results-heading">
                    <h3>Places around {searchedCity}</h3>
                    <span>
                      {externalPlaces.length}
                      {externalLoading ? '+' : ''} attractions found
                    </span>
                  </div>

                  <div className="destination-grid">
                    {externalPlaces.map((place) => {
                      const kinds = (place.kinds || '')
                        .split(',')
                        .filter(Boolean)

                      const categoryName = kinds
                        .slice(0, 2)
                        .map((kind) => kind.replaceAll('_', ' '))
                        .join(' · ')

                      const mapUrl = place.point
                        ? `https://www.openstreetmap.org/?mlat=${place.point.lat}&mlon=${place.point.lon}#map=17/${place.point.lat}/${place.point.lon}`
                        : null

                      return (
                        <article
                          className="destination-card external-place-card"
                          key={place.xid}
                        >
                          <div className="external-place-art">
                            {place.image && (
                              <img
                                className="external-place-image"
                                src={place.image}
                                alt={place.name || 'Attraction'}
                                loading="lazy"
                                onError={(event) => {
                                  event.currentTarget.style.display = 'none'
                                  event.currentTarget.parentElement.classList.add(
                                    'image-unavailable',
                                  )
                                }}
                              />
                            )}

                            <div
                              className="external-place-placeholder"
                              aria-hidden="true"
                            >
                              <span>✳</span>
                              <small>Discover this place</small>
                            </div>

                            <span className="category-tag">
                              {categoryName || 'Point of interest'}
                            </span>
                          </div>

                          <div className="card-body">
                            <h3>{place.name || 'Unnamed attraction'}</h3>

                            <p className="location">⌖ {searchedCity}</p>

                            <p className="card-description">
                              {place.description ||
                                (categoryName
                                  ? `Explore this ${categoryName.replaceAll(' · ', ' and ')} attraction.`
                                  : 'Discover this interesting place on your trip.')}
                            </p>

                            {typeof place.dist === 'number' && (
                              <p className="external-distance">
                                {place.dist >= 1000
                                  ? `${(place.dist / 1000).toFixed(2)} km`
                                  : `${Math.round(place.dist)} m`}{' '}
                                from the city search point
                              </p>
                            )}

                            {mapUrl && (
                              <a
                                className="text-button external-map-link"
                                href={mapUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View location on map <span>↗</span>
                              </a>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </>
              ) : (
                !externalLoading &&
                !externalError && (
                  <div className="external-hint">
                    <span>✈</span>
                    <p>
                      Your next discovery could be anywhere. Enter a city
                      above to find real attractions around it.
                    </p>
                  </div>
                )
              )}




              <p className="external-attribution">
                Attraction data provided by OpenTripMap. Map locations open
                in OpenStreetMap.
              </p>

            </section>
          </>
        ) : (
          <section className="trip-section">
            <span className="eyebrow">YOUR PERSONAL COLLECTION</span>

            <h1>
              My Trip<span>.</span>
            </h1>

            <p className="trip-intro">
              Every great journey starts with a few places on your list.
            </p>

            {actionError && (
              <div className="empty-state">
                <p>{actionError}</p>
                <button
                  className="secondary-button"
                  onClick={() => setActionError('')}
                >
                  Dismiss
                </button>
              </div>
            )}

            {itineraryLoading ? (
              <div className="empty-state trip-empty">
                <h3>Loading your trip...</h3>
                <p>Retrieving your saved destinations.</p>
              </div>
            ) : itineraryError ? (
              <div className="empty-state trip-empty">
                <h3>Unable to load your trip</h3>
                <p>{itineraryError}</p>
                <button
                  className="secondary-button"
                  onClick={fetchItinerary}
                >
                  Try again
                </button>
              </div>
            ) : itinerary.length === 0 ? (
              <div className="empty-state trip-empty">
                <span>✳</span>
                <h3>Your adventure starts here</h3>
                <p>You haven't saved any destinations yet.</p>

                <button
                  className="primary-button"
                  onClick={() => setPage('explore')}
                >
                  Discover destinations <span>→</span>
                </button>
              </div>
            ) : (
              <div className="destination-grid trip-grid">
                {itinerary.map((destination) => (
                  <article
                    className="destination-card"
                    key={destination.id}
                  >
                    <img
                      className="card-image trip-card-image"
                      src={destination.image}
                      alt={destination.name}
                    />

                    <div className="card-body">
                      <p className="location">{destination.country}</p>
                      <h3>{destination.name}</h3>

                      <p className="card-description">
                        {destination.description}
                      </p>

                      <button
                        className="remove-button"
                        onClick={() => removeDestination(destination.id)}
                      >
                        Remove from trip −
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <button
              className="back-link"
              onClick={() => setPage('explore')}
            >
              ← Back to Explore
            </button>
          </section>
        )}
      </main>

      {selected && (
        <div
          className="modal-backdrop"
          onClick={() => setSelected(null)}
        >
          <section
            className="details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close details"
            >
              ×
            </button>

            <img
              className="modal-image"
              src={selected.image}
              alt={selected.name}
            />

            <div className="modal-content">
              <span className="eyebrow">
                {selected.category} ESCAPE
              </span>

              <h2 id="details-title">{selected.name}</h2>

              <p className="location">⌖ {selected.country}</p>
              <p>{selected.description}</p>

              {actionError && <p>{actionError}</p>}

              <button
                className="primary-button"
                disabled={savingDestinationId === selected.id}
                onClick={() => addDestination(selected)}
              >
                {savingDestinationId === selected.id
                  ? 'Saving...'
                  : itineraryIds.has(selected.id)
                    ? 'Already in My Trip ✓'
                    : 'Add to My Trip'}
                {savingDestinationId !== selected.id && <span> +</span>}
              </button>
            </div>
          </section>
        </div>
      )}

      <footer className="footer">
        <button
          className="brand footer-brand"
          onClick={() => setPage('explore')}
        >
          <span className="brand-icon">✳</span>
          TripWise<span className="brand-period">.</span>
        </button>

        <p>Made for the places that stay with you.</p>
        <span>EXPLORE MORE. WORRY LESS.</span>
      </footer>
    </div>
  )
}

export default App
