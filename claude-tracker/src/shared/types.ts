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
  sessionTokens: number
  weeklyTokens: number
  sessionLimit: number
  weeklyLimit: number
  // 'api' = real percentages from Anthropic's OAuth usage endpoint;
  // 'estimate' = local fallback computed from JSONL token counts
  source: 'api' | 'estimate'
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
  fontSize: number
}
