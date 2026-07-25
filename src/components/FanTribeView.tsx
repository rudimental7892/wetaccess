import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  type FtAuthor,
  type FtMedia,
  type FtPost,
  fetchFtPosts,
  fetchFtProfile,
  ftCreatorsFromPosts,
  ftFormatDate,
  ftHasKyc,
  ftIsLocked,
  ftStreamUrl,
} from '../lib/fantribe'

type FanTribeViewProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

type FtRoute =
  | { view: 'posts'; filter: 'all' | 'locked' | 'public' | 'adult' }
  | { view: 'creators' }
  | { view: 'user'; username: string }

const BROWSE_KEY = 'fantribe:browseHash'

function parseRoute(): FtRoute {
  const hash = window.location.hash || '#/posts'
  const [pathPart, queryPart = ''] = hash.replace(/^#/, '').split('?')
  const pathname = pathPart || '/posts'
  const params = new URLSearchParams(queryPart)

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
  if (h.startsWith('#/user')) return
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

function MediaModal({
  open,
  media,
  onClose,
}: {
  open: boolean
  media: FtMedia | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [open, onClose])

  if (!open || !media) return null

  const isVideo = media.type === 'video'
  const src = isVideo ? ftStreamUrl(media.mediaId) : media.url

  return (
    <div className="fb-modal" role="dialog" aria-modal="true">
      <button
        type="button"
        className="fb-modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="fb-modal-panel">
        <div className="fb-modal-header">
          <h2>{isVideo ? 'Locked stream (Referer proxy)' : 'Image (unsigned CDN)'}</h2>
          <button type="button" className="fb-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fb-modal-body">
          {isVideo ? (
            <video className="fb-player" src={src} controls autoPlay playsInline />
          ) : (
            <img src={src} alt="" />
          )}
        </div>
        <p className="fb-modal-meta mono">{media.url}</p>
      </div>
    </div>
  )
}

function PostCard({
  post,
  onPlay,
}: {
  post: FtPost
  onPlay: (m: FtMedia) => void
}) {
  const locked = ftIsLocked(post)
  const author = post.author
  const handle = author?.username || author?.name || 'unknown'

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
          {locked ? <span className="fb-pill danger">subscribers_only</span> : (
            <span className="fb-pill ok">public</span>
          )}
          {post.isAdult ? <span className="fb-pill warn">+18</span> : null}
          <span className="fb-muted">{ftFormatDate(post._creationTime)}</span>
        </div>
      </div>
      {post.content ? <p className="fb-post-body">{post.content}</p> : null}
      <div className="fb-media-grid">
        {(post.medias || []).map((m) =>
          m.type === 'video' ? (
            <button
              key={m.mediaId}
              type="button"
              className="fb-media-thumb video"
              onClick={() => onPlay(m)}
            >
              <span className="fb-media-badge">▶ Play MP4</span>
              <span className="fb-media-url">{m.mediaId.slice(0, 8)}…</span>
            </button>
          ) : (
            <button
              key={m.mediaId}
              type="button"
              className="fb-media-thumb"
              onClick={() => onPlay(m)}
            >
              <img src={m.url} alt="" loading="lazy" />
            </button>
          ),
        )}
      </div>
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
  const [modal, setModal] = useState<FtMedia | null>(null)

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
            <PostCard key={p._id} post={p} onPlay={setModal} />
          ))}
          {userPosts.length === 0 ? (
            <p className="fb-empty">No posts for this creator in getAllPosts.</p>
          ) : null}
        </div>
      </section>

      <MediaModal open={Boolean(modal)} media={modal} onClose={() => setModal(null)} />
    </div>
  )
}

export function FanTribeView({ onSwitchSite, onLogout }: FanTribeViewProps) {
  const [route, setRoute] = useState(parseRoute)
  const [posts, setPosts] = useState<FtPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<FtMedia | null>(null)

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
          {route.view === 'user' ? (
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
                      <PostCard key={p._id} post={p} onPlay={setModal} />
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

      <MediaModal
        open={Boolean(modal)}
        media={modal}
        onClose={() => setModal(null)}
      />
    </div>
  )
}
