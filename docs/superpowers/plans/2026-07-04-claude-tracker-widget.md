# Claude Tracker Widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows 11 Electron desktop widget showing Claude Code Pro/Max rate limits (session 5h + weekly) and a 1-year activity heatmap styled after GitHub's contribution graph.

**Architecture:** Electron main process parses `~/.claude/projects/**/*.jsonl` files and optionally enriches with Anthropic API data, stores aggregates in SQLite, and pushes to a React renderer via IPC. The renderer is a frameless always-on-top window (380px wide) with two zones: rate limit progress bars and a 52-week heatmap. All user preferences are persisted via electron-store.

**Tech Stack:** Electron 28, React 18, Vite, TypeScript (strict), Tailwind CSS, better-sqlite3, node-cron, electron-store v8, electron-builder, Vitest

## Global Constraints

- Node.js ≥ 20, Electron ≥ 28
- TypeScript strict mode throughout
- contextIsolation: true, nodeIntegration: false (Electron security model)
- Window: 380px wide, frameless, transparent, always-on-top by default
- Dark theme: bg `#0d1117`, surface `#161b22`, border `#30363d`, accent `#00cc6a`, muted `#8b949e`
- SQLite runs in main process only — never passed to renderer
- All preferences (window position, API key, plan, refresh interval) persisted via electron-store
- Target: Windows 11 x64

---

### Task 1: Project Scaffold + Tailwind

**Files:**
- Create: `claude-tracker/` (root of project inside working dir)
- Create: `claude-tracker/tailwind.config.js`
- Create: `claude-tracker/src/renderer/src/index.css`
- Create: `claude-tracker/vitest.config.ts`

**Interfaces:**
- Produces: `npm run dev` opens Electron window; `npm test` runs Vitest

- [ ] **Step 1: Scaffold with electron-vite**

```bash
cd "e:\ALL DOCUMENTS\COURS CODE WCS\ClauseTokenUsage"
npm create @quick-start/electron@latest claude-tracker -- --template react-ts
cd claude-tracker
npm install
```

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install better-sqlite3 node-cron electron-store@8
npm install -D @types/better-sqlite3 @types/node-cron vitest
```

- [ ] **Step 3: Install and configure Tailwind**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Replace `tailwind.config.js` entirely:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        claude: {
          bg:          '#0d1117',
          surface:     '#161b22',
          border:      '#30363d',
          accent:      '#00cc6a',
          'accent-dim':'#006d32',
          text:        '#e6edf3',
          muted:       '#8b949e',
        }
      }
    }
  },
  plugins: []
}
```

Replace `src/renderer/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-claude-bg text-claude-text;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  margin: 0;
  overflow: hidden;
  user-select: none;
}
```

- [ ] **Step 4: Add Vitest config**

Create `vitest.config.ts` at project root:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
```

Add to `package.json` scripts:
```json
"test": "vitest run"
```

Create `tests/` directory:
```bash
mkdir tests
mkdir tests/fixtures
```

- [ ] **Step 5: Verify scaffold**

```bash
npm run dev
```

Expected: Electron window opens with the default Vite/React template. No errors in terminal.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: scaffold Electron + React + Vite + Tailwind + Vitest"
```

---

### Task 2: SQLite Database Layer

**Files:**
- Create: `src/main/db.ts`
- Create: `tests/db.test.ts`

**Interfaces:**
- Produces:
  - `initDb(dbPath: string): Database.Database`
  - `getMeta(db, key: string): string | null`
  - `setMeta(db, key: string, value: string): void`
  - `upsertDailyStats(db, date: string, sessions: number, tokensIn: number, tokensOut: number): void`
  - `getDailyStats(db, fromDate: string, toDate: string): DailyStat[]`
  - `insertSession(db, session: SessionRow): void`
  - `getRecentTokens(db, sinceMs: number): number`
  - Types exported: `DailyStat { date, sessions_count, tokens_in, tokens_out }`, `SessionRow { date, created_at, model, tokens_in, tokens_out, messages_count }`

- [ ] **Step 1: Write failing tests**

Create `tests/db.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/db.test.ts
```

Expected: FAIL — "Cannot find module '../src/main/db'"

- [ ] **Step 3: Implement db.ts**

