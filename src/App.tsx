import {
  type FormEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { AppShell } from './components/AppShell'
import { LoadingGrid } from './components/LoadingGrid'
import { Pagination } from './components/Pagination'
import { VideoDuration } from './components/VideoDuration'
import {
  type Creator,
  type MediaItem,
  fetchCreators,
  fetchUserMedia,
  imageUrl,
  mediaLabel,
  placeholderImage,
  streamUrl,
  thumbnailUrl,
} from './lib/wet3'

type Tab = 'all' | 'images' | 'videos'

type AppRoute = { view: 'creators' } | { view: 'profile'; username: string }

type CreatorsBrowseState = {
  search: string
  page: number
}

const MEDIA_PER_PAGE = 20
const CREATORS_PER_PAGE = 24
const BROWSE_HASH_KEY = 'wetaccess:browseHash'

function mediaTypeLabel(type: MediaItem['media_type']): string {
  return type === '2' ? 'Video' : 'Image'
}

function parseCreatorsBrowseState(): CreatorsBrowseState {
  const hash = window.location.hash
  const queryStart = hash.indexOf('?')
  const params = new URLSearchParams(
    queryStart >= 0 ? hash.slice(queryStart + 1) : '',
  )
  const search = params.get('search')?.trim() ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  return { search, page }
}

function buildCreatorsHash({ search, page }: CreatorsBrowseState): string {
  const params = new URLSearchParams()

  if (search) {
    params.set('search', search)
  }

  if (page > 1) {
    params.set('page', String(page))
  }

  const query = params.toString()
  return query ? `#/?${query}` : '#/'
}

function parseRoute(): AppRoute {
  const profileMatch = window.location.hash.match(/^#\/user\/([^/?#]+)/)

  if (profileMatch) {
    return { view: 'profile', username: decodeURIComponent(profileMatch[1]) }
  }

  return { view: 'creators' }
}

function navigateToCreators() {
  const savedBrowseHash = sessionStorage.getItem(BROWSE_HASH_KEY)
  window.location.hash = savedBrowseHash || '#/'
}

function navigateToProfile(username: string) {
  const currentHash = window.location.hash || '#/'

  if (!currentHash.match(/^#\/user\//)) {
    sessionStorage.setItem(BROWSE_HASH_KEY, currentHash)
  }

  window.location.hash = `#/user/${encodeURIComponent(username)}`
}

function App() {
  const [route, setRoute] = useState(parseRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (route.view === 'profile') {
    return (
      <AppShell profileName={route.username} onHome={navigateToCreators}>
        <ProfileView username={route.username} />
      </AppShell>
    )
  }

  return (
    <AppShell onHome={navigateToCreators}>
      <CreatorsView onOpenProfile={navigateToProfile} />
    </AppShell>
  )
}

function CreatorsView({ onOpenProfile }: { onOpenProfile: (username: string) => void }) {
  const initialBrowse = parseCreatorsBrowseState()
  const [searchInput, setSearchInput] = useState(initialBrowse.search)
  const [searchQuery, setSearchQuery] = useState(initialBrowse.search)
  const [page, setPage] = useState(initialBrowse.page)
  const [creators, setCreators] = useState<Creator[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const syncBrowseFromHash = () => {
      const { search, page: nextPage } = parseCreatorsBrowseState()
      setSearchInput(search)
      setSearchQuery(search)
      setPage(nextPage)
    }

    window.addEventListener('hashchange', syncBrowseFromHash)
    return () => window.removeEventListener('hashchange', syncBrowseFromHash)
  }, [])

  const updateBrowseHash = useCallback((next: CreatorsBrowseState) => {
    const nextHash = buildCreatorsHash(next)
    sessionStorage.setItem(BROWSE_HASH_KEY, nextHash)
    window.location.hash = nextHash
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / CREATORS_PER_PAGE))

  const loadCreators = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await fetchCreators(page, CREATORS_PER_PAGE, searchQuery)
      setCreators(data.items)
      setTotal(data.total)
    } catch (loadError) {
      setCreators([])
      setTotal(0)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load creators')
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery])

  useEffect(() => {
    void loadCreators()
  }, [loadCreators])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateBrowseHash({ search: searchInput.trim(), page: 1 })
  }

  const goToCreatorsPage = useCallback(
    (nextPage: number) => {
      updateBrowseHash({ search: searchQuery, page: nextPage })
    },
    [searchQuery, updateBrowseHash],
  )

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.src = placeholderImage()
  }

  return (
    <>
      <section className="hero">
        <p className="hero-eyebrow">Discover</p>
        <h1 className="hero-title">Find your next favorite creator</h1>
        <p className="hero-copy">
          {total.toLocaleString()} profiles to browse. Search by username or display name,
          then dive into their full media library.
        </p>
      </section>

      <section className="panel search-panel">
        <form className="search-row" onSubmit={submitSearch}>
          <input
            className="search-input"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search creators…"
            aria-label="Search creators"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
          {searchQuery ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => updateBrowseHash({ search: '', page: 1 })}
            >
              Clear
            </button>
          ) : null}
        </form>
      </section>

      {error ? <p className="status error">{error}</p> : null}
      {loading ? <LoadingGrid count={12} variant="creators" /> : null}

      {!loading && !error ? (
        <section className="creators-grid">
          {creators.map((creator) => (
            <button
              key={creator.u}
              type="button"
              className="creator-card"
              onClick={() => onOpenProfile(creator.u)}
            >
              <img
                src={creator.p}
                alt=""
                loading="lazy"
                onError={handleImageError}
              />
              <div className="creator-card-body">
                <strong>@{creator.u}</strong>
                <span>{creator.d}</span>
                <span className="creator-meta">{creator.ds} posts</span>
              </div>
            </button>
          ))}
        </section>
      ) : null}

      {!loading && !error && creators.length === 0 ? (
        <p className="empty">No creators matched that search.</p>
      ) : null}

      {!loading && !error && creators.length > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrevious={() => goToCreatorsPage(page - 1)}
          onNext={() => goToCreatorsPage(page + 1)}
        />
      ) : null}
    </>
  )
}

