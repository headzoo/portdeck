import type { ClassificationResult, HttpProbeResult, RawPortEntry, ServiceType } from '@shared/types'

const PORT_TYPE_MAP: Record<number, { type: ServiceType; label: string }> = {
  5432: { type: 'postgresql', label: 'PostgreSQL' },
  6379: { type: 'redis', label: 'Redis' },
  3306: { type: 'mysql', label: 'MySQL/MariaDB' },
  27017: { type: 'mongodb', label: 'MongoDB' },
  8096: { type: 'jellyfin', label: 'Jellyfin' },
  8989: { type: 'sonarr', label: 'Sonarr' },
  7878: { type: 'radarr', label: 'Radarr' },
  9696: { type: 'prowlarr', label: 'Prowlarr' }
}

const DEV_PORTS = new Set([3000, 4000, 4173, 5173, 8080, 8000, 8888])

function normalizeProcessName(name: string | null): string {
  return (name ?? '').toLowerCase()
}

function matchProcessPattern(processName: string, patterns: string[]): boolean {
  return patterns.some((p) => processName.includes(p))
}

function isQbittorrent(port: number, processName: string, httpProbe: HttpProbeResult | null): boolean {
  if (port !== 8080 && !processName.includes('qbittorrent')) return false
  const title = httpProbe?.title?.toLowerCase() ?? ''
  const server = httpProbe?.serverHeader?.toLowerCase() ?? ''
  return processName.includes('qbittorrent') || title.includes('qbittorrent') || server.includes('qbittorrent')
}

export function classifyService(
  entry: RawPortEntry,
  httpProbe: HttpProbeResult | null
): ClassificationResult {
  const processName = normalizeProcessName(entry.processName)
  const port = entry.port

  if (matchProcessPattern(processName, ['cloudflared', 'ngrok', 'backtunnel', 'localtunnel'])) {
    return { type: 'tunnel', confidence: 'high', label: 'Tunnel' }
  }

  if (matchProcessPattern(processName, ['nginx', 'caddy'])) {
    return { type: 'proxy', confidence: 'medium', label: 'Reverse Proxy' }
  }

  if (matchProcessPattern(processName, ['postgres', 'postmaster'])) {
    return { type: 'postgresql', confidence: 'high', label: 'PostgreSQL' }
  }

  if (matchProcessPattern(processName, ['redis-server', 'redis'])) {
    return { type: 'redis', confidence: 'high', label: 'Redis' }
  }

  if (matchProcessPattern(processName, ['mysqld', 'mariadbd', 'mysql'])) {
    return { type: 'mysql', confidence: 'high', label: 'MySQL/MariaDB' }
  }

  if (matchProcessPattern(processName, ['mongod', 'mongo'])) {
    return { type: 'mongodb', confidence: 'high', label: 'MongoDB' }
  }

  if (isQbittorrent(port, processName, httpProbe)) {
    return { type: 'qbittorrent', confidence: 'high', label: 'qBittorrent WebUI' }
  }

  const portMatch = PORT_TYPE_MAP[port]
  if (portMatch) {
    return { type: portMatch.type, confidence: 'medium', label: portMatch.label }
  }

  if (httpProbe?.reachable) {
    if (DEV_PORTS.has(port) || matchProcessPattern(processName, ['node', 'vite', 'next', 'go', 'air'])) {
      return { type: 'dev-server', confidence: 'medium', label: 'Dev Server' }
    }
    return { type: 'web-app', confidence: 'low', label: 'Web Service' }
  }

  if (matchProcessPattern(processName, ['docker', 'dockerd', 'containerd'])) {
    return { type: 'unknown', confidence: 'low', label: 'Container Runtime' }
  }

  return { type: 'unknown', confidence: 'low', label: 'Unknown' }
}