Create `src/main/db.ts`:
```typescript
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

export function getRecentTokens(db: Database.Database, sinceMs: number): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(tokens_in + tokens_out), 0) as total
    FROM sessions
    WHERE created_at >= ?
  `).get(sinceMs) as { total: number }
  return row.total
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/db.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db.ts tests/db.test.ts
git commit -m "feat: SQLite layer with schema, CRUD queries, and session timestamp tracking"
```

---

### Task 3: Local Parser + Rate Limit Calculator

**Files:**
- Create: `src/main/parser.ts`
- Create: `tests/parser.test.ts`
- Create: `tests/fixtures/sample.jsonl`

**Interfaces:**
- Consumes: `initDb`, `getMeta`, `setMeta`, `upsertDailyStats`, `insertSession`, `getRecentTokens`, `DailyStat`, `SessionRow` from `db.ts`
- Produces:
  - `parseClaude(claudePath: string, db: Database.Database): Promise<void>`
  - `computeRateLimits(db: Database.Database, plan: 'pro' | 'max'): RateLimits`
  - Type: `RateLimits { sessionPercent: number, sessionResetIn: string, weeklyPercent: number, weeklyResetAt: string }`

- [ ] **Step 1: Create fixture**

Create `tests/fixtures/sample.jsonl` — two sessions separated by >30 min gap:
```jsonl
{"timestamp":"2025-01-15T10:00:00.000Z","role":"user","model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":0}}
{"timestamp":"2025-01-15T10:00:10.000Z","role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":0,"output_tokens":25}}
{"timestamp":"2025-01-15T10:01:00.000Z","role":"user","model":"claude-sonnet-4-6","usage":{"input_tokens":15,"output_tokens":0}}
{"timestamp":"2025-01-15T10:01:15.000Z","role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":0,"output_tokens":30}}
{"timestamp":"2025-01-15T16:00:00.000Z","role":"user","model":"claude-sonnet-4-6","usage":{"input_tokens":20,"output_tokens":0}}
{"timestamp":"2025-01-15T16:00:12.000Z","role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":0,"output_tokens":40}}
```

- [ ] **Step 2: Write failing tests**

Create `tests/parser.test.ts`:
```typescript
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
  db.close()
  fs.unlinkSync(dbPath)
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
```

- [ ] **Step 3: Run — expect FAIL**

```bash
npx vitest run tests/parser.test.ts
```

Expected: FAIL — "Cannot find module '../src/main/parser'"

- [ ] **Step 4: Implement parser.ts**

Create `src/main/parser.ts`:
```typescript
import fs from 'fs'
import path from 'path'
import { getMeta, setMeta, upsertDailyStats, insertSession, getRecentTokens, getDailyStats } from './db'
import type Database from 'better-sqlite3'

export interface RateLimits {
  sessionPercent: number
  sessionResetIn: string
  weeklyPercent: number
  weeklyResetAt: string
}

const PLAN_LIMITS = {
  pro: { session: 40_000,  weekly: 200_000 },
  max: { session: 100_000, weekly: 500_000 },
}

const SESSION_GAP_MS = 30 * 60 * 1000

interface ParsedMessage {
  ts: number
  date: string
  model: string
  tokensIn: number
  tokensOut: number
}

function readJsonlFile(filePath: string): ParsedMessage[] {
  const out: ParsedMessage[] = []
  try {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        const raw = obj['timestamp']
        if (typeof raw !== 'string') continue
        const ts = new Date(raw).getTime()
        if (isNaN(ts)) continue
        const usage = obj['usage'] as Record<string, number> | undefined
        out.push({
          ts,
          date: raw.slice(0, 10),
          model: typeof obj['model'] === 'string' ? obj['model'] : 'unknown',
          tokensIn:  usage?.['input_tokens']  ?? 0,
          tokensOut: usage?.['output_tokens'] ?? 0,
        })
      } catch { /* skip malformed line */ }
    }
  } catch { /* file unreadable */ }
  return out.sort((a, b) => a.ts - b.ts)
}

function splitSessions(msgs: ParsedMessage[]): ParsedMessage[][] {
  if (!msgs.length) return []
  const sessions: ParsedMessage[][] = [[msgs[0]]]
  for (let i = 1; i < msgs.length; i++) {
    if (msgs[i].ts - msgs[i - 1].ts > SESSION_GAP_MS) sessions.push([])
    sessions[sessions.length - 1].push(msgs[i])
  }
  return sessions
}

export async function parseClaude(claudePath: string, db: Database.Database): Promise<void> {
  const cursorRaw = getMeta(db, 'last_parsed_ts')
  const cursor = cursorRaw ? parseInt(cursorRaw) : 0

  const projectsDir = path.join(claudePath, 'projects')
  if (!fs.existsSync(projectsDir)) return

  let allNew: ParsedMessage[] = []
  for (const proj of fs.readdirSync(projectsDir)) {
    const projPath = path.join(projectsDir, proj)
    if (!fs.statSync(projPath).isDirectory()) continue
    for (const file of fs.readdirSync(projPath)) {
      if (!file.endsWith('.jsonl')) continue
      const msgs = readJsonlFile(path.join(projPath, file))
      allNew = allNew.concat(msgs.filter(m => m.ts > cursor))
    }
  }

  if (!allNew.length) return
  allNew.sort((a, b) => a.ts - b.ts)

  // Group by date
  const byDate = new Map<string, ParsedMessage[]>()
  for (const m of allNew) {
    const bucket = byDate.get(m.date) ?? []
    bucket.push(m)
    byDate.set(m.date, bucket)
  }

  for (const [date, msgs] of byDate) {
    const sessions = splitSessions(msgs)
    const existing = db.prepare('SELECT sessions_count, tokens_in, tokens_out FROM daily_stats WHERE date = ?')
      .get(date) as { sessions_count: number; tokens_in: number; tokens_out: number } | undefined

    upsertDailyStats(
      db,
      date,
      (existing?.sessions_count ?? 0) + sessions.length,
      (existing?.tokens_in ?? 0) + msgs.reduce((s, m) => s + m.tokensIn, 0),
      (existing?.tokens_out ?? 0) + msgs.reduce((s, m) => s + m.tokensOut, 0)
    )

    for (const session of sessions) {
      insertSession(db, {
        date,
        created_at: session[0].ts,
        model: session[0].model,
        tokens_in:  session.reduce((s, m) => s + m.tokensIn, 0),
        tokens_out: session.reduce((s, m) => s + m.tokensOut, 0),
        messages_count: session.length,
      })
    }
  }

  setMeta(db, 'last_parsed_ts', String(allNew[allNew.length - 1].ts))
}

