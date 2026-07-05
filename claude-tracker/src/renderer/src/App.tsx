import { useState, useEffect } from 'react'
import RateLimitBar from './components/RateLimitBar'
import Heatmap from './components/Heatmap'
import Settings from './components/Settings'
import { useStats } from './hooks/useStats'

export default function App() {
  const { stats, config, refresh, saveConfig, resetData } = useStats(60_000)
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

  const zoom = (config?.fontSize ?? 13) / 13

  if (!stats || !config) {
    return (
      <div className="bg-[#0d1117] w-screen h-screen flex items-center justify-center rounded-xl border border-[#30363d]">
        <p className="text-[#8b949e] text-sm">Chargement…</p>
      </div>
    )
  }

  return (
    <div style={{ zoom }} className="bg-[#0d1117] w-full rounded-xl border border-[#30363d] overflow-hidden">
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
        sessionTokens={stats.rateLimits.sessionTokens}
        weeklyTokens={stats.rateLimits.weeklyTokens}
        sessionLimit={stats.rateLimits.sessionLimit}
        weeklyLimit={stats.rateLimits.weeklyLimit}
        source={stats.rateLimits.source}
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
          onReset={resetData}
        />
      )}
    </div>
  )
}
