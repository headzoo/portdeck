import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { ServiceMetadata, ServiceMetadataUpdate } from '@shared/types'

let db: Database.Database | null = null
let initError: string | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS services_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stable_key TEXT UNIQUE NOT NULL,
  label TEXT,
  project TEXT,
  ignored INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scanned_at TEXT NOT NULL,
  service_count INTEGER NOT NULL,
  risky_count INTEGER NOT NULL
);
`

function nowIso(): string {
  return new Date().toISOString()
}

export function initDatabase(): void {
  try {
    const userDataPath = app.getPath('userData')
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true })
    }

    const dbPath = join(userDataPath, 'portdeck.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec(SCHEMA)
    initError = null
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error)
    db = null
    throw error
  }
}

export function getDatabaseError(): string | null {
  return initError
}

function requireDb(): Database.Database {
  if (!db) {
    throw new Error(initError ?? 'Database not initialized')
  }
  return db
}

function rowToMetadata(row: Record<string, unknown>): ServiceMetadata {
  return {
    stableKey: String(row.stable_key),
    label: row.label ? String(row.label) : null,
    project: row.project ? String(row.project) : null,
    ignored: Boolean(row.ignored),
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export function getAllMetadata(): ServiceMetadata[] {
  const database = requireDb()
  const rows = database.prepare('SELECT * FROM services_metadata').all() as Record<string, unknown>[]
  return rows.map(rowToMetadata)
}

export function getMetadata(stableKey: string): ServiceMetadata | null {
  const database = requireDb()
  const row = database
    .prepare('SELECT * FROM services_metadata WHERE stable_key = ?')
    .get(stableKey) as Record<string, unknown> | undefined
  return row ? rowToMetadata(row) : null
}

export function upsertMetadata(stableKey: string, updates: ServiceMetadataUpdate): ServiceMetadata {
  const database = requireDb()
  const existing = getMetadata(stableKey)
  const timestamp = nowIso()

  if (!existing) {
    database
      .prepare(
        `INSERT INTO services_metadata (stable_key, label, project, ignored, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        stableKey,
        updates.label ?? null,
        updates.project ?? null,
        updates.ignored ? 1 : 0,
        updates.notes ?? null,
        timestamp,
        timestamp
      )
  } else {
    database
      .prepare(
        `UPDATE services_metadata
         SET label = ?, project = ?, ignored = ?, notes = ?, updated_at = ?
         WHERE stable_key = ?`
      )
      .run(
        updates.label !== undefined ? updates.label : existing.label,
        updates.project !== undefined ? updates.project : existing.project,
        updates.ignored !== undefined ? (updates.ignored ? 1 : 0) : (existing.ignored ? 1 : 0),
        updates.notes !== undefined ? updates.notes : existing.notes,
        timestamp,
        stableKey
      )
  }

  return getMetadata(stableKey)!
}

export function setIgnored(stableKey: string, ignored: boolean): void {
  upsertMetadata(stableKey, { ignored })
}

export function recordScanHistory(serviceCount: number, riskyCount: number): void {
  const database = requireDb()
  database
    .prepare('INSERT INTO scan_history (scanned_at, service_count, risky_count) VALUES (?, ?, ?)')
    .run(nowIso(), serviceCount, riskyCount)
}

export function getDistinctProjects(): string[] {
  const database = requireDb()
  const rows = database
    .prepare("SELECT DISTINCT project FROM services_metadata WHERE project IS NOT NULL AND project != '' ORDER BY project")
    .all() as { project: string }[]
  return rows.map((r) => r.project)
}