export function computeRateLimits(db: Database.Database, plan: 'pro' | 'max'): RateLimits {
  const limits = PLAN_LIMITS[plan]
  const now = Date.now()
  const fiveHAgo = now - 5 * 60 * 60 * 1000
  const sevenDAgo = now - 7 * 24 * 60 * 60 * 1000

  const sessionTokens = getRecentTokens(db, fiveHAgo)
  const sessionPct = Math.min(100, Math.round((sessionTokens / limits.session) * 100))

  const weeklyStats = getDailyStats(
    db,
    new Date(sevenDAgo).toISOString().slice(0, 10),
    new Date(now).toISOString().slice(0, 10)
  )
  const weeklyTokens = weeklyStats.reduce((s, r) => s + r.tokens_in + r.tokens_out, 0)
  const weeklyPct = Math.min(100, Math.round((weeklyTokens / limits.weekly) * 100))

  // Session reset: oldest session in 5h window + 5h
  const oldest = db.prepare('SELECT MIN(created_at) as t FROM sessions WHERE created_at >= ?').get(fiveHAgo) as { t: number | null }
  const resetMs = oldest.t ? Math.max(0, oldest.t + 5 * 60 * 60 * 1000 - now) : 5 * 60 * 60 * 1000
  const resetH = Math.floor(resetMs / 3600000)
  const resetM = Math.floor((resetMs % 3600000) / 60000)
  const sessionResetIn = `${resetH}h${String(resetM).padStart(2, '0')}`

  const weeklyResetDate = new Date(sevenDAgo + 7 * 24 * 60 * 60 * 1000)
  const weeklyResetAt = weeklyResetDate.toLocaleDateString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })

  return { sessionPercent: sessionPct, sessionResetIn, weeklyPercent: weeklyPct, weeklyResetAt }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run tests/parser.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/parser.ts tests/parser.test.ts tests/fixtures/sample.jsonl
git commit -m "feat: JSONL parser with session detection and rate limit calculator"
```

---

### Task 4: Anthropic API Client

**Files:**
- Create: `src/main/api-client.ts`

**Interfaces:**
- Produces:
  - `fetchApiUsage(apiKey: string): Promise<ApiUsageResult | null>`
  - Type: `ApiUsageResult { date: string, tokensIn: number, tokensOut: number }`
  - Returns `null` on any error (network, auth, missing endpoint)

- [ ] **Step 1: Implement api-client.ts**

Create `src/main/api-client.ts`:
```typescript
export interface ApiUsageResult {
  date: string
  tokensIn: number
  tokensOut: number
}

