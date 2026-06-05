import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import AppShell from './components/layout/AppShell'

const Dashboard = lazy(() => import('./views/Dashboard'))
const NewSong = lazy(() => import('./views/NewSong'))
const SongView = lazy(() => import('./views/SongView'))
const Setlists = lazy(() => import('./views/Setlists'))
const SetlistView = lazy(() => import('./views/SetlistView'))
const ImportView = lazy(() => import('./views/ImportView'))
const ChordVoicings = lazy(() => import('./views/ChordVoicings'))

function RouteFallback() {
  return (
    <div className='flex items-center justify-center py-24 text-sm text-[var(--color-ink-muted)]'>
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <AppShell>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/songs/new" element={<NewSong />} />
            <Route path="/songs/:id" element={<SongView />} />
            <Route path="/setlists" element={<Setlists />} />
            <Route path="/setlists/:id" element={<SetlistView />} />
            <Route path="/import" element={<ImportView />} />
            <Route path="/voicings" element={<ChordVoicings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </BrowserRouter>
    </AuthProvider>
  )
}
