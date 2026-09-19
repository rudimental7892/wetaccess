import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { LoadingGrid } from './LoadingGrid'
import { Pagination } from './Pagination'
import {
  type FeedItem,
  feedItemThumbnailUrl,
  feedItemWatchUrl,
  fetchFeed,
  placeholderImage,
} from '../lib/wet3'

const FEED_HASH_KEY = 'wetaccess:feedHash'

function parseFeedPage(): number {
  const hash = window.location.hash
  const queryStart = hash.indexOf('?')
  const params = new URLSearchParams(queryStart >= 0 ? hash.slice(queryStart + 1) : '')
  return Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
}

function buildFeedHash(page: number): string {
  return page > 1 ? `#/feed?page=${page}` : '#/feed'
}

export function rememberFeedHash(hash = window.location.hash) {
  if (hash.startsWith('#/feed') && !hash.match(/^#\/feed\/\d+/)) {
    sessionStorage.setItem(FEED_HASH_KEY, hash)
  }
}

export function navigateToFeed() {
  const saved = sessionStorage.getItem(FEED_HASH_KEY)
  window.location.hash = saved || '#/feed'
}

export function FeedView() {
  const [page, setPage] = useState(parseFeedPage)
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const gridRef = useRef<HTMLElement>(null)

  useEffect(() => {
    rememberFeedHash()

    const syncFromHash = () => {
      const next = parseFeedPage()
      setPage(next)
      rememberFeedHash()
    }

    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchFeed(page)
        if (!cancelled) {
          setItems(data.items)
          setHasMore(data.hasMore)
        }
      } catch (loadError) {
        if (!cancelled) {
          setItems([])
          setError(loadError instanceof Error ? loadError.message : 'Failed to load feed')
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
  }, [page])

  const goToPage = useCallback((nextPage: number) => {
    const nextHash = buildFeedHash(nextPage)
    sessionStorage.setItem(FEED_HASH_KEY, nextHash)
    window.location.hash = nextHash
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.src = placeholderImage()
  }

  return (
    <>
      <section className="relative overflow-hidden mb-7 p-7 max-md:p-[18px] max-md:mb-[18px] border border-border rounded-3xl bg-gradient-to-br from-accent/[0.08] via-transparent to-transparent bg-surface shadow-sm">
        <div className="absolute -right-[10%] -bottom-[60%] w-[280px] h-[280px] rounded-full bg-[radial-gradient(circle,rgba(224,100,152,0.16),transparent_68%)] pointer-events-none" />
        <p className="m-0 mb-2.5 text-accent text-xs font-bold tracking-[0.14em] uppercase">
          Browse all
        </p>
        <h1 className="m-0 max-w-[12ch] font-display text-[clamp(1.75rem,8vw,2.4rem)] md:text-[clamp(2.2rem,6vw,3.4rem)] leading-[0.95] font-[800] tracking-tight">
          Feed
        </h1>
        <p className="mt-3.5 m-0 max-w-[48ch] text-muted text-[15px] max-md:text-sm">
          {loading
            ? 'Loading latest videos...'
            : `Page ${page} · ${items.length} videos`}
        </p>
      </section>

      {error ? (
        <p className="m-0 mb-4.5 p-3 px-3.5 rounded-2xl text-danger border border-danger/25 bg-danger/[0.08] text-sm">
          {error}
        </p>
      ) : null}
      {loading ? <LoadingGrid count={20} variant="media" /> : null}

      {!loading && !error ? (
        <section
          ref={gridRef}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5 max-md:gap-3 scroll-mt-[76px]"
        >
          {items.map((item) => (
            <a
              key={item.id}
              className="group grid gap-2.5 max-md:gap-2 text-left no-underline text-inherit"
              href={feedItemWatchUrl(item)}
            >
              <div className="relative rounded-xl overflow-hidden bg-inset border border-border transition-all group-hover:-translate-y-0.5 group-hover:border-accent/30 group-hover:shadow-lg">
                <img
                  className="w-full aspect-square object-cover block group-hover:scale-[1.03] transition-transform duration-300"
                  src={feedItemThumbnailUrl(item)}
                  alt=""
                  loading="lazy"
                  onError={handleImageError}
                />
                <span className="absolute top-2 right-2 z-[2] w-7 h-7 rounded-full inline-flex items-center justify-center text-white bg-black/60 border border-white/20 text-[10px] shadow-md pointer-events-none">
                  &#9654;
                </span>
                {item.duration ? (
                  <span className="absolute right-2 bottom-2 z-[2] min-w-[40px] px-1.5 py-1 rounded-lg text-center text-[11px] font-bold tabular-nums leading-tight text-white bg-black/80 border border-white/12 shadow-md pointer-events-none">
                    {item.duration}
                  </span>
                ) : null}
                {item.locked ? (
                  <span className="absolute bottom-2 left-2 z-[2] px-1.5 py-0.5 rounded text-[9px] font-bold text-white bg-accent/90 backdrop-blur-sm">
                    Locked
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-1.5 px-0.5 min-w-0">
                <span className="text-xs font-bold truncate">
                  @{item.username}
                </span>
                {item.hasNewDrop ? (
                  <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-accent/60 bg-accent/10 text-accent text-[9px] font-extrabold uppercase tracking-wide">
                    New Drop
                  </span>
                ) : null}
              </div>
            </a>
          ))}
        </section>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <p className="m-0 py-12 px-5 text-center text-muted text-[15px] border border-dashed border-border rounded-2xl bg-white/[0.02]">
          No feed items found.
        </p>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="mt-6">
          <Pagination
            page={page}
            totalPages={1}
            hasMore={hasMore}
            onPrevious={() => goToPage(page - 1)}
            onNext={() => goToPage(page + 1)}
          />
        </div>
      ) : null}
    </>
  )
}
