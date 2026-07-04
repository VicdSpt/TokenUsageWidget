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
  fontSize: number
}
