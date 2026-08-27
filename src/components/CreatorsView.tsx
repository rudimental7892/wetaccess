import {
  type FormEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { LoadingGrid } from './LoadingGrid'
import { Pagination } from './Pagination'
import {
  type Creator,
  fetchCreators,
  placeholderImage,
  wet3AssetUrl,
} from '../lib/wet3'
import { useFavorites } from '../lib/favorites'

type CreatorsBrowseState = {
  search: string
  page: number
}

const CREATORS_PER_PAGE = 24
const BROWSE_HASH_KEY = 'wetaccess:browseHash'
const TWITTER_BROWSE_HASH_KEY = 'wetaccess:twitterBrowseHash'
const PROFILE_BACK_KEY = 'wetaccess:profileBack'

function parseBrowseQueryFromHash(): CreatorsBrowseState {
  const hash = window.location.hash
  const queryStart = hash.indexOf('?')
  const params = new URLSearchParams(
    queryStart >= 0 ? hash.slice(queryStart + 1) : '',
  )
  const search = params.get('search')?.trim() ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  return { search, page }
}

function buildBrowseHash(
  basePath: '#/' | '#/twitter',
  { search, page }: CreatorsBrowseState,
): string {
  const params = new URLSearchParams()

  if (search) {
    params.set('search', search)
  }

  if (page > 1) {
    params.set('page', String(page))
  }

  const query = params.toString()
  if (!query) {
    return basePath === '#/' ? '#/' : '#/twitter'
  }
  return basePath === '#/' ? `#/?${query}` : `#/twitter?${query}`
}

export function CreatorsView({ twitterOnly = false }: { twitterOnly?: boolean }) {
  const initialBrowse = parseBrowseQueryFromHash()
  const [searchInput, setSearchInput] = useState(initialBrowse.search)
  const [searchQuery, setSearchQuery] = useState(initialBrowse.search)
  const [page, setPage] = useState(initialBrowse.page)
  const [creators, setCreators] = useState<Creator[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [searchNote, setSearchNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { isFav, toggle: toggleFav } = useFavorites('wetaccess')
  const browseStorageKey = twitterOnly ? TWITTER_BROWSE_HASH_KEY : BROWSE_HASH_KEY
  const hashBase: '#/' | '#/twitter' = twitterOnly ? '#/twitter' : '#/'
  const profileFrom = twitterOnly ? 'twitter' : 'creators'

  useEffect(() => {
    sessionStorage.setItem(PROFILE_BACK_KEY, profileFrom)
  }, [profileFrom])

  useEffect(() => {
    const syncBrowseFromHash = () => {
      const { search, page: nextPage } = parseBrowseQueryFromHash()
      setSearchInput(search)
      setSearchQuery(search)
      setPage(nextPage)
    }

    window.addEventListener('hashchange', syncBrowseFromHash)
    return () => window.removeEventListener('hashchange', syncBrowseFromHash)
  }, [])

  const updateBrowseHash = useCallback(
    (next: CreatorsBrowseState) => {
      const nextHash = buildBrowseHash(hashBase, next)
      sessionStorage.setItem(browseStorageKey, nextHash)
      window.location.hash = nextHash
    },
    [browseStorageKey, hashBase],
  )

  const totalPages = Math.max(1, Math.ceil(total / CREATORS_PER_PAGE))

  const loadCreators = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSearchNote(null)

    try {
      const data = await fetchCreators(page, CREATORS_PER_PAGE, searchQuery, {
        twitterOnly,
      })
      setCreators(data.items)
      setTotal(data.total)
      setHasMore(Boolean(data.hasMore))
      if (data.note) setSearchNote(data.note)
    } catch (loadError) {
      setCreators([])
      setTotal(0)
      setHasMore(false)
      const msg =
        loadError instanceof Error
          ? loadError.message
          : twitterOnly
            ? 'Failed to load Twitter creators'
            : 'Failed to load creators'
      setError(
        /not valid JSON|Unexpected token|JSON\.parse/i.test(msg)
          ? 'Creators feed changed (wet3 HTML). Hard-refresh or restart `npm run dev`.'
          : msg,
      )
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery, twitterOnly])

  useEffect(() => {
    void loadCreators()
  }, [loadCreators])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateBrowseHash({ search: searchInput.trim(), page: 1 })
  }

  const goToCreatorsPage = useCallback(
    (nextPage: number) => {
      updateBrowseHash({ search: searchQuery, page: nextPage })
    },
    [searchQuery, updateBrowseHash],
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
          {twitterOnly ? 'Twitter' : 'Discover'}
        </p>
        <h1 className="m-0 max-w-[12ch] font-display text-[clamp(1.75rem,8vw,2.4rem)] md:text-[clamp(2.2rem,6vw,3.4rem)] leading-[0.95] font-[800] tracking-tight">
          {twitterOnly
            ? 'Creators with Twitter profiles'
            : 'Find your next favorite creator'}
        </h1>
        <p className="mt-3.5 m-0 max-w-[48ch] text-muted text-[15px] max-md:text-sm">
          {hasMore
            ? `Page ${page} -- wet3 keeps loading more creators via infinite pages`
            : `${total.toLocaleString()} on this result set`}
          {twitterOnly
            ? '. Twitter-linked tab uses the same wet3 feed (wet3 no longer filters twitterOnly server-side).'
            : '. Search scans usernames across pages (wet3 itself only filters in the browser).'}
        </p>
      </section>

      {/* Search panel */}
      <section className="grid gap-3.5 mb-6 p-4.5 max-md:p-3.5 border border-border rounded-2xl bg-surface/70">
        <form className="flex gap-2.5 max-md:flex-col max-md:items-stretch" onSubmit={submitSearch}>
          <input
            className="flex-1 min-w-0 border border-border bg-inset text-foreground rounded-2xl px-4 py-3.5 max-md:min-h-12 outline-none transition-all focus:border-accent/45 focus:ring-4 focus:ring-accent/10 placeholder:text-soft"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={twitterOnly ? 'Search Twitter creators...' : 'Search creators...'}
            aria-label={twitterOnly ? 'Search Twitter creators' : 'Search creators'}
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
              onClick={() => updateBrowseHash({ search: '', page: 1 })}
            >
              Clear
            </button>
          ) : null}
        </form>
        {searchQuery && !loading ? (
          <p className="m-0 mt-2.5 p-3 px-3.5 rounded-2xl bg-card text-muted text-sm">
            Searching for "{searchQuery}" -- wet3 no longer server-filters; we scan pages slowly
            (max ~20) so CF doesn't rate-limit.
          </p>
        ) : null}
        {searchNote && !loading ? (
          <p className="m-0 mt-2 p-3 px-3.5 rounded-2xl bg-card text-muted text-sm opacity-80">
            {searchNote}
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="m-0 mb-4.5 p-3 px-3.5 rounded-2xl text-danger border border-danger/25 bg-danger/[0.08] text-sm">
          {error}
        </p>
      ) : null}
      {loading ? <LoadingGrid count={12} variant="creators" /> : null}

      {!loading && !error ? (
        <section className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5 max-md:gap-3">
          {creators.map((creator) => (
            <div
              key={creator.u}
              className="group relative grid gap-3.5 max-md:gap-2.5 text-left p-4 max-md:p-3 border border-border bg-card rounded-2xl cursor-pointer no-underline text-inherit transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-card-hover hover:shadow-lg active:scale-[0.98]"
            >
              <a
                className="contents no-underline text-inherit"
                href={`#/user/${encodeURIComponent(creator.u)}?from=${profileFrom}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="w-full aspect-square rounded-[18px] object-cover bg-inset"
                  src={wet3AssetUrl(creator.p)}
                  alt=""
                  loading="lazy"
                  onError={handleImageError}
                />
                <div className="grid gap-1 min-w-0">
                  <strong className="font-display text-[15px] font-bold">
                    @{creator.u}
                  </strong>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-muted">
                    {creator.d}
                  </span>
                  <span className="inline-flex self-start mt-0.5 px-2 py-1 rounded-full bg-inset text-soft text-[11px] font-semibold tracking-wide uppercase">
                    {creator.ds} posts
                  </span>
                </div>
              </a>
              <button
                type="button"
                className={`absolute top-2 right-2 w-8 h-8 grid place-items-center rounded-full text-sm border-none cursor-pointer transition-all ${
                  isFav(creator.u)
                    ? 'bg-accent/80 text-white opacity-100'
                    : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100'
                } hover:bg-accent hover:text-white`}
                aria-label={isFav(creator.u) ? 'Remove from favorites' : 'Add to favorites'}
                onClick={(e) => {
                  e.preventDefault()
                  toggleFav({
                    id: creator.u,
                    site: 'wetaccess',
                    title: `@${creator.u}`,
                    thumb: wet3AssetUrl(creator.p),
                    url: `#/user/${encodeURIComponent(creator.u)}`,
                    meta: `${creator.ds} posts`,
                  })
                }}
              >
                {isFav(creator.u) ? '❤' : '♡'}
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {!loading && !error && creators.length === 0 ? (
        <p className="m-0 py-12 px-5 text-center text-muted text-[15px] border border-dashed border-border rounded-2xl bg-white/[0.02]">
          {twitterOnly
            ? 'No Twitter creators matched that search.'
            : 'No creators matched that search.'}
        </p>
      ) : null}

      {!loading && !error && creators.length > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          hasMore={hasMore}
          onPrevious={() => goToCreatorsPage(page - 1)}
          onNext={() => goToCreatorsPage(page + 1)}
        />
      ) : null}
    </>
  )
}
