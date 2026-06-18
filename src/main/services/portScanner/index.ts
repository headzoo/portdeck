import { scanLinuxPorts } from './linux'
import { scanMacPorts } from './mac'
import { scanWindowsPorts } from './windows'
import type { PortScannerResult } from './types'

export async function scanPorts(): Promise<PortScannerResult> {
  switch (process.platform) {
    case 'linux':
      return scanLinuxPorts()
    case 'darwin':
      return scanMacPorts()
    case 'win32':
      return scanWindowsPorts()
    default:
      return {
        entries: [],
        warnings: [],
        error: `Unsupported platform: ${process.platform}`
      }
  }
}

export type { PortScannerResult } from './types'
