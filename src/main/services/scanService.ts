import type { ScanResult, Service } from '@shared/types'
import { buildStableKey } from '@shared/types'
import { getAllMetadata, getDatabaseError, recordScanHistory } from '../database'
import { scanPorts } from './portScanner'
import { dedupePortEntries } from './dedupePortEntries'
import { probePorts } from './httpProbe'
import { classifyService } from './serviceClassifier'
import { assessRisk } from './riskEngine'

let cachedServices: Service[] = []

export function getCachedServices(): Service[] {
  return cachedServices
}

export async function runScan(): Promise<ScanResult> {
  const warnings: string[] = []
  const dbError = getDatabaseError()
  if (dbError) {
    warnings.push(`Database warning: ${dbError}`)
  }

  const scanResult = await scanPorts()
  warnings.push(...scanResult.warnings)

  if (scanResult.error && scanResult.entries.length === 0) {
    return {
      services: cachedServices,
      scannedAt: new Date().toISOString(),
      warnings,
      error: scanResult.error
    }
  }

  const dedupedEntries = dedupePortEntries(scanResult.entries)

  const metadataList = (() => {
    try {
      return getAllMetadata()
    } catch (error) {
      warnings.push(`Failed to load metadata: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  })()

  const metadataMap = new Map(metadataList.map((m) => [m.stableKey, m]))

  const uniquePorts = [...new Set(dedupedEntries.map((e) => e.port))]
  const probeResults = await probePorts(uniquePorts)

  const services: Service[] = dedupedEntries.map((entry) => {
    const stableKey = buildStableKey(entry.processName, entry.port, entry.pid)
    const httpProbe = probeResults.get(entry.port) ?? null
    const classification = classifyService(entry, httpProbe)
    const risk = assessRisk(entry, classification)
    const metadata = metadataMap.get(stableKey)

    const localUrl = httpProbe?.reachable ? httpProbe.url : null

    return {
      stableKey,
      port: entry.port,
      address: entry.address,
      protocol: entry.protocol,
      pid: entry.pid,
      processName: entry.processName,
      command: entry.command,
      localUrl,
      httpProbe,
      serviceType: classification.type,
      typeLabel: classification.label,
      typeConfidence: classification.confidence,
      riskLevel: risk.level,
      riskReason: risk.reason,
      label: metadata?.label ?? null,
      project: metadata?.project ?? null,
      ignored: metadata?.ignored ?? false,
      notes: metadata?.notes ?? null,
      status: 'listening'
    }
  })

  // Sort by port ascending
  services.sort((a, b) => a.port - b.port)
  cachedServices = services

  const riskyCount = services.filter((s) => ['medium', 'high'].includes(s.riskLevel)).length

  try {
    recordScanHistory(services.length, riskyCount)
  } catch (error) {
    warnings.push(`Failed to record scan history: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    services,
    scannedAt: new Date().toISOString(),
    warnings,
    error: scanResult.error
  }
}

export function mergeServiceUpdate(stableKey: string, updates: Partial<Service>): Service | null {
  const index = cachedServices.findIndex((s) => s.stableKey === stableKey)
  if (index === -1) return null

  cachedServices[index] = { ...cachedServices[index], ...updates }
  return cachedServices[index]
}
