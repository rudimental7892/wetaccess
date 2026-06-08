type LoadingGridProps = {
  count?: number
  variant?: 'creators' | 'media'
}

export function LoadingGrid({ count = 8, variant = 'media' }: LoadingGridProps) {
  return (
    <div className={variant === 'creators' ? 'creators-grid' : 'media-grid'}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={variant === 'creators' ? 'skeleton creator-skeleton' : 'skeleton media-skeleton'}
        />
      ))}
    </div>
  )
}
