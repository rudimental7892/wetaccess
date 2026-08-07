import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type SyntheticEvent,
} from 'react'
import Hls from 'hls.js'
import {
  type LzCreator,
  type LzMediaItem,
  type LzProfilePage,
  LZ_NETWORKS,
  LZ_SORTS,
  fetchLzCreators,
  fetchLzProfile,
  fetchLzStream,
  lzPhotoUrl,
  lzUserHash,
  lzWatchHash,
} from '../lib/leakedzone'

type LeakedZoneViewProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

type LzRoute =
  | { view: 'creators' }
  | { view: 'user'; slug: string; tab: 'video' | 'photo' }
  | { view: 'watch'; slug: string; id: string }

const BROWSE_KEY = 'leakedzone:browseHash'

function parseRoute(): LzRoute {
  const hash = window.location.hash || '#/'
  const path = hash.replace(/^#/, '').split('?')[0] || '/'

  const watchMatch = path.match(/^\/watch\/([^/]+)\/([^/]+)/)
  if (watchMatch) {
    return {
      view: 'watch',
      slug: decodeURIComponent(watchMatch[1]),
      id: decodeURIComponent(watchMatch[2]),
    }
  }

  const userMatch = path.match(/^\/user\/([^/]+)/)
  if (userMatch) {
    const params = new URLSearchParams(hash.split('?')[1] ?? '')
    const tab = params.get('tab') === 'photo' ? 'photo' : 'video'
    return {
      view: 'user',
      slug: decodeURIComponent(userMatch[1]),
      tab,
    }
  }

  return { view: 'creators' }
}

function rememberBrowse() {
  const h = window.location.hash
  if (h.startsWith('#/user') || h.startsWith('#/watch')) return
  sessionStorage.setItem(BROWSE_KEY, h || '#/')
}

function browseBackHash(): string {
  return sessionStorage.getItem(BROWSE_KEY) || '#/'
}

function placeholderAvatar(letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect fill="#1e293b" width="120" height="120"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-size="48" font-family="system-ui">${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function HlsPlayer({ src, poster }: { src: string; poster?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let hls: Hls | null = null

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        manifestLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 4,
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => {})
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      void video.play().catch(() => {})
    } else {
      video.src = src
    }

    return () => {
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [src])

  return (
    <video
      ref={videoRef}
      className="fb-player"
      controls
      playsInline
      poster={poster ?? undefined}
    />
  )
}

function WatchPage({ slug, id }: { slug: string; id: string }) {
  const [hls, setHls] = useState<string | null>(null)
  const [poster, setPoster] = useState<string | null>(null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [mode, setMode] = useState<'hls' | 'embed'>('hls')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hlsFailed, setHlsFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setHls(null)
    setEmbedUrl(null)
    setMode('hls')
    setHlsFailed(false)

    void fetchLzStream(slug, id)
      .then(async (data) => {
        if (cancelled) return
        setPoster(data.poster)
        setEmbedUrl(
          data.embedUrl ??
            `https://leakedzone.com/${encodeURIComponent(slug)}/video/${encodeURIComponent(id)}`,
        )
        const playlistUrl = data.playlist || data.hls
        // Probe playlist — Vercel often cannot fetch LZ /m3u8 (CF 403).
        try {
          const probe = await fetch(playlistUrl)
          const text = await probe.text()
          if (probe.ok && text.includes('#EXTM3U')) {
            setHls(playlistUrl)
            setMode('hls')
            return
          }
          setHlsFailed(true)
          setMode('embed')
        } catch {
          setHlsFailed(true)
          setMode('embed')
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setEmbedUrl(
          `https://leakedzone.com/${encodeURIComponent(slug)}/video/${encodeURIComponent(id)}`,
        )
        setMode('embed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug, id])

  return (
    <div className="fb-main">
      <section className="hero">
        <p className="hero-eyebrow">LeakedZone stream</p>
        <h1 className="fb-title">
          @{slug} · video #{id}
        </h1>
        <p className="fb-hero-line">
          {mode === 'embed'
            ? 'Host is Cloudflare-blocked for signed m3u8 — playing via embedded LeakedZone page. Bunny segments still proxy when HLS works (local/dev).'
            : 'Guest JWPlayer decode → rewritten playlist → Bunny TS via `/api/hls-proxy`.'}
        </p>
        <div className="fb-chip-row">
          <a className="fb-chip" href={browseBackHash()}>
            ← Back
          </a>
          <a className="fb-chip" href={lzUserHash(slug)}>
            Profile
          </a>
          {embedUrl ? (
            <a
              className="fb-chip"
              href={embedUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on LZ
            </a>
          ) : null}
          {hls && mode === 'embed' ? (
            <button
              type="button"
              className="fb-chip"
              onClick={() => setMode('hls')}
            >
              Try HLS
            </button>
          ) : null}
          {mode === 'hls' && embedUrl ? (
            <button
              type="button"
              className="fb-chip"
              onClick={() => setMode('embed')}
            >
              Use embed
            </button>
          ) : null}
        </div>
      </section>

      {loading ? <p className="status">Resolving stream…</p> : null}
      {error ? <p className="status error">{error}</p> : null}
      {hlsFailed && mode === 'embed' ? (
        <p className="status" style={{ opacity: 0.85 }}>
          Direct HLS blocked from this server (Cloudflare on /m3u8). Embed
          fallback active.
        </p>
      ) : null}

      {!loading && mode === 'hls' && hls ? (
        <div className="fb-watch-player">
          <HlsPlayer src={hls} poster={poster} />
        </div>
      ) : null}

      {!loading && mode === 'embed' && embedUrl ? (
        <div className="fb-watch-player lz-embed-wrap">
          <iframe
            className="lz-embed-frame"
            src={embedUrl}
            title={`LeakedZone ${slug} video ${id}`}
            allow="autoplay; fullscreen; encrypted-media"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : null}
    </div>
  )
}

function ProfilePage({
  slug,
  tab,
}: {
  slug: string
  tab: 'video' | 'photo'
}) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<LzProfilePage | null>(null)
  const [items, setItems] = useState<LzMediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useEmbed, setUseEmbed] = useState(false)

  // Reset when slug/tab change
  useEffect(() => {
    setPage(1)
    setItems([])
    setData(null)
    setUseEmbed(false)
  }, [slug, tab])

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await fetchLzProfile({ slug, tab, page: nextPage })
        setData(res)
        setPage(res.page)
        setUseEmbed(false)
        setItems((prev) => {
          if (!append) return res.items
          const seen = new Set(prev.map((i) => i.id))
          return [...prev, ...res.items.filter((i) => !seen.has(i.id))]
        })
      } catch (e: unknown) {
        if (!append) {
          setItems([])
          setData(null)
          setUseEmbed(true)
        }
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [slug, tab],
  )

  useEffect(() => {
    void load(1, false)
  }, [load])

  const onImgError = (e: SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = placeholderAvatar(slug.charAt(0).toUpperCase())
  }

  return (
    <div className="fb-main">
      <section className="profile-hero">
        <div className="profile-hero-top">
          {data?.avatar ? (
            <img
              className="profile-avatar"
              src={data.avatar}
              alt=""
              onError={onImgError}
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div className="profile-avatar" aria-hidden>
              {slug.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <h1 className="profile-title">@{slug}</h1>
          <p className="profile-subtitle">
            {data?.name && data.name !== slug ? data.name : 'LeakedZone profile'}
          </p>
        </div>
        <div className="stat-row">
          {data?.videoCount != null ? (
            <span className="stat-pill">
              <strong>{data.videoCount.toLocaleString()}</strong> videos
            </span>
          ) : null}
          {data?.photoCount != null ? (
            <span className="stat-pill">
              <strong>{data.photoCount.toLocaleString()}</strong> photos
            </span>
          ) : null}
          <span className="stat-pill">
            <strong>{items.length}</strong> loaded
          </span>
        </div>
        <div className="fb-chip-row" style={{ marginTop: 12 }}>
          <a className="fb-chip" href={browseBackHash()}>
            ← Creators
          </a>
          <a
            className={`fb-chip${tab === 'video' ? ' active' : ''}`}
            href={`#/user/${encodeURIComponent(slug)}?tab=video`}
          >
            Videos
          </a>
          <a
            className={`fb-chip${tab === 'photo' ? ' active' : ''}`}
            href={`#/user/${encodeURIComponent(slug)}?tab=photo`}
          >
            Photos
          </a>
        </div>
      </section>

      {error ? (
        <p className="status error">
          {error}
          {useEmbed
            ? ' — live scrape blocked; embedded profile below (or open on LZ).'
            : ''}
        </p>
      ) : null}
      {loading ? <p className="status">Loading media…</p> : null}

      {!loading && useEmbed ? (
        <div className="fb-watch-player lz-embed-wrap">
          <iframe
            className="lz-embed-frame"
            src={`https://leakedzone.com/${encodeURIComponent(slug)}${
              tab === 'photo' ? '/photo' : '/video'
            }`}
            title={`LeakedZone @${slug}`}
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <section className="media-section panel">
          <div className="media-grid">
            {items.map((item) =>
              item.type === 'video' ? (
                <article key={item.id} className="media-item">
                  <a
                    className="media-card"
                    href={lzWatchHash(item.slug, item.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Watch video ${item.id}`}
                    onClick={rememberBrowse}
                  >
                    <img
                      src={item.thumb}
                      alt=""
                      loading="lazy"
                      onError={onImgError}
                    />
                    <span className="video-badge" aria-hidden>
                      ▶
                    </span>
                  </a>
                  <div className="media-card-meta">
                    <span className="media-label">#{item.id}</span>
                  </div>
                </article>
              ) : (
                <article key={item.id} className="media-item">
                  <a
                    className="media-card"
                    href={lzPhotoUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View photo ${item.id}`}
                  >
                    <img
                      src={item.thumb}
                      alt=""
                      loading="lazy"
                      onError={onImgError}
                    />
                  </a>
                  <div className="media-card-meta">
                    <span className="media-label">#{item.id}</span>
                  </div>
                </article>
              ),
            )}
          </div>

          {data?.hasMore ? (
            <div className="fb-chip-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loadingMore}
                onClick={() => void load(page + 1, true)}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
              {data.lastPage ? (
                <span className="status">
                  Page {page} / {data.lastPage}
                </span>
              ) : (
                <span className="status">Page {page}</span>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <p className="empty">No {tab === 'photo' ? 'photos' : 'videos'} found.</p>
      ) : null}
    </div>
  )
}

function CreatorsBrowse() {
  const [page, setPage] = useState(1)
  const [networks, setNetworks] = useState('')
  const [sort, setSort] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [items, setItems] = useState<LzCreator[]>([])
  const [lastPage, setLastPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNote(null)
    try {
      const data = await fetchLzCreators({ page, networks, sort })
      setItems(data.items)
      setLastPage(data.lastPage)
      setHasMore(data.hasMore)
      if (data.note) setNote(data.note)
    } catch (e: unknown) {
      setItems([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [page, networks, sort])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (c) =>
        c.slug.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    )
  }, [items, searchQuery])

  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    const q = searchInput.trim()
    // Exact slug jump (search API is CF-blocked)
    if (q && !q.includes(' ') && /^[a-zA-Z0-9._-]+$/.test(q.replace(/^@/, ''))) {
      const slug = q.replace(/^@/, '')
      // If not on current page, still open profile
      rememberBrowse()
      window.location.hash = lzUserHash(slug)
      return
    }
    setSearchQuery(q)
  }

  const onImgError = (e: SyntheticEvent<HTMLImageElement>, slug: string) => {
    e.currentTarget.src = placeholderAvatar(slug.charAt(0).toUpperCase())
  }

  return (
    <div className="fb-main">
      <section className="hero">
        <p className="hero-eyebrow">Guest HTML scrape</p>
        <h1 className="fb-title">LeakedZone creators</h1>
        <p className="fb-hero-line">
          SSR catalog (~{lastPage.toLocaleString()} pages). Photos open on CDN;
          videos decode JWPlayer → proxied HLS. Site search is Cloudflare-blocked —
          filter this page or open a slug directly.
        </p>
        <div className="fb-stats">
          {loading ? 'Loading…' : null}
          {error ? <span className="error">{error}</span> : null}
          {!loading && !error ? (
            <>
              <span>
                <strong>{items.length}</strong> on page {page}
              </span>
              <span>
                <strong>{lastPage.toLocaleString()}</strong> pages
              </span>
            </>
          ) : null}
        </div>
      </section>

      <section className="panel search-panel">
        <form className="search-row" onSubmit={submitSearch}>
          <input
            className="search-input"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Filter page or open @slug…"
            aria-label="Search creators"
          />
          <button type="submit" className="btn btn-primary">
            Go
          </button>
          {searchQuery ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSearchInput('')
                setSearchQuery('')
              }}
            >
              Clear
            </button>
          ) : null}
        </form>
        <div className="fb-chip-row" style={{ marginTop: 12 }}>
          <label className="fb-field" style={{ margin: 0 }}>
            <span className="status" style={{ marginRight: 6 }}>
              Network
            </span>
            <select
              value={networks}
              onChange={(e) => {
                setNetworks(e.target.value)
                setPage(1)
              }}
            >
              {LZ_NETWORKS.map((n) => (
                <option key={n.value || 'all'} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
          <label className="fb-field" style={{ margin: 0 }}>
            <span className="status" style={{ marginRight: 6 }}>
              Sort
            </span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value)
                setPage(1)
              }}
            >
              {LZ_SORTS.map((s) => (
                <option key={s.value || 'default'} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? <p className="status error">{error}</p> : null}
      {note && !error ? (
        <p className="status" style={{ opacity: 0.85 }}>
          {note}
        </p>
      ) : null}
      {loading ? <p className="status">Loading creators…</p> : null}

      {!loading && items.length > 0 ? (
        <section className="creators-grid">
          {filtered.map((c) => (
            <a
              key={c.slug}
              className="creator-card"
              href={lzUserHash(c.slug)}
              onClick={rememberBrowse}
            >
              <img
                src={c.avatar}
                alt=""
                loading="lazy"
                onError={(e) => onImgError(e, c.slug)}
              />
              <div className="creator-card-body">
                <strong>@{c.slug}</strong>
                <span>{c.name}</span>
                <span className="creator-meta">id {c.modelId}</span>
              </div>
            </a>
          ))}
        </section>
      ) : null}

      {!loading && items.length > 0 && filtered.length === 0 ? (
        <p className="empty">No creators on this page match the filter.</p>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="fb-chip-row" style={{ marginTop: 20, justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="status">
            Page {page}
            {lastPage ? ` / ${lastPage.toLocaleString()}` : ''}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!hasMore && page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function LeakedZoneView({ onSwitchSite, onLogout }: LeakedZoneViewProps) {
  const [route, setRoute] = useState(parseRoute)

  useEffect(() => {
    const onHash = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash || window.location.hash === '#/') {
      // keep #/ as creators home
    }
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="app fb-app">
      <header className="app-nav">
        <div className="app-nav-start">
          <a href="#/" className="app-brand" onClick={rememberBrowse}>
            <span className="app-brand-mark lz">LZ</span>
            <span className="app-brand-text">LeakedZone</span>
          </a>
          <nav className="app-nav-tabs" aria-label="Primary">
            <a
              href="#/"
              className={`nav-tab${route.view === 'creators' ? ' active' : ''}`}
              onClick={rememberBrowse}
            >
              Creators
            </a>
          </nav>
        </div>
        <div className="app-nav-actions">
          <button type="button" className="nav-pill" onClick={onSwitchSite}>
            Switch site
          </button>
          <button type="button" className="nav-pill" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="page fb-page">
        {route.view === 'watch' ? (
          <WatchPage slug={route.slug} id={route.id} />
        ) : route.view === 'user' ? (
          <ProfilePage slug={route.slug} tab={route.tab} />
        ) : (
          <CreatorsBrowse />
        )}
      </main>
    </div>
  )
}
