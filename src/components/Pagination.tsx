type PaginationProps = {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
  className?: string
  label?: string
  /** When set, Next uses this instead of page >= totalPages (wet3 infinite HTMX). */
  hasMore?: boolean
}

export function Pagination({
  page,
  totalPages,
  onPrevious,
  onNext,
  className,
  label = 'Pagination',
  hasMore,
}: PaginationProps) {
  const nextDisabled =
    typeof hasMore === 'boolean' ? !hasMore : page >= totalPages
  const labelText =
    typeof hasMore === 'boolean'
      ? hasMore
        ? `Page ${page} · more`
        : `Page ${page}`
      : (
          <>
            {page} <span className="text-soft">of</span> {totalPages}
          </>
        )
  const fillPct =
    typeof hasMore === 'boolean'
      ? hasMore
        ? Math.min(95, 20 + page * 3)
        : 100
      : (page / Math.max(totalPages, 1)) * 100

  return (
    <nav
      className={`grid grid-cols-[auto_1fr_auto_auto] max-md:grid-cols-[1fr_1fr] max-md:grid-areas-[track_track/prev_next/label_label] items-center gap-3 max-md:gap-2.5 p-3.5 px-4 max-md:p-3 border border-border rounded-xl bg-surface ${className ?? ''}`}
      aria-label={label}
    >
      <button
        type="button"
        className="border border-border bg-transparent rounded-2xl px-5 py-3.5 max-md:min-h-12 font-semibold hover:border-border-strong hover:bg-accent-soft transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed max-md:[grid-area:prev]"
        onClick={onPrevious}
        disabled={page === 1}
      >
        &larr; Prev
      </button>
      <div className="h-1.5 rounded-full bg-inset overflow-hidden max-md:[grid-area:track]" aria-hidden="true">
        <span
          className="block h-full rounded-[inherit] bg-gradient-to-r from-accent to-warm"
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <span className="text-muted text-[13px] tabular-nums whitespace-nowrap max-md:[grid-area:label] max-md:text-center">
        {labelText}
      </span>
      <button
        type="button"
        className="border border-border bg-transparent rounded-2xl px-5 py-3.5 max-md:min-h-12 font-semibold hover:border-border-strong hover:bg-accent-soft transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed max-md:[grid-area:next]"
        onClick={onNext}
        disabled={nextDisabled}
      >
        Next &rarr;
      </button>
    </nav>
  )
}
