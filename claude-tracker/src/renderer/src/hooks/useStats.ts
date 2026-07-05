import { useState, useEffect, useCallback } from 'react'

export interface DailyStat { date: string; sessions_count: number; tokens_in: number; tokens_out: number }
export interface RateLimits { sessionPercent: number; sessionResetIn: string; weeklyPercent: number; weeklyResetAt: string; sessionTokens: number; weeklyTokens: number; sessionLimit: number; weeklyLimit: number; source: 'api' | 'estimate' }
export interface StatsPayload { rateLimits: RateLimits; dailyStats: DailyStat[]; lastUpdated: string }
export interface AppConfig { claudePath: string; apiKey: string; refreshIntervalMin: number; plan: 'pro' | 'max'; alwaysOnTop: boolean; launchAtLogin: boolean; fontSize: number }

declare global {
  interface Window {
    api: {
      getStats(): Promise<StatsPayload>
      getConfig(): Promise<AppConfig>
      setConfig(p: Partial<AppConfig>): Promise<void>
      forceRefresh(): Promise<void>
      resetData(): Promise<void>
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

  const resetData = useCallback(async () => {
    await window.api.resetData()
    await fetchAll()
  }, [fetchAll])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, intervalMs)
    return () => clearInterval(id)
  }, [fetchAll, intervalMs])

  return { stats, config, refresh, saveConfig, resetData }
}
