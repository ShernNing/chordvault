import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Music2, ListMusic, LayoutGrid, Plus, Moon, Sun,
  Zap, Wifi, WifiOff, Menu, X, FileUp,
  CloudOff, LogIn, LogOut, User, ExternalLink, ArrowUp, Guitar
} from 'lucide-react'
import { useOnlineStatus, useTheme, useDisplaySettings, STAGE_COLORS, DARK_THEMES } from '../../lib/hooks'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { Button, Tooltip } from '../ui'
import AuthModal from '../auth/AuthModal'

const NAV_ITEMS = [
  { to: '/', label: 'Library', icon: LayoutGrid, exact: true },
  { to: '/songs/new', label: 'Add Song', icon: Plus },
  { to: '/import', label: 'Import', icon: FileUp },
  { to: '/setlists', label: 'Setlists', icon: ListMusic },
  { to: '/voicings', label: 'Chord Voicings', icon: Guitar },
]

export default function AppShell({ children }) {
  const isOnline = useOnlineStatus()
  const { isDark, isStage, toggleDark, toggleStage, stageColorId, setStageColorId, darkThemeId, setDarkThemeId } = useTheme()
  useDisplaySettings()
  const { isLoggedIn, email } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLogout = async () => {
    await supabase?.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      {/* ── Offline Banner ────────────────────────────────────────── */}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 py-1.5 px-4 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs font-medium dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300">
          <WifiOff size={12} />
          Offline — showing cached data
        </div>
      )}

      {/* ── Top Bar ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[var(--color-bg)] border-b border-[var(--color-border)] no-print">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
          {/* Wordmark */}
          <NavLink to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-[var(--color-ink)] rounded flex items-center justify-center">
              <Music2 size={14} className="text-[var(--color-bg)]" />
            </div>
            <span className="font-display text-base font-normal text-[var(--color-ink)] tracking-tight hidden sm:block">
              ChordVault
            </span>
          </NavLink>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(item => <NavItem key={item.to} {...item} />)}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            <Tooltip content={isStage ? 'Exit stage mode' : 'Stage mode'}>
              <Button variant="ghost" size="icon-sm" onClick={toggleStage} className={isStage ? 'text-[var(--color-accent)]' : ''}>
                <Zap size={14} />
              </Button>
            </Tooltip>
            {isStage && STAGE_COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => setStageColorId(c.id)}
                title={c.label}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all shrink-0 ${stageColorId === c.id ? 'border-white scale-125' : 'border-transparent opacity-50 hover:opacity-80'}`}
                style={{ backgroundColor: c.chord }}
              />
            ))}

            <Tooltip content={isDark ? 'Light mode' : 'Dark mode'}>
              <Button variant="ghost" size="icon-sm" onClick={toggleDark}>
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </Button>
            </Tooltip>
            {isDark && !isStage && DARK_THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => setDarkThemeId(t.id)}
                title={t.label}
                className={`w-3.5 h-3.5 rounded-sm border transition-all shrink-0 ${darkThemeId === t.id ? 'ring-1 ring-[var(--color-ink)] ring-offset-1 ring-offset-[var(--color-bg)] opacity-100' : 'opacity-50 hover:opacity-80'}`}
                style={{ backgroundColor: t.swatch, borderColor: '#555' }}
              />
            ))}

            {/* Auth (desktop) */}
            <div className="hidden sm:flex items-center ml-1">
              {isLoggedIn ? (
                <Tooltip content={`Signed in as ${email} — click to sign out`}>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 h-7 px-2 rounded text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)] transition-colors"
                  >
                    <User size={12} />
                    <span className="max-w-[100px] truncate">{email}</span>
                    <LogOut size={11} className="opacity-50" />
                  </button>
                </Tooltip>
              ) : (
                <Tooltip content="Sign in to sync across devices">
                  <Button variant="ghost" size="icon-sm" onClick={() => setAuthOpen(true)}>
                    <LogIn size={14} />
                  </Button>
                </Tooltip>
              )}
            </div>

            {/* Mobile menu */}
            <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileMenuOpen(o => !o)}>
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </Button>
          </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--color-border)] bg-[var(--color-bg)] animate-fade-in">
            <nav className="flex flex-col p-2 gap-1">
              {NAV_ITEMS.map(item => (
                <NavItem key={item.to} {...item} mobile onClick={() => setMobileMenuOpen(false)} />
              ))}
              <div className="border-t border-[var(--color-border)] mt-1 pt-1">
                {isLoggedIn ? (
                  <button
                    onClick={() => { handleLogout(); setMobileMenuOpen(false) }}
                    className="flex items-center gap-2 w-full h-10 px-3 rounded text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)] transition-colors"
                  >
                    <LogOut size={14} /> Sign out ({email})
                  </button>
                ) : (
                  <button
                    onClick={() => { setAuthOpen(true); setMobileMenuOpen(false) }}
                    className="flex items-center gap-2 w-full h-10 px-3 rounded text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)] transition-colors"
                  >
                    <LogIn size={14} /> Sign in to sync
                  </button>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 animate-fade-in">
        {children}
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--color-border)] py-3 px-4 no-print">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-ink-muted)] font-mono">ChordVault</span>
            <div className="hidden sm:flex items-center gap-3">
              <span className="text-[var(--color-border)] text-xs">·</span>
              {[
                { label: 'Workout Tracker', href: 'https://workouttracker-xi.vercel.app' },
                { label: 'Transpose Me', href: 'https://transposeme.vercel.app/' },
              ].map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
                >
                  {label}
                  <ExternalLink size={9} className="opacity-50" />
                </a>
              ))}
              <span className="text-[var(--color-border)] text-xs">·</span>
              <span className="text-xs text-[var(--color-ink-muted)]">© {new Date().getFullYear()} Shern Ning</span>
            </div>
          </div>
          <span className={`flex items-center gap-1 text-xs ${
            !isLoggedIn ? 'text-[var(--color-ink-muted)]'
            : isOnline ? 'text-green-600 dark:text-green-400'
            : 'text-amber-600 dark:text-amber-400'
          }`}>
            {!isLoggedIn
              ? <><CloudOff size={10} /> Local only</>
              : isOnline
              ? <><Wifi size={10} /> Synced</>
              : <><WifiOff size={10} /> Offline</>
            }
          </span>
        </div>
      </footer>

      {/* ── Auth Modal ────────────────────────────────────────────── */}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />

      {/* ── Scroll To Top ─────────────────────────────────────────── */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title="Back to top"
        className={`
          fixed bottom-6 right-6 z-50 no-print
          h-9 w-9 rounded-full
          bg-[var(--color-ink)] text-[var(--color-bg)]
          border border-[var(--color-border)]
          flex items-center justify-center
          shadow-md hover:opacity-80 active:scale-95
          transition-all duration-200
          ${showScrollTop ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}
        `}
        aria-hidden={!showScrollTop}
      >
        <ArrowUp size={15} />
      </button>
    </div>
  )
}

function NavItem({ to, label, icon: Icon, exact, mobile, onClick }) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onClick}
      className={({ isActive }) => `
        flex items-center gap-2 px-3 rounded transition-colors duration-100 font-sans text-sm
        ${mobile ? 'h-10' : 'h-7'}
        ${isActive
          ? 'bg-[var(--color-ink)] text-[var(--color-bg)]'
          : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]'
        }
      `}
    >
      <Icon size={14} />
      {label}
    </NavLink>
  )
}
