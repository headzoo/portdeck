import type { ClassificationResult, RawPortEntry, RiskAssessment, RiskLevel, ServiceType } from '@shared/types'

function isPublicBind(address: string): boolean {
  const normalized = address.toLowerCase()
  return normalized === '*' || normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]'
}

function isLoopback(address: string): boolean {
  const normalized = address.toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

export function assessRisk(
  entry: RawPortEntry,
  classification: ClassificationResult
): RiskAssessment {
  const { type } = classification
  const publicBind = isPublicBind(entry.address)
  const loopback = isLoopback(entry.address)

  // Future integration placeholder: inspect tunnel configs for public exposure.
  if (type === 'tunnel') {
    return {
      level: 'info',
      reason: 'Tunnel process detected. Public exposure depends on tunnel configuration (inspection not yet implemented).'
    }
  }

  const highRiskDbTypes: ServiceType[] = ['postgresql', 'redis', 'mysql', 'mongodb']
  if (highRiskDbTypes.includes(type)) {
    if (publicBind) {
      return {
        level: 'high',
        reason: `${classification.label} listening on all interfaces — dangerous if exposed publicly.`
      }
    }
    if (loopback) {
      return {
        level: 'medium',
        reason: `${classification.label} on localhost only, but still sensitive if forwarded or tunneled.`
      }
    }
    return {
      level: 'high',
      reason: `${classification.label} bound to ${entry.address}.`
    }
  }

  if (type === 'qbittorrent') {
    return {
      level: publicBind ? 'high' : 'medium',
      reason: publicBind
        ? 'qBittorrent WebUI exposed on all interfaces.'
        : 'qBittorrent WebUI on localhost — still sensitive if forwarded.'
    }
  }

  const adminTypes: ServiceType[] = ['sonarr', 'radarr', 'prowlarr', 'jellyfin']
  if (adminTypes.includes(type)) {
    return {
      level: publicBind ? 'high' : 'medium',
      reason: publicBind
        ? `${classification.label} admin UI exposed on all interfaces.`
        : `${classification.label} admin UI on localhost.`
    }
  }

  if (type === 'dev-server') {
    return {
      level: publicBind ? 'medium' : 'low',
      reason: publicBind
        ? 'Dev server bound to all interfaces.'
        : 'Local dev server on localhost.'
    }
  }

  if (type === 'web-app' || type === 'proxy') {
    return {
      level: publicBind ? 'medium' : 'low',
      reason: publicBind
        ? 'HTTP service listening on all interfaces.'
        : 'HTTP service on localhost.'
    }
  }

  if (type === 'unknown' && publicBind) {
    return {
      level: 'medium',
      reason: 'Unknown service listening on all interfaces.'
    }
  }

  return {
    level: 'none' as RiskLevel,
    reason: 'No significant exposure risk detected.'
  }
}
