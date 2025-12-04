import { useCallback, useState } from 'react'
import AttackPercentageChart from '@/components/AttackPercentageChart.js'
import PdfReader from '@/components/PdfReader.js'

const Dashboard = () => {
      const [chartState, setChartState] = useState({ isLoading: true, hasData: false })

      const handleChartStateChange = useCallback((state) => {
            setChartState((prev) => {
                  if (prev.isLoading === state.isLoading && prev.hasData === state.hasData) {
                        return prev
                  }
                  return state
            })
      }, [])

      const showChart = chartState.isLoading || chartState.hasData

      return (
            <div className="mx-auto flex w-full max-w-5xl flex-col px-1">
                  <PdfReader />
                  {!showChart && (
                        <p className="mt-4 text-center text-sm text-slate-400">Load your match reports to track your data...</p>
                  )}
                  <div className={showChart ? 'mt-4' : 'hidden'}>
                        <AttackPercentageChart onDataStateChange={handleChartStateChange} />
                  </div>
            </div>
      )
}

export default Dashboard