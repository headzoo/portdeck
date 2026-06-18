import { promises as fs } from 'fs'

export interface ProcSocketOwner {
  pid: number
  processName: string | null
  command: string | null
}

export interface ProcResolution {
  /** Keyed by `${address}:${port}` for precise matching. */
  byKey: Map<string, ProcSocketOwner>
  /** Keyed by port for address-agnostic fallback matching. */
  byPort: Map<number, ProcSocketOwner>
}

interface ListeningSocket {
  address: string
  port: number
  inode: string
}

// TCP state 0A == TCP_LISTEN (see include/net/tcp_states.h)
const TCP_LISTEN = '0A'

function decodeIpv4(hex: string): string {
  const bytes: number[] = []
  for (let i = 0; i < 8; i += 2) {
    bytes.unshift(parseInt(hex.slice(i, i + 2), 16))
  }
  return bytes.join('.')
}

function decodeIpv6(hex: string): string {
  if (/^0{32}$/.test(hex)) return '::'
  // ::1 is stored as the last byte set, little-endian per 32-bit word.
  if (/^0{24}0{6}01$/i.test(hex) || hex.toLowerCase() === '00000000000000000000000001000000') {
    return '::1'
  }
  // Address decoding for general IPv6 is only used as a hint; port-based
  // matching is the reliable fallback, so a normalized form is sufficient.
  return hex.toLowerCase()
}

function parseProcNet(content: string, family: 'v4' | 'v6'): ListeningSocket[] {
  const sockets: ListeningSocket[] = []

  for (const line of content.split('\n').slice(1)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parts = trimmed.split(/\s+/)
    if (parts.length < 10) continue

    const state = parts[3]
    if (state !== TCP_LISTEN) continue

    const localAddress = parts[1]
    const [hexAddr, hexPort] = localAddress.split(':')
    if (!hexAddr || !hexPort) continue

    const port = parseInt(hexPort, 16)
    if (!Number.isFinite(port)) continue

    const address = family === 'v4' ? decodeIpv4(hexAddr) : decodeIpv6(hexAddr)
    const inode = parts[9]

    sockets.push({ address, port, inode })
  }

  return sockets
}

async function readListeningSockets(): Promise<ListeningSocket[]> {
  const sockets: ListeningSocket[] = []

  const sources: Array<[string, 'v4' | 'v6']> = [
    ['/proc/net/tcp', 'v4'],
    ['/proc/net/tcp6', 'v6']
  ]

  for (const [path, family] of sources) {
    try {
      const content = await fs.readFile(path, 'utf8')
      sockets.push(...parseProcNet(content, family))
    } catch {
      // File may not exist (e.g. IPv6 disabled); skip silently.
    }
  }

  return sockets
}

async function readProcessName(pid: number): Promise<string | null> {
  try {
    const comm = await fs.readFile(`/proc/${pid}/comm`, 'utf8')
    return comm.trim() || null
  } catch {
    return null
  }
}

async function readProcessCommand(pid: number): Promise<string | null> {
  try {
    const raw = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')
    const command = raw.replace(/\0/g, ' ').trim()
    return command || null
  } catch {
    return null
  }
}

/**
 * Maps each target socket inode to the PID that owns it by walking
 * `/proc/<pid>/fd/*` symlinks. Processes whose fd directory we cannot read
 * (e.g. owned by another user when running unprivileged) are skipped.
 */
async function buildInodePidMap(targetInodes: Set<string>): Promise<Map<string, number>> {
  const inodeToPid = new Map<string, number>()
  if (targetInodes.size === 0) return inodeToPid

  let pidDirs: string[]
  try {
    pidDirs = await fs.readdir('/proc')
  } catch {
    return inodeToPid
  }

  for (const name of pidDirs) {
    if (!/^\d+$/.test(name)) continue
    const pid = Number(name)

    let fds: string[]
    try {
      fds = await fs.readdir(`/proc/${name}/fd`)
    } catch {
      // Permission denied or process exited; cannot inspect this pid.
      continue
    }

    for (const fd of fds) {
      let link: string
      try {
        link = await fs.readlink(`/proc/${name}/fd/${fd}`)
      } catch {
        continue
      }
      const match = link.match(/^socket:\[(\d+)\]$/)
      if (match && targetInodes.has(match[1]) && !inodeToPid.has(match[1])) {
        inodeToPid.set(match[1], pid)
      }
    }

    if (inodeToPid.size === targetInodes.size) break
  }

  return inodeToPid
}

/**
 * Resolves listening-socket ownership directly from `/proc`, independent of
 * `ss`/`lsof`. Only resolves processes the current user is permitted to
 * inspect; run elevated to resolve every PID.
 */
export async function resolveProcSockets(): Promise<ProcResolution> {
  const byKey = new Map<string, ProcSocketOwner>()
  const byPort = new Map<number, ProcSocketOwner>()

  const sockets = await readListeningSockets()
  if (sockets.length === 0) return { byKey, byPort }

  const targetInodes = new Set(sockets.map((s) => s.inode))
  const inodeToPid = await buildInodePidMap(targetInodes)

  const ownerCache = new Map<number, ProcSocketOwner>()

  for (const socket of sockets) {
    const pid = inodeToPid.get(socket.inode)
    if (pid === undefined) continue

    let owner = ownerCache.get(pid)
    if (!owner) {
      const [processName, command] = await Promise.all([
        readProcessName(pid),
        readProcessCommand(pid)
      ])
      owner = { pid, processName, command }
      ownerCache.set(pid, owner)
    }

    byKey.set(`${socket.address}:${socket.port}`, owner)
    if (!byPort.has(socket.port)) {
      byPort.set(socket.port, owner)
    }
  }

  return { byKey, byPort }
}
