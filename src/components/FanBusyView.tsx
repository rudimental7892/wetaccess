import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import Hls from 'hls.js'
import {
  type FbCreator,
  type FbIllustration,
  type FbPaginate,
  type FbPost,
  type FbStats,
  fbAvatar,
  fbFormatDuration,
  fbFormatMoney,
  fbIsHlsUrl,
  fbIsVideo,
  fbMediaUrl,
  fbPosterUrl,
  fbProgressiveUrl,
  fetchFbCreatorByPseudo,
  fetchFbCreatorFull,
  fetchFbPosts,
  fetchFbPostsByCreator,
  fetchFbStats,
  fetchFbUsers,
} from '../lib/fanbusy'
import { useFavorites } from '../lib/favorites'

type FanBusyViewProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

type ListTab = 'users' | 'posts' | 'favorites'

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
  | { view: 'favorites' }

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

  if (pathname === '/favorites') {
    return { view: 'favorites' }
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

function FbHlsPlayer({
  src,
  onDuration,
}: {
  src: string
  onDuration?: (seconds: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDurationRef = useRef(onDuration)
  onDurationRef.current = onDuration

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let hls: Hls | null = null
    const isHls = fbIsHlsUrl(src)

    const reportDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        onDurationRef.current?.(video.duration)
      }
    }

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        manifestLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 4,
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        reportDuration()
        void video.play().catch(() => {})
      })
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      void video.play().catch(() => {})
    } else {
      video.src = src
      void video.play().catch(() => {})
    }

    video.addEventListener('loadedmetadata', reportDuration)

    return () => {
      video.removeEventListener('loadedmetadata', reportDuration)
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

function applyVideoMeta(
  video: HTMLVideoElement,
  setDuration: (n: number | null) => void,
) {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    setDuration(video.duration)
  }
  // Nudge off frame 0 so the poster isn't a black keyframe.
  if (video.currentTime < 0.05) {
    video.currentTime = Math.min(
      0.75,
      Math.max(0.1, video.duration * 0.05 || 0.75),
    )
  }
}

function VideoThumb({
  ill,
  post,
  onPlay,
}: {
  ill: FbIllustration
  post?: FbPost | null
  onPlay: (url: string, isVideo: boolean) => void
}) {
  const streamUrl = fbMediaUrl(ill)
  const progressive = fbProgressiveUrl(ill)
  const poster = fbPosterUrl(ill, post)
  const hlsPrimary = fbIsHlsUrl(streamUrl)
  const previewSrc = progressive || (!hlsPrimary ? streamUrl : '')

  const wrapRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [visible, setVisible] = useState(false)
  const [duration, setDuration] = useState<number | null>(null)
  const [posterFailed, setPosterFailed] = useState(false)
  const label = fbFormatDuration(duration)
  const showPoster = Boolean(poster) && !posterFailed

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '120px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || showPoster) return
    const video = videoRef.current
    if (!video || !streamUrl) return

    let hls: Hls | null = null
    const src = previewSrc || streamUrl

    if (fbIsHlsUrl(src) && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyVideoMeta(video, setDuration)
      })
    } else if (fbIsHlsUrl(src) && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
    } else if (src) {
      video.src = src
    }

    return () => {
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [visible, showPoster, streamUrl, previewSrc])

  // Duration-only probe when a static poster is shown (no visible video element).
  useEffect(() => {
    if (!visible || !showPoster || duration != null || !streamUrl) return
    const probe = document.createElement('video')
    probe.muted = true
    probe.preload = 'metadata'
    probe.setAttribute('playsinline', '')
    probe.className = 'ft-meta-probe'
    let hls: Hls | null = null
    const onMeta = () => applyVideoMeta(probe, setDuration)

    const src = previewSrc || streamUrl
    if (fbIsHlsUrl(src) && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, maxBufferLength: 2 })
      hls.loadSource(src)
      hls.attachMedia(probe)
      hls.on(Hls.Events.MANIFEST_PARSED, onMeta)
    } else {
      probe.src = src
      probe.addEventListener('loadedmetadata', onMeta)
    }
    document.body.appendChild(probe)

    return () => {
      hls?.destroy()
      probe.removeEventListener('loadedmetadata', onMeta)
      probe.removeAttribute('src')
      probe.load()
      probe.remove()
    }
  }, [visible, showPoster, duration, streamUrl, previewSrc])

  const onMeta = (event: SyntheticEvent<HTMLVideoElement>) => {
    applyVideoMeta(event.currentTarget, setDuration)
  }

  if (!streamUrl) return null

  return (
    <button
      ref={wrapRef}
      type="button"
      className="fb-media-thumb video ft-media-thumb"
      onClick={() => onPlay(streamUrl, true)}
      aria-label={`Play video${label ? `, ${label}` : ''}`}
    >
      {showPoster ? (
        <img
          src={poster}
          alt=""
          loading="lazy"
          onError={() => setPosterFailed(true)}
        />
      ) : visible ? (
        <video
          ref={videoRef}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={onMeta}
        />
      ) : (
        <span className="fb-media-placeholder" aria-hidden />
      )}
      <span className="fb-media-badge ft-play-badge" aria-hidden>
        ▶
      </span>
      {label ? <span className="ft-media-duration">{label}</span> : null}
    </button>
  )
}

