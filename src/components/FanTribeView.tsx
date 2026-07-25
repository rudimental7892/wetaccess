import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import {
  type FtAuthor,
  type FtMedia,
  type FtPost,
  fetchFtPosts,
  fetchFtProfile,
  ftCreatorsFromPosts,
  ftFormatDate,
  ftFormatDuration,
  ftHasKyc,
  ftIsLocked,
  ftStreamUrl,
  ftThumbUrl,
  ftWatchHash,
} from '../lib/fantribe'

type FanTribeViewProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

type FtRoute =
  | { view: 'posts'; filter: 'all' | 'locked' | 'public' | 'adult' }
  | { view: 'creators' }
  | { view: 'user'; username: string }
  | { view: 'watch'; guid: string }

const BROWSE_KEY = 'fantribe:browseHash'

function parseRoute(): FtRoute {
  const hash = window.location.hash || '#/posts'
  const [pathPart, queryPart = ''] = hash.replace(/^#/, '').split('?')
  const pathname = pathPart || '/posts'
  const params = new URLSearchParams(queryPart)

  const watchMatch = pathname.match(/^\/watch\/([^/]+)/)
  if (watchMatch) {
    return { view: 'watch', guid: decodeURIComponent(watchMatch[1]) }
  }

  const userMatch = pathname.match(/^\/user\/([^/]+)/)
  if (userMatch) {
    return { view: 'user', username: decodeURIComponent(userMatch[1]) }
  }

  if (pathname.startsWith('/creators')) {
    return { view: 'creators' }
  }

  const filterRaw = params.get('filter')
  const filter =
    filterRaw === 'locked' ||
    filterRaw === 'public' ||
    filterRaw === 'adult'
      ? filterRaw
      : 'all'
  return { view: 'posts', filter }
}

function rememberBrowse() {
  const h = window.location.hash
  if (h.startsWith('#/user') || h.startsWith('#/watch')) return
  sessionStorage.setItem(BROWSE_KEY, h || '#/posts')
}

function browseBackHash(): string {
  return sessionStorage.getItem(BROWSE_KEY) || '#/posts'
}

function Field({
  label,
  value,
  mono,
  danger,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  danger?: boolean
}) {
  if (value == null || value === '' || value === '—') return null
  return (
    <div className={`fb-field${danger ? ' danger' : ''}`}>
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{value}</dd>
    </div>
  )
}

function VideoThumb({ media }: { media: FtMedia }) {
  const [duration, setDuration] = useState<number | null>(
    typeof media.duration === 'number' ? media.duration : null,
  )
  const [useVideoFrame, setUseVideoFrame] = useState(false)
  const thumbSrc = ftThumbUrl(media.mediaId)
  const streamSrc = ftStreamUrl(media.mediaId)
  const label = ftFormatDuration(duration)

  const onThumbError = () => setUseVideoFrame(true)

  const onMeta = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration)
    }
    // Nudge off frame 0 so the poster isn't a black keyframe.
    if (video.currentTime < 0.05) {
      video.currentTime = Math.min(0.75, Math.max(0.1, video.duration * 0.05 || 0.75))
    }
  }

  return (
    <a
      className="fb-media-thumb video ft-media-thumb"
      href={ftWatchHash(media.mediaId)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Play video${label ? `, ${label}` : ''}`}
    >
      {!useVideoFrame ? (
        <img src={thumbSrc} alt="" loading="lazy" onError={onThumbError} />
      ) : (
        <video
          src={streamSrc}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={onMeta}
        />
      )}
      {/* Hidden metadata probe when poster img works but API duration missing */}
      {!useVideoFrame && duration == null ? (
        <video
          className="ft-meta-probe"
          src={streamSrc}
          muted
          preload="metadata"
          onLoadedMetadata={onMeta}
          aria-hidden
        />
      ) : null}
      <span className="fb-media-badge ft-play-badge" aria-hidden>
        ▶
      </span>
      {label ? (
        <span className="ft-media-duration">{label}</span>
      ) : null}
    </a>
  )
}

function MediaGrid({ medias }: { medias: FtMedia[] }) {
  return (
    <div className="fb-media-grid">
      {medias.map((m) =>
        m.type === 'video' ? (
          <VideoThumb key={m.mediaId} media={m} />
        ) : (
          <a
            key={m.mediaId}
            className="fb-media-thumb"
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open image"
          >
            <img src={m.url} alt="" loading="lazy" />
          </a>
        ),
      )}
    </div>
  )
}

function PostCard({ post }: { post: FtPost }) {
  const locked = ftIsLocked(post)
  const author = post.author
  const handle = author?.username || author?.name || 'unknown'

  return (
    <article className="fb-post-card">
      <div className="fb-post-head">
        <a
          className="fb-link"
          href={`#/user/${encodeURIComponent(handle)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={rememberBrowse}
        >
          <strong>@{handle}</strong>
        </a>
        <div className="fb-post-badges">
          {locked ? (
            <span className="fb-pill danger">subscribers_only</span>
          ) : (
            <span className="fb-pill ok">public</span>
          )}
          {post.isAdult ? <span className="fb-pill warn">+18</span> : null}
          <span className="fb-muted">{ftFormatDate(post._creationTime)}</span>
        </div>
      </div>
      {post.content ? <p className="fb-post-body">{post.content}</p> : null}
      <MediaGrid medias={post.medias || []} />
      <div className="fb-post-foot">
        <span className="fb-muted mono">{post._id.slice(0, 16)}…</span>
        <span className="fb-muted">{(post.medias || []).length} media</span>
      </div>
    </article>
  )
}