export async function fetchApiUsage(apiKey: string): Promise<ApiUsageResult | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/usage', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!response.ok) return null
    const data = await response.json() as { data?: Array<{ input_tokens?: number; output_tokens?: number }> }
    if (!data.data?.length) return null
    const entry = data.data[0]
    return {
      date: new Date().toISOString().slice(0, 10),
      tokensIn:  entry.input_tokens  ?? 0,
      tokensOut: entry.output_tokens ?? 0,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If `fetch` is missing, add `"lib": ["ES2020", "DOM"]` to `tsconfig.node.json`.

- [ ] **Step 3: Commit**

```bash
git add src/main/api-client.ts
git commit -m "feat: optional Anthropic API client with silent fallback"
```

---

### Task 5: Shared Types + Preload + IPC Handlers + Scheduler

**Files:**
- Create: `src/shared/types.ts`
- Modify: `src/preload/index.ts`
- Create: `src/main/ipc-handlers.ts`
- Create: `src/main/scheduler.ts`

**Interfaces:**
- Consumes: all db functions, `parseClaude`, `computeRateLimits`, `fetchApiUsage`
- Produces via `window.api` in renderer:
  - `window.api.getStats(): Promise<StatsPayload>`
  - `window.api.getConfig(): Promise<AppConfig>`
  - `window.api.setConfig(p: Partial<AppConfig>): Promise<void>`
  - `window.api.forceRefresh(): Promise<void>`

- [ ] **Step 1: Create shared types**

Create `src/shared/types.ts`:
```typescript
export interface DailyStat {
  date: string
  sessions_count: number
  tokens_in: number
  tokens_out: number
}

export interface RateLimits {
  sessionPercent: number
  sessionResetIn: string
  weeklyPercent: number
  weeklyResetAt: string
}

export interface StatsPayload {
  rateLimits: RateLimits
  dailyStats: DailyStat[]
  lastUpdated: string
}

export interface AppConfig {
  claudePath: string
  apiKey: string
  refreshIntervalMin: number
  plan: 'pro' | 'max'
  alwaysOnTop: boolean
  launchAtLogin: boolean
}
```

- [ ] **Step 2: Implement preload/index.ts**

Replace `src/preload/index.ts` entirely:
```typescript
import { contextBridge, ipcRenderer } from 'electron'
import type { StatsPayload, AppConfig } from '../shared/types'

contextBridge.exposeInMainWorld('api', {
  getStats:     (): Promise<StatsPayload>             => ipcRenderer.invoke('get-stats'),
  getConfig:    (): Promise<AppConfig>                => ipcRenderer.invoke('get-config'),
  setConfig:    (p: Partial<AppConfig>): Promise<void> => ipcRenderer.invoke('set-config', p),
  forceRefresh: (): Promise<void>                     => ipcRenderer.invoke('force-refresh'),
})

// Forward tray-menu events from main to renderer as DOM events
ipcRenderer.on('tray-refresh',       () => window.dispatchEvent(new Event('ipc-refresh')))
ipcRenderer.on('tray-open-settings', () => window.dispatchEvent(new Event('ipc-open-settings')))
```

- [ ] **Step 3: Implement ipc-handlers.ts**

Create `src/main/ipc-handlers.ts`:
```typescript
import { ipcMain, app } from 'electron'
import Store from 'electron-store'
import type Database from 'better-sqlite3'
import { getDailyStats } from './db'
import { computeRateLimits, parseClaude } from './parser'
import { fetchApiUsage } from './api-client'
import type { AppConfig, StatsPayload } from '../shared/types'
import os from 'os'
import path from 'path'

const DEFAULT_CONFIG: AppConfig = {
  claudePath:        path.join(os.homedir(), '.claude'),
  apiKey:            '',
  refreshIntervalMin: 15,
  plan:              'pro',
  alwaysOnTop:       true,
  launchAtLogin:     false,
}

export function createStore(): Store<AppConfig> {
  return new Store<AppConfig>({ defaults: DEFAULT_CONFIG })
}

export function registerIpcHandlers(db: Database.Database, store: Store<AppConfig>): void {
  ipcMain.handle('get-stats', async (): Promise<StatsPayload> => {
    const cfg = store.store
    const today = new Date().toISOString().slice(0, 10)
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return {
      rateLimits:  computeRateLimits(db, cfg.plan),
      dailyStats:  getDailyStats(db, yearAgo, today),
      lastUpdated: new Date().toISOString(),
    }
  })

  ipcMain.handle('get-config', (): AppConfig => store.store)

  ipcMain.handle('set-config', (_e, partial: Partial<AppConfig>): void => {
    Object.entries(partial).forEach(([k, v]) => store.set(k as keyof AppConfig, v as AppConfig[keyof AppConfig]))
    if ('launchAtLogin' in partial) {
      app.setLoginItemSettings({ openAtLogin: partial.launchAtLogin ?? false })
    }
  })

  ipcMain.handle('force-refresh', async (): Promise<void> => {
    const cfg = store.store
    await parseClaude(cfg.claudePath, db)
    if (cfg.apiKey) await fetchApiUsage(cfg.apiKey)
  })
}
```

- [ ] **Step 4: Implement scheduler.ts**

Create `src/main/scheduler.ts`:
```typescript
import cron from 'node-cron'
import Store from 'electron-store'
import type Database from 'better-sqlite3'
import { parseClaude } from './parser'
import { fetchApiUsage } from './api-client'
import type { AppConfig } from '../shared/types'

export function startScheduler(db: Database.Database, store: Store<AppConfig>): () => void {
  let task: cron.ScheduledTask | null = null

  const run = async (): Promise<void> => {
    const cfg = store.store
    await parseClaude(cfg.claudePath, db)
    if (cfg.apiKey) await fetchApiUsage(cfg.apiKey)
  }

  const intervalMin = store.get('refreshIntervalMin', 15)
  task = cron.schedule(`*/${intervalMin} * * * *`, run)

  run() // first run immediately

  return () => task?.stop()
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/preload/index.ts src/main/ipc-handlers.ts src/main/scheduler.ts
git commit -m "feat: shared types, preload bridge, IPC handlers, and scheduler"
```

---

### Task 6: Main Window + Tray Icon

**Files:**
- Modify: `src/main/index.ts`
- Create: `resources/icon.png` (any small green PNG, ≥16×16)

**Interfaces:**
- Consumes: `initDb`, `createStore`, `registerIpcHandlers`, `startScheduler`
- Produces: frameless 380px window, system tray icon, always-on-top, position persistence

- [ ] **Step 1: Create placeholder icon**

```bash
mkdir resources
```

Place any PNG file (16×16 or 32×32) at `resources/icon.png`. You can use Windows Paint to create a small green square and save as PNG.

- [ ] **Step 2: Implement main/index.ts**

Replace `src/main/index.ts` entirely:
```typescript
import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { initDb } from './db'
import { createStore, registerIpcHandlers } from './ipc-handlers'
import { startScheduler } from './scheduler'

const store = createStore()
const dbPath = path.join(app.getPath('userData'), 'tracker.db')
const db = initDb(dbPath)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  const saved = store.get('windowPosition' as any, null) as [number, number] | null

  mainWindow = new BrowserWindow({
    width: 380,
    height: 520,
    ...(saved ? { x: saved[0], y: saved[1] } : {}),
    frame: false,
    transparent: true,
    alwaysOnTop: store.get('alwaysOnTop', true),
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (!app.isPackaged) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('moved', () => {
    const pos = mainWindow?.getPosition()
    if (pos) store.set('windowPosition' as any, pos)
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

function buildTrayMenu(): Menu {
  const onTop = store.get('alwaysOnTop', true)
  return Menu.buildFromTemplate([
    { label: 'Claude Tracker', enabled: false },
    { type: 'separator' },
    { label: 'Actualiser', click: () => mainWindow?.webContents.send('tray-refresh') },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: onTop,
      click: () => {
        const next = !onTop
        store.set('alwaysOnTop', next)
        mainWindow?.setAlwaysOnTop(next)
        tray?.setContextMenu(buildTrayMenu())
      },
    },
    { type: 'separator' },
    { label: 'Paramètres', click: () => mainWindow?.webContents.send('tray-open-settings') },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ])
}

function createTray(): void {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, '../../resources/icon.png'))
    .resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Claude Tracker')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide()
    else mainWindow?.show()
  })
}

app.whenReady().then(() => {
  registerIpcHandlers(db, store)
  createWindow()
  createTray()
  startScheduler(db, store)
})

// Keep app alive via tray even when window closed
app.on('window-all-closed', (e: Event) => e.preventDefault())
```

- [ ] **Step 3: Run dev and verify**

```bash
npm run dev
```

Expected: Frameless window opens. Tray icon appears in Windows taskbar tray. Right-click shows menu: Actualiser / Always on Top / Paramètres / Quitter.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts resources/icon.png
git commit -m "feat: frameless window, tray icon, always-on-top, position persistence"
```

---

### Task 7: RateLimitBar Component

**Files:**
- Create: `src/renderer/src/components/RateLimitBar.tsx`

**Interfaces:**
- Consumes: `RateLimits` fields + `lastUpdated`, `refreshInterval`
- Produces: `<RateLimitBar sessionPercent sessionResetIn weeklyPercent weeklyResetAt lastUpdated refreshInterval />`

- [ ] **Step 1: Implement RateLimitBar.tsx**

Create `src/renderer/src/components/RateLimitBar.tsx`:
```tsx
interface BarProps {
  icon: string
  label: string
  subtitle: string
  percent: number
  resetInfo: string
}

function Bar({ icon, label, subtitle, percent, resetInfo }: BarProps) {
  const barColor =
    percent >= 95 ? 'bg-red-500' :
    percent >= 80 ? 'bg-orange-400' :
    'bg-[#00cc6a]'
  const textColor =
    percent >= 95 ? 'text-red-400' :
    percent >= 80 ? 'text-orange-300' :
    'text-[#00cc6a]'

  return (
    <div className="mb-4">
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <div>
            <p className="text-[#e6edf3] font-semibold text-sm leading-none">{label}</p>
            <p className="text-[#8b949e] text-xs mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-bold text-lg leading-none ${textColor}`}>{percent}%</p>
          <p className="text-[#8b949e] text-xs mt-0.5">Reset {resetInfo}</p>
        </div>
      </div>
      <div className="h-1.5 bg-[#161b22] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  )
}

interface RateLimitBarProps {
  sessionPercent: number
  sessionResetIn: string
  weeklyPercent: number
  weeklyResetAt: string
  lastUpdated: string
  refreshInterval: number
}

export default function RateLimitBar(props: RateLimitBarProps) {
  const { sessionPercent, sessionResetIn, weeklyPercent, weeklyResetAt, lastUpdated, refreshInterval } = props

  const ago = (() => {
    const diff = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 60000)
    return diff < 1 ? "il y a moins d'une minute" : `il y a ${diff} min`
  })()

  return (
    <div className="px-4 pt-4 pb-2">
      <Bar
        icon="⏱"
        label="Session"
        subtitle="Fenêtre glissante 5h"
        percent={sessionPercent}
        resetInfo={sessionResetIn}
      />
      <Bar
        icon="📊"
        label="Weekly"
        subtitle="7 derniers jours"
        percent={weeklyPercent}
        resetInfo={weeklyResetAt}
      />
      <div className="flex justify-between text-xs text-[#8b949e] mt-1">
        <span>Upd. {ago}</span>
        <span>• {refreshInterval} min</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke-test in App.tsx**

Replace `src/renderer/src/App.tsx` temporarily:
```tsx
import RateLimitBar from './components/RateLimitBar'
export default function App() {
  return (
    <div className="bg-[#0d1117] min-h-screen p-2">
      <RateLimitBar
        sessionPercent={37} sessionResetIn="3h01"
        weeklyPercent={54}  weeklyResetAt="mer. 11:00"
        lastUpdated={new Date().toISOString()} refreshInterval={15}
      />
    </div>
  )
}
```

```bash
npm run dev
```

Expected: Two progress bars with green fills, percentages right-aligned, reset info, footer with update time.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/RateLimitBar.tsx
git commit -m "feat: RateLimitBar component with color-coded progress and reset info"
```

---

### Task 8: Heatmap Component

**Files:**
- Create: `src/renderer/src/components/Heatmap.tsx`

**Interfaces:**
- Consumes: `DailyStat[]` (date: string, sessions_count: number)
- Produces: `<Heatmap dailyStats={[]} />`

- [ ] **Step 1: Implement Heatmap.tsx**

Create `src/renderer/src/components/Heatmap.tsx`:
```tsx
import { useMemo, useState } from 'react'

interface DailyStat { date: string; sessions_count: number }
interface HeatmapProps { dailyStats: DailyStat[] }

const CELL = 11
const GAP  = 2
const LEVELS = ['#161b22', '#0e4429', '#006d32', '#00cc6a']
const DAY_LABELS = ['L','M','M','J','V','S','D']

function level(n: number) { return n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : 3 }

export default function Heatmap({ dailyStats }: HeatmapProps) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)

  const map = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of dailyStats) m.set(s.date, s.sessions_count)
    return m
  }, [dailyStats])

  // Build 53-week grid ending today
  const today = new Date(); today.setHours(0,0,0,0)
  const start = new Date(today); start.setDate(start.getDate() - 364)
  // Align start to Monday
  const dow = start.getDay()
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))

  type Cell = { date: string; count: number; future: boolean }
  const weeks: Cell[][] = []
  const cur = new Date(start)
  for (let w = 0; w < 53; w++) {
    const week: Cell[] = []
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.toISOString().slice(0, 10)
      week.push({ date: dateStr, count: map.get(dateStr) ?? 0, future: cur > today })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }

  // Month labels: first week of each month
  const months: { label: string; col: number }[] = []
  let lastM = -1
  weeks.forEach((week, wi) => {
    const m = new Date(week[0].date).getMonth()
    if (m !== lastM) {
      months.push({ label: new Date(week[0].date).toLocaleDateString('fr-FR', { month: 'short' }), col: wi })
      lastM = m
    }
  })

  return (
    <div className="px-4 pb-4 select-none">
      <p className="text-[#8b949e] text-xs mb-2">Activité — 52 semaines</p>
      <div className="relative overflow-x-auto">
        {/* Month labels row */}
        <div className="relative h-4 ml-6 mb-1">
          {months.map(({ label, col }) => (
            <span
              key={`${label}-${col}`}
              className="absolute text-[9px] text-[#8b949e]"
              style={{ left: col * (CELL + GAP) }}
            >
              {label}
            </span>
          ))}
        </div>
        {/* Day labels + grid */}
        <div className="flex gap-0">
          <div className="flex flex-col mr-1" style={{ gap: GAP }}>
            {DAY_LABELS.map((d, i) => (
              <div
                key={i}
                style={{ height: CELL, fontSize: 9, lineHeight: `${CELL}px`, color: '#8b949e' }}
              >
                {i % 2 === 0 ? d : ''}
              </div>
            ))}
          </div>
          <div className="flex" style={{ gap: GAP }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                {week.map((cell, di) => (
                  <div
                    key={di}
                    style={{
                      width: CELL, height: CELL, borderRadius: 2,
                      backgroundColor: cell.future ? 'transparent' : LEVELS[level(cell.count)],
                      cursor: cell.future ? 'default' : 'crosshair',
                    }}
                    onMouseEnter={(e) => {
                      if (cell.future) return
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      const label = new Date(cell.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                      setTip({ text: `${cell.count} session${cell.count !== 1 ? 's' : ''} · ${label}`, x: r.left, y: r.top - 30 })
                    }}
                    onMouseLeave={() => setTip(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-end gap-1 mt-2">
          <span className="text-[9px] text-[#8b949e]">moins</span>
          {LEVELS.map((c, i) => <div key={i} style={{ width: CELL, height: CELL, borderRadius: 2, backgroundColor: c }} />)}
          <span className="text-[9px] text-[#8b949e]">plus</span>
        </div>
      </div>
      {tip && (
        <div
          className="fixed z-50 bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap shadow-lg"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Smoke-test with mock data**

Update `src/renderer/src/App.tsx`:
```tsx
import RateLimitBar from './components/RateLimitBar'
import Heatmap from './components/Heatmap'

const mock = Array.from({ length: 200 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - i)
  return { date: d.toISOString().slice(0, 10), sessions_count: Math.floor(Math.random() * 9) }
})

export default function App() {
  return (
    <div className="bg-[#0d1117]">
      <RateLimitBar sessionPercent={37} sessionResetIn="3h01" weeklyPercent={54} weeklyResetAt="mer. 11:00" lastUpdated={new Date().toISOString()} refreshInterval={15} />
      <hr className="border-[#30363d] mx-4" />
      <Heatmap dailyStats={mock} />
    </div>
  )
}
```

```bash
npm run dev
```

Expected: Rate limit bars + heatmap with green cells of varying intensity. Hover shows tooltip with session count and date.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Heatmap.tsx
git commit -m "feat: GitHub-style heatmap with 4 intensity levels and hover tooltip"
```

---

### Task 9: Settings Panel + useStats Hook

**Files:**
- Create: `src/renderer/src/components/Settings.tsx`
- Create: `src/renderer/src/hooks/useStats.ts`

**Interfaces:**
- Consumes: `window.api.*` (declared as global in hook)
- Produces:
  - `useStats(intervalMs?: number): { stats: StatsPayload|null, config: AppConfig|null, refresh(): void, saveConfig(p: Partial<AppConfig>): Promise<void> }`
  - `<Settings config={AppConfig} onSave={async (p) => void} onClose={() => void} />`

- [ ] **Step 1: Implement useStats.ts**

Create `src/renderer/src/hooks/useStats.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react'

export interface DailyStat { date: string; sessions_count: number; tokens_in: number; tokens_out: number }
export interface RateLimits { sessionPercent: number; sessionResetIn: string; weeklyPercent: number; weeklyResetAt: string }
export interface StatsPayload { rateLimits: RateLimits; dailyStats: DailyStat[]; lastUpdated: string }
export interface AppConfig { claudePath: string; apiKey: string; refreshIntervalMin: number; plan: 'pro'|'max'; alwaysOnTop: boolean; launchAtLogin: boolean }

declare global {
  interface Window {
    api: {
      getStats(): Promise<StatsPayload>
      getConfig(): Promise<AppConfig>
      setConfig(p: Partial<AppConfig>): Promise<void>
      forceRefresh(): Promise<void>
    }
  }
}

export function useStats(intervalMs = 60_000) {
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [config, setConfigState] = useState<AppConfig | null>(null)

  const fetchAll = useCallback(async () => {
    const [s, c] = await Promise.all([window.api.getStats(), window.api.getConfig()])
    setStats(s)
    setConfigState(c)
  }, [])

  const refresh = useCallback(async () => {
    await window.api.forceRefresh()
    await fetchAll()
  }, [fetchAll])

  const saveConfig = useCallback(async (partial: Partial<AppConfig>) => {
    await window.api.setConfig(partial)
    await fetchAll()
  }, [fetchAll])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, intervalMs)
    return () => clearInterval(id)
  }, [fetchAll, intervalMs])

  return { stats, config, refresh, saveConfig }
}
```

- [ ] **Step 2: Implement Settings.tsx**

Create `src/renderer/src/components/Settings.tsx`:
```tsx
import { useState } from 'react'
import type { AppConfig } from '../hooks/useStats'

interface SettingsProps {
  config: AppConfig
  onSave(p: Partial<AppConfig>): Promise<void>
  onClose(): void
}

export default function Settings({ config, onSave, onClose }: SettingsProps) {
  const [form, setForm] = useState<AppConfig>({ ...config })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof AppConfig>(k: K, v: AppConfig[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 w-72 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-[#e6edf3] font-semibold text-sm">Paramètres</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-[#8b949e] text-xs">Chemin ~/.claude</span>
            <input
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#e6edf3] outline-none focus:border-[#00cc6a] text-xs"
              value={form.claudePath}
              onChange={e => set('claudePath', e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-[#8b949e] text-xs">Clé API Anthropic (optionnel)</span>
            <input
              type="password"
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#e6edf3] outline-none focus:border-[#00cc6a] text-xs"
              value={form.apiKey}
              onChange={e => set('apiKey', e.target.value)}
              placeholder="sk-ant-..."
            />
          </label>

          <label className="block">
            <span className="text-[#8b949e] text-xs">Plan Claude</span>
            <select
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#e6edf3] outline-none text-xs"
              value={form.plan}
              onChange={e => set('plan', e.target.value as 'pro' | 'max')}
            >
              <option value="pro">Pro</option>
              <option value="max">Max</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[#8b949e] text-xs">Intervalle de refresh</span>
            <select
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#e6edf3] outline-none text-xs"
              value={form.refreshIntervalMin}
              onChange={e => set('refreshIntervalMin', Number(e.target.value))}
            >
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
            </select>
          </label>

          <div className="flex items-center justify-between">
            <span className="text-[#8b949e] text-xs">Lancer au démarrage</span>
            <button
              onClick={() => set('launchAtLogin', !form.launchAtLogin)}
              className={`relative w-9 h-5 rounded-full transition-colors ${form.launchAtLogin ? 'bg-[#00cc6a]' : 'bg-[#30363d]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.launchAtLogin ? 'translate-x-4' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-1.5 text-xs border border-[#30363d] text-[#8b949e] rounded hover:bg-[#0d1117]">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-1.5 text-xs bg-[#00cc6a] text-black font-bold rounded hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useStats.ts src/renderer/src/components/Settings.tsx
git commit -m "feat: useStats polling hook and Settings panel"
```

---

### Task 10: Full App Integration

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useStats`, `RateLimitBar`, `Heatmap`, `Settings`
- Produces: fully wired widget reading live data from main process via IPC

- [ ] **Step 1: Replace App.tsx with full integration**

Replace `src/renderer/src/App.tsx`:
```tsx
import { useState, useEffect } from 'react'
import RateLimitBar from './components/RateLimitBar'
import Heatmap from './components/Heatmap'
import Settings from './components/Settings'
import { useStats } from './hooks/useStats'

export default function App() {
  const { stats, config, refresh, saveConfig } = useStats(60_000)
  const [showSettings, setShowSettings] = useState(false)

  // Listen for events from tray menu (forwarded via preload)
  useEffect(() => {
    const onRefresh = () => refresh()
    const onSettings = () => setShowSettings(true)
    window.addEventListener('ipc-refresh', onRefresh)
    window.addEventListener('ipc-open-settings', onSettings)
    return () => {
      window.removeEventListener('ipc-refresh', onRefresh)
      window.removeEventListener('ipc-open-settings', onSettings)
    }
  }, [refresh])

  if (!stats || !config) {
    return (
      <div className="bg-[#0d1117] w-[380px] h-[520px] flex items-center justify-center rounded-xl border border-[#30363d]">
        <p className="text-[#8b949e] text-sm">Chargement…</p>
      </div>
    )
  }

  return (
    <div className="bg-[#0d1117] w-[380px] rounded-xl border border-[#30363d] overflow-hidden">
      {/* Draggable header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-[#30363d]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-[#00cc6a] text-base">◉</span>
        <span className="text-[#e6edf3] font-semibold text-sm">Claude Tracker</span>
        <div
          className="ml-auto flex gap-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={refresh}
            title="Actualiser"
            className="text-[#8b949e] hover:text-[#e6edf3] text-xs px-1.5 py-0.5 border border-[#30363d] rounded hover:border-[#8b949e]"
          >
            ↺
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Paramètres"
            className="text-[#8b949e] hover:text-[#e6edf3] text-xs px-1.5 py-0.5 border border-[#30363d] rounded hover:border-[#8b949e]"
          >
            ⚙
          </button>
        </div>
      </div>

      <RateLimitBar
        sessionPercent={stats.rateLimits.sessionPercent}
        sessionResetIn={stats.rateLimits.sessionResetIn}
        weeklyPercent={stats.rateLimits.weeklyPercent}
        weeklyResetAt={stats.rateLimits.weeklyResetAt}
        lastUpdated={stats.lastUpdated}
        refreshInterval={config.refreshIntervalMin}
      />

      <hr className="border-[#30363d] mx-4" />

      <Heatmap dailyStats={stats.dailyStats} />

      {showSettings && (
        <Settings
          config={config}
          onSave={saveConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Test full flow**

```bash
npm run dev
```

Expected:
- Header "Claude Tracker" with ↺ and ⚙ buttons
- Rate limit bars show real computed values (likely 0% if no Claude Code sessions, or real % if sessions exist in `~/.claude/`)
- Heatmap renders real daily session counts from the last year
- Clicking ⚙ opens Settings modal; saving updates config
- Clicking ↺ re-parses `~/.claude/` and refreshes UI
- Tray right-click → Actualiser also refreshes

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: full app integration — live IPC data, tray events, settings modal"
```

---

### Task 11: Windows Packaging

**Files:**
- Create: `electron-builder.config.ts`
- Create: `resources/icon.ico` (convert from icon.png)

**Interfaces:**
- Produces: `dist/claude-tracker-setup.exe` (NSIS installer, Windows x64)

- [ ] **Step 1: Install electron-builder**

```bash
npm install -D electron-builder
```

- [ ] **Step 2: Create electron-builder config**

Create `electron-builder.config.ts`:
```typescript
import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.claudetracker.widget',
  productName: 'Claude Tracker',
  directories: { output: 'dist', buildResources: 'resources' },
  files: ['out/**/*'],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Claude Tracker',
  },
}
export default config
```

- [ ] **Step 3: Create icon.ico**

Convert `resources/icon.png` to `resources/icon.ico`. Use an online converter (e.g. convertio.co) or install a local tool:
```bash
npm install -D png-to-ico
node -e "
const pngToIco = require('png-to-ico');
const fs = require('fs');
pngToIco('resources/icon.png').then(buf => fs.writeFileSync('resources/icon.ico', buf));
"
```

- [ ] **Step 4: Add build script**

In `package.json` scripts, add:
```json
"build:win": "electron-vite build && electron-builder --config electron-builder.config.ts"
```

- [ ] **Step 5: Build**

```bash
npm run build:win
```

Expected: `dist/claude-tracker-setup.exe` generated. Install it and verify the widget appears, tray icon is present, and it loads real data.

- [ ] **Step 6: Commit**

```bash
git add electron-builder.config.ts
git commit -m "feat: Windows NSIS packaging with electron-builder"
```

---

## Self-Review

**Spec coverage:**
- ✅ Frameless always-on-top Electron window (Task 6)
- ✅ Rate limit bars: session 5h + weekly (Tasks 2, 3, 7)
- ✅ Heatmap 1 year, intensity = sessions/day (Task 8)
- ✅ Local parser `~/.claude/` JSONL (Task 3)
- ✅ Anthropic API client optional (Task 4)
- ✅ SQLite with incremental parse cursor (Task 2)
- ✅ Scheduler refresh N min (Task 5)
- ✅ IPC handlers + preload contextBridge (Task 5)
- ✅ Settings modal (Task 9)
- ✅ System tray icon + context menu (Task 6)
- ✅ Position persistence via electron-store (Task 6)
- ✅ Windows NSIS installer (Task 11)
- ✅ Dark theme `#0d1117` / `#00cc6a` (Task 1)
- ✅ Tooltip on heatmap hover (Task 8)

**Types consistent across tasks:**
- `DailyStat`, `RateLimits`, `StatsPayload`, `AppConfig` — all defined once in `shared/types.ts`; renderer re-declares inline in `useStats.ts` to avoid cross-process import issues (acceptable)
- `SessionRow.created_at` — defined in Task 2, used identically in Task 3
- `getRecentTokens(db, sinceMs)` — defined in Task 2, called in Task 3 `computeRateLimits`
- `window.api` shape in preload (Task 5) matches declaration in `useStats.ts` (Task 9)
