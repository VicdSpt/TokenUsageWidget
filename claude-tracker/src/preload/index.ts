import { contextBridge, ipcRenderer } from 'electron'
import type { StatsPayload, AppConfig } from '../shared/types'

contextBridge.exposeInMainWorld('api', {
  getStats:     (): Promise<StatsPayload>              => ipcRenderer.invoke('get-stats'),
  getConfig:    (): Promise<AppConfig>                 => ipcRenderer.invoke('get-config'),
  setConfig:    (p: Partial<AppConfig>): Promise<void> => ipcRenderer.invoke('set-config', p),
  forceRefresh: (): Promise<void>                      => ipcRenderer.invoke('force-refresh'),
  resetData:    (): Promise<void>                      => ipcRenderer.invoke('reset-data'),
})

// Forward tray-menu events from main to renderer as DOM events
ipcRenderer.on('tray-refresh',       () => window.dispatchEvent(new Event('ipc-refresh')))
ipcRenderer.on('tray-open-settings', () => window.dispatchEvent(new Event('ipc-open-settings')))
