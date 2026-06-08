type PaginationProps = {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

export function Pagination({
  page,
  totalPages,
  onPrevious,
  onNext,
}: PaginationProps) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn-ghost" onClick={onPrevious} disabled={page === 1}>
        ← Prev
      </button>
      <div className="pagination-track" aria-hidden="true">
        <span
          className="pagination-fill"
          style={{ width: `${(page / totalPages) * 100}%` }}
        />
      </div>
      <span className="pagination-label">
        {page} <span className="pagination-of">of</span> {totalPages}
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onNext}
        disabled={page >= totalPages}
      >
        Next →
      </button>
    </nav>
  )
}
