import RateLimitBar from './components/RateLimitBar'
import Heatmap from './components/Heatmap'

const mock = Array.from({ length: 200 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - i)
  return { date: d.toISOString().slice(0, 10), sessions_count: Math.floor(Math.random() * 9) }
})

export default function App() {
  return (
    <div className="bg-[#0d1117]">
      <RateLimitBar sessionPercent={37} sessionResetIn="3h01" weeklyPercent={54} weeklyResetAt="mer. 11:00" lastUpdated={new Date().toISOString()} refreshInterval={15} />
      <hr className="border-[#30363d] mx-4" />
      <Heatmap dailyStats={mock} />
    </div>
  )
}
