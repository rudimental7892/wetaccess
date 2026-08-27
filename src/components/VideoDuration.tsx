import { useEffect, useState } from 'react'
import { fetchVideoDuration, formatDuration } from '../lib/wet3'

type VideoDurationProps = {
  mediaId: string
  overlay?: boolean
}

export function VideoDuration({ mediaId, overlay = false }: VideoDurationProps) {
  const [duration, setDuration] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    void fetchVideoDuration(mediaId).then((seconds) => {
      if (!cancelled) {
        setDuration(seconds)
      }
    })

    return () => {
      cancelled = true
    }
  }, [mediaId])

  if (overlay) {
    const loadingClass = duration === undefined ? ' text-white/65 font-semibold' : ''
    const unavailableClass = duration === null ? ' text-white/45 font-semibold' : ''

    return (
      <span
        className={`absolute right-2 bottom-2 z-[2] min-w-[40px] px-1.5 py-1 rounded-lg text-center text-[11px] font-bold tabular-nums leading-tight text-white bg-black/80 border border-white/12 shadow-md pointer-events-none${loadingClass}${unavailableClass}`}
      >
        {duration === undefined
          ? '...'
          : duration === null
            ? '--:--'
            : formatDuration(duration)}
      </span>
    )
  }

  // Inline meta variant
  const baseClass = 'text-[11px] tabular-nums font-semibold'
  if (duration === undefined) {
    return <span className={`${baseClass} text-soft font-medium`}>...</span>
  }
  if (duration === null) {
    return <span className={`${baseClass} text-soft font-medium`}>--:--</span>
  }
  return <span className={`${baseClass} text-accent-hover`}>{formatDuration(duration)}</span>
}
