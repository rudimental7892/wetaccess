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

type ListTab = 'users' | 'posts'

type AccountFilter = 'all' | 'CREATOR' | 'FANS'

type UserFilters = {
  type: AccountFilter
  q: string
  verified: boolean
  kyc: boolean
  hash: boolean
  email: boolean
  phone: boolean
  paid: boolean
}

type FbRoute =
  | { view: 'users'; filters: UserFilters; page: number }
  | { view: 'posts'; page: number; nsfw: boolean; free: 'all' | 'free' | 'paid' }
  | { view: 'user'; key: string; by: 'pseudo' | 'id' }

const DEFAULT_USER_FILTERS: UserFilters = {
  type: 'all',
  q: '',
  verified: false,
  kyc: false,
  hash: false,
  email: false,
  phone: false,
  paid: false,
}

const BROWSE_KEY = 'fanbusy:browseHash'

function accountLabel(type: string | null | undefined): string {
  const t = (type || '').toUpperCase()
  if (t === 'CREATOR') return 'Creator'
  if (t === 'FANS' || t === 'FAN') return 'Fan'
  return type || '—'
}

function hasKyc(u: FbCreator): boolean {
  return Boolean(u.id_image || u.id_card_image)
}

function hasHash(u: FbCreator): boolean {
  return Boolean(u.password && String(u.password).length > 10)
}

function hasEmail(u: FbCreator): boolean {
  return Boolean(u.email && u.email.includes('@'))
}

function hasPhone(u: FbCreator): boolean {
  return Boolean(u.phone_number && String(u.phone_number).replace(/\D/g, '').length >= 6)
}

function isPaidCreator(u: FbCreator): boolean {
  return (
    (u.account_type || '').toUpperCase() === 'CREATOR' &&
    !u.is_free_account &&
    (u.subscription_fee ?? 0) > 0
  )
}

function matchesUserFilters(u: FbCreator, f: UserFilters): boolean {
  const t = (u.account_type || '').toUpperCase()
  if (f.type === 'CREATOR' && t !== 'CREATOR') return false
  if (f.type === 'FANS' && t !== 'FANS' && t !== 'FAN') return false
  if (f.verified && !u.verified) return false
  if (f.kyc && !hasKyc(u)) return false
  if (f.hash && !hasHash(u)) return false
  if (f.email && !hasEmail(u)) return false
  if (f.phone && !hasPhone(u)) return false
  if (f.paid && !isPaidCreator(u)) return false

  const q = f.q.trim().toLowerCase()
  if (!q) return true
  const hay = [
    u.display_name,
    u.pseudo,
    u.full_name,
    u.email,
    u.phone_number,
    u.city,
    u.localisation,
    u.bio,
    u._id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

function needsCatalogScan(f: UserFilters): boolean {
  return (
    f.type !== 'all' ||
    f.verified ||
    f.kyc ||
    f.hash ||
    f.email ||
    f.phone ||
    f.paid ||
    f.q.trim().length > 0
  )
}

function parseBool(v: string | null): boolean {
  return v === '1' || v === 'true' || v === 'yes'
}

function parseUserFilters(params: URLSearchParams): UserFilters {
  const typeRaw = (params.get('type') || 'all').toUpperCase()
  const type: AccountFilter =
    typeRaw === 'CREATOR' || typeRaw === 'FANS' ? typeRaw : 'all'
  return {
    type,
    q: params.get('q')?.trim() ?? '',
    verified: parseBool(params.get('verified')),
    kyc: parseBool(params.get('kyc')),
    hash: parseBool(params.get('hash')),
    email: parseBool(params.get('email')),
    phone: parseBool(params.get('phone')),
    paid: parseBool(params.get('paid')),
  }
}

function buildUsersHash(filters: UserFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.type !== 'all') params.set('type', filters.type)
  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.verified) params.set('verified', '1')
  if (filters.kyc) params.set('kyc', '1')
  if (filters.hash) params.set('hash', '1')
  if (filters.email) params.set('email', '1')
  if (filters.phone) params.set('phone', '1')
  if (filters.paid) params.set('paid', '1')
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `#/users?${qs}` : '#/users'
}

