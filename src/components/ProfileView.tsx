import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { LoadingGrid } from './LoadingGrid'
import { Pagination } from './Pagination'
import { VideoDuration } from './VideoDuration'
import {
  type MediaItem,
  fetchUserMedia,
  formatMediaDate,
  imageUrl,
  mediaLabel,
  placeholderImage,
  thumbnailUrl,
  watchUrl,
} from '../lib/wet3'

type Tab = 'all' | 'images' | 'videos'

const MEDIA_PER_PAGE = 20

function mediaTypeLabel(type: MediaItem['media_type']): string {
  return type === '2' ? 'Video' : 'Image'
}

export function ProfileView({ username }: { username: string }) {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const galleryRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      setLoading(true)
      setError(null)
      setMedia([])
      setActiveTab('all')
      setCurrentPage(1)

      try {
        const items = await fetchUserMedia(username, (partial) => {
          if (!cancelled) {
            setMedia(partial)
            setLoading(false)
          }
        })

        if (!cancelled) {
          setMedia(items)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load profile')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [username])

  const filtered = useMemo(() => {
    if (activeTab === 'images') {
      return media.filter((item) => item.media_type === '1')
    }

    if (activeTab === 'videos') {
      return media.filter((item) => item.media_type === '2')
    }

    return media
  }, [activeTab, media])

  const imageCount = useMemo(
    () => media.filter((item) => item.media_type === '1').length,
    [media],
  )
  const videoCount = useMemo(
    () => media.filter((item) => item.media_type === '2').length,
    [media],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / MEDIA_PER_PAGE))
  const visible = filtered.slice(
    (currentPage - 1) * MEDIA_PER_PAGE,
    currentPage * MEDIA_PER_PAGE,
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
    event.currentTarget.src = placeholderImage()
  }

  const avatarLetter = username.charAt(0).toUpperCase()

  return (
    <>
      {/* Profile hero */}
      <section className="grid gap-4.5 mb-6 p-6 max-md:p-[18px] max-md:mb-[18px] border border-border rounded-3xl bg-gradient-to-b from-accent/10 to-transparent bg-surface shadow-sm">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div
            className="w-[72px] h-[72px] rounded-[22px] grid place-items-center font-display text-[28px] font-[800] text-white bg-gradient-to-br from-accent to-warm shadow-[0_12px_32px_rgba(224,100,152,0.22)]"
            aria-hidden="true"
          >
            {avatarLetter}
          </div>
        </div>
        <div>
          <h1 className="m-0 font-display text-[clamp(1.8rem,4vw,2.6rem)] max-md:text-[1.65rem] max-md:overflow-wrap-anywhere leading-none font-[800] tracking-tight">
            @{username}
          </h1>
          <p className="mt-2 m-0 text-muted text-sm">
            {loading ? 'Loading library...' : 'Creator profile & media library'}
          </p>
        </div>
        {!loading ? (
          <div className="flex flex-wrap gap-2.5 max-md:overflow-x-auto max-md:flex-nowrap max-md:pb-0.5">
            <span className="inline-flex items-center gap-2 px-3.5 py-2.5 border border-border rounded-full bg-black/18 text-muted text-[13px] shrink-0">
              <strong className="text-foreground font-semibold">{media.length}</strong> posts
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-2.5 border border-border rounded-full bg-black/18 text-muted text-[13px] shrink-0">
              <strong className="text-foreground font-semibold">{imageCount}</strong> images
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-2.5 border border-border rounded-full bg-black/18 text-muted text-[13px] shrink-0">
              <strong className="text-foreground font-semibold">{videoCount}</strong> videos
            </span>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="m-0 mb-4.5 p-3 px-3.5 rounded-2xl text-danger border border-danger/25 bg-danger/[0.08] text-sm">
          {error}
        </p>
      ) : null}
      {loading ? <LoadingGrid count={10} variant="media" /> : null}

      {!loading && !error ? (
        <section
          ref={galleryRef}
          className="grid gap-4.5 p-4.5 max-md:p-3.5 border border-border rounded-2xl bg-surface/70 scroll-mt-[76px]"
        >
          {/* Tabs */}
          <div
            className="inline-flex gap-1.5 p-1.5 border border-border rounded-full bg-inset w-fit max-w-full overflow-x-auto max-md:flex max-md:w-full"
            role="tablist"
            aria-label="Media filters"
          >
            {(['all', 'images', 'videos'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                className={
                  activeTab === tab
                    ? 'text-white bg-gradient-to-br from-accent to-[#c4004a] shadow-[0_8px_20px_rgba(224,100,152,0.22)] rounded-full px-4 py-2.5 max-md:flex-1 max-md:min-h-11 max-md:px-3 text-[13px] max-md:text-xs font-semibold whitespace-nowrap cursor-pointer border-none'
                    : 'text-muted rounded-full px-4 py-2.5 max-md:flex-1 max-md:min-h-11 max-md:px-3 text-[13px] max-md:text-xs font-semibold whitespace-nowrap cursor-pointer bg-transparent border-none hover:text-foreground hover:bg-white/[0.04] transition-all'
                }
                aria-selected={activeTab === tab}
                onClick={() => {
                  setActiveTab(tab)
                  setCurrentPage(1)
                  scrollToGallery()
                }}
              >
                {tab === 'all'
                  ? `All (${media.length})`
                  : tab === 'images'
                    ? `Images (${imageCount})`
                    : `Videos (${videoCount})`}
              </button>
            ))}
          </div>

          {visible.length > 0 && totalPages > 1 ? (
            <Pagination
              label="Pagination top"
              page={currentPage}
              totalPages={totalPages}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          ) : null}

          {/* Media grid */}
          <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4 gap-x-3 max-md:gap-3 max-md:gap-x-2.5">
            {visible.map((item) => (
              <article key={item.id} className="grid gap-2.5 min-w-0">
                {item.media_type === '2' ? (
                  <a
                    href={watchUrl(item.id)}
                    className="relative block aspect-square bg-inset border border-border rounded-[18px] overflow-hidden transition-all hover:-translate-y-0.5 hover:scale-[1.01] hover:border-accent/30 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Watch video ${mediaLabel(item)}`}
                  >
                    <img
                      className="w-full h-full object-cover block bg-inset"
                      src={thumbnailUrl(item)}
                      alt={mediaTypeLabel(item.media_type)}
                      loading="lazy"
                      onError={handleImageError}
                    />
                    <span className="absolute top-2 right-2 z-[2] text-[10px] w-7 h-7 rounded-full inline-flex items-center justify-center text-white bg-accent/90 shadow-[0_8px_18px_rgba(224,100,152,0.28)] pointer-events-none">
                      &#9654;
                    </span>
                    <VideoDuration mediaId={item.id} overlay />
                  </a>
                ) : (
                  <a
                    href={imageUrl(item.id)}
                    className="relative block aspect-square bg-inset border border-border rounded-[18px] overflow-hidden transition-all hover:-translate-y-0.5 hover:scale-[1.01] hover:border-accent/30 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View image ${mediaLabel(item)}`}
                  >
                    <img
                      className="w-full h-full object-cover block bg-inset"
                      src={thumbnailUrl(item)}
                      alt={mediaTypeLabel(item.media_type)}
                      loading="lazy"
                      onError={handleImageError}
                    />
                  </a>
                )}
                <div className="grid gap-[3px] px-0.5">
                  <span className="text-[11px] tabular-nums text-soft font-semibold tracking-[0.01em]" title={item.createdAt ?? undefined}>
                    {formatMediaDate(item.createdAt)}
                  </span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-foreground" title={item.id}>
                    {mediaLabel(item)}
                  </span>
                  {item.media_type === '2' ? (
                    <span className="max-md:hidden">
                      <VideoDuration mediaId={item.id} />
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="m-0 py-12 px-5 text-center text-muted text-[15px] border border-dashed border-border rounded-2xl bg-white/[0.02]">
              No media in this tab.
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
