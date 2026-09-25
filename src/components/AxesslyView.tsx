import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Hls from 'hls.js'
import {
  type AxCreator,
  type AxPost,
  fetchAxCreators,
  fetchAxFeed,
  fetchAxPosts,
  axStreamUrl,
  axWatchHash,
  axIsLocked,
  axIsPremium,
  axFormatPrice,
  axFormatDuration,
  axFormatDate,
} from '../lib/axessly'

type AxesslyViewProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

type AxRoute =
  | { view: 'creators' }
  | { view: 'feed'; filter: 'all' | 'locked' | 'unlocked' | 'premium' }
  | { view: 'user'; username: string }
  | { view: 'watch'; uid: string }

const BROWSE_KEY = 'axessly:browseHash'

function parseRoute(): AxRoute {
  const hash = window.location.hash || '#/creators'
  const [pathPart, queryPart = ''] = hash.replace(/^#/, '').split('?')
  const pathname = pathPart || '/creators'
  const params = new URLSearchParams(queryPart)

  const watchMatch = pathname.match(/^\/watch\/([^/]+)/)
  if (watchMatch) {
    return { view: 'watch', uid: decodeURIComponent(watchMatch[1]) }
  }

  const userMatch = pathname.match(/^\/user\/([^/]+)/)
  if (userMatch) {
    return { view: 'user', username: decodeURIComponent(userMatch[1]) }
  }

  if (pathname.startsWith('/feed')) {
    const filterRaw = params.get('filter')
    const filter =
      filterRaw === 'locked' || filterRaw === 'unlocked' || filterRaw === 'premium'
        ? filterRaw
        : 'all'
    return { view: 'feed', filter }
  }

  return { view: 'creators' }
}

function rememberBrowse() {
  const h = window.location.hash
  if (h.startsWith('#/user') || h.startsWith('#/watch')) return
  sessionStorage.setItem(BROWSE_KEY, h || '#/creators')
}

function browseBackHash(): string {
  return sessionStorage.getItem(BROWSE_KEY) || '#/creators'
}

function CreatorCard({ creator }: { creator: AxCreator }) {
  const handle = creator.username
  return (
    <a
      className="fb-user-card link"
      href={`#/user/${encodeURIComponent(handle)}`}
      onClick={rememberBrowse}
    >
      <div className="fb-user-avatar">
        {creator.avatar_url ? (
          <img src={creator.avatar_url} alt="" />
        ) : null}
      </div>
      <div className="fb-user-meta">
        <strong>@{handle}</strong>
        <span className="fb-user-sub">
          {creator.name || creator.full_name || '—'}
        </span>
        <span className="fb-user-leak">
          {creator.posts_count ?? 0} posts · {creator.followers_count ?? 0}{' '}
          followers
        </span>
      </div>
      <div className="fb-user-flags">
        {creator.is_verified ? (
          <span className="fb-pill ok">verified</span>
        ) : null}
        {creator.is_live ? (
          <span className="fb-pill danger">LIVE</span>
        ) : null}
        {creator.subscription_price ? (
          <span className="fb-pill">
            {axFormatPrice(creator.subscription_price)}
          </span>
        ) : null}
      </div>
      <span className="fb-open-hint">Open →</span>
    </a>
  )
}

function PostCard({ post }: { post: AxPost }) {
  const locked = axIsLocked(post)
  const premium = axIsPremium(post)
  const creator = post.creator
  const handle = creator?.username || 'unknown'
  const hasVideo = Boolean(post.cf_stream_uid || post.media_url)
  const dur = axFormatDuration(post.duration)

  return (
    <article className="fb-post-card">
      <div className="fb-post-head">
        <a
          className="fb-link"
          href={`#/user/${encodeURIComponent(handle)}`}
          onClick={rememberBrowse}
        >
          <strong>@{handle}</strong>
        </a>
        <div className="fb-post-badges">
          {locked ? (
            <span className="fb-pill danger">locked</span>
          ) : premium ? (
            <span className="fb-pill warn">premium (unlocked)</span>
          ) : (
            <span className="fb-pill ok">public</span>
          )}
          {post.price ? (
            <span className="fb-pill">{axFormatPrice(post.price)}</span>
          ) : null}
          {dur ? <span className="fb-pill">{dur}</span> : null}
          <span className="fb-muted">{axFormatDate(post.created_at)}</span>
        </div>
      </div>
      {post.caption ? <p className="fb-post-body">{post.caption}</p> : null}

      <div className="fb-media-grid">
        {hasVideo && post.cf_stream_uid && !locked ? (
          <a
            className="fb-media-thumb video"
            href={axWatchHash(post.cf_stream_uid)}
            aria-label={`Play video${dur ? `, ${dur}` : ''}`}
          >
            {post.thumb_url ? (
              <img src={post.thumb_url} alt="" loading="lazy" />
            ) : null}
            <span className="fb-media-badge" aria-hidden>
              ▶
            </span>
            {dur ? (
              <span className="ft-media-duration">{dur}</span>
            ) : null}
          </a>
        ) : post.thumb_url ? (
          <div className="fb-media-thumb">
            <img src={post.thumb_url} alt="" loading="lazy" />
            {locked ? (
              <span className="fb-media-badge" aria-hidden>
                🔒
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="fb-post-foot">
        <span className="fb-muted mono">{post.id}</span>
        <span className="fb-muted">
          {post.visibility || '—'} · {post.cf_stream_uid ? 'CF Stream' : 'no video'}
        </span>
      </div>
    </article>
  )
}

function HlsPlayer({ uid }: { uid: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const src = axStreamUrl(uid)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      return
    }

    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    }

    video.src = src
  }, [src])

  return (
    <video
      ref={videoRef}
      className="fb-player"
      controls
      autoPlay
      playsInline
      style={{ width: '100%', maxWidth: 960, borderRadius: 12, background: '#000' }}
    />
  )
}

function WatchPage({
  uid,
  posts,
}: {
  uid: string
  posts: AxPost[]
}) {
  const match = useMemo(() => {
    for (const p of posts) {
      if (p.cf_stream_uid === uid) return p
    }
    return null
  }, [posts, uid])

  const dur = axFormatDuration(match?.duration)
  const creator = match?.creator

  return (
    <div className="fb-detail-page">
      <div className="fb-detail-nav">
        <a href={browseBackHash()} className="nav-pill">
          ← Back
        </a>
        {creator?.username ? (
          <a
            href={`#/user/${encodeURIComponent(creator.username)}`}
            className="nav-pill"
          >
            @{creator.username}
          </a>
        ) : null}
      </div>

      <section className="hero">
        <p className="hero-eyebrow">CF Stream HLS</p>
        <h1 className="fb-title">
          {match && axIsPremium(match) ? 'Premium video' : 'Video'}
          {dur ? (
            <span className="ft-watch-duration"> · {dur}</span>
          ) : null}
        </h1>
        {match?.caption ? (
          <p className="fb-hero-line">{match.caption}</p>
        ) : null}
        {match?.price ? (
          <p className="fb-hero-line">
            Price: {axFormatPrice(match.price)} ·{' '}
            {axIsLocked(match) ? 'Locked' : 'Unlocked to free account'}
          </p>
        ) : null}
      </section>

      <div className="ft-watch-player-wrap">
        <HlsPlayer uid={uid} />
      </div>
      <p className="fb-modal-meta mono">{uid}</p>
    </div>
  )
}

function UserDetail({
  username,
  feedPosts,
}: {
  username: string
  feedPosts: AxPost[]
}) {
  const [posts, setPosts] = useState<AxPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creators, setCreators] = useState<AxCreator[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchAxPosts(username)
      .then((data) => {
        if (!cancelled) setPosts(data)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          const fromFeed = feedPosts.filter(
            (p) => p.creator?.username?.toLowerCase() === username.toLowerCase(),
          )
          setPosts(fromFeed)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [username, feedPosts])

  useEffect(() => {
    void fetchAxCreators().then(setCreators).catch(() => {})
  }, [])

  const creator = useMemo(
    () =>
      creators.find(
        (c) => c.username.toLowerCase() === username.toLowerCase(),
      ) ?? null,
    [creators, username],
  )

  const stats = useMemo(() => {
    const premium = posts.filter((p) => axIsPremium(p)).length
    const locked = posts.filter((p) => axIsLocked(p)).length
    const unlocked = posts.filter(
      (p) => axIsPremium(p) && !axIsLocked(p),
    ).length
    const videos = posts.filter((p) => p.cf_stream_uid).length
    return { premium, locked, unlocked, videos }
  }, [posts])

  return (
    <div className="fb-detail-page">
      <div className="fb-detail-nav">
        <a href={browseBackHash()} className="nav-pill">
          ← Back
        </a>
      </div>

      <section className="fb-profile-header">
        {creator?.banner_url ? (
          <img
            className="fb-profile-banner"
            src={creator.banner_url}
            alt=""
          />
        ) : null}
        <div className="fb-profile-identity">
          <div className="fb-user-avatar lg">
            {creator?.avatar_url ? (
              <img src={creator.avatar_url} alt="" />
            ) : null}
          </div>
          <div>
            <h1 className="fb-title">@{username}</h1>
            <p className="fb-hero-line">
              {creator?.name || creator?.full_name || '—'}
            </p>
            {creator?.bio ? (
              <p className="fb-muted">{creator.bio}</p>
            ) : null}
            {loading ? <p className="fb-muted">Loading posts…</p> : null}
            {error ? <p className="fb-stats error">{error}</p> : null}
          </div>
        </div>
      </section>

      <div className="fb-detail-grid">
        <section className="fb-section">
          <h3>Profile</h3>
          <dl className="fb-fields">
            {creator?.followers_count != null ? (
              <div className="fb-field">
                <dt>Followers</dt>
                <dd>{creator.followers_count}</dd>
              </div>
            ) : null}
            {creator?.posts_count != null ? (
              <div className="fb-field">
                <dt>Posts (profile)</dt>
                <dd>{creator.posts_count}</dd>
              </div>
            ) : null}
            {creator?.subscription_price != null ? (
              <div className="fb-field">
                <dt>Subscription</dt>
                <dd>{axFormatPrice(creator.subscription_price)}</dd>
              </div>
            ) : null}
            {creator?.is_verified != null ? (
              <div className="fb-field">
                <dt>Verified</dt>
                <dd>{creator.is_verified ? 'Yes' : 'No'}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="fb-section danger-box">
          <h3>Content gating (API response)</h3>
          <dl className="fb-fields">
            <div className="fb-field">
              <dt>Posts returned</dt>
              <dd>{posts.length}</dd>
            </div>
            <div className="fb-field">
              <dt>Premium</dt>
              <dd>{stats.premium}</dd>
            </div>
            <div className="fb-field danger">
              <dt>Premium but unlocked</dt>
              <dd className="mono">{stats.unlocked}</dd>
            </div>
            <div className="fb-field">
              <dt>Properly locked</dt>
              <dd>{stats.locked}</dd>
            </div>
            <div className="fb-field">
              <dt>Videos (CF Stream)</dt>
              <dd>{stats.videos}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="fb-section">
        <h3>Posts ({posts.length})</h3>
        <div className="fb-post-list">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
          {!loading && posts.length === 0 ? (
            <p className="fb-empty">No posts for this creator.</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export function AxesslyView({ onSwitchSite, onLogout }: AxesslyViewProps) {
  const [route, setRoute] = useState(parseRoute)
  const [posts, setPosts] = useState<AxPost[]>([])
  const [creators, setCreators] = useState<AxCreator[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash || window.location.hash === '#/') {
      window.location.hash = '#/creators'
    }
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [feedData, creatorsData] = await Promise.all([
        fetchAxFeed(50),
        fetchAxCreators(),
      ])
      setPosts(feedData)
      setCreators(creatorsData)
    } catch (e: unknown) {
      setPosts([])
      setCreators([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredPosts = useMemo(() => {
    if (route.view !== 'feed') return posts
    if (route.filter === 'locked') {
      return posts.filter((p) => axIsLocked(p))
    }
    if (route.filter === 'unlocked') {
      return posts.filter((p) => axIsPremium(p) && !axIsLocked(p))
    }
    if (route.filter === 'premium') {
      return posts.filter((p) => axIsPremium(p))
    }
    return posts
  }, [posts, route])

  const stats = useMemo(() => {
    const premium = posts.filter((p) => axIsPremium(p)).length
    const locked = posts.filter((p) => axIsLocked(p)).length
    const unlocked = posts.filter(
      (p) => axIsPremium(p) && !axIsLocked(p),
    ).length
    const videos = posts.filter((p) => p.cf_stream_uid).length
    return { premium, locked, unlocked, videos }
  }, [posts])

  return (
    <div className="app fb-app">
      <header className="app-nav">
        <div className="app-nav-start">
          <a href="#/creators" className="app-brand">
            <span className="app-brand-mark ax">AX</span>
            <span className="app-brand-text">Axessly</span>
          </a>
          <nav className="app-nav-tabs" aria-label="Primary">
            <a
              href="#/creators"
              className={`nav-tab${route.view === 'creators' ? ' active' : ''}`}
            >
              Creators
            </a>
            <a
              href="#/feed"
              className={`nav-tab${route.view === 'feed' ? ' active' : ''}`}
            >
              Feed
            </a>
          </nav>
        </div>
        <div className="app-nav-actions">
          <button type="button" className="nav-pill" onClick={() => void load()}>
            Refresh
          </button>
          <button type="button" className="nav-pill" onClick={onSwitchSite}>
            Switch site
          </button>
          <button type="button" className="nav-pill" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="page fb-page">
        <div className="fb-main">
          {route.view === 'watch' ? (
            <WatchPage uid={route.uid} posts={posts} />
          ) : route.view === 'user' ? (
            <UserDetail username={route.username} feedPosts={posts} />
          ) : route.view === 'creators' ? (
            <>
              <section className="hero">
                <p className="hero-eyebrow">Content gating bypass</p>
                <h1 className="fb-title">Axessly CF Stream</h1>
                <p className="fb-hero-line">
                  Free account sees {stats.unlocked} of {stats.premium} premium
                  posts unlocked with full CF Stream HLS URLs. Videos play unsigned
                  — wildcard CORS, no token.
                </p>
                <div className="fb-stats">
                  {loading ? 'Loading…' : null}
                  {error ? <span className="error">{error}</span> : null}
                  {!loading && !error ? (
                    <>
                      <span>
                        <strong>{creators.length}</strong> creators
                      </span>
                      <span>
                        <strong>{posts.length}</strong> posts
                      </span>
                      <span>
                        <strong>{stats.premium}</strong> premium
                      </span>
                      <span className="error">
                        <strong>{stats.unlocked}</strong> unlocked
                      </span>
                      <span>
                        <strong>{stats.locked}</strong> locked
                      </span>
                      <span>
                        <strong>{stats.videos}</strong> videos
                      </span>
                    </>
                  ) : null}
                </div>
              </section>

              <div className="fb-user-list">
                {creators.map((c) => (
                  <CreatorCard key={c.username} creator={c} />
                ))}
                {!loading && creators.length === 0 ? (
                  <p className="fb-empty">No creators.</p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <section className="hero">
                <p className="hero-eyebrow">Content gating bypass</p>
                <h1 className="fb-title">Axessly Feed</h1>
                <p className="fb-hero-line">
                  {stats.unlocked} of {stats.premium} premium posts unlocked.
                  Locked posts properly withhold <code>media_url</code>.
                </p>
              </section>

              <div className="fb-chip-row">
                {(
                  [
                    ['all', 'All'],
                    ['premium', 'Premium'],
                    ['unlocked', 'Unlocked'],
                    ['locked', 'Locked'],
                  ] as const
                ).map(([id, label]) => (
                  <a
                    key={id}
                    href={`#/feed?filter=${id}`}
                    className={`fb-chip${route.view === 'feed' && route.filter === id ? ' active' : ''}${id === 'unlocked' ? ' danger' : ''}`}
                  >
                    {label}
                  </a>
                ))}
              </div>

              <div className="fb-post-list">
                {filteredPosts.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
                {!loading && filteredPosts.length === 0 ? (
                  <p className="fb-empty">No posts in this filter.</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
