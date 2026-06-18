import type { Protocol, RawPortEntry } from '@shared/types'

export interface PortScannerResult {
  entries: RawPortEntry[]
  warnings: string[]
  error: string | null
}

export interface PortScanner {
  scan(): Promise<PortScannerResult>
}

export type { RawPortEntry, Protocol }
