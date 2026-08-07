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
import { AfricanCastingView } from './components/AfricanCastingView'
import { FanBusyView } from './components/FanBusyView'
import { FanTribeView } from './components/FanTribeView'
import { LeakedZoneView } from './components/LeakedZoneView'
import { AppShell } from './components/AppShell'
import {
  DropDetailView,
  DropsListView,
  navigateToDropsList,
} from './components/DropsView'
import { LoadingGrid } from './components/LoadingGrid'
import { LoginView } from './components/LoginView'
import { Pagination } from './components/Pagination'
import { SitePicker } from './components/SitePicker'
import { VideoDuration } from './components/VideoDuration'
import {
  type AppSite,
  clearSession,
  readSession,
  type SessionState,
  writeSession,
} from './lib/session'
import { WatchView } from './components/WatchView'
import {
  type Creator,
  type MediaItem,
  fetchCreators,
  fetchUserMedia,
  formatMediaDate,
  imageUrl,
  mediaLabel,
  placeholderImage,
  thumbnailUrl,
  watchUrl,
  wet3AssetUrl,
} from './lib/wet3'

type Tab = 'all' | 'images' | 'videos'

type AppRoute =
  | { view: 'creators' }
  | { view: 'twitter' }
  | { view: 'drops' }
  | { view: 'drop'; dropId: number }
  | { view: 'profile'; username: string; from?: 'creators' | 'twitter' | 'drops' }
  | { view: 'watch'; mediaId: string }

type CreatorsBrowseState = {
  search: string
  page: number
}

type ProfileBack = 'creators' | 'twitter' | 'drops'

const MEDIA_PER_PAGE = 20
const CREATORS_PER_PAGE = 24
const BROWSE_HASH_KEY = 'wetaccess:browseHash'
const TWITTER_BROWSE_HASH_KEY = 'wetaccess:twitterBrowseHash'
const PROFILE_BACK_KEY = 'wetaccess:profileBack'

function mediaTypeLabel(type: MediaItem['media_type']): string {
  return type === '2' ? 'Video' : 'Image'
}

function parseBrowseQueryFromHash(): CreatorsBrowseState {
  const hash = window.location.hash
  const queryStart = hash.indexOf('?')
  const params = new URLSearchParams(
    queryStart >= 0 ? hash.slice(queryStart + 1) : '',
  )
  const search = params.get('search')?.trim() ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  return { search, page }
}

function buildBrowseHash(
  basePath: '#/' | '#/twitter',
  { search, page }: CreatorsBrowseState,
): string {
  const params = new URLSearchParams()

  if (search) {
    params.set('search', search)
  }

  if (page > 1) {
    params.set('page', String(page))
  }

  const query = params.toString()
  if (!query) {
    return basePath === '#/' ? '#/' : '#/twitter'
  }
  return basePath === '#/' ? `#/?${query}` : `#/twitter?${query}`
}

