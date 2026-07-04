import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, getMeta, setMeta, upsertDailyStats, getDailyStats, insertSession, getRecentTokens } from '../src/main/db'
import type Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

let db: Database.Database
let dbPath: string

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`)
  db = initDb(dbPath)
})

afterEach(() => {
  db.close()
  fs.unlinkSync(dbPath)
})

describe('initDb', () => {
  it('creates all three tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('sessions')
    expect(names).toContain('daily_stats')
    expect(names).toContain('meta')
  })
})

describe('meta', () => {
  it('returns null for unknown key', () => {
    expect(getMeta(db, 'missing')).toBeNull()
  })
  it('stores and retrieves value', () => {
    setMeta(db, 'cursor', '1234567890')
    expect(getMeta(db, 'cursor')).toBe('1234567890')
  })
  it('overwrites on second set', () => {
    setMeta(db, 'k', 'a')
    setMeta(db, 'k', 'b')
    expect(getMeta(db, 'k')).toBe('b')
  })
})

describe('upsertDailyStats + getDailyStats', () => {
  it('inserts and retrieves', () => {
    upsertDailyStats(db, '2025-01-15', 3, 1000, 500)
    const rows = getDailyStats(db, '2025-01-01', '2025-01-31')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2025-01-15', sessions_count: 3, tokens_in: 1000, tokens_out: 500 })
  })
  it('upserts on duplicate date', () => {
    upsertDailyStats(db, '2025-01-15', 3, 1000, 500)
    upsertDailyStats(db, '2025-01-15', 5, 2000, 800)
    expect(getDailyStats(db, '2025-01-01', '2025-01-31')).toHaveLength(1)
    expect(getDailyStats(db, '2025-01-01', '2025-01-31')[0].sessions_count).toBe(5)
  })
  it('filters by date range', () => {
    upsertDailyStats(db, '2025-01-10', 1, 100, 50)
    upsertDailyStats(db, '2025-02-01', 2, 200, 100)
    expect(getDailyStats(db, '2025-01-01', '2025-01-31')).toHaveLength(1)
  })
})

describe('getRecentTokens', () => {
  it('sums tokens for sessions after sinceMs', () => {
    const now = Date.now()
    insertSession(db, { date: '2025-01-15', created_at: now - 1000, model: 'sonnet', tokens_in: 100, tokens_out: 50, messages_count: 2 })
    insertSession(db, { date: '2025-01-15', created_at: now - 1000000000, model: 'sonnet', tokens_in: 999, tokens_out: 999, messages_count: 2 })
    const total = getRecentTokens(db, now - 10000)
    expect(total).toBe(150) // only first session is recent
  })
})
