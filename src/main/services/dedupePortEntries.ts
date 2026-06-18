import type { RawPortEntry } from '@shared/types'

function isWildcardAddress(address: string): boolean {
  const normalized = address.toLowerCase()
  return normalized === '*' || normalized === '0.0.0.0' || normalized === '::'
}

function isLoopbackAddress(address: string): boolean {
  const normalized = address.toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

function entryScore(entry: RawPortEntry): number {
  let score = 0
  if (entry.pid) score += 8
  if (entry.processName) score += 4
  if (isWildcardAddress(entry.address)) score += 2
  if (isLoopbackAddress(entry.address)) score += 1
  return score
}

function dedupeKey(entry: RawPortEntry): string {
  if (entry.pid) {
    return `pid:${entry.pid}:${entry.port}`
  }
  if (entry.processName) {
    return `${entry.processName}:${entry.port}`
  }
  return `port:${entry.port}`
}

function mergeAddress(a: string, b: string): string {
  if (a === b) return a
  if (isWildcardAddress(a) || isWildcardAddress(b)) return '*'

  const addresses = [a, b]
  const hasLoopback = addresses.some(isLoopbackAddress)
  const hasNonLoopback = addresses.some((addr) => !isLoopbackAddress(addr))
  if (hasLoopback && hasNonLoopback) {
    return addresses.find((addr) => !isLoopbackAddress(addr)) ?? a
  }

  return a
}

function mergeEntries(existing: RawPortEntry, incoming: RawPortEntry): RawPortEntry {
  const keepExisting = entryScore(existing) >= entryScore(incoming)
  const primary = keepExisting ? existing : incoming
  const secondary = keepExisting ? incoming : existing

  return {
    port: primary.port,
    address: mergeAddress(existing.address, incoming.address),
    protocol: primary.protocol,
    pid: primary.pid ?? secondary.pid,
    processName: primary.processName ?? secondary.processName,
    command: primary.command ?? secondary.command
  }
}

/**
 * Collapse duplicate listeners that represent the same logical service.
 * Common case: dual-stack IPv4 (0.0.0.0) + IPv6 (::) on the same port.
 */
export function dedupePortEntries(entries: RawPortEntry[]): RawPortEntry[] {
  const merged = new Map<string, RawPortEntry>()

  for (const entry of entries) {
    const key = dedupeKey(entry)
    const existing = merged.get(key)
    merged.set(key, existing ? mergeEntries(existing, entry) : entry)
  }

  return [...merged.values()]
}
