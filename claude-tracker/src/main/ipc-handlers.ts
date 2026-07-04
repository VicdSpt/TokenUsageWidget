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
  claudePath:         path.join(os.homedir(), '.claude'),
  apiKey:             '',
  refreshIntervalMin: 15,
  plan:               'pro',
  alwaysOnTop:        true,
  launchAtLogin:      false,
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
