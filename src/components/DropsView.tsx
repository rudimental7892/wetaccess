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
      {/* Hero */}
      <section className="relative overflow-hidden mb-7 p-7 max-md:p-[18px] max-md:mb-[18px] border border-border rounded-3xl bg-gradient-to-br from-accent/[0.08] via-transparent to-transparent bg-surface shadow-sm">
        <div className="absolute -right-[10%] -bottom-[60%] w-[280px] h-[280px] rounded-full bg-[radial-gradient(circle,rgba(224,100,152,0.16),transparent_68%)] pointer-events-none" />
        <p className="m-0 mb-2.5 text-accent text-xs font-bold tracking-[0.14em] uppercase">
          Exclusive packs
        </p>
        <h1 className="m-0 max-w-[12ch] font-display text-[clamp(1.75rem,8vw,2.4rem)] md:text-[clamp(2.2rem,6vw,3.4rem)] leading-[0.95] font-[800] tracking-tight">
          Drops
        </h1>
        <p className="mt-3.5 m-0 max-w-[48ch] text-muted text-[15px] max-md:text-sm">
          {loading
            ? 'Loading unlockable packs...'
            : `${drops.length.toLocaleString()} packs · ${unlockedCount.toLocaleString()} unlocked · ${lockedCount.toLocaleString()} locked`}
        </p>
      </section>

      {/* Search + filter */}
      <section className="grid gap-3.5 mb-6 p-4.5 max-md:p-3.5 border border-border rounded-2xl bg-surface/70">
        <form className="flex gap-2.5 max-md:flex-col max-md:items-stretch" onSubmit={submitSearch}>
          <input
            className="flex-1 min-w-0 border border-border bg-inset text-foreground rounded-2xl px-4 py-3.5 max-md:min-h-12 outline-none transition-all focus:border-accent/45 focus:ring-4 focus:ring-accent/10 placeholder:text-soft"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search drops..."
            aria-label="Search drops"
          />
          <button
            type="submit"
            className="border border-accent/45 bg-gradient-to-br from-accent to-[#c4004a] text-white rounded-2xl px-5 py-3.5 max-md:min-h-12 max-md:w-full font-semibold shadow-[0_10px_24px_rgba(224,100,152,0.22)] hover:-translate-y-px hover:shadow-[0_14px_28px_rgba(224,100,152,0.28)] transition-all cursor-pointer"
          >
            Search
          </button>
          {searchQuery ? (
            <button
              type="button"
              className="border border-border bg-transparent rounded-2xl px-5 py-3.5 max-md:min-h-12 max-md:w-full font-semibold hover:border-border-strong hover:bg-accent-soft transition-all cursor-pointer"
              onClick={() => updateBrowseHash({ search: '', page: 1, filter })}
            >
              Clear
            </button>
          ) : null}
        </form>

        {/* Filter tabs */}
        <div
          className="inline-flex gap-1.5 p-1.5 border border-border rounded-full bg-inset w-fit max-w-full overflow-x-auto max-md:flex max-md:w-full"
          role="tablist"
          aria-label="Drop filters"
        >
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
              className={
                filter === value
                  ? 'text-white bg-gradient-to-br from-accent to-[#c4004a] shadow-[0_8px_20px_rgba(224,100,152,0.22)] rounded-full px-4 py-2.5 max-md:flex-1 max-md:min-h-11 max-md:px-3 text-[13px] max-md:text-xs font-semibold whitespace-nowrap cursor-pointer border-none'
                  : 'text-muted rounded-full px-4 py-2.5 max-md:flex-1 max-md:min-h-11 max-md:px-3 text-[13px] max-md:text-xs font-semibold whitespace-nowrap cursor-pointer bg-transparent border-none hover:text-foreground hover:bg-white/[0.04] transition-all'
              }
              aria-selected={filter === value}
              onClick={() => updateBrowseHash({ search: searchQuery, page: 1, filter: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <p className="m-0 mb-4.5 p-3 px-3.5 rounded-2xl text-danger border border-danger/25 bg-danger/[0.08] text-sm">
          {error}
        </p>
      ) : null}
      {loading ? <LoadingGrid count={12} variant="creators" /> : null}

      {!loading && !error ? (
        <section className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5 max-md:gap-3">
          {visible.map((drop) => {
            const items = dropItemCount(drop)
            const progress = dropProgress(drop)

            return (
              <a
                key={drop.id}
                className={`group grid gap-3 max-md:gap-2.5 text-left p-3 max-md:p-2.5 border border-border bg-card rounded-2xl cursor-pointer no-underline text-inherit transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-card-hover hover:shadow-lg active:scale-[0.98] ${
                  drop.unlocked ? '' : 'opacity-[0.92]'
                }`}
                href={`#/drops/${drop.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="relative rounded-2xl overflow-hidden bg-inset">
                  <img
                    className={`w-full aspect-square object-cover block ${
                      drop.unlocked ? '' : 'saturate-[0.7] brightness-[0.72]'
                    }`}
                    src={dropThumbnailUrl(drop.thumbnail)}
                    alt=""
                    loading="lazy"
                    onError={handleImageError}
                  />
                  <span
                    className={`absolute top-2 left-2 z-[1] px-2 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase text-white border border-white/12 ${
                      drop.unlocked ? 'bg-accent/88' : 'bg-black/72'
                    }`}
                  >
                    {drop.unlocked ? 'Unlocked' : 'Locked'}
                  </span>
                </div>
                <div className="grid gap-1 min-w-0">
                  <strong className="font-display text-[15px] font-bold">
                    @{drop.username}
                  </strong>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-muted">
                    {drop.title}
                  </span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-muted">
                    {items > 0 ? `${items} items · ` : ''}
                    {formatDropRelease(drop.release_at)}
                  </span>
                  <div className="mt-1 h-[5px] rounded-full bg-inset overflow-hidden" aria-hidden="true">
                    <span
                      className="block h-full rounded-[inherit] bg-gradient-to-r from-accent to-warm"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-soft font-semibold">
                    {drop.click_count}/{drop.required_clicks} clicks
                  </span>
                </div>
              </a>
            )
          })}
        </section>
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <p className="m-0 py-12 px-5 text-center text-muted text-[15px] border border-dashed border-border rounded-2xl bg-white/[0.02]">
          No drops matched that filter.
        </p>
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
      ? 'Refreshing pack...'
      : progress?.phase === 'loading'
        ? 'Loading pack...'
        : 'Unlocking...'
    : drop?.unlocked
      ? 'Unlocked'
      : 'Locked'

  return (
    <>
      {/* Profile-style hero for drop detail */}
      <section className="grid gap-4.5 mb-6 p-6 max-md:p-[18px] max-md:mb-[18px] border border-border rounded-3xl bg-gradient-to-b from-accent/10 to-transparent bg-surface shadow-sm">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div
            className="w-[88px] h-[88px] rounded-[22px] overflow-hidden grid place-items-center bg-gradient-to-br from-accent to-warm shadow-[0_12px_32px_rgba(224,100,152,0.22)] text-white font-display text-[28px] font-[800]"
            aria-hidden="true"
          >
            {drop ? (
              <img
                className="w-full h-full object-cover"
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
          <h1 className="m-0 font-display text-[clamp(1.8rem,4vw,2.6rem)] max-md:text-[1.65rem] max-md:overflow-wrap-anywhere leading-none font-[800] tracking-tight">
            {drop?.title ?? `Drop #${dropId}`}
          </h1>
          <p className="mt-2 m-0 text-muted text-sm">
            {drop ? (
              <>
                <a
                  className="border-none bg-none p-0 text-accent-hover font-semibold cursor-pointer no-underline hover:underline"
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
              'Loading pack...'
            ) : (
              'Pack unavailable'
            )}
          </p>
        </div>
        {drop ? (
          <div className="flex flex-wrap gap-2.5 max-md:overflow-x-auto max-md:flex-nowrap max-md:pb-0.5">
            <span className="inline-flex items-center gap-2 px-3.5 py-2.5 border border-border rounded-full bg-black/18 text-muted text-[13px] shrink-0">
              <strong className="text-foreground font-semibold">{unlockStatusLabel}</strong>
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-2.5 border border-border rounded-full bg-black/18 text-muted text-[13px] shrink-0">
              <strong className="text-foreground font-semibold">{dropItemCount(drop)}</strong> items
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-2.5 border border-border rounded-full bg-black/18 text-muted text-[13px] shrink-0">
              <strong className="text-foreground font-semibold">
                {drop.click_count}/{drop.required_clicks}
              </strong>{' '}
              clicks
            </span>
          </div>
        ) : null}
      </section>

      {unlocking ? (
        <div className="m-0 mb-4.5 p-3 px-3.5 rounded-2xl bg-card text-muted text-sm grid gap-2.5">
          <p className="m-0">
            {progress?.phase === 'refreshing'
              ? 'Pack unlocked -- loading media...'
              : progress?.phase === 'loading'
                ? 'Loading drop catalog...'
                : `Unlocking without ads... ${progress?.clickCount ?? 0}/${progress?.requiredClicks || drop?.required_clicks || '?'} clicks`}
          </p>
          {progress && progress.requiredClicks > 0 ? (
            <div className="h-[5px] rounded-full bg-inset overflow-hidden" aria-hidden="true">
              <span
                className="block h-full rounded-[inherit] bg-gradient-to-r from-accent to-warm"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="m-0 mb-4.5 p-3 px-3.5 rounded-2xl text-danger border border-danger/25 bg-danger/[0.08] text-sm">
          {error}
        </p>
      ) : null}
      {loading && !drop ? <LoadingGrid count={10} variant="media" /> : null}

      {!loading && drop && !drop.unlocked && !unlocking ? (
        <p className="m-0 py-12 px-5 text-center text-muted text-[15px] border border-dashed border-border rounded-2xl bg-white/[0.02]">
          This pack is still locked ({drop.click_count}/{drop.required_clicks}). Unlock
          bypass did not finish -- open it again to retry.
        </p>
      ) : null}

      {!loading && drop?.unlocked ? (
        <section
          ref={galleryRef}
          className="grid gap-4.5 p-4.5 max-md:p-3.5 border border-border rounded-2xl bg-surface/70 scroll-mt-[76px]"
        >
          {visible.length > 0 && totalPages > 1 ? (
            <Pagination
              label="Pagination top"
              page={currentPage}
              totalPages={totalPages}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          ) : null}

          <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4 gap-x-3 max-md:gap-3 max-md:gap-x-2.5">
            {visible.map((item) => {
              const isVideo = dropItemIsVideo(item)
              const href = dropItemOpenUrl(item)
              const thumb = dropItemThumbnailUrl(item)
              const thumbFallback = wet3PreviewFallback(item)
              return (
                <article key={item.id} className="grid gap-2.5 min-w-0">
                  <a
                    href={href}
                    className="relative block aspect-square bg-inset border border-border rounded-[18px] overflow-hidden transition-all hover:-translate-y-0.5 hover:scale-[1.01] hover:border-accent/30 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${isVideo ? 'Watch' : 'View'} drop item ${item.id}`}
                  >
                    <img
                      className="w-full h-full object-cover block bg-inset"
                      src={thumb}
                      alt=""
                      loading="lazy"
                      data-fallback={thumbFallback}
                      onError={handleImageError}
                    />
                    {isVideo ? (
                      <>
                        <span className="absolute top-2 right-2 z-[2] text-[10px] w-7 h-7 rounded-full inline-flex items-center justify-center text-white bg-accent/90 shadow-[0_8px_18px_rgba(224,100,152,0.28)] pointer-events-none">
                          &#9654;
                        </span>
                        {item.duration?.trim() ? (
                          <span className="absolute right-2 bottom-2 z-[2] min-w-[40px] px-1.5 py-1 rounded-lg text-center text-[11px] font-bold tabular-nums leading-tight text-white bg-black/80 border border-white/12 shadow-md pointer-events-none">
                            {item.duration.replace(/^00:/, '')}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </a>
                  <div className="grid gap-[3px] px-0.5">
                    <span className="text-[11px] tabular-nums text-soft font-semibold tracking-[0.01em]">
                      {item.price || 'Free'}
                    </span>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-foreground" title={item.id}>
                      {item.id}
                    </span>
                    {isVideo && item.duration?.trim() ? (
                      <span className="text-[11px] tabular-nums text-accent-hover font-semibold max-md:hidden">
                        {item.duration}
                      </span>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>

          {visible.length === 0 ? (
            <p className="m-0 py-12 px-5 text-center text-muted text-[15px] border border-dashed border-border rounded-2xl bg-white/[0.02]">
              No media in this pack.
            </p>
          ) : totalPages > 1 ? (
            <Pagination
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
