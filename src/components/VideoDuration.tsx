import { useEffect, useState } from 'react'
import { fetchVideoDuration, formatDuration } from '../lib/wet3'

type VideoDurationProps = {
  mediaId: string
}

export function VideoDuration({ mediaId }: VideoDurationProps) {
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

  if (duration === undefined) {
    return <span className="media-duration muted">…</span>
  }

  if (duration === null) {
    return null
  }

  return <span className="media-duration">{formatDuration(duration)}</span>
}
