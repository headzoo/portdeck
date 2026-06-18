import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { initDatabase } from './database'
import { migrateLegacyUserData } from './migrateLegacyUserData'
import {
  applyWindowState,
  loadWindowState,
  trackWindowState,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH
} from './windowState'

// Some Linux setups (VMs, certain Mesa/GPU drivers) fail to launch the GPU
// process ("GPU process isn't usable. Goodbye."), which aborts the app before
// any window appears. Software rendering is more than enough for this 2D table
// UI. Set PORTDECK_ENABLE_GPU=1 to opt back into hardware acceleration.
if (process.platform === 'linux' && process.env.PORTDECK_ENABLE_GPU !== '1') {
  app.disableHardwareAcceleration()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const windowState = loadWindowState()

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    title: 'Portdeck',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  applyWindowState(mainWindow, windowState)
  trackWindowState(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  migrateLegacyUserData()

  try {
    initDatabase()
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
