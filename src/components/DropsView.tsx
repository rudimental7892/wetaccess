import {
  type FormEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { LoadingGrid } from './LoadingGrid'
import { Pagination } from './Pagination'
import {
  type Drop,
  type DropItem,
  type DropUnlockProgress,
  dropItemCount,
  dropItemIsVideo,
  dropItemOpenUrl,
  dropItemThumbnailUrl,
  dropThumbnailUrl,
  fetchDrops,
  formatDropRelease,
  unlockAndFetchDrop,
  placeholderImage,
} from '../lib/wet3'

type DropFilter = 'all' | 'unlocked' | 'locked'

type DropsBrowseState = {
  search: string
  page: number
  filter: DropFilter
}

const DROPS_PER_PAGE = 24
const DROP_ITEMS_PER_PAGE = 20
const DROPS_HASH_KEY = 'wetaccess:dropsHash'

function parseDropsBrowseState(): DropsBrowseState {
  const hash = window.location.hash
  const queryStart = hash.indexOf('?')
  const params = new URLSearchParams(queryStart >= 0 ? hash.slice(queryStart + 1) : '')
  const search = params.get('search')?.trim() ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const filterParam = params.get('filter')
  const filter: DropFilter =
    filterParam === 'unlocked' || filterParam === 'locked' ? filterParam : 'all'

  return { search, page, filter }
}

function buildDropsHash({ search, page, filter }: DropsBrowseState): string {
  const params = new URLSearchParams()

  if (search) {
    params.set('search', search)
  }

  if (filter !== 'all') {
    params.set('filter', filter)
  }

  if (page > 1) {
    params.set('page', String(page))
  }

  const query = params.toString()
  return query ? `#/drops?${query}` : '#/drops'
}

export function rememberDropsBrowseHash(hash = window.location.hash) {
  if (hash.startsWith('#/drops') && !hash.match(/^#\/drops\/\d+/)) {
    sessionStorage.setItem(DROPS_HASH_KEY, hash)
  }
}

export function navigateToDropsList() {
  const saved = sessionStorage.getItem(DROPS_HASH_KEY)
  window.location.hash = saved || '#/drops'
}

function matchesDropSearch(drop: Drop, query: string): boolean {
  if (!query) {
    return true
  }

  const haystack = `${drop.username} ${drop.display_name} ${drop.title}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function dropProgress(drop: Drop): number {
  if (drop.required_clicks <= 0) {
    return drop.unlocked ? 100 : 0
  }

  return Math.min(100, Math.round((drop.click_count / drop.required_clicks) * 100))
}

export function DropsListView() {
  const initialBrowse = parseDropsBrowseState()
  const [searchInput, setSearchInput] = useState(initialBrowse.search)
  const [searchQuery, setSearchQuery] = useState(initialBrowse.search)
  const [page, setPage] = useState(initialBrowse.page)
  const [filter, setFilter] = useState<DropFilter>(initialBrowse.filter)
  const [drops, setDrops] = useState<Drop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    rememberDropsBrowseHash()

    const syncBrowseFromHash = () => {
      const next = parseDropsBrowseState()
      setSearchInput(next.search)
      setSearchQuery(next.search)
      setPage(next.page)
      setFilter(next.filter)
      rememberDropsBrowseHash()
    }

    window.addEventListener('hashchange', syncBrowseFromHash)
    return () => window.removeEventListener('hashchange', syncBrowseFromHash)
  }, [])

  const updateBrowseHash = useCallback((next: DropsBrowseState) => {
    const nextHash = buildDropsHash(next)
    sessionStorage.setItem(DROPS_HASH_KEY, nextHash)
    window.location.hash = nextHash
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchDrops()
        if (!cancelled) {
          setDrops(data)
        }
      } catch (loadError) {
        if (!cancelled) {
          setDrops([])
          setError(loadError instanceof Error ? loadError.message : 'Failed to load drops')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    return drops.filter((drop) => {
      if (filter === 'unlocked' && !drop.unlocked) {
        return false
      }

      if (filter === 'locked' && drop.unlocked) {
        return false
      }

      return matchesDropSearch(drop, searchQuery)
    })
  }, [drops, filter, searchQuery])

  const unlockedCount = useMemo(
    () => drops.filter((drop) => drop.unlocked).length,
    [drops],
  )
  const lockedCount = drops.length - unlockedCount
  const totalPages = Math.max(1, Math.ceil(filtered.length / DROPS_PER_PAGE))
  const visible = filtered.slice((page - 1) * DROPS_PER_PAGE, page * DROPS_PER_PAGE)

  useEffect(() => {
    if (page > totalPages) {
      updateBrowseHash({ search: searchQuery, page: totalPages, filter })
    }
  }, [filter, page, searchQuery, totalPages, updateBrowseHash])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateBrowseHash({ search: searchInput.trim(), page: 1, filter })
  }

  const goToPage = useCallback(
    (nextPage: number) => {
      updateBrowseHash({ search: searchQuery, page: nextPage, filter })
    },
    [filter, searchQuery, updateBrowseHash],
  )

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.src = placeholderImage()
  }

  return (
    <>
      <section className="hero">
        <p className="hero-eyebrow">Exclusive packs</p>
        <h1 className="hero-title">Drops</h1>
        <p className="hero-copy">
          {loading
            ? 'Loading unlockable packs…'
            : `${drops.length.toLocaleString()} packs · ${unlockedCount.toLocaleString()} unlocked · ${lockedCount.toLocaleString()} locked`}
        </p>
      </section>

      <section className="panel search-panel">
        <form className="search-row" onSubmit={submitSearch}>
          <input
            className="search-input"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search drops…"
            aria-label="Search drops"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
          {searchQuery ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => updateBrowseHash({ search: '', page: 1, filter })}
            >
              Clear
            </button>
          ) : null}
        </form>

        <div className="segmented" role="tablist" aria-label="Drop filters">
          {(
            [
              ['all', `All (${drops.length})`],
              ['unlocked', `Unlocked (${unlockedCount})`],
              ['locked', `Locked (${lockedCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              className={`tab-btn${filter === value ? ' active' : ''}`}
              aria-selected={filter === value}
              onClick={() => updateBrowseHash({ search: searchQuery, page: 1, filter: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error ? <p className="status error">{error}</p> : null}
      {loading ? <LoadingGrid count={12} variant="creators" /> : null}

      {!loading && !error ? (
        <section className="drops-grid">
          {visible.map((drop) => {
            const items = dropItemCount(drop)
            const progress = dropProgress(drop)

            return (
              <a
                key={drop.id}
                className={`drop-card${drop.unlocked ? '' : ' locked'}`}
                href={`#/drops/${drop.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="drop-thumb-wrap">
                  <img
                    src={dropThumbnailUrl(drop.thumbnail)}
                    alt=""
                    loading="lazy"
                    onError={handleImageError}
                  />
                  <span className={`drop-status${drop.unlocked ? ' open' : ''}`}>
                    {drop.unlocked ? 'Unlocked' : 'Locked'}
                  </span>
                </div>
                <div className="drop-card-body">
                  <strong>@{drop.username}</strong>
                  <span className="drop-title">{drop.title}</span>
                  <span className="drop-meta">
                    {items > 0 ? `${items} items · ` : ''}
                    {formatDropRelease(drop.release_at)}
                  </span>
                  <div className="drop-progress" aria-hidden="true">
                    <span className="drop-progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="drop-clicks">
                    {drop.click_count}/{drop.required_clicks} clicks
                  </span>
                </div>
              </a>
            )
          })}
        </section>
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <p className="empty">No drops matched that filter.</p>
      ) : null}

      {!loading && !error && visible.length > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrevious={() => goToPage(page - 1)}
          onNext={() => goToPage(page + 1)}
        />
      ) : null}
    </>
  )
}

export function DropDetailView({ dropId }: { dropId: number }) {
  const [drop, setDrop] = useState<Drop | null>(null)
  const [loading, setLoading] = useState(true)
  const [unlocking, setUnlocking] = useState(true)
  const [progress, setProgress] = useState<DropUnlockProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const galleryRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setUnlocking(true)
      setError(null)
      setCurrentPage(1)
      setProgress({ phase: 'loading', clickCount: 0, requiredClicks: 0 })

      try {
        // Show pack metadata immediately from the slim catalog cache when possible.
        const catalog = await fetchDrops()
        const preview = catalog.find((row) => row.id === dropId) ?? null
        if (!cancelled && preview) {
          setDrop(preview)
          setLoading(false)
        }

        const unlocked = await unlockAndFetchDrop(dropId, (next) => {
          if (!cancelled) {
            setProgress(next)
            setUnlocking(next.phase === 'unlocking' || next.phase === 'refreshing' || next.phase === 'loading')
            setDrop((current) =>
              current
                ? {
                    ...current,
                    click_count: next.clickCount,
                    required_clicks: next.requiredClicks || current.required_clicks,
                  }
                : current,
            )
          }
        })

        if (cancelled) {
          return
        }

        if (!unlocked) {
          setDrop(null)
          setError('Drop not found')
          return
        }

        setDrop(unlocked)

        if (!unlocked.unlocked || !unlocked.items?.length) {
          setError(
            'Could not unlock this pack yet. Wet3 may be rate-limiting click farming — try again.',
          )
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load drop')
        }
      } finally {
        if (!cancelled) {
          setUnlocking(false)
          setLoading(false)
          setProgress((current) => (current ? { ...current, phase: 'done' } : current))
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [dropId])

  const items = drop?.items ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / DROP_ITEMS_PER_PAGE))
  const visible = items.slice(
    (currentPage - 1) * DROP_ITEMS_PER_PAGE,
    currentPage * DROP_ITEMS_PER_PAGE,
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
    const img = event.currentTarget
    const fallback = img.dataset.fallback

    if (fallback && img.src !== fallback) {
      img.src = fallback
      return
    }

    img.src = placeholderImage()
  }

  const progressPct =
    progress && progress.requiredClicks > 0
      ? Math.min(100, Math.round((progress.clickCount / progress.requiredClicks) * 100))
      : 0

  const unlockStatusLabel = unlocking
    ? progress?.phase === 'refreshing'
      ? 'Refreshing pack…'
      : progress?.phase === 'loading'
        ? 'Loading pack…'
        : 'Unlocking…'
    : drop?.unlocked
      ? 'Unlocked'
      : 'Locked'

  return (
    <>
      <section className="profile-hero">
        <div className="profile-hero-top">
          <div className="drop-detail-thumb" aria-hidden="true">
            {drop ? (
              <img
                src={dropThumbnailUrl(drop.thumbnail)}
                alt=""
                onError={handleImageError}
              />
            ) : (
              <span>?</span>
            )}
          </div>
        </div>
        <div>
          <h1 className="profile-title">{drop?.title ?? `Drop #${dropId}`}</h1>
          <p className="profile-subtitle">
            {drop ? (
              <>
                <a
                  className="link-btn"
                  href={`#/user/${encodeURIComponent(drop.username)}?from=drops`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @{drop.username}
                </a>
                {' · '}
                {formatDropRelease(drop.release_at)}
              </>
            ) : loading ? (
              'Loading pack…'
            ) : (
              'Pack unavailable'
            )}
          </p>
        </div>
        {drop ? (
          <div className="stat-row">
            <span className="stat-pill">
              <strong>{unlockStatusLabel}</strong>
            </span>
            <span className="stat-pill">
              <strong>{dropItemCount(drop)}</strong> items
            </span>
            <span className="stat-pill">
              <strong>
                {drop.click_count}/{drop.required_clicks}
              </strong>{' '}
              clicks
            </span>
          </div>
        ) : null}
      </section>

      {unlocking ? (
        <p className="status unlock-status">
          {progress?.phase === 'refreshing'
            ? 'Pack unlocked — loading media…'
            : progress?.phase === 'loading'
              ? 'Loading drop catalog…'
              : `Unlocking without ads… ${progress?.clickCount ?? 0}/${progress?.requiredClicks || drop?.required_clicks || '?'} clicks`}
          {progress && progress.requiredClicks > 0 ? (
            <span className="drop-progress unlock-progress" aria-hidden="true">
              <span className="drop-progress-fill" style={{ width: `${progressPct}%` }} />
            </span>
          ) : null}
        </p>
      ) : null}

      {error ? <p className="status error">{error}</p> : null}
      {loading && !drop ? <LoadingGrid count={10} variant="media" /> : null}

      {!loading && drop && !drop.unlocked && !unlocking ? (
        <p className="empty">
          This pack is still locked ({drop.click_count}/{drop.required_clicks}). Unlock
          bypass did not finish — open it again to retry.
        </p>
      ) : null}

      {!loading && drop?.unlocked ? (
        <section ref={galleryRef} className="media-section panel gallery-anchor">
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
            {visible.map((item) => {
              const isVideo = dropItemIsVideo(item)
              const href = dropItemOpenUrl(item)
              const thumb = dropItemThumbnailUrl(item)
              const thumbFallback = wet3PreviewFallback(item)
              return (
                <article key={item.id} className="media-item">
                  <a
                    href={href}
                    className="media-card"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${isVideo ? 'Watch' : 'View'} drop item ${item.id}`}
                  >
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      data-fallback={thumbFallback}
                      onError={handleImageError}
                    />
                    {isVideo ? (
                      <>
                        <span className="video-badge" aria-hidden="true">
                          ▶
                        </span>
                        {item.duration?.trim() ? (
                          <span className="duration-badge">
                            {item.duration.replace(/^00:/, '')}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </a>
                  <div className="media-card-meta">
                    <span className="media-date">{item.price || 'Free'}</span>
                    <span className="media-label" title={item.id}>
                      {item.id}
                    </span>
                    {isVideo && item.duration?.trim() ? (
                      <span className="media-duration">{item.duration}</span>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>

          {visible.length === 0 ? (
            <p className="empty">No media in this pack.</p>
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

function wet3PreviewFallback(item: DropItem): string {
  return `/wet3-api/previews/${encodeURIComponent(item.id)}.webp`
}
