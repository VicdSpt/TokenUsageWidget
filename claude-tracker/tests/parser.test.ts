import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseClaude, computeRateLimits } from '../src/main/parser'
import { initDb, getDailyStats } from '../src/main/db'
import type Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

const FIXTURE = path.join(__dirname, 'fixtures', 'sample.jsonl')

let db: Database.Database
let dbPath: string
let tempDir: string

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`)
  db = initDb(dbPath)
  tempDir = path.join(os.tmpdir(), `claude-test-${Date.now()}`)
  const projectDir = path.join(tempDir, 'projects', 'abc123')
  fs.mkdirSync(projectDir, { recursive: true })
  fs.copyFileSync(FIXTURE, path.join(projectDir, 'conv.jsonl'))
})

afterEach(() => {
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
  for (let i = 0; i < 5; i++) {
    try {
      fs.unlinkSync(dbPath)
      try { fs.unlinkSync(dbPath + '-wal') } catch { /* ok */ }
      try { fs.unlinkSync(dbPath + '-shm') } catch { /* ok */ }
      break
    } catch { /* brief spin */ }
  }
  fs.rmSync(tempDir, { recursive: true })
})

describe('parseClaude', () => {
  it('extracts 2 sessions from fixture (gap > 30 min)', async () => {
    await parseClaude(tempDir, db)
    const stats = getDailyStats(db, '2025-01-01', '2025-01-31')
    expect(stats).toHaveLength(1)
    expect(stats[0].date).toBe('2025-01-15')
    expect(stats[0].sessions_count).toBe(2)
  })

  it('counts tokens correctly', async () => {
    await parseClaude(tempDir, db)
    const stats = getDailyStats(db, '2025-01-01', '2025-01-31')
    // input: 10+15+20=45, output: 25+30+40=95
    expect(stats[0].tokens_in).toBe(45)
    expect(stats[0].tokens_out).toBe(95)
  })

  it('does not double-count on second parse call', async () => {
    await parseClaude(tempDir, db)
    await parseClaude(tempDir, db)
    const stats = getDailyStats(db, '2025-01-01', '2025-01-31')
    expect(stats[0].sessions_count).toBe(2)
    expect(stats[0].tokens_in).toBe(45)
  })
})

describe('computeRateLimits', () => {
  it('returns 0% with no session data', () => {
    const limits = computeRateLimits(db, 'pro')
    expect(limits.sessionPercent).toBe(0)
    expect(limits.weeklyPercent).toBe(0)
  })

  it('returns non-zero when recent sessions exist', async () => {
    // Inject a synthetic recent session
    const now = Date.now()
    db.prepare('INSERT INTO sessions (date, created_at, model, tokens_in, tokens_out, messages_count) VALUES (?,?,?,?,?,?)')
      .run(new Date().toISOString().slice(0, 10), now - 1000, 'sonnet', 5000, 2000, 4)
    db.prepare('INSERT INTO daily_stats (date, sessions_count, tokens_in, tokens_out) VALUES (?,?,?,?)')
      .run(new Date().toISOString().slice(0, 10), 1, 5000, 2000)
    const limits = computeRateLimits(db, 'pro')
    expect(limits.sessionPercent).toBeGreaterThan(0)
  })
})
