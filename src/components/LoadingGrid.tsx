type LoadingGridProps = {
  count?: number
  variant?: 'creators' | 'media'
}

export function LoadingGrid({ count = 8, variant = 'media' }: LoadingGridProps) {
  const gridClass =
    variant === 'creators'
      ? 'grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5 max-md:gap-3'
      : 'grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4 gap-x-3 max-md:gap-3 max-md:gap-x-2.5'

  const skeletonClass =
    variant === 'creators'
      ? 'relative overflow-hidden rounded-xl bg-card border border-border aspect-[0.82] after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/[0.06] after:to-transparent after:animate-[shimmer_1.4s_infinite]'
      : 'relative overflow-hidden rounded-xl bg-card border border-border aspect-square after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/[0.06] after:to-transparent after:animate-[shimmer_1.4s_infinite]'

  return (
    <div className={gridClass}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={skeletonClass} />
      ))}
    </div>
  )
}
