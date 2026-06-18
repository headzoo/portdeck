import { contextBridge, ipcRenderer } from 'electron'
import type { KillResult, PortdeckAPI, ScanResult, Service, ServiceMetadataUpdate } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'

const portdeck: PortdeckAPI = {
  scanServices: (): Promise<ScanResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_SERVICES),

  getServices: (): Promise<Service[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SERVICES),

  updateServiceMetadata: (stableKey: string, updates: ServiceMetadataUpdate): Promise<Service | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SERVICE_METADATA, stableKey, updates),

  ignoreService: (stableKey: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.IGNORE_SERVICE, stableKey),

  unignoreService: (stableKey: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNIGNORE_SERVICE, stableKey),

  openExternalUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL_URL, url),

  copyText: (text: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.COPY_TEXT, text),

  killProcess: (pid: number): Promise<KillResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.KILL_PROCESS, pid)
}

contextBridge.exposeInMainWorld('portdeck', portdeck)

declare global {
  interface Window {
    portdeck: PortdeckAPI
  }
}