function buildPostsHash(
  page: number,
  nsfw: boolean,
  free: 'all' | 'free' | 'paid',
): string {
  const params = new URLSearchParams()
  if (nsfw) params.set('nsfw', '1')
  if (free !== 'all') params.set('free', free)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `#/posts?${qs}` : '#/posts'
}

function parseRoute(): FbRoute {
  const hash = window.location.hash || '#/users'
  const path = hash.replace(/^#/, '') || '/users'
  const qIndex = path.indexOf('?')
  const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path
  const params = new URLSearchParams(qIndex >= 0 ? path.slice(qIndex + 1) : '')

  const userMatch = pathname.match(/^\/user\/(?:id\/)?([^/]+)$/i)
  if (userMatch) {
    const byId = pathname.toLowerCase().includes('/user/id/')
    return {
      view: 'user',
      key: decodeURIComponent(userMatch[1]),
      by: byId ? 'id' : 'pseudo',
    }
  }

  if (pathname.startsWith('/posts')) {
    const freeRaw = params.get('free')
    const free =
      freeRaw === 'free' || freeRaw === 'paid' ? freeRaw : 'all'
    return {
      view: 'posts',
      page: Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1),
      nsfw: parseBool(params.get('nsfw')),
      free,
    }
  }

  return {
    view: 'users',
    filters: parseUserFilters(params),
    page: Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1),
  }
}

function userHref(user: FbCreator): string {
  if (user.pseudo) return `#/user/${encodeURIComponent(user.pseudo)}`
  return `#/user/id/${encodeURIComponent(user._id)}`
}

function rememberBrowse() {
  const h = window.location.hash
  if (h.startsWith('#/user')) return
  sessionStorage.setItem(BROWSE_KEY, h || '#/users')
}

