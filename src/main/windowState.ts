import { app, BrowserWindow, screen, type Display, type Rectangle } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export const WINDOW_DEFAULT_WIDTH = 1280
export const WINDOW_DEFAULT_HEIGHT = 860
export const WINDOW_MIN_WIDTH = 960
export const WINDOW_MIN_HEIGHT = 640

const SAVE_DEBOUNCE_MS = 300

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  displayId: number
  isMaximized: boolean
}

let trackedWindow: BrowserWindow | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let beforeQuitHooked = false

function windowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function clampSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(WINDOW_MIN_WIDTH, width),
    height: Math.max(WINDOW_MIN_HEIGHT, height)
  }
}

function boundsIntersect(a: Rectangle, b: Rectangle): boolean {
  return !(
    b.x > a.x + a.width ||
    b.x + b.width < a.x ||
    b.y > a.y + a.height ||
    b.y + b.height < a.y
  )
}

function centerOnDisplay(display: Display, width: number, height: number): Rectangle {
  const { x, y, width: displayWidth, height: displayHeight } = display.workArea
  return {
    x: Math.round(x + (displayWidth - width) / 2),
    y: Math.round(y + (displayHeight - height) / 2),
    width,
    height
  }
}

function resolveTargetDisplay(state: WindowState): Display {
  const displays = screen.getAllDisplays()
  const savedDisplay = displays.find((display) => display.id === state.displayId)
  if (savedDisplay) {
    return savedDisplay
  }

  const savedBounds: Rectangle = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height
  }
  const matchingDisplay = screen.getDisplayMatching(savedBounds)
  if (boundsIntersect(savedBounds, matchingDisplay.workArea)) {
    return matchingDisplay
  }

  return screen.getPrimaryDisplay()
}

function ensureVisibleOnDisplay(bounds: Rectangle, display: Display): Rectangle {
  if (boundsIntersect(bounds, display.workArea)) {
    return bounds
  }

  return centerOnDisplay(display, bounds.width, bounds.height)
}

function parseWindowState(raw: unknown): WindowState | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const state = raw as Partial<WindowState>
  if (
    typeof state.x !== 'number' ||
    typeof state.y !== 'number' ||
    typeof state.width !== 'number' ||
    typeof state.height !== 'number' ||
    typeof state.displayId !== 'number' ||
    typeof state.isMaximized !== 'boolean'
  ) {
    return null
  }

  const size = clampSize(state.width, state.height)
  return {
    x: state.x,
    y: state.y,
    width: size.width,
    height: size.height,
    displayId: state.displayId,
    isMaximized: state.isMaximized
  }
}

export function getDefaultWindowState(): WindowState {
  const display = screen.getPrimaryDisplay()
  const bounds = centerOnDisplay(display, WINDOW_DEFAULT_WIDTH, WINDOW_DEFAULT_HEIGHT)

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    displayId: display.id,
    isMaximized: false
  }
}

export function loadWindowState(): WindowState {
  try {
    const filePath = windowStatePath()
    if (!existsSync(filePath)) {
      return getDefaultWindowState()
    }

    const parsed = parseWindowState(JSON.parse(readFileSync(filePath, 'utf8')))
    return parsed ?? getDefaultWindowState()
  } catch {
    return getDefaultWindowState()
  }
}

export function saveWindowState(state: WindowState): void {
  try {
    const userDataPath = app.getPath('userData')
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true })
    }

    writeFileSync(windowStatePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    console.error('Failed to save window state:', error)
  }
}

export function captureWindowState(window: BrowserWindow): WindowState {
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds()
  const size = clampSize(bounds.width, bounds.height)

  return {
    x: bounds.x,
    y: bounds.y,
    width: size.width,
    height: size.height,
    displayId: screen.getDisplayMatching(bounds).id,
    isMaximized: window.isMaximized()
  }
}

export function applyWindowState(window: BrowserWindow, state: WindowState): void {
  const display = resolveTargetDisplay(state)
  const bounds = ensureVisibleOnDisplay(
    {
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height
    },
    display
  )

  window.setBounds(bounds)

  if (state.isMaximized) {
    window.maximize()
  }
}

function scheduleSave(window: BrowserWindow): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }

  saveTimer = setTimeout(() => {
    saveTimer = null
    saveWindowState(captureWindowState(window))
  }, SAVE_DEBOUNCE_MS)
}

function saveImmediately(window: BrowserWindow): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }

  saveWindowState(captureWindowState(window))
}

function ensureBeforeQuitHook(): void {
  if (beforeQuitHooked) {
    return
  }

  beforeQuitHooked = true
  app.on('before-quit', () => {
    if (trackedWindow && !trackedWindow.isDestroyed()) {
      saveImmediately(trackedWindow)
    }
  })
}

export function trackWindowState(window: BrowserWindow): void {
  trackedWindow = window
  ensureBeforeQuitHook()

  window.on('resize', () => {
    scheduleSave(window)
  })

  window.on('move', () => {
    scheduleSave(window)
  })

  window.on('maximize', () => {
    saveImmediately(window)
  })

  window.on('unmaximize', () => {
    saveImmediately(window)
  })

  window.on('close', () => {
    saveImmediately(window)
  })
}
