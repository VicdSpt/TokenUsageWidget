import fs from 'fs'
import path from 'path'
import os from 'os'
import type { RateLimits } from '../shared/types'

// Real rate-limit percentages straight from Anthropic — the same source Claude Code's
// /usage command uses. Local token estimation can never match these numbers because
// Anthropic weights models/cache/context in ways that aren't derivable from the JSONL.

export interface OAuthUsage {
  sessionPercent: number
  sessionResetsAt: Date | null
  weeklyPercent: number
  weeklyResetsAt: Date | null
}

interface UsageWindow {
  utilization?: unknown
  resets_at?: unknown
}

function toPercent(u: unknown): number {
  if (typeof u !== 'number' || isNaN(u)) return 0
  // The endpoint reports 0-100; some variants report a 0-1 fraction. A value ≤ 1
  // with a fractional part can only be a fraction (percent values are integers).
  const pct = u > 0 && u <= 1 && !Number.isInteger(u) ? u * 100 : u
  return Math.min(100, Math.max(0, Math.round(pct)))
}

function toDate(v: unknown): Date | null {
  if (typeof v === 'number' && v > 0) {
    // unix seconds vs milliseconds
    return new Date(v < 1e12 ? v * 1000 : v)
  }
  if (typeof v === 'string') {
    const d = new Date(v)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

export function parseUsageResponse(data: unknown): OAuthUsage | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, UsageWindow | undefined>
  const five = obj['five_hour']
  const seven = obj['seven_day']
  if (!five && !seven) return null
  return {
    sessionPercent: toPercent(five?.utilization),
    sessionResetsAt: toDate(five?.resets_at),
    weeklyPercent: toPercent(seven?.utilization),
    weeklyResetsAt: toDate(seven?.resets_at),
  }
}

function readAccessToken(): string | null {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf-8')
    const cred = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string; expiresAt?: number } }
    const oauth = cred.claudeAiOauth
    if (!oauth?.accessToken) return null
    if (typeof oauth.expiresAt === 'number' && oauth.expiresAt < Date.now()) return null
    return oauth.accessToken
  } catch {
    return null
  }
}

let cache: { at: number; data: OAuthUsage } | null = null
const CACHE_TTL_MS = 60_000

export async function fetchOAuthUsage(): Promise<OAuthUsage | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data

  const token = readAccessToken()
  if (!token) return null

  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    })
    if (!res.ok) {
      console.error('[oauth-usage] HTTP', res.status)
      return null
    }
    const body = await res.json()
    const parsed = parseUsageResponse(body)
    if (!parsed) {
      console.error('[oauth-usage] unexpected response shape:', JSON.stringify(body).slice(0, 500))
      return null
    }
    cache = { at: Date.now(), data: parsed }
    console.log(`[oauth-usage] session ${parsed.sessionPercent}% · weekly ${parsed.weeklyPercent}%`)
    return parsed
  } catch (err) {
    console.error('[oauth-usage] fetch failed:', err)
    return null
  }
}

export function oauthToRateLimits(u: OAuthUsage): RateLimits {
  const now = Date.now()

  let sessionResetIn = '---'
  if (u.sessionResetsAt) {
    const ms = Math.max(0, u.sessionResetsAt.getTime() - now)
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    sessionResetIn = `${h}h${String(m).padStart(2, '0')}`
  }

  let weeklyResetAt = '---'
  if (u.weeklyResetsAt) {
    const d = u.weeklyResetsAt
    weeklyResetAt =
      d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }) +
      ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return {
    sessionPercent: u.sessionPercent,
    sessionResetIn,
    weeklyPercent: u.weeklyPercent,
    weeklyResetAt,
    sessionTokens: 0,
    weeklyTokens: 0,
    sessionLimit: 0,
    weeklyLimit: 0,
    source: 'api',
  }
}
