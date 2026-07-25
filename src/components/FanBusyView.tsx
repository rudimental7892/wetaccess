import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Hls from 'hls.js'
import {
  type FbCreator,
  type FbIllustration,
  type FbPaginate,
  type FbPost,
  type FbStats,
  fbAvatar,
  fbFormatMoney,
  fbIsVideo,
  fbMediaUrl,
  fetchFbCreatorByPseudo,
  fetchFbCreatorFull,
  fetchFbPosts,
  fetchFbPostsByCreator,
  fetchFbStats,
  fetchFbUsers,
} from '../lib/fanbusy'

type FanBusyViewProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

type Tab = 'users' | 'posts'

type AccountFilter = 'all' | 'CREATOR' | 'FANS'

function accountLabel(type: string | null | undefined): string {
  const t = (type || '').toUpperCase()
  if (t === 'CREATOR') return 'Creator'
  if (t === 'FANS' || t === 'FAN') return 'Fan'
  return type || '—'
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

function FbHlsPlayer({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let hls: Hls | null = null
    const isHls = src.includes('.m3u8') || src.includes('/hls/')

    if (isHls && Hls.isSupported()) {
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
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      void video.play().catch(() => {})
    } else {
      video.src = src
      void video.play().catch(() => {})
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
      poster={poster || undefined}
    />
  )
}

function MediaThumb({
  ill,
  onPlay,
}: {
  ill: FbIllustration
  onPlay: (url: string, isVideo: boolean) => void
}) {
  const url = fbMediaUrl(ill)
  if (!url) return null
  const video = fbIsVideo(ill)

  if (video) {
    return (
      <button
        type="button"
        className="fb-media-thumb video"
        onClick={() => onPlay(url, true)}
      >
        <span className="fb-media-badge">▶ HLS / video</span>
        <span className="fb-media-url">{url.slice(0, 72)}…</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className="fb-media-thumb"
      onClick={() => onPlay(url, false)}
    >
      <img src={url} alt="" loading="lazy" />
    </button>
  )
}

function UserCard({
  user,
  selected,
  onSelect,
}: {
  user: FbCreator
  selected: boolean
  onSelect: () => void
}) {
  const avatar = fbAvatar(user)
  return (
    <button
      type="button"
      className={`fb-user-card${selected ? ' active' : ''}`}
      onClick={onSelect}
    >
      <div className="fb-user-avatar">
        {avatar ? (
          <img src={avatar} alt="" loading="lazy" />
        ) : (
          <span>{(user.display_name || user.pseudo || '?').slice(0, 1)}</span>
        )}
      </div>
      <div className="fb-user-meta">
        <strong>{user.display_name || user.pseudo || user._id}</strong>
        <span className="fb-user-sub">
          @{user.pseudo || '—'} · {accountLabel(user.account_type)}
        </span>
        <span className="fb-user-leak">
          {[user.email, user.phone_number, user.full_name]
            .filter(Boolean)
            .join(' · ') || 'no contact fields'}
        </span>
      </div>
      {user.verified ? <span className="fb-pill ok">verified</span> : null}
      {user.password ? <span className="fb-pill danger">hash</span> : null}
      {user.id_image || user.id_card_image ? (
        <span className="fb-pill warn">KYC</span>
      ) : null}
    </button>
  )
}

function PostCard({
  post,
  onOpenUser,
  onPlay,
}: {
  post: FbPost
  onOpenUser?: (pseudo: string) => void
  onPlay: (url: string, isVideo: boolean) => void
}) {
  const creator = post.creator
  const avatar = fbAvatar(creator)
  const ills = post.illustrations ?? []

  return (
    <article className="fb-post-card">
      <header className="fb-post-head">
        <div className="fb-user-avatar sm">
          {avatar ? <img src={avatar} alt="" /> : <span>?</span>}
        </div>
        <div>
          <strong>
            {creator?.display_name || creator?.pseudo || 'Unknown'}
          </strong>
          {creator?.pseudo ? (
            <button
              type="button"
              className="fb-link"
              onClick={() => onOpenUser?.(creator.pseudo!)}
            >
              @{creator.pseudo}
            </button>
          ) : null}
          <span className="fb-muted">
            {post.created_at
              ? new Date(post.created_at).toLocaleString()
              : ''}
          </span>
        </div>
        <div className="fb-post-badges">
          <span className={`fb-pill ${post.is_free ? 'ok' : 'warn'}`}>
            {post.is_free
              ? 'free'
              : fbFormatMoney(post.price_of_release, post.currency)}
          </span>
          {!post.is_free && ills.some((i) => fbMediaUrl(i)) ? (
            <span className="fb-pill danger">paid unlock</span>
          ) : null}
        </div>
      </header>
      {post.content ? <p className="fb-post-body">{post.content}</p> : null}
      {ills.length ? (
        <div className="fb-media-grid">
          {ills.map((ill) => (
            <MediaThumb key={ill._id} ill={ill} onPlay={onPlay} />
          ))}
        </div>
      ) : null}
      <footer className="fb-post-foot">
        <span>{post.like_number ?? 0} likes</span>
        <span>{post.view_number ?? 0} views</span>
        <span>{post.comment_number ?? 0} comments</span>
        <span className="mono">{post._id}</span>
      </footer>
    </article>
  )
}

function UserDetail({
  user,
  posts,
  postsLoading,
  onPlay,
  onClose,
}: {
  user: FbCreator
  posts: FbPost[]
  postsLoading: boolean
  onPlay: (url: string, isVideo: boolean) => void
  onClose: () => void
}) {
  const avatar = fbAvatar(user)
  const address = [
    user.street_number,
    user.street_name,
    user.postal_code,
    user.city,
    user.localisation,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <aside className="fb-detail">
      <div className="fb-detail-top">
        <button type="button" className="nav-pill" onClick={onClose}>
          Close
        </button>
        <h2>{user.display_name || user.pseudo || 'User'}</h2>
        <span className="fb-muted">@{user.pseudo || '—'} · {user._id}</span>
      </div>

      <div className="fb-detail-hero">
        {avatar ? <img src={avatar} alt="" /> : null}
        {(user.mine_banner || user.banner) && (
          <img
            className="fb-banner"
            src={user.mine_banner || user.banner || ''}
            alt=""
          />
        )}
      </div>

      <section className="fb-section">
        <h3>Identity &amp; contact (guest API)</h3>
        <dl className="fb-fields">
          <Field label="Legal / full name" value={user.full_name} danger />
          <Field label="Email" value={user.email} mono danger />
          <Field
            label="Phone"
            value={
              user.phone_number
                ? `${user.country_code || ''} ${user.phone_number}`.trim()
                : null
            }
            mono
            danger
          />
          <Field label="Password hash" value={user.password} mono danger />
          <Field
            label="Verification code"
            value={user.verification_code}
            mono
            danger
          />
          <Field label="Account type" value={accountLabel(user.account_type)} />
          <Field
            label="Verified"
            value={user.verified == null ? null : user.verified ? 'yes' : 'no'}
          />
          <Field label="Language" value={user.lang} />
          <Field label="Currency" value={user.currency} />
          <Field label="Website" value={user.web_site} />
          <Field label="Social" value={user.social_link} />
          <Field label="Address" value={address || null} danger />
          <Field label="ID type" value={user.id_type} danger />
          <Field label="Bio" value={user.bio} />
          <Field
            label="Fans / follows / likes"
            value={`${user.fan_number ?? 0} / ${user.follow_number ?? 0} / ${user.like_number ?? 0}`}
          />
          <Field
            label="Sub fee"
            value={fbFormatMoney(user.subscription_fee, user.currency)}
          />
          <Field
            label="Chat / video call"
            value={
              user.active_tchat
                ? `chat ${fbFormatMoney(user.tchat_fee, user.currency)} · call ${fbFormatMoney(user.video_call_fee, user.currency)}`
                : null
            }
          />
          <Field label="Affiliation" value={user.affiliation_code} mono />
          <Field label="Created" value={user.created_at} mono />
          <Field label="Updated" value={user.updated_at} mono />
        </dl>
      </section>

      {(user.id_image || user.id_card_image) && (
        <section className="fb-section danger-box">
          <h3>KYC documents (public URLs)</h3>
          <div className="fb-kyc-grid">
            {user.id_image ? (
              <a href={user.id_image} target="_blank" rel="noreferrer">
                <img src={user.id_image} alt="ID image" />
                <span>id_image</span>
              </a>
            ) : null}
            {user.id_card_image ? (
              <a href={user.id_card_image} target="_blank" rel="noreferrer">
                <img src={user.id_card_image} alt="ID card" />
                <span>id_card_image</span>
              </a>
            ) : null}
          </div>
        </section>
      )}

      {user.subscriptions_details && (
        <section className="fb-section">
          <h3>Subscription tiers</h3>
          <pre className="fb-json">
            {JSON.stringify(user.subscriptions_details, null, 2)}
          </pre>
        </section>
      )}

      <section className="fb-section">
        <h3>Posts ({postsLoading ? '…' : posts.length})</h3>
        {postsLoading ? (
          <p className="fb-muted">Loading posts…</p>
        ) : posts.length === 0 ? (
          <p className="fb-muted">No posts returned for this user.</p>
        ) : (
          <div className="fb-post-list">
            {posts.map((p) => (
              <PostCard key={p._id} post={p} onPlay={onPlay} />
            ))}
          </div>
        )}
      </section>

      <section className="fb-section">
        <h3>Raw user JSON</h3>
        <pre className="fb-json">{JSON.stringify(user, null, 2)}</pre>
      </section>
    </aside>
  )
}

export function FanBusyView({ onSwitchSite, onLogout }: FanBusyViewProps) {
  const [tab, setTab] = useState<Tab>('users')
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [users, setUsers] = useState<FbCreator[]>([])
  const [pageInfo, setPageInfo] = useState<FbPaginate>({})
  const [stats, setStats] = useState<FbStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [selected, setSelected] = useState<FbCreator | null>(null)
  const [userPosts, setUserPosts] = useState<FbPost[]>([])
  const [userPostsLoading, setUserPostsLoading] = useState(false)

  const [posts, setPosts] = useState<FbPost[]>([])
  const [postsPage, setPostsPage] = useState(1)
  const [postsInfo, setPostsInfo] = useState<FbPaginate>({})
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsError, setPostsError] = useState('')
  const [nsfwOnly, setNsfwOnly] = useState(false)

  const [playerOpen, setPlayerOpen] = useState(false)
  const [playerUrl, setPlayerUrl] = useState('')
  const [playerIsVideo, setPlayerIsVideo] = useState(true)

  const loadUsers = useCallback(async (p: number) => {
    setLoading(true)
    setError('')
    try {
      const { users: rows, pageInfo: info } = await fetchFbUsers(p, 10)
      setUsers(rows)
      setPageInfo(info)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPosts = useCallback(async (p: number, nsfw: boolean) => {
    setPostsLoading(true)
    setPostsError('')
    try {
      const { posts: rows, pageInfo: info } = await fetchFbPosts(p, {
        nsfw,
        limit: 20,
      })
      setPosts(rows)
      setPostsInfo(info)
    } catch (e) {
      setPostsError(e instanceof Error ? e.message : String(e))
      setPosts([])
    } finally {
      setPostsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchFbStats()
      .then(setStats)
      .catch(() => setStats(null))
  }, [])

  useEffect(() => {
    if (tab === 'users') void loadUsers(page)
  }, [tab, page, loadUsers])

  useEffect(() => {
    if (tab === 'posts') void loadPosts(postsPage, nsfwOnly)
  }, [tab, postsPage, nsfwOnly, loadPosts])

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (accountFilter !== 'all') {
        const t = (u.account_type || '').toUpperCase()
        if (accountFilter === 'CREATOR' && t !== 'CREATOR') return false
        if (accountFilter === 'FANS' && t !== 'FANS' && t !== 'FAN') return false
      }
      if (!q) return true
      const hay = [
        u.display_name,
        u.pseudo,
        u.full_name,
        u.email,
        u.phone_number,
        u.city,
        u._id,
        u.bio,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [users, query, accountFilter])

  async function openUser(user: FbCreator) {
    setSelected(user)
    setUserPosts([])
    setUserPostsLoading(true)
    try {
      const full = await fetchFbCreatorFull(user._id).catch(() => null)
      if (full) setSelected(full)
      const rows = await fetchFbPostsByCreator(user._id)
      setUserPosts(rows)
    } catch {
      setUserPosts([])
    } finally {
      setUserPostsLoading(false)
    }
  }

  async function openUserByPseudo(pseudo: string) {
    setTab('users')
    const match = users.find(
      (u) => (u.pseudo || '').toLowerCase() === pseudo.toLowerCase(),
    )
    if (match) {
      void openUser(match)
      return
    }
    // Fetch by pseudo via full list path
    try {
      const u = await fetchFbCreatorByPseudo(pseudo)
      if (u) void openUser(u)
    } catch {
      /* ignore */
    }
  }

  function playMedia(url: string, isVideo: boolean) {
    setPlayerUrl(url)
    setPlayerIsVideo(isVideo)
    setPlayerOpen(true)
  }

  function closePlayer() {
    setPlayerOpen(false)
    setPlayerUrl('')
  }

  useEffect(() => {
    if (!playerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePlayer()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [playerOpen])

  const lastPage = pageInfo.last_page ?? 1
  const postsLast = postsInfo.last_page ?? 1

  const statsLine = stats
    ? `${(stats.total ?? 0).toLocaleString()} accounts · ${(stats.creators ?? 0).toLocaleString()} creators · ${(stats.fans ?? 0).toLocaleString()} fans`
    : 'FanBusy guest API POC — emails, bcrypt hashes, KYC images, paid HLS'

  return (
    <div className="app fb-app">
      <header className="app-nav">
        <div className="app-nav-start">
          <button type="button" className="app-brand" onClick={onSwitchSite}>
            <span className="app-brand-mark fb">FB</span>
            <span className="app-brand-text">FanBusy</span>
          </button>
          <nav className="app-nav-tabs" aria-label="FanBusy">
            <button
              type="button"
              className={`nav-tab${tab === 'users' ? ' active' : ''}`}
              onClick={() => setTab('users')}
            >
              Users
            </button>
            <button
              type="button"
              className={`nav-tab${tab === 'posts' ? ' active' : ''}`}
              onClick={() => setTab('posts')}
            >
              Posts
            </button>
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

      <main className={`page fb-page${selected ? ' split' : ''}`}>
        <div className="fb-main">
          <p className="fb-stats">{statsLine}</p>

          {tab === 'users' ? (
            <>
              <div className="fb-toolbar">
                <label className="fb-search">
                  <input
                    type="search"
                    placeholder="Filter this page: name, email, phone, city…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="fb-select">
                  Type
                  <select
                    value={accountFilter}
                    onChange={(e) =>
                      setAccountFilter(e.target.value as AccountFilter)
                    }
                  >
                    <option value="all">All</option>
                    <option value="CREATOR">Creators</option>
                    <option value="FANS">Fans</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="nav-pill"
                  onClick={() => void loadUsers(page)}
                  disabled={loading}
                >
                  Reload
                </button>
              </div>

              {error ? <p className="fb-stats error">{error}</p> : null}
              {loading ? (
                <p className="fb-muted">Loading users…</p>
              ) : (
                <div className="fb-user-list">
                  {filteredUsers.length === 0 ? (
                    <p className="fb-empty">No users on this page match.</p>
                  ) : (
                    filteredUsers.map((u) => (
                      <UserCard
                        key={u._id}
                        user={u}
                        selected={selected?._id === u._id}
                        onSelect={() => void openUser(u)}
                      />
                    ))
                  )}
                </div>
              )}

              <div className="fb-pager">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span>
                  Page {pageInfo.current_page ?? page} / {lastPage}
                  {pageInfo.total != null
                    ? ` · ${pageInfo.total.toLocaleString()} total`
                    : ''}
                </span>
                <button
                  type="button"
                  disabled={page >= lastPage || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="fb-toolbar">
                <label className="fb-check">
                  <input
                    type="checkbox"
                    checked={nsfwOnly}
                    onChange={(e) => {
                      setNsfwOnly(e.target.checked)
                      setPostsPage(1)
                    }}
                  />
                  NSFW feed
                </label>
                <button
                  type="button"
                  className="nav-pill"
                  onClick={() => void loadPosts(postsPage, nsfwOnly)}
                  disabled={postsLoading}
                >
                  Reload
                </button>
              </div>
              {postsError ? (
                <p className="fb-stats error">{postsError}</p>
              ) : null}
              {postsLoading ? (
                <p className="fb-muted">Loading posts…</p>
              ) : (
                <div className="fb-post-list">
                  {posts.length === 0 ? (
                    <p className="fb-empty">No posts.</p>
                  ) : (
                    posts.map((p) => (
                      <PostCard
                        key={p._id}
                        post={p}
                        onOpenUser={(pseudo) => void openUserByPseudo(pseudo)}
                        onPlay={playMedia}
                      />
                    ))
                  )}
                </div>
              )}
              <div className="fb-pager">
                <button
                  type="button"
                  disabled={postsPage <= 1 || postsLoading}
                  onClick={() => setPostsPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span>
                  Page {postsInfo.current_page ?? postsPage} / {postsLast}
                  {postsInfo.total != null
                    ? ` · ${postsInfo.total.toLocaleString()} total`
                    : ''}
                </span>
                <button
                  type="button"
                  disabled={postsPage >= postsLast || postsLoading}
                  onClick={() => setPostsPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>

        {selected ? (
          <UserDetail
            user={selected}
            posts={userPosts}
            postsLoading={userPostsLoading}
            onPlay={playMedia}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </main>

      {playerOpen ? (
        <div className="fb-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="fb-modal-backdrop"
            aria-label="Close"
            onClick={closePlayer}
          />
          <div className="fb-modal-panel">
            <div className="fb-modal-header">
              <h2>{playerIsVideo ? 'Media playback' : 'Image'}</h2>
              <button
                type="button"
                className="fb-modal-close"
                onClick={closePlayer}
              >
                ×
              </button>
            </div>
            <div className="fb-modal-body">
              {playerIsVideo ? (
                <FbHlsPlayer src={playerUrl} />
              ) : (
                <img src={playerUrl} alt="" />
              )}
              <p className="fb-modal-meta mono">
                <a href={playerUrl} target="_blank" rel="noreferrer">
                  {playerUrl}
                </a>
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
