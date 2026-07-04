import cron from 'node-cron'
import Store from 'electron-store'
import type Database from 'better-sqlite3'
import { parseClaude } from './parser'
import { fetchApiUsage } from './api-client'
import type { AppConfig } from '../shared/types'

export function startScheduler(db: Database.Database, store: Store<AppConfig>): () => void {
  let task: ReturnType<typeof cron.schedule> | null = null

  const run = async (): Promise<void> => {
    const cfg = store.store
    await parseClaude(cfg.claudePath, db)
    if (cfg.apiKey) await fetchApiUsage(cfg.apiKey)
  }

  const intervalMin = store.get('refreshIntervalMin', 15)
  task = cron.schedule(`*/${intervalMin} * * * *`, () => run().catch(console.error))

  run().catch(console.error) // initial run

  return () => task?.stop()
}