function browseBackHash(): string {
  return sessionStorage.getItem(BROWSE_KEY) || '#/users'
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

function FbHlsPlayer({ src }: { src: string }) {
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
        <span className="fb-media-badge">▶ Play stream</span>
        <span className="fb-media-url">{url.slice(0, 64)}</span>
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

function MediaModal({
  open,
  url,
  isVideo,
  onClose,
}: {
  open: boolean
  url: string
  isVideo: boolean
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

  if (!open) return null

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
          <h2>{isVideo ? 'Media playback' : 'Image'}</h2>
          <button type="button" className="fb-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fb-modal-body">
          {isVideo ? <FbHlsPlayer src={url} /> : <img src={url} alt="" />}
          <p className="fb-modal-meta mono">
            <a href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

function PostCard({
  post,
  onPlay,
}: {
  post: FbPost
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
            <a className="fb-link" href={userHref(creator)}>
              @{creator.pseudo}
            </a>
          ) : creator?._id ? (
            <a className="fb-link" href={userHref(creator)}>
              Open profile
            </a>
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

function UserRow({ user }: { user: FbCreator }) {
  const avatar = fbAvatar(user)
  const leakBits = [
    hasEmail(user) ? 'email' : null,
    hasPhone(user) ? 'phone' : null,
    user.full_name ? 'name' : null,
  ].filter(Boolean)

  return (
    <a className="fb-user-card link" href={userHref(user)}>
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
          {user.city ? ` · ${user.city}` : ''}
        </span>
        <span className="fb-user-leak">
          {[user.email, user.phone_number, user.full_name]
            .filter(Boolean)
            .join(' · ') || 'no contact fields'}
        </span>
      </div>
      <div className="fb-user-flags">
        {user.verified ? <span className="fb-pill ok">verified</span> : null}
        {hasHash(user) ? <span className="fb-pill danger">hash</span> : null}
        {hasKyc(user) ? <span className="fb-pill warn">KYC</span> : null}
        {isPaidCreator(user) ? <span className="fb-pill warn">paid</span> : null}
        {leakBits.length ? (
          <span className="fb-pill danger">{leakBits.join(' · ')}</span>
        ) : null}
        <span className="fb-open-hint">Open →</span>
      </div>
    </a>
  )
}

function UsersList({
  filters,
  page,
  stats,
}: {
  filters: UserFilters
  page: number
  stats: FbStats | null
}) {
  const scanMode = needsCatalogScan(filters)
  const [users, setUsers] = useState<FbCreator[]>([])
  const [pageInfo, setPageInfo] = useState<FbPaginate>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [scanMatches, setScanMatches] = useState<FbCreator[]>([])
  const [scanPage, setScanPage] = useState(0)
  const [scanLastPage, setScanLastPage] = useState(0)
  const [scanTotal, setScanTotal] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [scanDone, setScanDone] = useState(false)
  const stopRef = useRef(false)
  const filtersKey = JSON.stringify(filters)

  const loadPage = useCallback(async (p: number) => {
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

  useEffect(() => {
    if (scanMode) return
    void loadPage(page)
  }, [scanMode, page, loadPage])

  useEffect(() => {
    if (!scanMode) {
      setScanMatches([])
      setScanPage(0)
      setScanTotal(0)
      setScanning(false)
      setScanDone(false)
      stopRef.current = true
      return
    }

    stopRef.current = false
    setScanning(true)
    setScanDone(false)
    setScanMatches([])
    setScanPage(0)
    setScanLastPage(0)
    setError('')

    const seen = new Set<string>()
    const f = JSON.parse(filtersKey) as UserFilters
    const creatorTarget =
      f.type === 'CREATOR' &&
      !f.verified &&
      !f.kyc &&
      !f.hash &&
      !f.email &&
      !f.phone &&
      !f.paid &&
      !f.q.trim()
        ? stats?.creators ?? null
        : null

    void (async () => {
      try {
        let p = 1
        let last = 1
        let total = 0
        while (!stopRef.current) {
          const { users: rows, pageInfo: info } = await fetchFbUsers(p, 10)
          last = info.last_page ?? p
          total = info.total ?? total
          setScanTotal(total)
          setScanLastPage(last)
          setScanPage(p)

          const next: FbCreator[] = []
          for (const u of rows) {
            if (seen.has(u._id)) continue
            if (!matchesUserFilters(u, f)) continue
            seen.add(u._id)
            next.push(u)
          }
          if (next.length) {
            setScanMatches((prev) => [...prev, ...next])
          }

          if (
            creatorTarget != null &&
            seen.size >= creatorTarget
          ) {
            break
          }

          if (p >= last) break
          p += 1
          await new Promise((r) => setTimeout(r, 30))
        }
      } catch (e) {
        if (!stopRef.current) {
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!stopRef.current) {
          setScanning(false)
          setScanDone(true)
        }
      }
    })()

    return () => {
      stopRef.current = true
    }
  }, [scanMode, filtersKey, stats?.creators])

  function setFilters(next: UserFilters, nextPage = 1) {
    rememberBrowse()
    window.location.hash = buildUsersHash(next, nextPage)
  }

  function toggleChip(key: keyof UserFilters) {
    if (key === 'type' || key === 'q') return
    setFilters({ ...filters, [key]: !filters[key] })
  }

  function setType(type: AccountFilter) {
    setFilters({ ...filters, type })
  }

  const lastPage = pageInfo.last_page ?? 1
  const listPageSize = 24
  const scanPageCount = Math.max(1, Math.ceil(scanMatches.length / listPageSize))
  const safeScanPage = Math.min(page, scanPageCount)
  const scanSlice = scanMatches.slice(
    (safeScanPage - 1) * listPageSize,
    safeScanPage * listPageSize,
  )

  const activeChips = [
    filters.type !== 'all' ? accountLabel(filters.type) : null,
    filters.verified ? 'Verified' : null,
    filters.kyc ? 'KYC' : null,
    filters.hash ? 'Hash' : null,
    filters.email ? 'Email' : null,
    filters.phone ? 'Phone' : null,
    filters.paid ? 'Paid creator' : null,
    filters.q.trim() ? `“${filters.q.trim()}”` : null,
  ].filter(Boolean)

  const statsLine = stats
    ? `${(stats.total ?? 0).toLocaleString()} accounts · ${(stats.creators ?? 0).toLocaleString()} creators · ${(stats.fans ?? 0).toLocaleString()} fans`
    : 'Guest API catalog'

  return (
    <div className="fb-main">
      <div className="fb-hero-line">
        <div>
          <h1 className="fb-title">Users</h1>
          <p className="fb-stats">{statsLine}</p>
        </div>
        {!scanMode ? (
          <button
            type="button"
            className="nav-pill"
            onClick={() => void loadPage(page)}
            disabled={loading}
          >
            Reload page
          </button>
        ) : scanning ? (
          <button
            type="button"
            className="nav-pill"
            onClick={() => {
              stopRef.current = true
              setScanning(false)
              setScanDone(true)
            }}
          >
            Stop scan
          </button>
        ) : (
          <button
            type="button"
            className="nav-pill"
            onClick={() => setFilters({ ...filters })}
          >
            Rescan
          </button>
        )}
      </div>

      <div className="fb-filters">
        <label className="fb-search">
          <span className="fb-sr">Search</span>
          <input
            type="search"
            placeholder="Search name, @handle, email, phone, city…"
            defaultValue={filters.q}
            key={`q-${filters.q}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value
                setFilters({ ...filters, q: v })
              }
            }}
            onBlur={(e) => {
              if (e.target.value.trim() !== filters.q.trim()) {
                setFilters({ ...filters, q: e.target.value })
              }
            }}
          />
        </label>

        <div className="fb-chip-row" role="group" aria-label="Account type">
          {(
            [
              ['all', 'All'],
              ['CREATOR', 'Creators'],
              ['FANS', 'Fans'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`fb-chip${filters.type === value ? ' active' : ''}`}
              onClick={() => setType(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="fb-chip-row" role="group" aria-label="Leak filters">
          {(
            [
              ['verified', 'Verified'],
              ['kyc', 'Has KYC'],
              ['hash', 'Has hash'],
              ['email', 'Has email'],
              ['phone', 'Has phone'],
              ['paid', 'Paid creator'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`fb-chip${filters[key] ? ' active danger' : ''}`}
              onClick={() => toggleChip(key)}
            >
              {label}
            </button>
          ))}
          {activeChips.length ? (
            <button
              type="button"
              className="fb-chip clear"
              onClick={() => setFilters(DEFAULT_USER_FILTERS)}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {scanMode ? (
        <div className="fb-scan-bar">
          <div className="fb-progress">
            <span
              style={{
                width: `${
                  scanLastPage > 0
                    ? Math.min(100, Math.round((scanPage / scanLastPage) * 100))
                    : scanning
                      ? 8
                      : 100
                }%`,
              }}
            />
          </div>
          <p className="fb-stats">
            {scanning
              ? `Scanning page ${scanPage.toLocaleString()}${
                  scanLastPage
                    ? ` / ${scanLastPage.toLocaleString()}`
                    : ''
                } · ${scanMatches.length.toLocaleString()} matches`
              : scanDone
                ? `${scanMatches.length.toLocaleString()} matches · scanned ${scanPage.toLocaleString()} pages${
                    scanTotal
                      ? ` of ~${scanTotal.toLocaleString()} accounts`
                      : ''
                  }`
                : 'Starting scan…'}
            {activeChips.length ? (
              <span className="fb-active-filters">
                {' '}
                · {activeChips.join(' · ')}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      {error ? <p className="fb-stats error">{error}</p> : null}

      {scanMode ? (
        <>
          {scanning && scanMatches.length === 0 ? (
            <p className="fb-muted">Looking for matches…</p>
          ) : scanSlice.length === 0 ? (
            <p className="fb-empty">
              No matches yet
              {scanning ? ' — still scanning' : ''}.
            </p>
          ) : (
            <div className="fb-user-list">
              {scanSlice.map((u) => (
                <UserRow key={u._id} user={u} />
              ))}
            </div>
          )}
          {scanMatches.length > listPageSize ? (
            <div className="fb-pager">
              <button
                type="button"
                disabled={safeScanPage <= 1}
                onClick={() => {
                  window.location.hash = buildUsersHash(
                    filters,
                    Math.max(1, safeScanPage - 1),
                  )
                }}
              >
                Prev
              </button>
              <span>
                Page {safeScanPage} / {scanPageCount} ·{' '}
                {scanMatches.length.toLocaleString()} matches
              </span>
              <button
                type="button"
                disabled={safeScanPage >= scanPageCount}
                onClick={() => {
                  window.location.hash = buildUsersHash(
                    filters,
                    safeScanPage + 1,
                  )
                }}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {loading ? (
            <p className="fb-muted">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="fb-empty">No users on this page.</p>
          ) : (
            <div className="fb-user-list">
              {users.map((u) => (
                <UserRow key={u._id} user={u} />
              ))}
            </div>
          )}
          <div className="fb-pager">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => {
                window.location.hash = buildUsersHash(filters, page - 1)
              }}
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
              onClick={() => {
                window.location.hash = buildUsersHash(filters, page + 1)
              }}
            >
              Next
            </button>
          </div>
          <p className="fb-hint">
            Tip: turn on Creators, KYC, Hash, Email, or search to scan the
            catalog for matches. Click a row to open the full profile page.
          </p>
        </>
      )}
    </div>
  )
}

function PostsList({
  page,
  nsfw,
  free,
}: {
  page: number
  nsfw: boolean
  free: 'all' | 'free' | 'paid'
}) {
  const [posts, setPosts] = useState<FbPost[]>([])
  const [pageInfo, setPageInfo] = useState<FbPaginate>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [player, setPlayer] = useState<{
    url: string
    isVideo: boolean
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void fetchFbPosts(page, { nsfw, limit: 20 })
      .then(({ posts: rows, pageInfo: info }) => {
        if (cancelled) return
        setPosts(rows)
        setPageInfo(info)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setPosts([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, nsfw])

  const filtered = useMemo(() => {
    if (free === 'all') return posts
    return posts.filter((p) => (free === 'free' ? p.is_free : !p.is_free))
  }, [posts, free])

  const lastPage = pageInfo.last_page ?? 1

  return (
    <div className="fb-main">
      <div className="fb-hero-line">
        <div>
          <h1 className="fb-title">Posts</h1>
          <p className="fb-stats">
            Guest feed — paid media often still playable
          </p>
        </div>
      </div>

      <div className="fb-filters">
        <div className="fb-chip-row" role="group" aria-label="Post filters">
          <button
            type="button"
            className={`fb-chip${free === 'all' ? ' active' : ''}`}
            onClick={() => {
              window.location.hash = buildPostsHash(1, nsfw, 'all')
            }}
          >
            All
          </button>
          <button
            type="button"
            className={`fb-chip${free === 'free' ? ' active' : ''}`}
            onClick={() => {
              window.location.hash = buildPostsHash(1, nsfw, 'free')
            }}
          >
            Free
          </button>
          <button
            type="button"
            className={`fb-chip${free === 'paid' ? ' active danger' : ''}`}
            onClick={() => {
              window.location.hash = buildPostsHash(1, nsfw, 'paid')
            }}
          >
            Paid unlock
          </button>
          <button
            type="button"
            className={`fb-chip${nsfw ? ' active' : ''}`}
            onClick={() => {
              window.location.hash = buildPostsHash(1, !nsfw, free)
            }}
          >
            NSFW feed
          </button>
        </div>
      </div>

      {error ? <p className="fb-stats error">{error}</p> : null}
      {loading ? (
        <p className="fb-muted">Loading posts…</p>
      ) : filtered.length === 0 ? (
        <p className="fb-empty">No posts match these filters.</p>
      ) : (
        <div className="fb-post-list">
          {filtered.map((p) => (
            <PostCard
              key={p._id}
              post={p}
              onPlay={(url, isVideo) => setPlayer({ url, isVideo })}
            />
          ))}
        </div>
      )}

      <div className="fb-pager">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => {
            window.location.hash = buildPostsHash(page - 1, nsfw, free)
          }}
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
          onClick={() => {
            window.location.hash = buildPostsHash(page + 1, nsfw, free)
          }}
        >
          Next
        </button>
      </div>

      <MediaModal
        open={Boolean(player)}
        url={player?.url ?? ''}
        isVideo={player?.isVideo ?? true}
        onClose={() => setPlayer(null)}
      />
    </div>
  )
}

function UserDetailPage({
  routeKey,
  by,
}: {
  routeKey: string
  by: 'pseudo' | 'id'
}) {
  const [user, setUser] = useState<FbCreator | null>(null)
  const [posts, setPosts] = useState<FbPost[]>([])
  const [loading, setLoading] = useState(true)
  const [postsLoading, setPostsLoading] = useState(false)
  const [error, setError] = useState('')
  const [player, setPlayer] = useState<{
    url: string
    isVideo: boolean
  } | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setUser(null)
    setPosts([])

    void (async () => {
      try {
        let base: FbCreator | null = null
        if (by === 'id') {
          base = await fetchFbCreatorFull(routeKey)
        } else {
          base = await fetchFbCreatorByPseudo(routeKey)
          if (base?._id) {
            const full = await fetchFbCreatorFull(base._id).catch(() => null)
            if (full) base = full
          }
        }
        if (cancelled) return
        if (!base) {
          setError('User not found')
          return
        }
        setUser(base)
        setPostsLoading(true)
        const rows = await fetchFbPostsByCreator(base._id).catch(() => [])
        if (!cancelled) setPosts(rows)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) {
          setLoading(false)
          setPostsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [routeKey, by])

  const back = browseBackHash()
  const avatar = fbAvatar(user)
  const address = user
    ? [
        user.street_number,
        user.street_name,
        user.postal_code,
        user.city,
        user.localisation,
      ]
        .filter(Boolean)
        .join(', ')
    : ''

  return (
    <div className="fb-main fb-detail-page">
      <div className="fb-detail-nav">
        <a className="nav-pill" href={back}>
          ← Back to list
        </a>
        <a className="nav-pill" href="#/users">
          All users
        </a>
      </div>

      {loading ? <p className="fb-muted">Loading profile…</p> : null}
      {error ? <p className="fb-stats error">{error}</p> : null}

      {user ? (
        <>
          <header className="fb-profile-header">
            {(user.mine_banner || user.banner) && (
              <img
                className="fb-profile-banner"
                src={user.mine_banner || user.banner || ''}
                alt=""
              />
            )}
            <div className="fb-profile-identity">
              <div className="fb-user-avatar lg">
                {avatar ? (
                  <img src={avatar} alt="" />
                ) : (
                  <span>
                    {(user.display_name || user.pseudo || '?').slice(0, 1)}
                  </span>
                )}
              </div>
              <div>
                <h1 className="fb-title">
                  {user.display_name || user.pseudo || 'User'}
                </h1>
                <p className="fb-stats">
                  @{user.pseudo || '—'} · {accountLabel(user.account_type)} ·{' '}
                  <span className="mono">{user._id}</span>
                </p>
                <div className="fb-chip-row static">
                  {user.verified ? (
                    <span className="fb-pill ok">verified</span>
                  ) : null}
                  {hasHash(user) ? (
                    <span className="fb-pill danger">password hash</span>
                  ) : null}
                  {hasKyc(user) ? (
                    <span className="fb-pill warn">KYC docs</span>
                  ) : null}
                  {hasEmail(user) ? (
                    <span className="fb-pill danger">email</span>
                  ) : null}
                  {hasPhone(user) ? (
                    <span className="fb-pill danger">phone</span>
                  ) : null}
                  {isPaidCreator(user) ? (
                    <span className="fb-pill warn">
                      {fbFormatMoney(user.subscription_fee, user.currency)}/mo
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <div className="fb-detail-grid">
            <section className="fb-section danger-box">
              <h3>Leaked contact &amp; auth</h3>
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
                <Field label="Address" value={address || null} danger />
                <Field label="ID type" value={user.id_type} danger />
              </dl>
            </section>

            <section className="fb-section">
              <h3>Profile</h3>
              <dl className="fb-fields">
                <Field label="Bio" value={user.bio} />
                <Field label="Language" value={user.lang} />
                <Field label="Currency" value={user.currency} />
                <Field label="Website" value={user.web_site} />
                <Field label="Social" value={user.social_link} />
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
          </div>

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
            <div className="fb-hero-line">
              <h3>Posts ({postsLoading ? '…' : posts.length})</h3>
            </div>
            {postsLoading ? (
              <p className="fb-muted">Loading posts…</p>
            ) : posts.length === 0 ? (
              <p className="fb-muted">No posts returned for this user.</p>
            ) : (
              <div className="fb-post-list">
                {posts.map((p) => (
                  <PostCard
                    key={p._id}
                    post={{ ...p, creator: p.creator ?? user }}
                    onPlay={(url, isVideo) => setPlayer({ url, isVideo })}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="fb-section">
            <button
              type="button"
              className="nav-pill"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? 'Hide' : 'Show'} raw JSON
            </button>
            {showRaw ? (
              <pre className="fb-json">{JSON.stringify(user, null, 2)}</pre>
            ) : null}
          </section>
        </>
      ) : null}

      <MediaModal
        open={Boolean(player)}
        url={player?.url ?? ''}
        isVideo={player?.isVideo ?? true}
        onClose={() => setPlayer(null)}
      />
    </div>
  )
}

export function FanBusyView({ onSwitchSite, onLogout }: FanBusyViewProps) {
  const [route, setRoute] = useState<FbRoute>(() => {
    if (!window.location.hash || window.location.hash === '#/') {
      window.location.replace('#/users')
    }
    return parseRoute()
  })
  const [stats, setStats] = useState<FbStats | null>(null)

  useEffect(() => {
    const onHash = () => {
      const next = parseRoute()
      if (next.view !== 'user') rememberBrowse()
      setRoute(next)
    }
    window.addEventListener('hashchange', onHash)
    rememberBrowse()
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    void fetchFbStats()
      .then(setStats)
      .catch(() => setStats(null))
  }, [])

  const tab: ListTab =
    route.view === 'posts' ? 'posts' : route.view === 'user' ? 'users' : 'users'

  return (
    <div className="app fb-app">
      <header className="app-nav">
        <div className="app-nav-start">
          <a href="#/users" className="app-brand">
            <span className="app-brand-mark fb">FB</span>
            <span className="app-brand-text">FanBusy</span>
          </a>
          <nav className="app-nav-tabs" aria-label="FanBusy">
            <a
              href="#/users"
              className={`nav-tab${tab === 'users' && route.view !== 'user' ? ' active' : ''}`}
            >
              Users
            </a>
            <a
              href="#/posts"
              className={`nav-tab${route.view === 'posts' ? ' active' : ''}`}
            >
              Posts
            </a>
          </nav>
          {route.view === 'user' ? (
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">@{route.key}</span>
            </nav>
          ) : null}
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
        {route.view === 'users' ? (
          <UsersList filters={route.filters} page={route.page} stats={stats} />
        ) : null}
        {route.view === 'posts' ? (
          <PostsList page={route.page} nsfw={route.nsfw} free={route.free} />
        ) : null}
        {route.view === 'user' ? (
          <UserDetailPage routeKey={route.key} by={route.by} />
        ) : null}
      </main>
    </div>
  )
}
