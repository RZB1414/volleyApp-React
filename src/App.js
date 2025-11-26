import NavigationBar from '@/components/NavigationBar.js'
import AppRoutes from '@/routes/AppRoutes.js'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavigationBar />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        <AppRoutes />
      </main>
    </div>
  )
}
