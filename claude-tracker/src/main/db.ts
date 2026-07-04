import Database from 'better-sqlite3'

export interface DailyStat {
  date: string
  sessions_count: number
  tokens_in: number
  tokens_out: number
}

export interface SessionRow {
  date: string
  created_at: number  // Unix ms timestamp
  model: string | null
  tokens_in: number
  tokens_out: number
  messages_count: number
}

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      date          TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      model         TEXT,
      tokens_in     INTEGER DEFAULT 0,
      tokens_out    INTEGER DEFAULT 0,
      messages_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS daily_stats (
      date           TEXT PRIMARY KEY,
      sessions_count INTEGER DEFAULT 0,
      tokens_in      INTEGER DEFAULT 0,
      tokens_out     INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `)
  return db
}

export function getMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value)
}

export function upsertDailyStats(
  db: Database.Database,
  date: string,
  sessions: number,
  tokensIn: number,
  tokensOut: number
): void {
  db.prepare(`
    INSERT INTO daily_stats (date, sessions_count, tokens_in, tokens_out)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      sessions_count = excluded.sessions_count,
      tokens_in      = excluded.tokens_in,
      tokens_out     = excluded.tokens_out
  `).run(date, sessions, tokensIn, tokensOut)
}

export function getDailyStats(
  db: Database.Database,
  fromDate: string,
  toDate: string
): DailyStat[] {
  return db.prepare(`
    SELECT date, sessions_count, tokens_in, tokens_out
    FROM daily_stats
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(fromDate, toDate) as DailyStat[]
}

export function insertSession(db: Database.Database, session: SessionRow): void {
  db.prepare(`
    INSERT INTO sessions (date, created_at, model, tokens_in, tokens_out, messages_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(session.date, session.created_at, session.model, session.tokens_in, session.tokens_out, session.messages_count)
}

export function resetData(db: Database.Database): void {
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM daily_stats').run()
  db.prepare("DELETE FROM meta WHERE key = 'last_parsed_ts'").run()
}

export function getRecentTokens(db: Database.Database, sinceMs: number): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(tokens_in + tokens_out), 0) as total
    FROM sessions
    WHERE created_at >= ?
  `).get(sinceMs) as { total: number }
  return row.total
}
