import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type CatalogVideo,
  type EmbedResponse,
  acThumbUrl,
  fetchAcCatalog,
  fetchAcEmbed,
  formatAcDuration,
} from '../lib/africancasting'

const PAGE_SIZE = 24

type SortKey = 'latest' | 'oldest' | 'title'

type AfricanCastingViewProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

function placeholderSrc() {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" fill="%23161320"><rect width="320" height="180"/></svg>',
  )
}

export function AfricanCastingView({
  onSwitchSite,
  onLogout,
}: AfricanCastingViewProps) {
  const [videos, setVideos] = useState<CatalogVideo[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortKey>('latest')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const galleryRef = useRef<HTMLElement>(null)

  const [activeId, setActiveId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalPoster, setModalPoster] = useState('')
  const [modalMp4, setModalMp4] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')

  const embedCache = useMemo(() => new Map<string, EmbedResponse>(), [])

  const loadPage = useCallback(async (p: number) => {
    setLoading(true)
    setError('')
    try {
      const offset = (p - 1) * PAGE_SIZE
      const res = await fetchAcCatalog(offset, PAGE_SIZE)
      if (!res.success) throw new Error('API returned success=false')
      setVideos(res.data ?? [])
      setTotal(res.total_results)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setVideos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage(page)
  }, [loadPage, page])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = q
      ? videos.filter((v) => {
          const hay = `${v.title} ${v.models} ${v.channels} ${v.keywords}`.toLowerCase()
          return hay.includes(q)
        })
      : [...videos]

    if (sort === 'title') {
      rows.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    } else if (sort === 'oldest') {
      rows.reverse()
    }

    return rows
  }, [videos, query, sort])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const scrollToGallery = useCallback(() => {
    galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  function goToPage(p: number) {
    const clamped = Math.max(1, Math.min(totalPages, p))
    setPage(clamped)
    scrollToGallery()
  }

  async function playVideo(video: CatalogVideo) {
    setActiveId(video.id)
    setModalOpen(true)
    setModalTitle(video.title)
    setModalPoster(acThumbUrl(video.main_thumb))
    setModalMp4('')
    setModalError('')
    setModalLoading(true)

    try {
      const cached = embedCache.get(video.id)
      const data = cached ?? (await fetchAcEmbed(video.id))
      if (!cached) embedCache.set(video.id, data)
      setModalMp4(data.mp4)
      if (data.poster) setModalPoster(data.poster)
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e))
    } finally {
      setModalLoading(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setModalLoading(false)
    setModalError('')
    setModalMp4('')
    setActiveId('')
  }

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [modalOpen])

  function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
    event.currentTarget.src = placeholderSrc()
  }

  const pagerRange = (() => {
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, page + 2)
    const nums: number[] = []
    for (let i = start; i <= end; i++) nums.push(i)
    return { start, end, nums }
  })()

  return (
    <div className="app ac-app">
      <header className="app-nav">
        <div className="app-nav-start">
          <button type="button" className="app-brand" onClick={onSwitchSite}>
            <span className="app-brand-mark ac">AC</span>
            <span className="app-brand-text">African Casting</span>
          </button>
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

      <main className="page ac-page" ref={galleryRef}>
        {/* Hero */}
        <section className="ac-hero">
          <p className="ac-hero-eyebrow">Video catalog</p>
          <h1 className="ac-hero-title">African Casting</h1>
          <p className="ac-hero-sub">
            {total > 0
              ? `${total.toLocaleString()} videos · Page ${page} of ${totalPages}`
              : loading
                ? 'Loading catalog...'
                : 'Catalog'}
          </p>
        </section>

        {/* Toolbar */}
        <div className="ac-toolbar">
          <label className="ac-search">
            <input
              type="search"
              placeholder="Search title, model, category..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="ac-select-label">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="latest">Latest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>

        {error ? (
          <div className="ac-error">
            <p>{error}</p>
            <button type="button" className="nav-pill" onClick={() => loadPage(page)}>
              Retry
            </button>
          </div>
        ) : null}

        {/* Grid */}
        <div className="ac-grid">
          {loading
            ? Array.from({ length: PAGE_SIZE }, (_, i) => (
                <div key={`skel-${i}`} className="ac-card-skeleton">
                  <div className="ac-card-skeleton-thumb" />
                  <div className="ac-card-skeleton-body">
                    <div className="ac-card-skeleton-line wide" />
                    <div className="ac-card-skeleton-line narrow" />
                  </div>
                </div>
              ))
            : filtered.length === 0
              ? <p className="ac-empty">No matches on this page.</p>
              : filtered.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`ac-card${v.id === activeId ? ' active' : ''}`}
                    onClick={() => void playVideo(v)}
                  >
                    <div className="ac-card-thumb">
                      <img
                        src={acThumbUrl(v.main_thumb)}
                        alt=""
                        loading="lazy"
                        onError={handleImageError}
                      />
                      <span className="ac-card-play">&#9654;</span>
                      <span className="ac-card-duration">{formatAcDuration(v.length)}</span>
                    </div>
                    <div className="ac-card-body">
                      <h3>{v.title}</h3>
                      <p className="ac-card-meta">{v.models || '—'}</p>
                      {v.channels ? (
                        <p className="ac-card-tags">{v.channels}</p>
                      ) : null}
                    </div>
                  </button>
                ))}
        </div>

        {/* Pagination */}
        {total > 0 ? (
          <nav className="ac-pager" aria-label="Pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Prev
            </button>
            {pagerRange.start > 1 ? (
              <>
                <button type="button" onClick={() => goToPage(1)}>1</button>
                {pagerRange.start > 2 ? <span className="ac-pager-dots">...</span> : null}
              </>
            ) : null}
            {pagerRange.nums.map((n) => (
              <button
                key={n}
                type="button"
                className={n === page ? 'active' : ''}
                onClick={() => goToPage(n)}
              >
                {n}
              </button>
            ))}
            {pagerRange.end < totalPages ? (
              <>
                {pagerRange.end < totalPages - 1 ? <span className="ac-pager-dots">...</span> : null}
                <button type="button" onClick={() => goToPage(totalPages)}>{totalPages}</button>
              </>
            ) : null}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </button>
          </nav>
        ) : null}
      </main>

      {/* Video modal */}
      {modalOpen ? (
        <div className="ac-modal" role="dialog" aria-modal="true" aria-labelledby="ac-modal-title">
          <button
            type="button"
            className="ac-modal-backdrop"
            aria-label="Close"
            onClick={closeModal}
          />
          <div className="ac-modal-panel">
            <header className="ac-modal-header">
              <h2 id="ac-modal-title">{modalTitle}</h2>
              <button type="button" className="ac-modal-close" onClick={closeModal}>
                &times;
              </button>
            </header>
            <div className="ac-modal-body">
              {modalLoading ? (
                <div className="ac-modal-loading">
                  <div className="ac-spinner" />
                  <p>Loading video...</p>
                </div>
              ) : modalError ? (
                <p className="ac-modal-status error">{modalError}</p>
              ) : modalMp4 ? (
                <>
                  <video
                    key={modalMp4}
                    controls
                    playsInline
                    autoPlay
                    poster={modalPoster}
                    src={modalMp4}
                  />
                  <p className="ac-modal-meta">
                    ID {activeId} &middot;{' '}
                    <a href={modalMp4} target="_blank" rel="noopener noreferrer">
                      CDN link
                    </a>
                  </p>
                </>
              ) : (
                <p className="ac-modal-status">No stream URL</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
