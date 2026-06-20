import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { motion, AnimatePresence, useMotionEnabled } from './lib/motion'
import { ToastProvider } from './lib/toast'
import { AuthProvider } from './lib/AuthContext'
import AppShell from './components/layout/AppShell'
import ScrollRestoration from './lib/ScrollRestoration'

const Dashboard = lazy(() => import('./views/Dashboard'))
const NewSong = lazy(() => import('./views/NewSong'))
const SongView = lazy(() => import('./views/SongView'))
const Setlists = lazy(() => import('./views/Setlists'))
const SetlistView = lazy(() => import('./views/SetlistView'))
const ImportView = lazy(() => import('./views/ImportView'))
const ChordVoicings = lazy(() => import('./views/ChordVoicings'))
const Stats = lazy(() => import('./views/Stats'))
const ShareView = lazy(() => import('./views/ShareView'))

function RouteFallback() {
  return (
    <div className='flex items-center justify-center py-24 text-sm text-[var(--color-ink-muted)]'>
      Loading…
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  const enabled = useMotionEnabled()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={enabled ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        exit={enabled ? { opacity: 0, y: -8 } : undefined}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/songs/new" element={<NewSong />} />
            <Route path="/songs/:id" element={<SongView />} />
            <Route path="/setlists" element={<Setlists />} />
            <Route path="/setlists/:id" element={<SetlistView />} />
            <Route path="/import" element={<ImportView />} />
            <Route path="/voicings" element={<ChordVoicings />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/share/:token" element={<ShareView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <ScrollRestoration />
            <AppShell>
              <AnimatedRoutes />
            </AppShell>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </MotionConfig>
  )
}
