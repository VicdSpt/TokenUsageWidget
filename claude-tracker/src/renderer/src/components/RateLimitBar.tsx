interface BarProps {
  icon: string
  label: string
  subtitle: string
  percent: number
  resetInfo: string
}

function Bar({ icon, label, subtitle, percent, resetInfo }: BarProps) {
  const barColor =
    percent >= 95 ? 'bg-red-500' :
    percent >= 80 ? 'bg-orange-400' :
    'bg-[#00cc6a]'
  const textColor =
    percent >= 95 ? 'text-red-400' :
    percent >= 80 ? 'text-orange-300' :
    'text-[#00cc6a]'

  return (
    <div className="mb-4">
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <div>
            <p className="text-[#e6edf3] font-semibold text-sm leading-none">{label}</p>
            <p className="text-[#8b949e] text-xs mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-bold text-lg leading-none ${textColor}`}>{percent}%</p>
          <p className="text-[#8b949e] text-xs mt-0.5">Reset {resetInfo}</p>
        </div>
      </div>
      <div className="h-1.5 bg-[#161b22] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  )
}

interface RateLimitBarProps {
  sessionPercent: number
  sessionResetIn: string
  weeklyPercent: number
  weeklyResetAt: string
  lastUpdated: string
  refreshInterval: number
}

export default function RateLimitBar(props: RateLimitBarProps) {
  const { sessionPercent, sessionResetIn, weeklyPercent, weeklyResetAt, lastUpdated, refreshInterval } = props

  const ago = (() => {
    const diff = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 60000)
    return diff < 1 ? "il y a moins d'une minute" : `il y a ${diff} min`
  })()

  return (
    <div className="px-4 pt-4 pb-2">
      <Bar
        icon="⏱"
        label="Session"
        subtitle="Fenêtre glissante 5h"
        percent={sessionPercent}
        resetInfo={sessionResetIn}
      />
      <Bar
        icon="📊"
        label="Weekly"
        subtitle="7 derniers jours"
        percent={weeklyPercent}
        resetInfo={weeklyResetAt}
      />
      <div className="flex justify-between text-xs text-[#8b949e] mt-1">
        <span>Upd. {ago}</span>
        <span>• {refreshInterval} min</span>
      </div>
    </div>
  )
}