function parseRoute(): AppRoute {
  const watchMatch = window.location.hash.match(/^#\/watch\/([^/?#]+)/)

  if (watchMatch) {
    return { view: 'watch', mediaId: decodeURIComponent(watchMatch[1]) }
  }

  const profileMatch = window.location.hash.match(/^#\/user\/([^/?#]+)/)

  if (profileMatch) {
    const hash = window.location.hash
    const queryStart = hash.indexOf('?')
    const params = new URLSearchParams(
      queryStart >= 0 ? hash.slice(queryStart + 1) : '',
    )
    const fromRaw = params.get('from') ?? sessionStorage.getItem(PROFILE_BACK_KEY)
    const from: ProfileBack | undefined =
      fromRaw === 'twitter' || fromRaw === 'drops' || fromRaw === 'creators'
        ? fromRaw
        : undefined
    return {
      view: 'profile',
      username: decodeURIComponent(profileMatch[1]),
      from,
    }
  }

  const dropMatch = window.location.hash.match(/^#\/drops\/(\d+)/)

  if (dropMatch) {
    return { view: 'drop', dropId: Number(dropMatch[1]) }
  }

  if (window.location.hash.startsWith('#/drops')) {
    return { view: 'drops' }
  }

  if (window.location.hash.startsWith('#/twitter')) {
    return { view: 'twitter' }
  }

  return { view: 'creators' }
}

function navigateToCreators() {
  const savedBrowseHash = sessionStorage.getItem(BROWSE_HASH_KEY)
  window.location.hash = savedBrowseHash || '#/'
}

function navigateToTwitter() {
  const saved = sessionStorage.getItem(TWITTER_BROWSE_HASH_KEY)
  window.location.hash = saved || '#/twitter'
}

function profileBackTarget(from?: ProfileBack): ProfileBack {
  if (from === 'twitter' || from === 'drops' || from === 'creators') {
    return from
  }
  const stored = sessionStorage.getItem(PROFILE_BACK_KEY)
  if (stored === 'twitter' || stored === 'drops') {
    return stored
  }
  return 'creators'
}

function App() {
  const [session, setSession] = useState<SessionState>(() => readSession())

  function persist(next: SessionState) {
    writeSession(next)
    setSession(next)
  }

  function handleLogin() {
    persist({ loggedIn: true, site: null })
  }

  function handlePickSite(site: AppSite) {
    persist({ loggedIn: true, site })
    window.location.hash = '#/'
  }

  function handleSwitchSite() {
    persist({ loggedIn: true, site: null })
    window.location.hash = '#/'
  }

  function handleLogout() {
    clearSession()
    setSession({ loggedIn: false, site: null })
    window.location.hash = '#/'
  }

  if (!session.loggedIn) {
    return <LoginView onSuccess={handleLogin} />
  }

  if (!session.site) {
    return <SitePicker onPick={handlePickSite} onLogout={handleLogout} />
  }

  if (session.site === 'africancasting') {
    return (
      <AfricanCastingView
        onSwitchSite={handleSwitchSite}
        onLogout={handleLogout}
      />
    )
  }

  if (session.site === 'fanbusy') {
    return (
      <FanBusyView
        onSwitchSite={handleSwitchSite}
        onLogout={handleLogout}
      />
    )
  }

  if (session.site === 'fantribe') {
    return (
      <FanTribeView
        onSwitchSite={handleSwitchSite}
        onLogout={handleLogout}
      />
    )
  }

  if (session.site === 'leakedzone') {
    return (
      <LeakedZoneView
        onSwitchSite={handleSwitchSite}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <WetaccessApp onSwitchSite={handleSwitchSite} onLogout={handleLogout} />
  )
}

type WetaccessAppProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

function WetaccessApp({ onSwitchSite, onLogout }: WetaccessAppProps) {
  const [route, setRoute] = useState(parseRoute)
  const shellExtra = { onSwitchSite, onLogout }

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (route.view === 'watch') {
    return (
      <AppShell
        activeNav="creators"
        breadcrumb={`watch ${route.mediaId}`}
        backLabel="Back"
        onHome={() => window.history.back()}
        onBack={() => window.history.back()}
        {...shellExtra}
      >
        <WatchView mediaId={route.mediaId} />
      </AppShell>
    )
  }

  if (route.view === 'profile') {
    const backTo = profileBackTarget(route.from)
    const onBack =
      backTo === 'drops'
        ? navigateToDropsList
        : backTo === 'twitter'
          ? navigateToTwitter
          : navigateToCreators

    return (
      <AppShell
        activeNav={backTo}
        breadcrumb={`@${route.username}`}
        backLabel={
          backTo === 'drops'
            ? 'All drops'
            : backTo === 'twitter'
              ? 'Twitter creators'
              : 'All creators'
        }
        onHome={onBack}
        onBack={onBack}
        {...shellExtra}
      >
        <ProfileView username={route.username} />
      </AppShell>
    )
  }

  if (route.view === 'drop') {
    return (
      <AppShell
        activeNav="drops"
        breadcrumb={`#${route.dropId}`}
        backLabel="All drops"
        onHome={navigateToDropsList}
        onBack={navigateToDropsList}
        {...shellExtra}
      >
        <DropDetailView dropId={route.dropId} />
      </AppShell>
    )
  }

  if (route.view === 'drops') {
    return (
      <AppShell activeNav="drops" onHome={navigateToCreators} {...shellExtra}>
        <DropsListView />
      </AppShell>
    )
  }

  if (route.view === 'twitter') {
    return (
      <AppShell activeNav="twitter" onHome={navigateToTwitter} {...shellExtra}>
        <CreatorsView twitterOnly />
      </AppShell>
    )
  }

  return (
    <AppShell activeNav="creators" onHome={navigateToCreators} {...shellExtra}>
      <CreatorsView />
    </AppShell>
  )
}

function CreatorsView({ twitterOnly = false }: { twitterOnly?: boolean }) {
  const initialBrowse = parseBrowseQueryFromHash()
  const [searchInput, setSearchInput] = useState(initialBrowse.search)
  const [searchQuery, setSearchQuery] = useState(initialBrowse.search)
  const [page, setPage] = useState(initialBrowse.page)
  const [creators, setCreators] = useState<Creator[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [searchNote, setSearchNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const browseStorageKey = twitterOnly ? TWITTER_BROWSE_HASH_KEY : BROWSE_HASH_KEY
  const hashBase: '#/' | '#/twitter' = twitterOnly ? '#/twitter' : '#/'
  const profileFrom = twitterOnly ? 'twitter' : 'creators'

  useEffect(() => {
    sessionStorage.setItem(PROFILE_BACK_KEY, profileFrom)
  }, [profileFrom])

  useEffect(() => {
    const syncBrowseFromHash = () => {
      const { search, page: nextPage } = parseBrowseQueryFromHash()
      setSearchInput(search)
      setSearchQuery(search)
      setPage(nextPage)
    }

    window.addEventListener('hashchange', syncBrowseFromHash)
    return () => window.removeEventListener('hashchange', syncBrowseFromHash)
  }, [])

  const updateBrowseHash = useCallback(
    (next: CreatorsBrowseState) => {
      const nextHash = buildBrowseHash(hashBase, next)
      sessionStorage.setItem(browseStorageKey, nextHash)
      window.location.hash = nextHash
    },
    [browseStorageKey, hashBase],
  )

  const totalPages = Math.max(1, Math.ceil(total / CREATORS_PER_PAGE))

  const loadCreators = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSearchNote(null)

    try {
      const data = await fetchCreators(page, CREATORS_PER_PAGE, searchQuery, {
        twitterOnly,
      })
      setCreators(data.items)
      setTotal(data.total)
      setHasMore(Boolean(data.hasMore))
      if (data.note) setSearchNote(data.note)
    } catch (loadError) {
      setCreators([])
      setTotal(0)
      setHasMore(false)
      const msg =
        loadError instanceof Error
          ? loadError.message
          : twitterOnly
            ? 'Failed to load Twitter creators'
            : 'Failed to load creators'
      setError(
        /not valid JSON|Unexpected token|JSON\.parse/i.test(msg)
          ? 'Creators feed changed (wet3 HTML). Hard-refresh or restart `npm run dev`.'
          : msg,
      )
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery, twitterOnly])

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
        <p className="hero-eyebrow">{twitterOnly ? 'Twitter' : 'Discover'}</p>
        <h1 className="hero-title">
          {twitterOnly
            ? 'Creators with Twitter profiles'
            : 'Find your next favorite creator'}
        </h1>
        <p className="hero-copy">
          {hasMore
            ? `Page ${page} · wet3 keeps loading more creators via infinite pages`
            : `${total.toLocaleString()} on this result set`}
          {twitterOnly
            ? '. Twitter-linked tab uses the same wet3 feed (wet3 no longer filters twitterOnly server-side).'
            : '. Search scans usernames across pages (wet3 itself only filters in the browser).'}
        </p>
      </section>

      <section className="panel search-panel">
        <form className="search-row" onSubmit={submitSearch}>
          <input
            className="search-input"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={twitterOnly ? 'Search Twitter creators…' : 'Search creators…'}
            aria-label={twitterOnly ? 'Search Twitter creators' : 'Search creators'}
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
        {searchQuery && !loading ? (
          <p className="status" style={{ marginTop: 10 }}>
            Searching for “{searchQuery}” — wet3 no longer server-filters; we scan pages slowly
            (max ~20) so CF doesn’t rate-limit.
          </p>
        ) : null}
        {searchNote && !loading ? (
          <p className="status" style={{ marginTop: 8, opacity: 0.8 }}>
            {searchNote}
          </p>
        ) : null}
      </section>

      {error ? <p className="status error">{error}</p> : null}
      {loading ? <LoadingGrid count={12} variant="creators" /> : null}

      {!loading && !error ? (
        <section className="creators-grid">
          {creators.map((creator) => (
            <a
              key={creator.u}
              className="creator-card"
              href={`#/user/${encodeURIComponent(creator.u)}?from=${profileFrom}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={wet3AssetUrl(creator.p)}
                alt=""
                loading="lazy"
                onError={handleImageError}
              />
              <div className="creator-card-body">
                <strong>@{creator.u}</strong>
                <span>{creator.d}</span>
                <span className="creator-meta">{creator.ds} posts</span>
              </div>
            </a>
          ))}
        </section>
      ) : null}

      {!loading && !error && creators.length === 0 ? (
        <p className="empty">
          {twitterOnly
            ? 'No Twitter creators matched that search.'
            : 'No creators matched that search.'}
        </p>
      ) : null}

      {!loading && !error && creators.length > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          hasMore={hasMore}
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
                    href={watchUrl(item.id)}
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
                  <span className="media-date" title={item.createdAt ?? undefined}>
                    {formatMediaDate(item.createdAt)}
                  </span>
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
