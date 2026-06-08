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

  const className = overlay
    ? `duration-badge${duration === undefined ? ' loading' : ''}`
    : `media-duration${duration === undefined ? ' muted' : ''}`

  if (duration === undefined) {
    return <span className={className}>…</span>
  }

  if (duration === null) {
    return <span className={`${className} unavailable`}>--:--</span>
  }

  return <span className={className}>{formatDuration(duration)}</span>
}
