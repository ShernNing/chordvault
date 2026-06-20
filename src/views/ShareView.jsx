import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Music2, ExternalLink, Hash, Printer } from 'lucide-react'
import { getShare } from '../lib/shares'
import {
  transposeKey,
  getCapoShapeKey,
  getCapoDisplay,
  semitonesFromKeyToKey,
} from '../lib/transposition'
import SongRenderer from '../components/song/SongRenderer'
import TransposeControls from '../components/song/TransposeControls'
import { Button, Badge, ErrorState, Skeleton } from '../components/ui'

export default function ShareView() {
  const { token } = useParams()
  const [share, setShare] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getShare(token)
      .then((s) => { if (alive) setShare(s) })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [token])

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      {/* Minimal public header — branding + read-only badge, no app nav */}
      <header className="sticky top-0 z-40 bg-[var(--color-bg)] border-b border-[var(--color-border)] no-print">
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-[var(--color-ink)] rounded flex items-center justify-center">
              <Music2 size={14} className="text-[var(--color-bg)]" />
            </div>
            <span className="font-display text-base tracking-tight hidden sm:block text-[var(--color-ink)]">
              ChordVault
            </span>
            <Badge variant="default">shared · read-only</Badge>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={() => window.print()} title="Print">
              <Printer size={14} />
            </Button>
            <Link to="/">
              <Button variant="secondary" size="sm">
                Open ChordVault <ExternalLink size={12} />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-7 w-1/3" />
            <Skeleton className="h-64" />
          </div>
        ) : error ? (
          <ErrorState message={error} />
        ) : share?.kind === 'song' ? (
          <SharedSong payload={share.payload} />
        ) : share?.kind === 'setlist' ? (
          <SharedSetlist payload={share.payload} />
        ) : (
          <ErrorState message="This link could not be displayed." />
        )}
      </main>
    </div>
  )
}

// ─── Shared song ─────────────────────────────────────────────────────────────

function SharedSong({ payload }) {
  const [semitones, setSemitones] = useState(0)
  const [capo, setCapo] = useState(0)
  const [nashville, setNashville] = useState(false)

  const song = payload
  const displayKey = song.original_key ? transposeKey(song.original_key, semitones) : null
  const shapeKey = getCapoShapeKey(displayKey, capo)
  const shapeSemitones = semitones - capo

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-mono text-base font-bold text-[var(--color-ink)] leading-tight">
          {song.title}
          {song.original_key && (
            <span className="ml-1">({displayKey || song.original_key})</span>
          )}
        </h1>
        {song.artist && <p className="text-xs text-[var(--color-ink-soft)] mt-0.5">{song.artist}</p>}
      </div>

      {song.original_key && (
        <div className="no-print">
          <TransposeControls
            originalKey={song.original_key}
            semitones={semitones}
            capo={capo}
            onChange={(s, c) => { setSemitones(s); setCapo(c) }}
            nashville={nashville}
            onToggleNashville={() => setNashville((v) => !v)}
          />
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] p-6 md:p-8">
        <SongRenderer
          parsedContent={song.parsed_content}
          semitones={shapeSemitones}
          targetKey={shapeKey}
          nashville={nashville}
        />
      </div>
    </div>
  )
}

// ─── Shared setlist ──────────────────────────────────────────────────────────

function SharedSetlist({ payload }) {
  const songs = payload.songs || []
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-[var(--color-ink)]">{payload.name}</h1>
        <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
          {songs.length} {songs.length === 1 ? 'song' : 'songs'}
        </p>
      </div>
      {songs.map((s, i) => (
        <SetlistSong key={i} song={s} number={i + 1} />
      ))}
    </div>
  )
}

function SetlistSong({ song, number }) {
  const displayKey = song.chosen_key || song.original_key
  const semitones = song.chosen_key && song.original_key
    ? semitonesFromKeyToKey(song.original_key, song.chosen_key)
    : 0
  const capo = song.capo || 0
  const shapeSemitones = semitones - capo
  const shapeKey = capo > 0 && displayKey ? transposeKey(displayKey, -capo) : displayKey
  const capoHint = displayKey && capo > 0 ? getCapoDisplay(displayKey, capo) : null

  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] p-6">
      <div className="flex items-baseline gap-2 flex-wrap mb-3">
        <span className="font-mono text-sm font-bold text-[var(--color-ink)]">
          {number}. {song.title}
          {displayKey && <span className="ml-1">({displayKey}{capo > 0 ? `, capo ${capo}` : ''})</span>}
        </span>
        {song.artist && <span className="text-xs text-[var(--color-ink-soft)]">{song.artist}</span>}
      </div>
      {capoHint && (
        <p className="text-[10px] text-[var(--color-ink-muted)] font-mono mb-2 flex items-center gap-1">
          <Hash size={9} /> {capoHint}
        </p>
      )}
      <SongRenderer
        parsedContent={song.parsed_content}
        semitones={shapeSemitones}
        targetKey={shapeKey}
      />
    </div>
  )
}
