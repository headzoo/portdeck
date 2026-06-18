import { execFile } from 'child_process'
import { promisify } from 'util'
import type { RawPortEntry } from './types'
import type { PortScannerResult } from './types'
import { resolveProcSockets } from './procResolver'

const execFileAsync = promisify(execFile)

/**
 * Fills in PID/process info for entries the scanner couldn't attribute by
 * reading socket ownership directly from `/proc`. This catches sockets that
 * `ss`/`lsof` reported without a process column (commonly because the scan
 * runs unprivileged and the kernel hides owners of other users' sockets).
 */
async function enrichWithProc(entries: RawPortEntry[], warnings: string[]): Promise<void> {
  if (!entries.some((entry) => entry.pid === null)) return

  try {
    const { byKey, byPort } = await resolveProcSockets()
    if (byKey.size === 0 && byPort.size === 0) return

    for (const entry of entries) {
      if (entry.pid !== null) continue

      const owner = byKey.get(`${entry.address}:${entry.port}`) ?? byPort.get(entry.port)
      if (!owner) continue

      entry.pid = owner.pid
      if (!entry.processName) entry.processName = owner.processName
      if (!entry.command) entry.command = owner.command
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`/proc PID resolution failed: ${message}`)
  }
}

function parseAddress(raw: string): { address: string; port: number } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Handle IPv6 [::]:port or [addr]:port
  const ipv6Match = trimmed.match(/^\[(.+?)\]:(\d+)$/)
  if (ipv6Match) {
    return { address: ipv6Match[1], port: Number(ipv6Match[2]) }
  }

  const lastColon = trimmed.lastIndexOf(':')
  if (lastColon === -1) return null

  const address = trimmed.slice(0, lastColon)
  const port = Number(trimmed.slice(lastColon + 1))
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return null

  return { address: address || '*', port }
}

function parseSsUsers(usersField: string): { pid: number | null; processName: string | null; command: string | null } {
  // Example: users:(("nginx",pid=1234,fd=6))
  const pidMatch = usersField.match(/pid=(\d+)/)
  const nameMatch = usersField.match(/\(\("([^"]+)"/)
  const pid = pidMatch ? Number(pidMatch[1]) : null
  const processName = nameMatch ? nameMatch[1] : null
  return { pid, processName, command: processName }
}

function parseSsOutput(output: string): RawPortEntry[] {
  const entries: RawPortEntry[] = []
  const seen = new Set<string>()

  for (const line of output.split('\n')) {
    if (!line.includes('LISTEN')) continue

    const parts = line.trim().split(/\s+/)
    if (parts.length < 4) continue

    const localAddr = parts[3]
    const parsed = parseAddress(localAddr)
    if (!parsed) continue

    const usersIdx = parts.findIndex((p) => p.startsWith('users:'))
    let pid: number | null = null
    let processName: string | null = null
    let command: string | null = null

    if (usersIdx !== -1) {
      const usersField = parts.slice(usersIdx).join(' ')
      const info = parseSsUsers(usersField)
      pid = info.pid
      processName = info.processName
      command = info.command
    }

    const key = `${parsed.address}:${parsed.port}:${pid ?? 'none'}`
    if (seen.has(key)) continue
    seen.add(key)

    entries.push({
      port: parsed.port,
      address: parsed.address,
      protocol: 'tcp',
      pid,
      processName,
      command
    })
  }

  return entries
}

function parseLsofOutput(output: string): RawPortEntry[] {
  const entries: RawPortEntry[] = []
  const seen = new Set<string>()

  for (const line of output.split('\n').slice(1)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parts = trimmed.split(/\s+/)
    if (parts.length < 9) continue

    const command = parts[0]
    const pid = Number(parts[1])
    const nameField = parts[parts.length - 1]

    const addrMatch = nameField.match(/(?:\*|\d+\.\d+\.\d+\.\d+|::|\[::\]|localhost|\[::1\]):(\d+)/)
    if (!addrMatch) continue

    const port = Number(addrMatch[1])
    if (!Number.isFinite(port)) continue

    let address = '*'
    const hostMatch = nameField.match(/^([^:]+):/)
    if (hostMatch) {
      address = hostMatch[1].replace(/^\[/, '').replace(/\]$/, '')
    }

    const key = `${address}:${port}:${pid}`
    if (seen.has(key)) continue
    seen.add(key)

    entries.push({
      port,
      address,
      protocol: 'tcp',
      pid: Number.isFinite(pid) ? pid : null,
      processName: command,
      command
    })
  }

  return entries
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd])
    return true
  } catch {
    return false
  }
}

