import { clipboard, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { ServiceMetadataUpdate } from '@shared/types'
import { getDatabaseError, setIgnored, upsertMetadata } from './database'
import { killProcess } from './services/processKiller'
import { getCachedServices, mergeServiceUpdate, runScan } from './services/scanService'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SCAN_SERVICES, async () => {
    try {
      return await runScan()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        services: getCachedServices(),
        scannedAt: new Date().toISOString(),
        warnings: [],
        error: message
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_SERVICES, () => {
    return getCachedServices()
  })

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_SERVICE_METADATA,
    (_event, stableKey: string, updates: ServiceMetadataUpdate) => {
      try {
        const metadata = upsertMetadata(stableKey, updates)
        return mergeServiceUpdate(stableKey, {
          label: metadata.label,
          project: metadata.project,
          notes: metadata.notes,
          ignored: metadata.ignored
        })
      } catch (error) {
        console.error('Failed to update metadata:', error)
        return null
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.IGNORE_SERVICE, (_event, stableKey: string) => {
    try {
      setIgnored(stableKey, true)
      mergeServiceUpdate(stableKey, { ignored: true })
    } catch (error) {
      console.error('Failed to ignore service:', error)
      throw error
    }
  })

  ipcMain.handle(IPC_CHANNELS.UNIGNORE_SERVICE, (_event, stableKey: string) => {
    try {
      setIgnored(stableKey, false)
      mergeServiceUpdate(stableKey, { ignored: false })
    } catch (error) {
      console.error('Failed to unignore service:', error)
      throw error
    }
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL_URL, async (_event, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC_CHANNELS.COPY_TEXT, (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle(IPC_CHANNELS.KILL_PROCESS, async (_event, pid: unknown) => {
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
      return { success: false, elevated: false, error: 'Invalid process ID.' }
    }
    try {
      return await killProcess(pid)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, elevated: false, error: message }
    }
  })

  // Surface database init errors early if present
  const dbError = getDatabaseError()
  if (dbError) {
    console.error('Database initialization error:', dbError)
  }
}
