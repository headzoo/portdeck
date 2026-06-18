export type Protocol = 'tcp' | 'udp'

export type ServiceType =
  | 'web-app'
  | 'dev-server'
  | 'postgresql'
  | 'redis'
  | 'mysql'
  | 'mongodb'
  | 'jellyfin'
  | 'sonarr'
  | 'radarr'
  | 'prowlarr'
  | 'qbittorrent'
  | 'tunnel'
  | 'proxy'
  | 'unknown'

export type RiskLevel = 'none' | 'info' | 'low' | 'medium' | 'high'

export type Confidence = 'low' | 'medium' | 'high'

export interface RawPortEntry {
  port: number
  address: string
  protocol: Protocol
  pid: number | null
  processName: string | null
  command: string | null
}

export interface HttpProbeResult {
  reachable: boolean
  url: string | null
  statusCode: number | null
  contentType: string | null
  serverHeader: string | null
  title: string | null
  protocol: 'http' | 'https' | null
}

export interface ClassificationResult {
  type: ServiceType
  confidence: Confidence
  label: string
}

export interface RiskAssessment {
  level: RiskLevel
  reason: string
}

export interface ServiceMetadata {
  stableKey: string
  label: string | null
  project: string | null
  ignored: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ServiceMetadataUpdate {
  label?: string | null
  project?: string | null
  notes?: string | null
  ignored?: boolean
}

export interface Service {
  stableKey: string
  port: number
  address: string
  protocol: Protocol
  pid: number | null
  processName: string | null
  command: string | null
  localUrl: string | null
  httpProbe: HttpProbeResult | null
  serviceType: ServiceType
  typeLabel: string
  typeConfidence: Confidence
  riskLevel: RiskLevel
  riskReason: string
  label: string | null
  project: string | null
  ignored: boolean
  notes: string | null
  status: 'listening' | 'unknown'
}

export interface ScanResult {
  services: Service[]
  scannedAt: string
  warnings: string[]
  error: string | null
}

export interface PortScannerResult {
  entries: RawPortEntry[]
  warnings: string[]
  error: string | null
}

export interface KillResult {
  success: boolean
  elevated: boolean
  error: string | null
}

export interface PortdeckAPI {
  scanServices: () => Promise<ScanResult>
  getServices: () => Promise<Service[]>
  updateServiceMetadata: (stableKey: string, updates: ServiceMetadataUpdate) => Promise<Service | null>
  ignoreService: (stableKey: string) => Promise<void>
  unignoreService: (stableKey: string) => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
  copyText: (text: string) => Promise<void>
  killProcess: (pid: number) => Promise<KillResult>
}

export const IPC_CHANNELS = {
  SCAN_SERVICES: 'portdeck:scan-services',
  GET_SERVICES: 'portdeck:get-services',
  UPDATE_SERVICE_METADATA: 'portdeck:update-service-metadata',
  IGNORE_SERVICE: 'portdeck:ignore-service',
  UNIGNORE_SERVICE: 'portdeck:unignore-service',
  OPEN_EXTERNAL_URL: 'portdeck:open-external-url',
  COPY_TEXT: 'portdeck:copy-text',
  KILL_PROCESS: 'portdeck:kill-process'
} as const

export function buildStableKey(processName: string | null, port: number, pid: number | null): string {
  // Prefer processName:port so labels survive restarts when the same service rebinds.
  if (processName) {
    return `${processName}:${port}`
  }
  if (pid) {
    return `pid:${pid}:${port}`
  }
  return `port:${port}`
}
