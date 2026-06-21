import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  User, Shield, LogOut, LogIn, CloudOff, Wifi, Music2, Play,
  ListMusic, Copy, Check, X, Mail, Calendar, Type, ShieldCheck,
  Users, AlertCircle, Eye,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useSongs, useSetlists, useDisplaySettings, useOnlineStatus, FONT_OPTIONS } from '../lib/hooks'
import { supabaseProfileOps } from '../lib/supabaseOps'
import { supabase } from '../lib/supabase'
import { Badge, Button, Select, EmptyState, Skeleton } from '../components/ui'
import AuthModal from '../components/auth/AuthModal'
import { useToast } from '../lib/toast'

const DAY = 24 * 60 * 60 * 1000

// Capabilities per role — shown in the badge and the superuser legend.
const ROLE_INFO = {
  superuser: {
    label: 'Superuser', variant: 'accent', icon: ShieldCheck,
    can: ['View every song & build setlists', 'Add songs', 'Edit any song', 'Delete any song', 'Promote / demote users'],
    cannot: [],
  },
  leader: {
    label: 'Leader', variant: 'success', icon: Shield,
    can: ['View every song & build setlists', 'Add songs', 'Edit songs they added'],
    cannot: ["Edit other people's songs", 'Delete songs', 'Change user roles'],
  },
  member: {
    label: 'Member', variant: 'default', icon: Eye,
    can: ['View every song', 'Build & edit setlists'],
    cannot: ['Add songs', 'Edit songs', 'Delete songs', 'Change user roles'],
  },
}

function RoleBadge({ role }) {
  const info = ROLE_INFO[role] || ROLE_INFO.member
  const Icon = info.icon
  return <Badge variant={info.variant}><Icon size={9} className="mr-0.5" /> {info.label}</Badge>
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function Profile() {
  const { isLoggedIn, email, userId, role, isSuperuser, session } = useAuth()
  const { songs } = useSongs('recent')
  const { setlists } = useSetlists()
  const isOnline = useOnlineStatus()
  const [authOpen, setAuthOpen] = useState(false)

  // ── Signed-out state ──────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          icon={CloudOff}
          title="You're not signed in"
          description="Songs you add are stored only in this browser. Sign in to sync your library across devices and unlock your profile."
          action={
            <Button variant="primary" size="md" onClick={() => setAuthOpen(true)} className="btn-shimmer">
              <LogIn size={14} /> Sign in
            </Button>
          }
        />
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    )
  }

  const mine = songs.filter(s => s.created_by && s.created_by === userId)
  const myPlays = mine.reduce((sum, s) => sum + (s.play_count || 0), 0)
  const provider = session?.user?.app_metadata?.provider
  const memberSince = session?.user?.created_at

  return (
    <div className="space-y-6">
      <Header />
      <AccountCard
        email={email}
        userId={userId}
        role={role}
        provider={provider}
        memberSince={memberSince}
        isOnline={isOnline}
      />

      {/* Your numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Music2} label="Songs you added" value={mine.length} />
        <StatCard icon={Play} label="Plays on your songs" value={myPlays} />
        <StatCard icon={Music2} label="Library total" value={songs.length} />
        <StatCard icon={ListMusic} label="Setlists" value={setlists.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SongsYouAdded mine={mine} />
        <DisplaySettingsPanel />
      </div>

      {isSuperuser && <AdminPanel meUserId={userId} />}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="font-display text-2xl text-[var(--color-ink)] flex items-center gap-2">
        <User size={22} /> Profile
      </h1>
      <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">Your account, contributions, and settings</p>
    </div>
  )
}

// ─── Account ─────────────────────────────────────────────────────────────────
function AccountCard({ email, userId, role, provider, memberSince, isOnline }) {
  const [copied, setCopied] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(userId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  const handleLogout = async () => {
    setSigningOut(true)
    await supabase?.auth.signOut()
    // AuthProvider's onAuthStateChange flips the UI; no manual redirect needed.
  }

  const initial = (email || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)] p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-full bg-[var(--color-ink)] text-[var(--color-bg)] flex items-center justify-center font-display text-2xl">
            {initial}
          </div>
          <span
            title={isOnline ? 'Online' : 'Offline'}
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[var(--color-bg-warm)] ${
              isOnline ? 'bg-green-500' : 'bg-amber-500'
            }`}
          />
        </div>

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-[var(--color-ink)] truncate">{email}</span>
            <RoleBadge role={role} />
          </div>
          <p className="text-xs text-[var(--color-ink-soft)] mt-0.5">{(ROLE_INFO[role] || ROLE_INFO.member).can.join(' · ')}</p>
          <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-[var(--color-ink-muted)]">
            <span className="flex items-center gap-1">
              <Mail size={11} /> {provider === 'google' ? 'Google' : 'Email link'}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={11} /> Joined {formatDate(memberSince)}
            </span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Wifi size={11} /> Synced
            </span>
          </div>
        </div>

        {/* Sign out */}
        <Button variant="danger" size="sm" onClick={handleLogout} loading={signingOut} className="shrink-0">
          <LogOut size={13} /> Sign out
        </Button>
      </div>

      {/* User id row */}
      <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">User ID</span>
        <code className="text-xs font-mono text-[var(--color-ink-soft)] truncate">{userId}</code>
        <button
          onClick={copyId}
          title="Copy user ID"
          className="ml-auto shrink-0 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
        >
          {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  )
}

