import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type CatalogVideo,
  fetchAcCatalog,
  fetchAcEmbed,
  formatAcDuration,
} from '../lib/africancasting'

const PAGE_SIZES = [12, 24, 48, 96] as const
const BATCH = 100

type SortKey = 'latest' | 'oldest' | 'title'

type AfricanCastingViewProps = {
  onSwitchSite: () => void
  onLogout: () => void
}

function videoIdNum(id: string): number {
  const n = Number.parseInt(id, 10)
  return Number.isFinite(n) ? n : 0
}

export function AfricanCastingView({
  onSwitchSite,
  onLogout,
}: AfricanCastingViewProps) {
  const [all, setAll] = useState<CatalogVideo[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(24)
  const [sort, setSort] = useState<SortKey>('latest')
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  const [activeId, setActiveId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalPoster, setModalPoster] = useState('')
  const [modalMp4, setModalMp4] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')

  const embedCache = useMemo(() => new Map<string, { mp4: string; poster: string | null }>(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = q
      ? all.filter((v) => {
          const hay = `${v.title} ${v.models} ${v.channels} ${v.keywords}`.toLowerCase()
          return hay.includes(q)
        })
      : [...all]

    rows.sort((a, b) => {
      if (sort === 'title') {
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      }
      const diff = videoIdNum(b.id) - videoIdNum(a.id)
      return sort === 'latest' ? diff : -diff
    })

    return rows
  }, [all, query, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true)
    setCatalogError('')
    setAll([])
    setTotal(0)
    setPage(1)

    try {
      const first = await fetchAcCatalog(0, BATCH)
      if (!first.success || !first.data) throw new Error('API returned success=false')
      setTotal(first.total_results)
      setAll([...first.data])

      let loaded = first.data.length
      while (loaded < first.total_results) {
        const next = await fetchAcCatalog(loaded, BATCH)
        if (!next.data?.length) break
        loaded += next.data.length
        setAll((prev) => [...prev, ...next.data!])
      }
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingCatalog(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog, reloadToken])

  async function playVideo(video: CatalogVideo) {
    setActiveId(video.id)
    setModalOpen(true)
    setModalTitle(video.title)
    setModalPoster(video.main_thumb)
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

  const pct =
    total > 0 ? Math.min(100, Math.round((all.length / total) * 100)) : 0

  const stats = catalogError
    ? catalogError
    : loadingCatalog
      ? `Loaded ${all.length.toLocaleString()} / ${total.toLocaleString()} — browse while the rest loads`
      : `${filtered.length.toLocaleString()} matches · ${all.length.toLocaleString()} total`

  const pagerNums = (() => {
    const start = Math.max(1, safePage - 2)
    const end = Math.min(pageCount, safePage + 2)
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

      <main className="page ac-page">
        <div className="ac-toolbar">
          <label className="ac-search">
            <input
              type="search"
              placeholder="Search title, model, category…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
            />
          </label>
          <label className="ac-page-size">
            Sort
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey)
                setPage(1)
              }}
            >
              <option value="latest">Latest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
            </select>
          </label>
          <label className="ac-page-size">
            Per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])
                setPage(1)
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="nav-pill"
            disabled={loadingCatalog}
            onClick={() => {
              embedCache.clear()
              setReloadToken((n) => n + 1)
            }}
          >
            Reload
          </button>
        </div>

        {loadingCatalog ? (
          <div className="ac-progress-wrap">
            <div className="ac-progress">
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}

        <p className={`ac-stats${catalogError ? ' error' : ''}`}>{stats}</p>

        <div className="ac-grid">
          {slice.length === 0 ? (
            <p className="ac-empty">No matches yet.</p>
          ) : (
            slice.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`ac-card${v.id === activeId ? ' active' : ''}`}
                onClick={() => void playVideo(v)}
                title={`Play #${v.id}`}
              >
                <img src={v.main_thumb} alt="" loading="lazy" />
                <div className="ac-card-body">
                  <h3>{v.title}</h3>
                  <p className="meta">
                    {v.models || '—'} · {formatAcDuration(v.length)} · #{v.id}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        {filtered.length > 0 ? (
          <nav className="ac-pager" aria-label="Pagination">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              Prev
            </button>
            {pagerNums.start > 1 ? (
              <button type="button" onClick={() => setPage(1)}>
                1
              </button>
            ) : null}
            {pagerNums.nums.map((n) => (
              <button
                key={n}
                type="button"
                className={n === safePage ? 'active' : ''}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            {pagerNums.end < pageCount ? (
              <button type="button" onClick={() => setPage(pageCount)}>
                {pageCount}
              </button>
            ) : null}
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </button>
          </nav>
        ) : null}
      </main>

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
                ×
              </button>
            </header>
            <div className="ac-modal-body">
              {modalLoading ? (
                <p className="ac-modal-status">Resolving embed MP4…</p>
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
                    ID {activeId} ·{' '}
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
