import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface DailyStat { date: string; sessions_count: number }
interface HeatmapProps { dailyStats: DailyStat[] }

const CELL = 11
const GAP  = 2
const LEVELS = ['#161b22', '#0e4429', '#006d32', '#00cc6a']
const DAY_LABELS = ['L','M','M','J','V','S','D']

function level(n: number) { return n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : 3 }

export default function Heatmap({ dailyStats }: HeatmapProps) {
  const [tipText, setTipText] = useState<string | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Track real mouse coordinates at document level — bypasses any CSS zoom on parent elements.
  // position:fixed inside a CSS-zoomed ancestor uses the zoomed coordinate space in Chromium,
  // so we render the tooltip via createPortal (outside the zoom context) and update its
  // position directly via the DOM to avoid React re-render overhead on every mousemove.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!tooltipRef.current) return
      tooltipRef.current.style.left = `${e.clientX + 14}px`
      tooltipRef.current.style.top  = `${e.clientY - 38}px`
    }
    document.addEventListener('mousemove', handler)
    return () => document.removeEventListener('mousemove', handler)
  }, [])

  const map = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of dailyStats) m.set(s.date, s.sessions_count)
    return m
  }, [dailyStats])

  const today = new Date(); today.setHours(0,0,0,0)
  const jan1 = new Date(2026, 0, 1)
  const dow = jan1.getDay()
  const start = new Date(jan1)
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))

  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const numWeeks = Math.ceil((today.getTime() - start.getTime()) / msPerWeek) + 1

  type Cell = { date: string; count: number; future: boolean }
  const weeks: Cell[][] = []
  const cur = new Date(start)
  for (let w = 0; w < numWeeks; w++) {
    const week: Cell[] = []
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.toLocaleDateString('fr-CA')
      week.push({ date: dateStr, count: map.get(dateStr) ?? 0, future: cur > today })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }

  const months: { label: string; col: number }[] = []
  let lastM = -1
  weeks.forEach((week, wi) => {
    const m = new Date(week[0].date).getMonth()
    if (m !== lastM) {
      months.push({ label: new Date(week[0].date).toLocaleDateString('fr-FR', { month: 'short' }), col: wi })
      lastM = m
    }
  })

  return (
    <div className="px-4 pb-4 select-none">
      <p className="text-[#8b949e] text-xs mb-2">Activité 2026</p>
      <div className="relative overflow-x-auto">
        <div className="relative h-4 ml-6 mb-1">
          {months.map(({ label, col }) => (
            <span
              key={`${label}-${col}`}
              className="absolute text-[9px] text-[#8b949e]"
              style={{ left: col * (CELL + GAP) }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex gap-0">
          <div className="flex flex-col mr-1" style={{ gap: GAP }}>
            {DAY_LABELS.map((d, i) => (
              <div
                key={i}
                style={{ height: CELL, fontSize: 9, lineHeight: `${CELL}px`, color: '#8b949e' }}
              >
                {i % 2 === 0 ? d : ''}
              </div>
            ))}
          </div>
          <div className="flex" style={{ gap: GAP }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                {week.map((cell, di) => (
                  <div
                    key={di}
                    style={{
                      width: CELL, height: CELL, borderRadius: 2,
                      backgroundColor: cell.future ? 'transparent' : LEVELS[level(cell.count)],
                      cursor: cell.future ? 'default' : 'crosshair',
                    }}
                    onMouseEnter={() => {
                      if (cell.future) return
                      const label = new Date(cell.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                      setTipText(`${cell.count} session${cell.count !== 1 ? 's' : ''} · ${label}`)
                    }}
                    onMouseLeave={() => setTipText(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 mt-2">
          <span className="text-[9px] text-[#8b949e]">moins</span>
          {LEVELS.map((c, i) => <div key={i} style={{ width: CELL, height: CELL, borderRadius: 2, backgroundColor: c }} />)}
          <span className="text-[9px] text-[#8b949e]">plus</span>
        </div>
      </div>

      {tipText && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap shadow-lg"
          style={{ left: 0, top: 0 }}
        >
          {tipText}
        </div>,
        document.body
      )}
    </div>
  )
}
