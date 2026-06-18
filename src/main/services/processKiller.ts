import { execFile } from 'child_process'
import { promisify } from 'util'
import type { KillResult } from '@shared/types'

const execFileAsync = promisify(execFile)

// Mirrors portScanner/linux.ts elevation strategy — see runElevatedSs there.
const ALLOW_INTERACTIVE_ELEVATION = process.env.PORTDECK_PRIVILEGED_SCAN === '1'

function isValidPid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 0
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd])
    return true
  } catch {
    return false
  }
}

function isPermissionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EPERM'
  )
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ESRCH'
  )
}

/**
 * Sends SIGTERM via elevated privileges. Tries passwordless `sudo -n` first,
 * then interactive `pkexec` when PORTDECK_PRIVILEGED_SCAN=1.
 */
async function runElevatedKill(pid: number): Promise<{ ok: boolean; error: string | null }> {
  const args = ['-TERM', String(pid)]

  if (await commandExists('sudo')) {
    try {
      await execFileAsync('sudo', ['-n', 'kill', ...args])
      return { ok: true, error: null }
    } catch (error) {
      if (isNotFoundError(error)) {
        return { ok: true, error: null }
      }
      // Passwordless sudo not configured; fall through.
    }
  }

  if (ALLOW_INTERACTIVE_ELEVATION && (await commandExists('pkexec'))) {
    try {
      await execFileAsync('pkexec', ['kill', ...args])
      return { ok: true, error: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `Privileged kill failed or was cancelled: ${message}` }
    }
  }

  return {
    ok: false,
    error: 'Permission denied. Cannot kill this process without elevated privileges.'
  }
}

export async function killProcess(pid: number): Promise<KillResult> {
  if (!isValidPid(pid)) {
    return { success: false, elevated: false, error: 'Invalid process ID.' }
  }

  try {
    process.kill(pid, 'SIGTERM')
    return { success: true, elevated: false, error: null }
  } catch (error) {
    if (isNotFoundError(error)) {
      return { success: true, elevated: false, error: null }
    }

    if (process.platform === 'linux' && isPermissionError(error)) {
      const elevated = await runElevatedKill(pid)
      return {
        success: elevated.ok,
        elevated: elevated.ok,
        error: elevated.error
      }
    }

    const message = error instanceof Error ? error.message : String(error)
    return { success: false, elevated: false, error: message }
  }
}
