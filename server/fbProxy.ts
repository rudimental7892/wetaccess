import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'

const execFileAsync = promisify(execFile)
const CURL = '/usr/bin/curl'
const FB_API = 'https://fb-services.fanbusy.com:9105/api/v1'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.end(JSON.stringify(body))
}

function sanitizePath(raw: string): string | null {
  const cleaned = raw.replace(/^\/+/, '').replace(/\.\./g, '')
  if (!cleaned || cleaned.includes('://')) return null
  return cleaned
}

async function curlGet(url: string): Promise<string> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        CURL,
        [
          '-sk',
          '--fail-with-body',
          '--connect-timeout',
          '15',
          '--max-time',
          '30',
          '-H',
          'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          '-H',
          'Accept: application/json',
          '-H',
          'Origin: https://www.fanbusy.com',
          '-H',
          'Referer: https://www.fanbusy.com/',
          url,
        ],
        { maxBuffer: 8 * 1024 * 1024 },
      )
      if (stdout) return stdout
      throw new Error('Empty response')
    } catch (err) {
      lastErr = err
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
  throw new Error(`FanBusy upstream failed: ${msg}`)
}

export function createFbProxyMiddleware(): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/fb')) {
      next()
      return
    }

    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const parsed = new URL(url, 'http://localhost')
    const path = sanitizePath(parsed.searchParams.get('path') ?? '')
    if (!path) {
      sendJson(res, 400, { error: 'missing or invalid path' })
      return
    }

    parsed.searchParams.delete('path')
    const search = parsed.searchParams.toString()
    const target = `${FB_API}/${path}${search ? `?${search}` : ''}`

    void curlGet(target)
      .then((text) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'private, no-store')
        res.end(text)
      })
      .catch((err: unknown) => {
        sendJson(res, 502, {
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }
}
