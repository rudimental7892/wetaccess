import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import {
  ensureProxiedPlayUrl,
  imageUrl,
  streamUrl,
  thumbnailUrl,
  type MediaItem,
} from '../lib/wet3'

type WatchViewProps = {
  mediaId: string
  posterItem?: MediaItem | null
}

const AAF_BROKER_DOWN =
  'AllAccessFans playback is down: wet3 is serving expired CloudFront signatures (and its proxy-m3u8 broker returns “Proxy Error”). YouFanly (Bunny) videos should still play.'

const BUNNY_REFERER_HINT =
  'Stream CDN blocked the request (HTTP 403). Playback must stay on the wetaccess HLS proxy — retry, or hard-refresh the watch tab.'

/**
 * Resolve the stream URL before handing it to the player so JSON 502s from our
 * wet3 proxy are not fed into native Safari HLS (which only showed a vague error).
 *
 * Critical: never return a bare Bunny/AAF URL. Those 403 without Referer: wet3.click.
 */
async function preflightStream(
  startUrl: string,
): Promise<{ ok: true; playUrl: string } | { ok: false; message: string }> {
  let url = ensureProxiedPlayUrl(startUrl)

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
    if (
      location &&
      (response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308)
    ) {
      // Always map CDN / wet3 absolute redirects onto same-origin proxies.
      const next = ensureProxiedPlayUrl(location)

      if (
        next.includes('/api/stream-v2/proxy') &&
        (next.includes('allaccessfans.co') ||
          decodeURIComponent(next).includes('allaccessfans.co'))
      ) {
        return probeWet3Broker(next)
      }

      url = next
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
      // Prefer stable proxy URL advertised by stream middleware when present.
      const playHeader = response.headers.get('X-Wetaccess-Play-Url')
      const playUrl =
        playHeader && playHeader.trim()
          ? ensureProxiedPlayUrl(playHeader)
          : ensureProxiedPlayUrl(url)
      // Guard empty header that would otherwise become "" → 400 missing url
      if (!playUrl || playUrl.trim() === '' || playUrl.includes('url=&') || playUrl.endsWith('?url=')) {
        return { ok: true, playUrl: ensureProxiedPlayUrl(url) }
      }
      return { ok: true, playUrl }
    }

    // Progressive media (rare) — let the video element try (still same-origin if proxied).
    if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
      return { ok: true, playUrl: ensureProxiedPlayUrl(url) }
    }

    return { ok: false, message: explainUpstreamFailure(response.status, head, url) }
  }

  return { ok: false, message: 'Stream redirect loop. Retry or pick another video.' }
}

async function probeWet3Broker(
  proxyPath: string,
): Promise<{ ok: true; playUrl: string } | { ok: false; message: string }> {
  try {
    const response = await fetch(ensureProxiedPlayUrl(proxyPath), {
      method: 'GET',
      redirect: 'manual',
      credentials: 'same-origin',
    })
    const head = await response.clone().arrayBuffer().then((buf) => {
      const slice = new Uint8Array(buf).subarray(0, 96)
      return new TextDecoder().decode(slice)
    })
    if (response.ok && head.trimStart().startsWith('#EXTM3U')) {
      const playHeader = response.headers.get('X-Wetaccess-Play-Url')
      const playUrl =
        playHeader && playHeader.trim()
          ? ensureProxiedPlayUrl(playHeader)
          : ensureProxiedPlayUrl(proxyPath)
      if (!playUrl || playUrl.trim() === '' || playUrl.includes('url=&') || playUrl.endsWith('?url=')) {
        return { ok: true, playUrl: ensureProxiedPlayUrl(proxyPath) }
      }
      return {
        ok: true,
        playUrl,
      }
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
    // Only parse when the body looks like JSON — m3u8/HTML used to throw
    // "is not valid JSON" into the watch UI for every content page.
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const json = JSON.parse(trimmed) as {
        error?: string
        detail?: string
        message?: string
      }
      if (
        json.error === 'stream_token_required' ||
        json.message?.toLowerCase().includes('watch an ad')
      ) {
        return 'Stream needs an ad unlock token. Retry — wetaccess should auto-fetch st= from wet3.'
      }
      if (
        json.error === 'aaf signature expired' ||
        json.detail?.toLowerCase().includes('expired') ||
        json.detail?.includes('Proxy Error') ||
        json.error?.includes('proxy')
      ) {
        return AAF_BROKER_DOWN
      }
      if (json.detail || json.error || json.message) {
        return `Stream failed (${status}): ${json.detail ?? json.error ?? json.message}`
      }
    }
  } catch {
    // not JSON
  }
  if (trimmed.includes('MissingKey') || trimmed.includes('AccessDenied')) {
    return 'AAF CDN blocked the playlist (expired/invalid CloudFront signature). Wet3 is not refreshing tokens.'
  }
  if (status === 403) {
    return BUNNY_REFERER_HINT
  }
  if (url.includes('allaccessfans.co') || url.includes('stream-v2/proxy')) {
    return AAF_BROKER_DOWN
  }
  return `Stream failed (HTTP ${status}). Retry or try a YouFanly video.`
}

/**
 * In-app HLS player. All CDN hops go through same-origin proxies that set
 * Referer: https://wet3.click/ — required by Bunny, broken if the browser hits b-cdn directly.
 */
export function WatchView({ mediaId, posterItem }: WatchViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Loading stream…')
  const [playUrl, setPlayUrl] = useState<string | null>(null)
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
    setPlayUrl(null)
    setStatus('Loading stream…')

    const fail = (message: string) => {
      if (!cancelled) {
        setError(message)
        setStatus('')
      }
    }

    const startPlayback = (resolvedUrl: string) => {
      // Final guard: never hand a bare CDN URL to hls.js / <video>.
      const safeUrl = ensureProxiedPlayUrl(resolvedUrl)
      setPlayUrl(safeUrl)

      // Prefer hls.js when MSE is available — clearer retries than Safari native on proxy errors.
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          // Absolute proxied URLs already; don't let hls invent cross-origin bases.
          manifestLoadingMaxRetry: 4,
          manifestLoadingRetryDelay: 800,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 800,
          fragLoadingMaxRetry: 5,
          fragLoadingRetryDelay: 600,
        })
        hls.loadSource(safeUrl)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!cancelled) setStatus('')
          void video.play().catch(() => {})
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || cancelled) return
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // One automatic resume; don't infinite-loop on hard 403s.
            if (data.response?.code === 403) {
              fail(BUNNY_REFERER_HINT)
              hls?.destroy()
              hls = null
              return
            }
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
          fail(BUNNY_REFERER_HINT)
        }
        video.src = safeUrl
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
        video.removeAttribute('src')
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
          {/* Same-origin proxy path only — never bare Bunny (403 without wet3 Referer). */}
          <a
            className="ghost-btn"
            href={playUrl || src}
            target="_blank"
            rel="noopener"
          >
            Open proxied stream
          </a>
        </div>
      ) : null}
      <p className="watch-meta">
        Media <code>{mediaId}</code>
      </p>
    </section>
  )
}
