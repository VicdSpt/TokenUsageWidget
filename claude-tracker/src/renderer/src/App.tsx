import RateLimitBar from './components/RateLimitBar'

export default function App(): React.JSX.Element {
  return (
    <div className="bg-[#0d1117] min-h-screen p-2">
      <RateLimitBar
        sessionPercent={37} sessionResetIn="3h01"
        weeklyPercent={54}  weeklyResetAt="wed. 11:00"
        lastUpdated={new Date().toISOString()} refreshInterval={15}
      />
    </div>
  )
}
