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
            {page} <span className="pagination-of">of</span> {totalPages}
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
      className={['pagination', className].filter(Boolean).join(' ')}
      aria-label={label}
    >
      <button type="button" className="btn btn-ghost" onClick={onPrevious} disabled={page === 1}>
        ← Prev
      </button>
      <div className="pagination-track" aria-hidden="true">
        <span className="pagination-fill" style={{ width: `${fillPct}%` }} />
      </div>
      <span className="pagination-label">{labelText}</span>
      <button type="button" className="btn btn-ghost" onClick={onNext} disabled={nextDisabled}>
        Next →
      </button>
    </nav>
  )
}
