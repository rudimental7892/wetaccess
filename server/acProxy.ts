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

    next()
  }
}
