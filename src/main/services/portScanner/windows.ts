import type { PortScannerResult } from './types'

export async function scanWindowsPorts(): Promise<PortScannerResult> {
  return {
    entries: [],
    warnings: [],
    error: 'Windows port scanning is not yet implemented. Linux support is prioritized for MVP.'
  }
}
