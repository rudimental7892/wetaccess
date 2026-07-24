import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { imageUrl, streamUrl, thumbnailUrl, type MediaItem } from '../lib/wet3'

type WatchViewProps = {
  mediaId: string
  posterItem?: MediaItem | null
}

const AAF_BROKER_DOWN =
  'AllAccessFans playback is down: wet3’s stream broker returns “Proxy Error”, and AAF’s CDN now requires CloudFront signed cookies. YouFanly (Bunny) videos should still play.'

/**
 * Resolve the stream URL before handing it to the player so JSON 502s from our
 * wet3 proxy are not fed into native Safari HLS (which only showed a vague error).
 */
async function preflightStream(
  startUrl: string,
): Promise<{ ok: true; playUrl: string } | { ok: false; message: string }> {
  let url = startUrl
  for (let hop = 0; hop < 6; hop += 1) {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'same-origin',
      })
    } catch {
      return { ok: false, message: 'Could not reach the stream proxy. Check your connection and retry.' }
    }

    const location = response.headers.get('Location')
    if (location && (response.status === 301 || response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308)) {
      const next = new URL(location, window.location.origin)
      // AAF playlist still goes through wet3’s broken broker — fail early with a clear reason.
      if (
        next.pathname.includes('/api/stream-v2/proxy') &&
        next.searchParams.get('url')?.includes('allaccessfans.co')
      ) {
        const broker = await probeWet3Broker(next.pathname + next.search)
        if (!broker.ok) {
          return broker
        }
      }
      url = next.pathname + next.search
      continue
    }

    const contentType = response.headers.get('content-type') ?? ''
    const head = await response.clone().arrayBuffer().then((buf) => {
      const slice = new Uint8Array(buf).subarray(0, 96)
      return new TextDecoder().decode(slice)
    })

    if (!response.ok) {
      return { ok: false, message: explainUpstreamFailure(response.status, head, url) }
    }

    if (head.trimStart().startsWith('#EXTM3U') || contentType.includes('mpegurl')) {
      return { ok: true, playUrl: url }
    }

    // Progressive media (rare) — let the video element try.
    if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
      return { ok: true, playUrl: url }
    }

    return { ok: false, message: explainUpstreamFailure(response.status, head, url) }
  }

  return { ok: false, message: 'Stream redirect loop. Retry or pick another video.' }
}

async function probeWet3Broker(
  proxyPath: string,
): Promise<{ ok: true; playUrl: string } | { ok: false; message: string }> {
  try {
    const response = await fetch(proxyPath, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'same-origin',
    })
    const head = await response.clone().arrayBuffer().then((buf) => {
      const slice = new Uint8Array(buf).subarray(0, 96)
      return new TextDecoder().decode(slice)
    })
    if (response.ok && head.trimStart().startsWith('#EXTM3U')) {
      return { ok: true, playUrl: proxyPath }
    }
    return { ok: false, message: explainUpstreamFailure(response.status, head, proxyPath) }
  } catch {
    return { ok: false, message: AAF_BROKER_DOWN }
  }
}

function explainUpstreamFailure(status: number, head: string, url: string): string {
  const trimmed = head.trim()
  if (/^Proxy Error\b/i.test(trimmed) || /wet3 upstream proxy error/i.test(trimmed)) {
    return AAF_BROKER_DOWN
  }
  try {
    const json = JSON.parse(trimmed) as { error?: string; detail?: string }
    if (json.detail?.includes('Proxy Error') || json.error?.includes('proxy')) {
      return AAF_BROKER_DOWN
    }
    if (json.detail || json.error) {
      return `Stream failed (${status}): ${json.detail ?? json.error}`
    }
  } catch {
    // not JSON
  }
  if (trimmed.includes('MissingKey')) {
    return 'AAF CDN blocked the playlist (CloudFront MissingKey). Wet3 normally signs this; its broker is failing.'
  }
  if (url.includes('allaccessfans.co') || url.includes('stream-v2/proxy')) {
    return AAF_BROKER_DOWN
  }
  return `Stream failed (HTTP ${status}). Retry or try a YouFanly video.`
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
    let onNativeError: (() => void) | null = null
    setError(null)
    setStatus('Loading stream…')

    const fail = (message: string) => {
      if (!cancelled) {
        setError(message)
        setStatus('')
      }
    }

    const startPlayback = (playUrl: string) => {
      // Prefer hls.js when MSE is available — clearer retries than Safari native on proxy errors.
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          manifestLoadingMaxRetry: 4,
          manifestLoadingRetryDelay: 800,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 800,
          fragLoadingMaxRetry: 5,
          fragLoadingRetryDelay: 600,
        })
        hls.loadSource(playUrl)
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
              ? AAF_BROKER_DOWN
              : `Playback error (${data.details})`,
          )
          hls?.destroy()
          hls = null
        })
        return
      }

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        onNativeError = () => {
          fail(AAF_BROKER_DOWN)
        }
        video.src = playUrl
        video.addEventListener('error', onNativeError)
        video.addEventListener('loadedmetadata', () => {
          if (!cancelled) setStatus('')
        })
        void video.play().catch(() => {})
        return
      }

      fail('This browser cannot play HLS video.')
    }

    void (async () => {
      const result = await preflightStream(src)
      if (cancelled) return
      if (!result.ok) {
        fail(result.message)
        return
      }
      setStatus('Starting player…')
      startPlayback(result.playUrl)
    })()

    return () => {
      cancelled = true
      hls?.destroy()
      if (onNativeError) {
        video.removeEventListener('error', onNativeError)
      }
      video.removeAttribute('src')
      video.load()
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
