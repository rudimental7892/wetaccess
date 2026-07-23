import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { imageUrl, streamUrl, thumbnailUrl, type MediaItem } from '../lib/wet3'

type WatchViewProps = {
  mediaId: string
  posterItem?: MediaItem | null
}

/**
 * In-app HLS player. AAF videos need wet3's stream-v2 broker (CDN is cookie-signed);
 * opening the raw m3u8 in a new tab often shows wet3's plain-text "Proxy Error".
 */
export function WatchView({ mediaId, posterItem }: WatchViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Loading stream…')
  const src = streamUrl(mediaId)
  const poster = posterItem
    ? thumbnailUrl(posterItem)
    : imageUrl(mediaId)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let hls: Hls | null = null
    let cancelled = false
    setError(null)
    setStatus('Loading stream…')

    const fail = (message: string) => {
      if (!cancelled) {
        setError(message)
        setStatus('')
      }
    }

    const onNativeError = () => {
      fail('Playback failed. Wet3’s AAF broker may be rate-limiting — try again.')
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.addEventListener('error', onNativeError)
      video.addEventListener('loadedmetadata', () => {
        if (!cancelled) setStatus('')
      })
      void video.play().catch(() => {
        /* user gesture / autoplay — controls still work */
      })
      return () => {
        cancelled = true
        video.removeEventListener('error', onNativeError)
        video.removeAttribute('src')
        video.load()
      }
    }

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        // Retry flaky wet3 AAF broker responses
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 800,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 800,
        fragLoadingMaxRetry: 5,
        fragLoadingRetryDelay: 600,
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!cancelled) setStatus('')
        void video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || cancelled) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setStatus('Network glitch — retrying…')
          hls?.startLoad()
          return
        }
        fail(
          data.details === 'manifestLoadError'
            ? 'Could not load playlist (wet3 Proxy Error). Retry or pick another video.'
            : `Playback error (${data.details})`,
        )
        hls?.destroy()
        hls = null
      })
      return () => {
        cancelled = true
        hls?.destroy()
      }
    }

    fail('This browser cannot play HLS video.')
    return () => {
      cancelled = true
    }
  }, [src])

  return (
    <section className="watch-view panel">
      <div className="watch-player-wrap">
        <video
          ref={videoRef}
          className="watch-player"
          controls
          playsInline
          poster={poster}
        />
      </div>
      {status ? <p className="watch-status">{status}</p> : null}
      {error ? (
        <div className="watch-error">
          <p>{error}</p>
          <button type="button" className="ghost-btn" onClick={() => window.location.reload()}>
            Retry
          </button>
          <a className="ghost-btn" href={src} target="_blank" rel="noreferrer">
            Open raw stream
          </a>
        </div>
      ) : null}
      <p className="watch-meta">
        Media <code>{mediaId}</code>
      </p>
    </section>
  )
}
