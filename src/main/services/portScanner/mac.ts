import type { PortScannerResult } from './types'

export async function scanMacPorts(): Promise<PortScannerResult> {
  return {
    entries: [],
    warnings: [],
    error: 'macOS port scanning is not yet implemented. Linux support is prioritized for MVP.'
  }
}
