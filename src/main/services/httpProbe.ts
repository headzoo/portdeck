import type { HttpProbeResult } from '@shared/types'

const PROBE_TIMEOUT_MS = 750
const MAX_CONCURRENCY = 8

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match ? match[1].trim() : null
}

async function probeUrl(url: string): Promise<HttpProbeResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/json,*/*',
        'User-Agent': 'Portdeck/0.1'
      }
    })

    const contentType = response.headers.get('content-type')
    const serverHeader = response.headers.get('server')

    let title: string | null = null
    if (contentType?.includes('text/html')) {
      const text = await response.text()
      title = extractTitle(text.slice(0, 8192))
    }

    return {
      reachable: true,
      url,
      statusCode: response.status,
      contentType,
      serverHeader,
      title,
      protocol: url.startsWith('https') ? 'https' : 'http'
    }
  } catch {
    return {
      reachable: false,
      url: null,
      statusCode: null,
      contentType: null,
      serverHeader: null,
      title: null,
      protocol: null
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function probePort(port: number): Promise<HttpProbeResult> {
  const httpUrl = `http://127.0.0.1:${port}`
  const httpResult = await probeUrl(httpUrl)
  if (httpResult.reachable) {
    return httpResult
  }

  const httpsUrl = `https://127.0.0.1:${port}`
  const httpsResult = await probeUrl(httpsUrl)
  if (httpsResult.reachable) {
    return httpsResult
  }

  return {
    reachable: false,
    url: null,
    statusCode: null,
    contentType: null,
    serverHeader: null,
    title: null,
    protocol: null
  }
}

export async function probePorts(ports: number[]): Promise<Map<number, HttpProbeResult>> {
  const results = new Map<number, HttpProbeResult>()
  const queue = [...ports]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const port = queue.shift()
      if (port === undefined) return
      const result = await probePort(port)
      results.set(port, result)
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, ports.length) }, () => worker())
  await Promise.all(workers)
  return results
}