// ─── Songs you added ───────────────────────────────────────────────────────
function SongsYouAdded({ mine }) {
  return (
    <Panel title="Songs you added" icon={Music2}>
      {mine.length === 0 ? (
        <p className="text-xs text-[var(--color-ink-muted)] italic">
          You haven't added any songs yet. <Link to="/songs/new" className="text-[var(--color-accent)] not-italic">Add one →</Link>
        </p>
      ) : (
        <ul className="space-y-1.5">
          {mine.slice(0, 8).map(s => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <Link to={`/songs/${s.id}`} className="flex-1 min-w-0 truncate text-[var(--color-ink)] hover:underline">
                {s.title}
              </Link>
              {s.original_key && <Badge variant="key">{s.original_key}</Badge>}
              <span className="text-xs text-[var(--color-ink-muted)] w-16 text-right">{timeAgo(s.created_at)}</span>
            </li>
          ))}
          {mine.length > 8 && (
            <li className="text-xs text-[var(--color-ink-muted)] pt-1">+ {mine.length - 8} more</li>
          )}
        </ul>
      )}
    </Panel>
  )
}

// ─── Display settings ────────────────────────────────────────────────────────
function DisplaySettingsPanel() {
  const { fontSize, setFontSize, fontFamily, setFontFamily } = useDisplaySettings()
  return (
    <Panel title="Display settings" icon={Type}>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Chord & lyric size</label>
            <span className="text-xs font-mono text-[var(--color-ink-muted)] tabular-nums">{fontSize}px</span>
          </div>
          <input
            type="range" min="10" max="28" step="1" value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>
        <Select label="Font" value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
          {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
        <p className="text-xs text-[var(--color-ink-muted)]">Saved to this browser. Applies to every song sheet.</p>
      </div>
    </Panel>
  )
}

// ─── Admin: user & role management ───────────────────────────────────────────
function AdminPanel({ meUserId }) {
  const toast = useToast()
  const [users, setUsers] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    setError(null)
    supabaseProfileOps.listAll()
      .then(setUsers)
      .catch(e => { setError(e.message); setUsers([]) })
  }, [])

  useEffect(() => { load() }, [load])

  const changeRole = async (u, nextRole) => {
    if (nextRole === u.role) return
    if (u.id === meUserId && nextRole !== 'superuser') {
      const ok = window.confirm('Change your own role away from superuser? You will immediately lose superuser access and can\'t change it back yourself.')
      if (!ok) return
    }
    setBusyId(u.id)
    try {
      await supabaseProfileOps.setRole(u.id, nextRole)
      setUsers(prev => prev.map(p => p.id === u.id ? { ...p, role: nextRole } : p))
      toast?.success?.(`${u.email || 'User'} is now ${nextRole}`)
    } catch (e) {
      toast?.error?.(`Couldn't update role: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const onlySelf = Array.isArray(users) && users.length <= 1

  return (
    <div className="border border-[var(--color-accent)] rounded-lg bg-[var(--color-accent-soft)] p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
          <ShieldCheck size={15} className="text-[var(--color-accent)]" /> Admin · User management
        </h2>
        {Array.isArray(users) && (
          <Badge variant="default">{users.length} user{users.length === 1 ? '' : 's'}</Badge>
        )}
      </div>
      <p className="text-xs text-[var(--color-ink-muted)] mb-4">
        Set each person's role. Changes take effect on their next page load. Enforced by Postgres RLS — see ROLES.md.
      </p>

      {/* Role legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {['member', 'leader', 'superuser'].map(r => {
          const info = ROLE_INFO[r]
          const Icon = info.icon
          return (
            <div key={r} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-warm)] p-3">
              <div className="flex items-center gap-1.5 mb-1.5 text-[var(--color-ink)]">
                <Icon size={13} className={r === 'superuser' ? 'text-[var(--color-accent)]' : ''} />
                <span className="text-xs font-semibold">{info.label}</span>
              </div>
              <ul className="space-y-0.5">
                {info.can.map(c => (
                  <li key={c} className="flex items-start gap-1 text-[10px] text-[var(--color-ink-soft)]">
                    <Check size={10} className="text-green-500 mt-0.5 shrink-0" /> {c}
                  </li>
                ))}
                {info.cannot.map(c => (
                  <li key={c} className="flex items-start gap-1 text-[10px] text-[var(--color-ink-muted)]">
                    <X size={10} className="text-red-400 mt-0.5 shrink-0" /> {c}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800">
          <AlertCircle size={13} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {users === null ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
      ) : (
        <>
          {onlySelf && !error && (
            <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-[var(--color-bg-warm)] border border-[var(--color-border)]">
              <Users size={13} className="text-[var(--color-ink-muted)] mt-0.5 shrink-0" />
              <p className="text-xs text-[var(--color-ink-soft)]">
                Only your own profile is visible. To list and manage every user, run the role SQL block in ROLES.md
                (it adds the "superuser reads all profiles" / "superuser updates profiles" policies and an email column).
              </p>
            </div>
          )}
          <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-bg-warm)]">
            {users.map(u => {
              const isMe = u.id === meUserId
              return (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-ink)] text-[var(--color-bg)] flex items-center justify-center text-sm shrink-0">
                    {(u.email || u.id || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-[var(--color-ink)] truncate">{u.email || `${u.id.slice(0, 8)}…`}</span>
                      {isMe && <span className="text-[10px] text-[var(--color-ink-muted)]">(you)</span>}
                    </div>
                    <span className="text-[10px] text-[var(--color-ink-muted)] font-mono">joined {formatDate(u.created_at)}</span>
                  </div>
                  <RoleBadge role={u.role} />
                  <Select
                    value={u.role}
                    disabled={busyId === u.id}
                    onChange={(e) => changeRole(u, e.target.value)}
                    className="w-32 shrink-0"
                    title="Set role"
                  >
                    <option value="member">Member</option>
                    <option value="leader">Leader</option>
                    <option value="superuser">Superuser</option>
                  </Select>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Shared bits ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)] p-4">
      <div className="flex items-center gap-1.5 text-[var(--color-ink-muted)] mb-1">
        <Icon size={13} />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="font-display text-2xl text-[var(--color-ink)] tabular-nums">{value}</div>
    </div>
  )
}

function Panel({ title, icon: Icon, children }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)] p-4">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wide mb-3">
        <Icon size={13} /> {title}
      </h2>
      {children}
    </div>
  )
}