function CreatorCard({ user }: { user: FtAuthor }) {
  const handle = user.username || user._id
  return (
    <a
      className="fb-user-card link"
      href={`#/user/${encodeURIComponent(handle)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={rememberBrowse}
    >
      <div className="fb-user-avatar">
        {user.image ? <img src={user.image} alt="" /> : null}
      </div>
      <div className="fb-user-meta">
        <strong>@{handle}</strong>
        <span className="fb-user-sub">{user.name}</span>
        <span className="fb-user-leak">
          {user.email ? `✉ ${user.email}` : 'no email'}
          {ftHasKyc(user) ? ' · KYC' : ''}
        </span>
      </div>
      <div className="fb-user-flags">
        <span className="fb-pill">{user.accountType || '—'}</span>
        {user.email ? <span className="fb-pill danger">email</span> : null}
        {ftHasKyc(user) ? <span className="fb-pill danger">KYC</span> : null}
      </div>
      <span className="fb-open-hint">Open →</span>
    </a>
  )
}

function WatchPage({
  guid,
  posts,
}: {
  guid: string
  posts: FtPost[]
}) {
  const match = useMemo(() => {
    for (const p of posts) {
      for (const m of p.medias || []) {
        if (m.type === 'video' && m.mediaId === guid) {
          return { post: p, media: m }
        }
      }
    }
    return null
  }, [posts, guid])

  const [duration, setDuration] = useState<number | null>(
    match?.media.duration ?? null,
  )
  const src = ftStreamUrl(guid)
  const author = match?.post.author
  const handle = author?.username || author?.name

  return (
    <div className="fb-detail-page ft-watch-page">
      <div className="fb-detail-nav">
        <a href={browseBackHash()} className="nav-pill">
          ← Back
        </a>
        {handle ? (
          <a
            href={`#/user/${encodeURIComponent(handle)}`}
            className="nav-pill"
            target="_blank"
            rel="noopener noreferrer"
          >
            @{handle}
          </a>
        ) : null}
      </div>

      <section className="hero">
        <p className="hero-eyebrow">Stream proxy</p>
        <h1 className="fb-title">
          {match?.post.visibility === 'subscribers_only'
            ? 'Locked video'
            : 'Video'}
          {duration != null ? (
            <span className="ft-watch-duration">
              {' '}
              · {ftFormatDuration(duration)}
            </span>
          ) : null}
        </h1>
        {match?.post.content ? (
          <p className="fb-hero-line">{match.post.content}</p>
        ) : null}
      </section>

      <div className="ft-watch-player-wrap">
        <video
          className="fb-player ft-watch-player"
          src={src}
          controls
          autoPlay
          playsInline
          poster={ftThumbUrl(guid)}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (Number.isFinite(v.duration)) setDuration(v.duration)
          }}
        />
      </div>
      <p className="fb-modal-meta mono">{guid}</p>
    </div>
  )
}