// Interactive elevation (pkexec, which shows a GUI password prompt) is opt-in
// so a Refresh never blocks on a password dialog unless the user asked for it.
const ALLOW_INTERACTIVE_ELEVATION = process.env.PORTDECK_PRIVILEGED_SCAN === '1'

function isRoot(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0
}

/**
 * Runs `ss -ltnp` with elevated privileges so the kernel reveals owners of
 * other users' sockets (e.g. root-owned services on ports 80/443).
 *
 * Tries passwordless `sudo -n` first (silent, never prompts). Only falls back
 * to interactive `pkexec` when PORTDECK_PRIVILEGED_SCAN=1. Returns null when
 * elevation is unavailable, not permitted, or cancelled.
 */
async function runElevatedSs(warnings: string[]): Promise<string | null> {
  if (await commandExists('sudo')) {
    try {
      const { stdout } = await execFileAsync('sudo', ['-n', 'ss', '-ltnp'], {
        maxBuffer: 10 * 1024 * 1024
      })
      return stdout
    } catch {
      // Passwordless sudo not configured/permitted; fall through silently.
    }
  }

  if (ALLOW_INTERACTIVE_ELEVATION && (await commandExists('pkexec'))) {
    try {
      const { stdout } = await execFileAsync('pkexec', ['ss', '-ltnp'], {
        maxBuffer: 10 * 1024 * 1024
      })
      return stdout
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Privileged scan via pkexec failed or was cancelled: ${message}`)
    }
  }

  return null
}

/**
 * Fills in PID/process info for entries still unattributed after the
 * unprivileged scan and /proc resolution, by running an elevated `ss`. This is
 * the only way to attribute sockets owned by other users (commonly root-owned
 * services on privileged ports < 1024). Best-effort: silently no-ops when
 * elevation is unavailable.
 */
async function enrichWithPrivileged(entries: RawPortEntry[], warnings: string[]): Promise<void> {
  if (isRoot()) return
  if (!entries.some((entry) => entry.pid === null)) return

  const stdout = await runElevatedSs(warnings)
  if (!stdout) return

  const elevated = parseSsOutput(stdout)
  const byKey = new Map<string, RawPortEntry>()
  const byPort = new Map<number, RawPortEntry>()
  for (const owner of elevated) {
    if (owner.pid === null) continue
    byKey.set(`${owner.address}:${owner.port}`, owner)
    if (!byPort.has(owner.port)) byPort.set(owner.port, owner)
  }
  if (byKey.size === 0 && byPort.size === 0) return

  for (const entry of entries) {
    if (entry.pid !== null) continue

    const owner = byKey.get(`${entry.address}:${entry.port}`) ?? byPort.get(entry.port)
    if (!owner) continue

    entry.pid = owner.pid
    if (!entry.processName) entry.processName = owner.processName
    if (!entry.command) entry.command = owner.command
  }
}

export async function scanLinuxPorts(): Promise<PortScannerResult> {
  const warnings: string[] = []

  const hasSs = await commandExists('ss')
  if (hasSs) {
    try {
      const { stdout } = await execFileAsync('ss', ['-ltnp'], { maxBuffer: 10 * 1024 * 1024 })
      const entries = parseSsOutput(stdout)
      if (entries.length > 0) {
        await enrichWithProc(entries, warnings)
        await enrichWithPrivileged(entries, warnings)
        return { entries, warnings, error: null }
      }
      warnings.push('ss returned no listening ports; trying lsof fallback.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`ss failed: ${message}`)
    }
  } else {
    warnings.push('ss not found on PATH.')
  }

  const hasLsof = await commandExists('lsof')
  if (!hasLsof) {
    return {
      entries: [],
      warnings,
      error: 'Neither ss nor lsof is available. Install iproute2 or lsof to scan ports.'
    }
  }

  try {
    const { stdout } = await execFileAsync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n'], {
      maxBuffer: 10 * 1024 * 1024
    })
    const entries = parseLsofOutput(stdout)
    await enrichWithProc(entries, warnings)
    await enrichWithPrivileged(entries, warnings)
    return { entries, warnings, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      entries: [],
      warnings,
      error: `Port scan failed: ${message}`
    }
  }
}
