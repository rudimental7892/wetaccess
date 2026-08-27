import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'

const execFileAsync = promisify(execFile)
const CURL = '/usr/bin/curl'
const MEMBERS = 'https://members.africancasting.com'

let curlChain: Promise<unknown> = Promise.resolve()

function curlGet(url: string, maxBuffer = 8 * 1024 * 1024): Promise<string> {
  const run = async (): Promise<string> => {
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { stdout } = await execFileAsync(
          CURL,
          [
            '-sL',
            '--fail-with-body',
            '--connect-timeout',
            '20',
            '--max-time',
            '90',
            '--retry',
            '2',
            '--retry-delay',
            '1',
            '--retry-all-errors',
            '-H',
            'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            '-H',
            'Accept: text/html,application/json',
            url,
          ],
          { maxBuffer },
        )
        if (stdout) return stdout
        throw new Error('Empty response')
      } catch (err) {
        lastErr = err
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
    throw new Error(`Upstream failed after retries: ${msg}`)
  }

  const next = curlChain.then(run, run)
  curlChain = next.catch(() => {})
  return next
}

function curlBinary(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      CURL,
      [
        '-sL',
        '--fail-with-body',
        '--connect-timeout',
        '15',
        '--max-time',
        '30',
        '-H',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        url,
      ],
      { maxBuffer: 16 * 1024 * 1024, encoding: 'buffer' as unknown as string },
      (err, stdout) => {
        if (err) return reject(err)
        resolve(stdout as unknown as Buffer)
      },
    )
    child.on('error', reject)
  })
}

function extractMp4(html: string): string | null {
  const m = html.match(/src="(https:\/\/[^"]+\.mp4[^"]*)"/i)
  return m?.[1]?.replace(/&amp;/g, '&') ?? null
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

const THUMB_ALLOWED_HOST = /^[a-z0-9]+\.mjedge\.net$/i

const thumbCache = new Map<string, { buf: Buffer; type: string; at: number }>()
const THUMB_CACHE_MAX = 200
const THUMB_CACHE_TTL = 30 * 60 * 1000

function getCachedThumb(key: string) {
  const e = thumbCache.get(key)
  if (!e) return null
  if (Date.now() - e.at > THUMB_CACHE_TTL) {
    thumbCache.delete(key)
    return null
  }
  return e
}

function cacheThumb(key: string, buf: Buffer, type: string) {
  thumbCache.set(key, { buf, type, at: Date.now() })
  if (thumbCache.size > THUMB_CACHE_MAX) {
    const oldest = thumbCache.keys().next().value
    if (oldest) thumbCache.delete(oldest)
  }
}

export function createAcProxyMiddleware(): Connect.NextHandleFunction {
  return async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? ''
    const path = url.split('?')[0]

    if (path === '/api/ac-catalog') {
      const q = new URL(url, 'http://local').searchParams
      const offset = q.get('offset') ?? '0'
      const amount = q.get('amount') ?? '100'
      const upstream = `${MEMBERS}/api/?output=json&command=media.newest&type=videos&offset=${offset}&amount=${amount}`
      try {
        const body = await curlGet(upstream)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body)
      } catch (err) {
        sendJson(res, 502, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return
    }

    if (path === '/api/ac-embed') {
      const id = new URL(url, 'http://local').searchParams.get('id')
      if (!id || !/^\d+$/.test(id)) {
        sendJson(res, 400, { error: 'Missing or invalid id' })
        return
      }
      try {
        const html = await curlGet(`${MEMBERS}/embed/${id}`)
        const mp4 = extractMp4(html)
        const poster = html.match(/poster="(https:\/\/[^"]+)"/i)?.[1] ?? null
        if (!mp4) {
          sendJson(res, 404, { error: 'No MP4 in embed response', id })
          return
        }
        sendJson(res, 200, { id, mp4, poster })
      } catch (err) {
        sendJson(res, 502, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return
    }

    if (path === '/api/ac-thumb') {
      const thumbUrl = new URL(url, 'http://local').searchParams.get('url')
      if (!thumbUrl) {
        sendJson(res, 400, { error: 'Missing url param' })
        return
      }
      try {
        const parsed = new URL(thumbUrl)
        if (!THUMB_ALLOWED_HOST.test(parsed.hostname)) {
          sendJson(res, 403, { error: 'Host not allowed' })
          return
        }

        const cached = getCachedThumb(thumbUrl)
        if (cached) {
          res.statusCode = 200
          res.setHeader('Content-Type', cached.type)
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.end(cached.buf)
          return
        }

        const buf = await curlBinary(thumbUrl)
        const ext = parsed.pathname.split('.').pop()?.toLowerCase() ?? ''
        const type =
          ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'png'
              ? 'image/png'
              : ext === 'webp'
                ? 'image/webp'
                : 'image/jpeg'
        cacheThumb(thumbUrl, buf, type)
        res.statusCode = 200
        res.setHeader('Content-Type', type)
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.end(buf)
      } catch (err) {
        sendJson(res, 502, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return
    }

    next()
  }
}