function MediaThumb({
  ill,
  post,
  onPlay,
}: {
  ill: FbIllustration
  post?: FbPost | null
  onPlay: (url: string, isVideo: boolean) => void
}) {
  const url = fbMediaUrl(ill)
  if (!url) return null

  if (fbIsVideo(ill)) {
    return <VideoThumb ill={ill} post={post} onPlay={onPlay} />
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
  const [duration, setDuration] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setDuration(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [open, onClose, url])

  if (!open) return null

  const length = fbFormatDuration(duration)

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
          <h2>
            {isVideo ? 'Media playback' : 'Image'}
            {length ? (
              <span className="ft-watch-duration"> · {length}</span>
            ) : null}
          </h2>
          <button type="button" className="fb-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fb-modal-body">
          {isVideo ? (
            <FbHlsPlayer
              src={url}
              onDuration={(n) => setDuration(n)}
            />
          ) : (
            <img src={url} alt="" />
          )}
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
  isFav,
  onToggleFav,
}: {
  post: FbPost
  onPlay: (url: string, isVideo: boolean) => void
  isFav?: boolean
  onToggleFav?: () => void
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
            <a
              className="fb-link"
              href={userHref(creator)}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{creator.pseudo}
            </a>
          ) : creator?._id ? (
            <a
              className="fb-link"
              href={userHref(creator)}
              target="_blank"
              rel="noopener noreferrer"
            >
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
          {onToggleFav ? (
            <button
              type="button"
              className={`fav-btn${isFav ? ' active' : ''}`}
              aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
              onClick={onToggleFav}
            >
              {isFav ? '❤' : '♡'}
            </button>
          ) : null}
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
            <MediaThumb key={ill._id} ill={ill} post={post} onPlay={onPlay} />
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

function CreatorCard({ user }: { user: FbCreator }) {
  const avatar = fbAvatar(user)
  const isCreator = (user.account_type || '').toUpperCase() === 'CREATOR'
  const fans = user.fan_number ?? 0
  const likes = user.like_number ?? 0
  const fee = user.subscription_fee ?? 0

  return (
    <a className="fb-creator-card" href={userHref(user)}>
      <div className="fb-creator-avatar">
        {avatar ? (
          <img src={avatar} alt="" loading="lazy" />
        ) : (
          <span>{(user.display_name || user.pseudo || '?').slice(0, 1)}</span>
        )}
        {user.verified ? <span className="fb-creator-verified" title="Verified">✓</span> : null}
      </div>
      <div className="fb-creator-info">
        <strong className="fb-creator-name">
          {user.display_name || user.pseudo || user._id}
        </strong>
        <span className="fb-creator-handle">@{user.pseudo || '—'}</span>
        <div className="fb-creator-stats">
          <span title="Fans">{fans.toLocaleString()} fans</span>
          <span title="Likes">{likes.toLocaleString()} likes</span>
        </div>
      </div>
      <div className="fb-creator-foot">
        {isCreator && fee > 0 ? (
          <span className="fb-creator-price">{fbFormatMoney(fee, user.currency)}/mo</span>
        ) : isCreator && user.is_free_account ? (
          <span className="fb-creator-free">Free</span>
        ) : (
          <span className="fb-creator-type">{accountLabel(user.account_type)}</span>
        )}
      </div>
    </a>
  )
}

type SortKey = 'default' | 'fans' | 'likes' | 'name'

function sortUsers(list: FbCreator[], sort: SortKey): FbCreator[] {
  if (sort === 'default') return list
  const copy = [...list]
  if (sort === 'fans') copy.sort((a, b) => (b.fan_number ?? 0) - (a.fan_number ?? 0))
  if (sort === 'likes') copy.sort((a, b) => (b.like_number ?? 0) - (a.like_number ?? 0))
  if (sort === 'name') copy.sort((a, b) => (a.display_name || a.pseudo || '').localeCompare(b.display_name || b.pseudo || ''))
  return copy
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
  const [sortKey, setSortKey] = useState<SortKey>('default')

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
      const { users: rows, pageInfo: info } = await fetchFbUsers(p, 20)
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

    const SCAN_SIZE = 50
    const PARALLEL = 2
    void (async () => {
      try {
        let p = 1
        let last = 1
        let total = 0
        let retries = 0
        while (!stopRef.current) {
          try {
            const batchSize = Math.min(PARALLEL, last - p + 1)
            const batch = Array.from(
              { length: batchSize },
              (_, i) => fetchFbUsers(p + i, SCAN_SIZE),
            )
            const results = await Promise.all(batch)
            retries = 0

            for (let i = 0; i < results.length; i++) {
              const { users: rows, pageInfo: info } = results[i]
              last = Math.max(last, info.last_page ?? (p + i))
              total = info.total ?? total
              setScanTotal(total)
              setScanLastPage(last)
              setScanPage(p + i)

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
            }

            if (creatorTarget != null && seen.size >= creatorTarget) break

            p += results.length
            if (p > last) break
            await new Promise((r) => setTimeout(r, 30))
          } catch (batchErr) {
            retries++
            if (retries > 3) throw batchErr
            await new Promise((r) => setTimeout(r, 1000 * retries))
          }
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

  const sorted = useMemo(() => sortUsers(scanMode ? scanSlice : users, sortKey), [scanMode, scanSlice, users, sortKey])

  return (
    <div className="fb-main">
      {/* Hero */}
      <section className="fb-hero">
        <div className="fb-hero-top">
          <div>
            <p className="fb-hero-eyebrow">Discover</p>
            <h1 className="fb-title">Creators</h1>
            <p className="fb-hero-sub">
              {stats
                ? `${(stats.creators ?? 0).toLocaleString()} creators · ${(stats.fans ?? 0).toLocaleString()} fans`
                : 'Loading…'}
            </p>
          </div>
          <div className="fb-hero-actions">
            {scanning ? (
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
            ) : null}
          </div>
        </div>
      </section>

      <div className="fb-toolbar">
        <label className="fb-search">
          <span className="fb-sr">Search</span>
          <input
            type="search"
            placeholder="Search creators…"
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

        <div className="fb-toolbar-row">
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
            <button
              type="button"
              className={`fb-chip${filters.verified ? ' active' : ''}`}
              onClick={() => toggleChip('verified')}
            >
              Verified
            </button>
            <button
              type="button"
              className={`fb-chip${filters.paid ? ' active' : ''}`}
              onClick={() => toggleChip('paid')}
            >
              Paid
            </button>
            {activeChips.length ? (
              <button
                type="button"
                className="fb-chip clear"
                onClick={() => setFilters(DEFAULT_USER_FILTERS)}
              >
                Clear
              </button>
            ) : null}
          </div>

          <label className="fb-sort">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="default">Default order</option>
              <option value="fans">Most fans</option>
              <option value="likes">Most likes</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
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

      {error ? (
        <div className="fb-error">
          <p>{error}</p>
          <button type="button" className="nav-pill" onClick={() => void loadPage(page)}>
            Retry
          </button>
        </div>
      ) : null}

      {(scanMode ? (scanning && scanMatches.length === 0) : loading) ? (
        <div className="fb-creator-grid">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={`skel-${i}`} className="fb-creator-skeleton">
              <div className="fb-creator-skeleton-avatar" />
              <div className="fb-creator-skeleton-lines">
                <div className="fb-skel-line wide" />
                <div className="fb-skel-line narrow" />
                <div className="fb-skel-line medium" />
              </div>
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="fb-empty">
          {scanMode && scanning ? 'Scanning — no matches yet.' : 'No creators found.'}
        </p>
      ) : (
        <div className="fb-creator-grid">
          {sorted.map((u) => (
            <CreatorCard key={u._id} user={u} />
          ))}
        </div>
      )}

      {scanMode && scanMatches.length > listPageSize ? (
        <div className="fb-pager">
          <button
            type="button"
            disabled={safeScanPage <= 1}
            onClick={() => {
              window.location.hash = buildUsersHash(filters, Math.max(1, safeScanPage - 1))
            }}
          >
            ← Prev
          </button>
          <span>
            Page {safeScanPage} / {scanPageCount} · {scanMatches.length.toLocaleString()} matches
          </span>
          <button
            type="button"
            disabled={safeScanPage >= scanPageCount}
            onClick={() => {
              window.location.hash = buildUsersHash(filters, safeScanPage + 1)
            }}
          >
            Next →
          </button>
        </div>
      ) : !scanMode ? (
        <div className="fb-pager">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => { window.location.hash = buildUsersHash(filters, page - 1) }}
          >
            ← Prev
          </button>
          <span>
            Page {pageInfo.current_page ?? page} / {lastPage}
          </span>
          <button
            type="button"
            disabled={page >= lastPage || loading}
            onClick={() => { window.location.hash = buildUsersHash(filters, page + 1) }}
          >
            Next →
          </button>
        </div>
      ) : null}
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
  const { isFav, toggle: toggleFav } = useFavorites('fanbusy')
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
      <section className="fb-hero">
        <div className="fb-hero-top">
          <div>
            <p className="fb-hero-eyebrow">Content feed</p>
            <h1 className="fb-title">Posts</h1>
            <p className="fb-hero-sub">
              Guest feed · paid media often still playable · Page {pageInfo.current_page ?? page}
            </p>
          </div>
        </div>
      </section>

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

      {error ? (
        <div className="fb-error">
          <p>{error}</p>
          <button type="button" className="nav-pill" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="fb-post-list">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={`skel-${i}`} className="fb-post-skeleton">
              <div className="fb-post-skeleton-head">
                <div className="fb-user-skeleton-avatar" style={{ width: 36, height: 36 }} />
                <div className="fb-user-skeleton-body">
                  <div className="fb-user-skeleton-line wide" />
                  <div className="fb-user-skeleton-line narrow" />
                </div>
              </div>
              <div className="fb-user-skeleton-line wide" style={{ height: 14 }} />
              <div className="fb-user-skeleton-line" style={{ width: '60%', height: 14 }} />
              <div className="fb-post-skeleton-media" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="fb-empty">No posts match these filters.</p>
      ) : (
        <div className="fb-post-list">
          {filtered.map((p) => (
            <PostCard
              key={p._id}
              post={p}
              onPlay={(url, isVideo) => setPlayer({ url, isVideo })}
              isFav={isFav(p._id)}
              onToggleFav={() => {
                const creator = p.creator
                toggleFav({
                  id: p._id,
                  site: 'fanbusy',
                  title: p.content?.slice(0, 80) || `Post by ${creator?.display_name || creator?.pseudo || 'Unknown'}`,
                  thumb: p.illustrations?.[0] ? fbMediaUrl(p.illustrations[0]) : undefined,
                  meta: `${creator?.display_name || creator?.pseudo || ''} · ${p.is_free ? 'free' : 'paid'}`,
                })
              }}
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
  const [postsError, setPostsError] = useState('')
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
        setPostsError('')
        try {
          const rows = await fetchFbPostsByCreator(base._id)
          if (!cancelled) setPosts(rows)
        } catch (e) {
          if (!cancelled) {
            setPosts([])
            setPostsError(e instanceof Error ? e.message : String(e))
          }
        } finally {
          if (!cancelled) setPostsLoading(false)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) {
          setLoading(false)
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
            ) : postsError ? (
              <p className="fb-stats error">{postsError}</p>
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

function FavoritesList() {
  const { items: favItems, remove } = useFavorites('fanbusy')
  const [player, setPlayer] = useState<{ url: string; isVideo: boolean } | null>(null)

  return (
    <div className="fb-main">
      <section className="fb-hero">
        <div className="fb-hero-top">
          <div>
            <p className="fb-hero-eyebrow">Saved content</p>
            <h1 className="fb-title">Favorites</h1>
            <p className="fb-hero-sub">{favItems.length} saved item{favItems.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </section>

      {favItems.length === 0 ? (
        <p className="fb-empty">No favorites yet. Click the heart on any post to save it here.</p>
      ) : (
        <div className="fb-fav-grid">
          {favItems.map((fav) => (
            <div key={fav.id} className="fb-fav-card">
              {fav.thumb ? (
                <button
                  type="button"
                  className="fb-fav-thumb"
                  onClick={() => setPlayer({ url: fav.thumb!, isVideo: true })}
                >
                  <img src={fav.thumb} alt="" loading="lazy" />
                  <span className="ft-play-badge" style={{ opacity: 1 }}>▶</span>
                </button>
              ) : null}
              <div className="fb-fav-body">
                <p className="fb-fav-title">{fav.title}</p>
                {fav.meta ? <p className="fb-fav-meta">{fav.meta}</p> : null}
              </div>
              <button
                type="button"
                className="fav-btn active"
                aria-label="Remove from favorites"
                onClick={() => remove(fav.id)}
              >
                ❤
              </button>
            </div>
          ))}
        </div>
      )}

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

  const { count: fbFavCount } = useFavorites('fanbusy')

  const tab: ListTab =
    route.view === 'posts' ? 'posts' : route.view === 'favorites' ? 'favorites' : 'users'

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
              Creators
            </a>
            <a
              href="#/posts"
              className={`nav-tab${route.view === 'posts' ? ' active' : ''}`}
            >
              Feed
            </a>
            <a
              href="#/favorites"
              className={`nav-tab${route.view === 'favorites' ? ' active' : ''}`}
            >
              Favs{fbFavCount ? ` (${fbFavCount})` : ''}
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
        {route.view === 'favorites' ? (
          <FavoritesList />
        ) : null}
      </main>
    </div>
  )
}
