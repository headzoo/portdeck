import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const LEGACY_APP_DIRS = ['Portlight', 'portlight']
const LEGACY_DB_FILE = 'portlight.db'
const NEW_DB_FILE = 'portdeck.db'
const WINDOW_STATE_FILE = 'window-state.json'

/**
 * Copies Portlight userData into the new Portdeck directory on first launch.
 * Uses copy (not move) so legacy Portlight data remains intact.
 */
export function migrateLegacyUserData(): void {
  const userDataPath = app.getPath('userData')
  const appDataPath = app.getPath('appData')
  const newDbPath = join(userDataPath, NEW_DB_FILE)

  if (existsSync(newDbPath)) {
    return
  }

  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true })
  }

  for (const legacyDirName of LEGACY_APP_DIRS) {
    const legacyDir = join(appDataPath, legacyDirName)
    if (!existsSync(legacyDir)) {
      continue
    }

    const legacyDbPath = join(legacyDir, LEGACY_DB_FILE)
    if (existsSync(legacyDbPath)) {
      copyFileSync(legacyDbPath, newDbPath)
      console.log(`Migrated database from ${legacyDbPath} to ${newDbPath}`)
    }

    const legacyWindowState = join(legacyDir, WINDOW_STATE_FILE)
    const newWindowState = join(userDataPath, WINDOW_STATE_FILE)
    if (existsSync(legacyWindowState) && !existsSync(newWindowState)) {
      copyFileSync(legacyWindowState, newWindowState)
      console.log(`Migrated window state from ${legacyWindowState} to ${newWindowState}`)
    }

    if (existsSync(newDbPath)) {
      break
    }
  }
}