function ProfileView({ username }: { username: string }) {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const galleryRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      setLoading(true)
      setError(null)
      setActiveTab('all')
      setCurrentPage(1)

      try {
        const items = await fetchUserMedia(username)

        if (!cancelled) {
          setMedia(items)
        }
      } catch (loadError) {
        if (!cancelled) {
          setMedia([])
          setError(loadError instanceof Error ? loadError.message : 'Failed to load profile')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [username])

  const filtered = useMemo(() => {
    if (activeTab === 'images') {
      return media.filter((item) => item.media_type === '1')
    }

    if (activeTab === 'videos') {
      return media.filter((item) => item.media_type === '2')
    }

    return media
  }, [activeTab, media])

  const imageCount = useMemo(
    () => media.filter((item) => item.media_type === '1').length,
    [media],
  )
  const videoCount = useMemo(
    () => media.filter((item) => item.media_type === '2').length,
    [media],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / MEDIA_PER_PAGE))
  const visible = filtered.slice(
    (currentPage - 1) * MEDIA_PER_PAGE,
    currentPage * MEDIA_PER_PAGE,
  )

  const scrollToGallery = useCallback(() => {
    galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const goToPreviousPage = useCallback(() => {
    setCurrentPage((page) => Math.max(1, page - 1))
    scrollToGallery()
  }, [scrollToGallery])

  const goToNextPage = useCallback(() => {
    setCurrentPage((page) => Math.min(totalPages, page + 1))
    scrollToGallery()
  }, [scrollToGallery, totalPages])

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.src = placeholderImage()
  }

  const avatarLetter = username.charAt(0).toUpperCase()

  return (
    <>
      <section className="profile-hero">
        <div className="profile-hero-top">
          <div className="profile-avatar" aria-hidden="true">
            {avatarLetter}
          </div>
        </div>
        <div>
          <h1 className="profile-title">@{username}</h1>
          <p className="profile-subtitle">
            {loading ? 'Loading library…' : 'Creator profile & media library'}
          </p>
        </div>
        {!loading ? (
          <div className="stat-row">
            <span className="stat-pill">
              <strong>{media.length}</strong> posts
            </span>
            <span className="stat-pill">
              <strong>{imageCount}</strong> images
            </span>
            <span className="stat-pill">
              <strong>{videoCount}</strong> videos
            </span>
          </div>
        ) : null}
      </section>

      {error ? <p className="status error">{error}</p> : null}
      {loading ? <LoadingGrid count={10} variant="media" /> : null}

      {!loading && !error ? (
        <section ref={galleryRef} className="media-section panel gallery-anchor">
          <div className="segmented" role="tablist" aria-label="Media filters">
            {(['all', 'images', 'videos'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                className={`tab-btn${activeTab === tab ? ' active' : ''}`}
                aria-selected={activeTab === tab}
                onClick={() => {
                  setActiveTab(tab)
                  setCurrentPage(1)
                  scrollToGallery()
                }}
              >
                {tab === 'all'
                  ? `All (${media.length})`
                  : tab === 'images'
                    ? `Images (${imageCount})`
                    : `Videos (${videoCount})`}
              </button>
            ))}
          </div>

          {visible.length > 0 && totalPages > 1 ? (
            <Pagination
              className="pagination-top"
              label="Pagination top"
              page={currentPage}
              totalPages={totalPages}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          ) : null}

          <div className="media-grid">
            {visible.map((item) => (
              <article key={item.id} className="media-item">
                {item.media_type === '2' ? (
                  <a
                    href={streamUrl(item.id)}
                    className="media-card"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Watch video ${mediaLabel(item)}`}
                  >
                    <img
                      src={thumbnailUrl(item)}
                      alt={mediaTypeLabel(item.media_type)}
                      loading="lazy"
                      onError={handleImageError}
                    />
                    <span className="video-badge" aria-hidden="true">
                      ▶
                    </span>
                    <VideoDuration mediaId={item.id} overlay />
                  </a>
                ) : (
                  <a
                    href={imageUrl(item.id)}
                    className="media-card"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View image ${mediaLabel(item)}`}
                  >
                    <img
                      src={thumbnailUrl(item)}
                      alt={mediaTypeLabel(item.media_type)}
                      loading="lazy"
                      onError={handleImageError}
                    />
                  </a>
                )}
                <div className="media-card-meta">
                  <span className="media-label" title={item.id}>
                    {mediaLabel(item)}
                  </span>
                  {item.media_type === '2' ? (
                    <VideoDuration mediaId={item.id} />
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="empty">No media in this tab.</p>
          ) : totalPages > 1 ? (
            <Pagination
              className="pagination-bottom"
              label="Pagination bottom"
              page={currentPage}
              totalPages={totalPages}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          ) : null}
        </section>
      ) : null}
    </>
  )
}

export default App
