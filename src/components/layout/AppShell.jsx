import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Music2, ListMusic, LayoutGrid, Plus, Moon, Sun,
  Zap, Wifi, WifiOff, Menu, X, BookOpen, FileUp
} from 'lucide-react'
import { useOnlineStatus, useTheme } from '../../lib/hooks'
import { Button, Tooltip } from '../ui'

const NAV_ITEMS = [
  { to: '/', label: 'Library', icon: LayoutGrid, exact: true },
  { to: '/songs/new', label: 'Add Song', icon: Plus },
  { to: '/import', label: 'Import', icon: FileUp },
  { to: '/setlists', label: 'Setlists', icon: ListMusic },
]

export default function AppShell({ children }) {
  const isOnline = useOnlineStatus()
  const { isDark, isStage, toggleDark, toggleStage } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      {/* ── Offline Banner ────────────────────────────────────────── */}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 py-1.5 px-4 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs font-medium dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300">
          <WifiOff size={12} />
          Offline — showing cached songs
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
            {NAV_ITEMS.map(item => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            {/* Stage mode */}
            <Tooltip content={isStage ? 'Exit stage mode' : 'Stage mode'}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleStage}
                className={isStage ? 'text-[var(--color-accent)]' : ''}
                title="Toggle stage mode"
              >
                <Zap size={14} />
              </Button>
            </Tooltip>

            {/* Dark mode */}
            <Tooltip content={isDark ? 'Light mode' : 'Dark mode'}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleDark}
                title="Toggle dark mode"
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </Button>
            </Tooltip>

            {/* Online indicator (desktop) */}
            <div className="hidden sm:flex items-center gap-1 ml-1">
              {isOnline
                ? <Wifi size={12} className="text-green-500" />
                : <WifiOff size={12} className="text-amber-500" />
              }
            </div>

            {/* Mobile menu */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(o => !o)}
            >
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </Button>
          </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--color-border)] bg-[var(--color-bg)] animate-fade-in">
            <nav className="flex flex-col p-2 gap-1">
              {NAV_ITEMS.map(item => (
                <NavItem
                  key={item.to}
                  {...item}
                  mobile
                  onClick={() => setMobileMenuOpen(false)}
                />
              ))}
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
          <span className="text-xs text-[var(--color-ink-muted)] font-mono">ChordVault</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-ink-muted)]">
              {isOnline ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Wifi size={10} /> Synced
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <WifiOff size={10} /> Offline
                </span>
              )}
            </span>
          </div>
        </div>
      </footer>
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
