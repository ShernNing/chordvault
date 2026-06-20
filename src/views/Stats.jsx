import React from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Play, Clock, Music2, ListMusic, AlertCircle } from 'lucide-react'
import { useSongs, useSetlists } from '../lib/hooks'
import { Badge, EmptyState, ErrorState, Skeleton } from '../components/ui'

const DAY = 24 * 60 * 60 * 1000

function timeAgo(dateStr) {
  if (!dateStr) return 'never'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function Stats() {
  const { songs, loading, error, reload } = useSongs('title')
  const { setlists } = useSetlists()

  const stats = React.useMemo(() => {
    const totalPlays = songs.reduce((s, x) => s + (x.play_count || 0), 0)
    const played = songs.filter((s) => (s.play_count || 0) > 0)

    const mostPlayed = [...played]
      .sort((a, b) => (b.play_count || 0) - (a.play_count || 0))
      .slice(0, 10)

    const recent = songs
      .filter((s) => s.last_played_at)
      .sort((a, b) => new Date(b.last_played_at) - new Date(a.last_played_at))
      .slice(0, 8)

    const cutoff = Date.now() - 90 * DAY
    const stale = songs
      .filter((s) => !s.last_played_at || new Date(s.last_played_at).getTime() < cutoff)
      .sort((a, b) => {
        const av = a.last_played_at ? new Date(a.last_played_at).getTime() : 0
        const bv = b.last_played_at ? new Date(b.last_played_at).getTime() : 0
        return av - bv
      })
      .slice(0, 10)

    const keyCounts = {}
    for (const s of songs) {
      const k = s.original_key || '—'
      keyCounts[k] = (keyCounts[k] || 0) + 1
    }
    const keyDist = Object.entries(keyCounts).sort((a, b) => b[1] - a[1])
    const maxKey = keyDist.reduce((m, [, c]) => Math.max(m, c), 0)

    return { totalPlays, mostPlayed, recent, stale, keyDist, maxKey, playedCount: played.length }
  }, [songs])

  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-[var(--color-ink)] flex items-center gap-2">
          <BarChart3 size={22} /> Stats
        </h1>
        <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">Your repertoire at a glance</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : songs.length === 0 ? (
        <EmptyState
          icon={Music2}
          title="Nothing to chart yet"
          description="Add songs and start playing them — your stats build up automatically."
          action={<Link to="/songs/new"><span className="text-xs text-[var(--color-accent)]">Add a song →</span></Link>}
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Music2} label="Songs" value={songs.length} />
            <StatCard icon={ListMusic} label="Setlists" value={setlists.length} />
            <StatCard icon={Play} label="Total plays" value={stats.totalPlays} />
            <StatCard icon={Clock} label="Songs played" value={stats.playedCount} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Most played */}
            <Panel title="Most played" icon={Play}>
              {stats.mostPlayed.length === 0 ? (
                <Muted>No plays recorded yet.</Muted>
              ) : (
                <ol className="space-y-1.5">
                  {stats.mostPlayed.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-right font-mono text-[10px] text-[var(--color-ink-muted)]">{i + 1}</span>
                      <Link to={`/songs/${s.id}`} className="flex-1 min-w-0 truncate text-[var(--color-ink)] hover:underline">
                        {s.title}
                      </Link>
                      {s.original_key && <Badge variant="key">{s.original_key}</Badge>}
                      <span className="text-xs text-[var(--color-ink-muted)] tabular-nums w-12 text-right">
                        {s.play_count}×
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            {/* Key distribution */}
            <Panel title="Keys in your library" icon={BarChart3}>
              <div className="space-y-1.5">
                {stats.keyDist.map(([key, count]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-8 font-mono text-xs text-[var(--color-ink-soft)]">{key}</span>
                    <div className="flex-1 h-4 bg-[var(--color-bg)] rounded overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-accent)] rounded transition-all"
                        style={{ width: `${stats.maxKey ? (count / stats.maxKey) * 100 : 0}%`, minWidth: count ? '6px' : 0 }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs text-[var(--color-ink-muted)] tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Recently played */}
            <Panel title="Recently played" icon={Clock}>
              {stats.recent.length === 0 ? (
                <Muted>No plays recorded yet.</Muted>
              ) : (
                <ul className="space-y-1.5">
                  {stats.recent.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <Link to={`/songs/${s.id}`} className="flex-1 min-w-0 truncate text-[var(--color-ink)] hover:underline">
                        {s.title}
                      </Link>
                      <span className="text-xs text-[var(--color-ink-muted)]">{timeAgo(s.last_played_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Needs attention */}
            <Panel title="Not played in a while" icon={AlertCircle}>
              {stats.stale.length === 0 ? (
                <Muted>Everything's been played recently. Nice.</Muted>
              ) : (
                <ul className="space-y-1.5">
                  {stats.stale.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <Link to={`/songs/${s.id}`} className="flex-1 min-w-0 truncate text-[var(--color-ink)] hover:underline">
                        {s.title}
                      </Link>
                      <span className="text-xs text-[var(--color-ink-muted)]">{timeAgo(s.last_played_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

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

function Muted({ children }) {
  return <p className="text-xs text-[var(--color-ink-muted)] italic">{children}</p>
}