function UserDetail({
  username,
  posts,
}: {
  username: string
  posts: FtPost[]
}) {
  const [profile, setProfile] = useState<FtAuthor | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const userPosts = useMemo(
    () =>
      posts.filter(
        (p) =>
          (p.author?.username || '').toLowerCase() === username.toLowerCase(),
      ),
    [posts, username],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchFtProfile(username)
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [username])

  const pi = profile?.personalInfo

  return (
    <div className="fb-detail-page">
      <div className="fb-detail-nav">
        <a href={browseBackHash()} className="nav-pill">
          ← Back
        </a>
      </div>

      <section className="fb-profile-header">
        {profile?.imageBanner ? (
          <img className="fb-profile-banner" src={profile.imageBanner} alt="" />
        ) : null}
        <div className="fb-profile-identity">
          <div className="fb-user-avatar lg">
            {profile?.image ? <img src={profile.image} alt="" /> : null}
          </div>
          <div>
            <h1 className="fb-title">@{username}</h1>
            <p className="fb-hero-line">{profile?.name || '—'}</p>
            {loading ? <p className="fb-muted">Loading profile…</p> : null}
            {error ? <p className="fb-stats error">{error}</p> : null}
          </div>
        </div>
      </section>

      <div className="fb-detail-grid">
        <section className="fb-section danger-box">
          <h3>Guest PII (`users:getUserProfile`)</h3>
          <dl className="fb-fields">
            <Field label="Email" value={profile?.email} danger mono />
            <Field label="Clerk externalId" value={profile?.externalId} mono />
            <Field
              label="tokenIdentifier"
              value={profile?.tokenIdentifier}
              mono
            />
            <Field label="Account" value={profile?.accountType} />
            <Field label="Location" value={profile?.location} />
            <Field label="Bio" value={profile?.bio} />
          </dl>
        </section>

        <section className="fb-section danger-box">
          <h3>KYC personalInfo</h3>
          {ftHasKyc(profile) ? (
            <dl className="fb-fields">
              <Field label="Full name" value={pi?.fullName} danger />
              <Field label="Date of birth" value={pi?.dateOfBirth} danger />
              <Field label="Address" value={pi?.address} danger />
              <Field label="WhatsApp" value={pi?.whatsappNumber} danger mono />
              <Field
                label="Mobile Money"
                value={pi?.mobileMoneyNumber}
                danger
                mono
              />
              <Field
                label="Mobile Money 2"
                value={pi?.mobileMoneyNumber2}
                danger
                mono
              />
            </dl>
          ) : (
            <p className="fb-muted">No personalInfo on this profile.</p>
          )}
        </section>
      </div>

      <section className="fb-section">
        <h3>
          Posts from dump ({userPosts.length}) — locked medias included
        </h3>
        <div className="fb-post-list">
          {userPosts.map((p) => (
            <PostCard key={p._id} post={p} />
          ))}
          {userPosts.length === 0 ? (
            <p className="fb-empty">No posts for this creator in getAllPosts.</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export function FanTribeView({ onSwitchSite, onLogout }: FanTribeViewProps) {
  const [route, setRoute] = useState(parseRoute)
  const [posts, setPosts] = useState<FtPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash || window.location.hash === '#/') {
      window.location.hash = '#/posts'
    }
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchFtPosts()
      setPosts(rows)
    } catch (e: unknown) {
      setPosts([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const creators = useMemo(() => ftCreatorsFromPosts(posts), [posts])

  const filteredPosts = useMemo(() => {
    if (route.view !== 'posts') return posts
    if (route.filter === 'locked') {
      return posts.filter((p) => ftIsLocked(p))
    }
    if (route.filter === 'public') {
      return posts.filter((p) => !ftIsLocked(p))
    }
    if (route.filter === 'adult') {
      return posts.filter((p) => p.isAdult)
    }
    return posts
  }, [posts, route])

  const stats = useMemo(() => {
    const locked = posts.filter((p) => ftIsLocked(p)).length
    const adult = posts.filter((p) => p.isAdult).length
    const emails = creators.filter((c) => c.email).length
    const kyc = creators.filter((c) => ftHasKyc(c)).length
    let images = 0
    let videos = 0
    for (const p of posts) {
      for (const m of p.medias || []) {
        if (m.type === 'video') videos += 1
        else images += 1
      }
    }
    return { locked, adult, emails, kyc, images, videos }
  }, [posts, creators])

  return (
    <div className="app fb-app">
      <header className="app-nav">
        <div className="app-nav-start">
          <a href="#/posts" className="app-brand">
            <span className="app-brand-mark ft">FT</span>
            <span className="app-brand-text">FanTribe</span>
          </a>
          <nav className="app-nav-tabs" aria-label="Primary">
            <a
              href="#/posts"
              className={`nav-tab${route.view === 'posts' ? ' active' : ''}`}
            >
              Posts
            </a>
            <a
              href="#/creators"
              className={`nav-tab${route.view === 'creators' ? ' active' : ''}`}
            >
              Creators
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
            <WatchPage guid={route.guid} posts={posts} />
          ) : route.view === 'user' ? (
            <UserDetail username={route.username} posts={posts} />
          ) : (
            <>
              <section className="hero">
                <p className="hero-eyebrow">Critical guest dump</p>
                <h1 className="fb-title">FanTribe Convex bypass</h1>
                <p className="fb-hero-line">
                  `posts:getAllPosts` returns locked media URLs. Images load unsigned from
                  `cdn.fantribe.io`. Videos play via `/api/ft-stream` (Bunny Referer spoof).
                  Profiles leak email + KYC via `users:getUserProfile`.
                </p>
                <div className="fb-stats">
                  {loading ? 'Loading…' : null}
                  {error ? <span className="error">{error}</span> : null}
                  {!loading && !error ? (
                    <>
                      <span>
                        <strong>{posts.length}</strong> posts
                      </span>
                      <span>
                        <strong>{stats.locked}</strong> locked
                      </span>
                      <span>
                        <strong>{stats.videos}</strong> videos
                      </span>
                      <span>
                        <strong>{stats.images}</strong> images
                      </span>
                      <span>
                        <strong>{creators.length}</strong> creators
                      </span>
                      <span className="error">
                        <strong>{stats.emails}</strong> emails
                      </span>
                      <span className="error">
                        <strong>{stats.kyc}</strong> KYC
                      </span>
                    </>
                  ) : null}
                </div>
              </section>

              {route.view === 'posts' ? (
                <>
                  <div className="fb-chip-row">
                    {(
                      [
                        ['all', 'All'],
                        ['locked', 'Locked'],
                        ['public', 'Public'],
                        ['adult', '+18'],
                      ] as const
                    ).map(([id, label]) => (
                      <a
                        key={id}
                        href={`#/posts?filter=${id}`}
                        className={`fb-chip${route.filter === id ? ' active' : ''}${id === 'locked' ? ' danger' : ''}`}
                      >
                        {label}
                      </a>
                    ))}
                  </div>

                  <div className="fb-post-list">
                    {filteredPosts.map((p) => (
                      <PostCard key={p._id} post={p} />
                    ))}
                    {!loading && filteredPosts.length === 0 ? (
                      <p className="fb-empty">No posts in this filter.</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="fb-user-list">
                  {creators.map((c) => (
                    <CreatorCard key={c._id} user={c} />
                  ))}
                  {!loading && creators.length === 0 ? (
                    <p className="fb-empty">No creators.</p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
