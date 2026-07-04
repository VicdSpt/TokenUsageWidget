import type { StatsPayload, AppConfig } from '../shared/types'

declare global {
  interface Window {
    api: {
      getStats: () => Promise<StatsPayload>
      getConfig: () => Promise<AppConfig>
      setConfig: (p: Partial<AppConfig>) => Promise<void>
      forceRefresh: () => Promise<void>
    }
  }
}
