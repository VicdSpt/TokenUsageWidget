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
