import React, { useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, FileUp, CheckCircle, XCircle, Edit3,
  ChevronDown, ChevronUp, AlertTriangle, Save, X, Check,
  Music2, ArrowRight, Loader2, RotateCcw
} from 'lucide-react'
import { importDocument } from '../lib/docImport'
import { ingest } from '../lib/ingestion'
import { supabaseSongOps } from '../lib/supabaseOps'
import { Button, Input, Textarea, TagInput, Badge, ErrorState } from '../components/ui'
import SongRenderer from '../components/song/SongRenderer'

// ─── States ────────────────────────────────────────────────────────────────
// idle → uploading → reviewing → saving → done

export default function ImportView() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [phase, setPhase] = useState('idle') // idle | uploading | reviewing | conflicts | saving | done
  const [songs, setSongs] = useState([]) // ImportedSong[]
  const [conflicts, setConflicts] = useState([]) // { importedSong, existingSong, resolution, newTitle }
  const [error, setError] = useState(null)
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 })
  const [savedCount, setSavedCount] = useState(0)

  // ── File handler ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['docx', 'pdf'].includes(ext)) {
      setError('Please upload a .docx or .pdf file.')
      return
    }
    setError(null)
    setPhase('uploading')
    try {
      const imported = await importDocument(file)
      setSongs(imported)
      setPhase('reviewing')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // ── Per-song updates ──────────────────────────────────────────────────────
  const updateSong = useCallback((id, updates) => {
    setSongs(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }, [])

  const acceptSong = (id) => updateSong(id, { status: 'accepted' })
  const discardSong = (id) => updateSong(id, { status: 'discarded' })
  const restoreSong = (id) => updateSong(id, { status: 'pending' })

  // Accept all pending at once
  const acceptAll = () => {
    setSongs(prev => prev.map(s =>
      s.status === 'pending' ? { ...s, status: 'accepted' } : s
    ))
  }

  // ── Save accepted songs ───────────────────────────────────────────────────
  const handleSave = async () => {
    const toSave = songs.filter(s => s.status === 'accepted' || s.status === 'edited')
    if (toSave.length === 0) return

    const existing = await supabaseSongOps.getByTitles(toSave.map(s => s.title))
    if (existing.length > 0) {
      const conflictList = existing.map(ex => {
        const imported = toSave.find(s => s.title.toLowerCase() === ex.title.toLowerCase())
        return { importedSong: imported, existingSong: ex, resolution: 'skip', newTitle: imported.title + ' (2)', incomingEdits: null, existingEdits: null }
      })
      setConflicts(conflictList)
      setPhase('conflicts')
      return
    }

    await executeSave(toSave, [])
  }

  const executeSave = async (toSave, resolvedConflicts) => {
    setPhase('saving')
    setSaveProgress({ done: 0, total: toSave.length })
    let saved = 0

    const conflictMap = Object.fromEntries(resolvedConflicts.map(c => [c.importedSong.id, c]))

    for (const song of toSave) {
      const conflict = conflictMap[song.id]
      try {
        if (conflict) {
          const ie = conflict.incomingEdits
          const incRaw = ie?.raw_content ?? song.rawContent
          const incParsed = ie ? ingest(incRaw, ie.title ?? song.title) : null
          const inc = {
            title: ie?.title ?? song.title,
            artist: ie?.artist ?? song.artist ?? '',
            original_key: ie?.original_key ?? song.original_key,
            raw_content: incRaw,
            parsed_content: incParsed?.parsed_content ?? song.parsed_content,
            tags: song.tags || [],
          }

          const applyExistingEdits = async () => {
            const ee = conflict.existingEdits
            if (!ee) return
            const exParsed = ee.raw_content ? ingest(ee.raw_content, ee.title) : null
            await supabaseSongOps.update(conflict.existingSong.id, {
              title: ee.title, artist: ee.artist, original_key: ee.original_key,
              raw_content: ee.raw_content,
              ...(exParsed ? { parsed_content: exParsed.parsed_content } : {}),
            })
          }

          if (conflict.resolution === 'replace') {
            await supabaseSongOps.update(conflict.existingSong.id, inc)
            saved++
          } else if (conflict.resolution === 'keep-both') {
            await supabaseSongOps.create({ ...inc, title: conflict.newTitle || inc.title + ' (2)' })
            await applyExistingEdits()
            saved++
          } else {
            // skip — still apply any existing edits the user made
            await applyExistingEdits()
          }
        } else {
          await supabaseSongOps.create({
            title: song.title, artist: song.artist || '',
            raw_content: song.rawContent, parsed_content: song.parsed_content,
            original_key: song.original_key, tags: song.tags || [],
          })
          saved++
        }
      } catch (e) {
        console.error('Failed to save song:', song.title, e)
      }
      setSaveProgress(p => ({ ...p, done: p.done + 1 }))
    }

    setSavedCount(saved)
    setPhase('done')
  }

  const updateConflict = (importedId, updates) => {
    setConflicts(prev => prev.map(c => c.importedSong.id === importedId ? { ...c, ...updates } : c))
  }

  const acceptedCount = songs.filter(s => s.status === 'accepted' || s.status === 'edited').length
  const pendingCount = songs.filter(s => s.status === 'pending').length

  // ── Render phases ─────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4 animate-fade-in">
        <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto">
          <CheckCircle size={24} className="text-green-600 dark:text-green-400" />
        </div>
        <h2 className="font-display text-2xl text-[var(--color-ink)]">
          {savedCount} {savedCount === 1 ? 'song' : 'songs'} imported
        </h2>
        <p className="text-sm text-[var(--color-ink-soft)]">
          All accepted songs have been added to your library.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="primary" onClick={() => navigate('/')}>
            <Music2 size={14} /> Go to library
          </Button>
          <Button variant="secondary" onClick={() => { setPhase('idle'); setSongs([]) }}>
            Import another
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'conflicts') {
    const toSave = songs.filter(s => s.status === 'accepted' || s.status === 'edited')
    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-amber-500" />
            <h1 className="font-display text-2xl text-[var(--color-ink)]">Duplicate songs found</h1>
          </div>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {conflicts.length} {conflicts.length === 1 ? 'song already exists' : 'songs already exist'} in your library. Choose what to do with each.
          </p>
        </div>

        <div className="space-y-3">
          {conflicts.map(conflict => (
            <ConflictCard
              key={conflict.importedSong.id}
              conflict={conflict}
              onChange={updates => updateConflict(conflict.importedSong.id, updates)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
          <Button variant="ghost" size="sm" onClick={() => setPhase('reviewing')}>
            ← Back to review
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => executeSave(toSave, conflicts)}
          >
            <Save size={13} /> Continue saving
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'saving') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <Loader2 size={28} className="animate-spin mx-auto text-[var(--color-ink-muted)]" />
        <p className="text-sm text-[var(--color-ink-soft)]">
          Saving {saveProgress.done} / {saveProgress.total}…
        </p>
      </div>
    )
  }

  if (phase === 'uploading') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <Loader2 size={28} className="animate-spin mx-auto text-[var(--color-ink-muted)]" />
        <p className="text-sm text-[var(--color-ink-soft)]">Reading document and detecting songs…</p>
      </div>
    )
  }

  if (phase === 'idle') {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <div>
          <h1 className="font-display text-2xl text-[var(--color-ink)]">Import Document</h1>
          <p className="text-sm text-[var(--color-ink-soft)] mt-1">
            Upload a Word (.docx) or PDF file containing one or more chord sheets.
            ChordVault will detect each song and let you review before saving.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 border border-red-200 bg-red-50 rounded text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-12 text-center transition-colors hover:border-[var(--color-ink-muted)] cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={(e) => e.currentTarget.classList.add('border-[var(--color-ink)]')}
          onDragLeave={(e) => e.currentTarget.classList.remove('border-[var(--color-ink)]')}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-[var(--color-border)] flex items-center justify-center group-hover:border-[var(--color-ink-muted)] transition-colors">
              <FileUp size={20} className="text-[var(--color-ink-muted)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-ink)]">
                Drop a file here, or click to browse
              </p>
              <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                Supports .docx (Word) and .pdf
              </p>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {/* Format hints */}
        <div className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)] space-y-2">
          <p className="text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wide">
            Supported format
          </p>
          <div className="font-mono text-xs text-[var(--color-ink-soft)] space-y-1">
            <p className="font-bold">1. The Joy (F)</p>
            <p className="text-[var(--color-ink-muted)]">[Verse 1]</p>
            <p><span className="font-bold text-[var(--color-ink)]">F</span>{'         '}<span className="font-bold text-[var(--color-ink)]">Dm</span></p>
            <p>This is the day You made</p>
            <p className="mt-2 font-bold">2. Amazing Grace (G)</p>
            <p className="text-[var(--color-ink-muted)]">…</p>
          </div>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Song titles are detected by "1. Name (Key)" numbering or bold headings.
            Each song gets its own review card.
          </p>
        </div>
      </div>
    )
  }

  // ── Review phase ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-[var(--color-ink)]">
            Review {songs.length} detected {songs.length === 1 ? 'song' : 'songs'}
          </h1>
          <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
            {acceptedCount} accepted · {pendingCount} pending ·{' '}
            {songs.filter(s => s.status === 'discarded').length} discarded
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pendingCount > 0 && (
            <Button variant="secondary" size="sm" onClick={acceptAll}>
              <Check size={13} /> Accept all
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={acceptedCount === 0}
          >
            <Save size={13} /> Save {acceptedCount} {acceptedCount === 1 ? 'song' : 'songs'}
          </Button>
        </div>
      </div>

      {/* Song cards */}
      <div className="space-y-3">
        {songs.map((song, index) => (
          <ImportSongCard
            key={song.id}
            song={song}
            index={index}
            onAccept={() => acceptSong(song.id)}
            onDiscard={() => discardSong(song.id)}
            onRestore={() => restoreSong(song.id)}
            onUpdate={(updates) => updateSong(song.id, updates)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Conflict Card ─────────────────────────────────────────────────────────

function ConflictCard({ conflict, onChange }) {
  const { importedSong, existingSong, resolution, newTitle, incomingEdits, existingEdits } = conflict
  const [showEditor, setShowEditor] = useState(false)

  // Local edit state — synced to parent only on Apply
  const [incTitle, setIncTitle] = useState(importedSong.title)
  const [incArtist, setIncArtist] = useState(importedSong.artist || '')
  const [incKey, setIncKey] = useState(importedSong.original_key || '')
  const [incContent, setIncContent] = useState(importedSong.rawContent || '')

  const [exTitle, setExTitle] = useState(existingSong.title)
  const [exArtist, setExArtist] = useState(existingSong.artist || '')
  const [exKey, setExKey] = useState(existingSong.original_key || '')
  const [exContent, setExContent] = useState(existingSong.raw_content || '')

  const incPreview = useMemo(() => incContent.trim() ? ingest(incContent, incTitle) : null, [incContent, incTitle])
  const exPreview = useMemo(() => exContent.trim() ? ingest(exContent, exTitle) : null, [exContent, exTitle])

  const hasEdits = incomingEdits || existingEdits

  const applyEdits = () => {
    onChange({
      incomingEdits: { title: incTitle, artist: incArtist, original_key: incKey, raw_content: incContent },
      existingEdits: { title: exTitle, artist: exArtist, original_key: exKey, raw_content: exContent },
    })
    setShowEditor(false)
  }

  const discardEdits = () => {
    setIncTitle(importedSong.title); setIncArtist(importedSong.artist || '')
    setIncKey(importedSong.original_key || ''); setIncContent(importedSong.rawContent || '')
    setExTitle(existingSong.title); setExArtist(existingSong.artist || '')
    setExKey(existingSong.original_key || ''); setExContent(existingSong.raw_content || '')
    onChange({ incomingEdits: null, existingEdits: null })
    setShowEditor(false)
  }

  const displayInc = incomingEdits ?? importedSong
  const displayEx = existingEdits ?? existingSong

  return (
    <div className="border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800">
        <AlertTriangle size={13} className="text-amber-500 shrink-0" />
        <span className="text-sm font-semibold text-[var(--color-ink)]">{displayInc.title}</span>
        {displayInc.artist && <span className="text-xs text-[var(--color-ink-muted)]">— {displayInc.artist}</span>}
        {hasEdits && <span className="ml-auto text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Edited</span>}
      </div>

      {/* Collapsed summary */}
      {!showEditor && (
        <div className="grid grid-cols-2 divide-x divide-[var(--color-border)] text-xs">
          <div className="p-3 bg-[var(--color-bg-warm)]">
            <p className="font-medium text-[var(--color-ink-muted)] uppercase tracking-wide text-[10px] mb-1">In library</p>
            <p className="font-medium text-[var(--color-ink)]">{displayEx.title ?? existingSong.title}</p>
            <p className="text-[var(--color-ink-muted)]">{displayEx.artist || existingSong.artist || <span className="italic opacity-50">no artist</span>}</p>
          </div>
          <div className="p-3 bg-[var(--color-bg)]">
            <p className="font-medium text-[var(--color-ink-muted)] uppercase tracking-wide text-[10px] mb-1">Importing</p>
            <p className="font-medium text-[var(--color-ink)]">{displayInc.title ?? importedSong.title}</p>
            <p className="text-[var(--color-ink-muted)]">{displayInc.artist || importedSong.artist || <span className="italic opacity-50">no artist</span>}</p>
          </div>
        </div>
      )}

      {/* Side-by-side editor */}
      {showEditor && (
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="grid grid-cols-2 gap-4">
            {/* Existing */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wide border-b border-[var(--color-border)] pb-1">In library</p>
              <Input label="Title" value={exTitle} onChange={e => setExTitle(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Artist" value={exArtist} onChange={e => setExArtist(e.target.value)} />
                <Input label="Key" value={exKey} onChange={e => setExKey(e.target.value)} placeholder="e.g. G" />
              </div>
              <Textarea label="Chord sheet" value={exContent} onChange={e => setExContent(e.target.value)} className="h-44 font-mono text-xs" spellCheck={false} />
              {exPreview && (
                <div className="border border-[var(--color-border)] rounded p-2 max-h-36 overflow-y-auto bg-[var(--color-bg-warm)]">
                  <SongRenderer parsedContent={exPreview.parsed_content} semitones={0} />
                </div>
              )}
            </div>

            {/* Incoming */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wide border-b border-[var(--color-border)] pb-1">Importing</p>
              <Input label="Title" value={incTitle} onChange={e => setIncTitle(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Artist" value={incArtist} onChange={e => setIncArtist(e.target.value)} />
                <Input label="Key" value={incKey} onChange={e => setIncKey(e.target.value)} placeholder="e.g. G" />
              </div>
              <Textarea label="Chord sheet" value={incContent} onChange={e => setIncContent(e.target.value)} className="h-44 font-mono text-xs" spellCheck={false} />
              {incPreview && (
                <div className="border border-[var(--color-border)] rounded p-2 max-h-36 overflow-y-auto bg-[var(--color-bg-warm)]">
                  <SongRenderer parsedContent={incPreview.parsed_content} semitones={0} />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--color-border)]">
            <button onClick={discardEdits} className="text-xs text-red-500 hover:text-red-600 transition-colors">
              Discard edits
            </button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowEditor(false)}>
                <X size={13} /> Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={applyEdits}>
                <Check size={13} /> Apply edits
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resolution controls */}
      <div className="px-4 py-3 bg-[var(--color-bg)] border-t border-[var(--color-border)] space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: 'skip', label: 'Skip import' },
            { value: 'replace', label: 'Replace existing' },
            { value: 'keep-both', label: 'Keep both' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange({ resolution: opt.value })}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                resolution === opt.value
                  ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]'
                  : 'border-[var(--color-border)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              {opt.label}
            </button>
          ))}

          <button
            onClick={() => setShowEditor(e => !e)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              showEditor
                ? 'border-[var(--color-ink-muted)] text-[var(--color-ink)]'
                : hasEdits
                  ? 'border-blue-400 text-blue-600 dark:border-blue-600 dark:text-blue-400'
                  : 'border-[var(--color-border)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            <Edit3 size={11} />
            {showEditor ? 'Hide editor' : hasEdits ? 'Edit (modified)' : 'Compare & Edit'}
          </button>
        </div>

        {resolution === 'keep-both' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-ink-muted)] shrink-0">New title for import:</span>
            <input
              type="text"
              value={newTitle}
              onChange={e => onChange({ newTitle: e.target.value })}
              className="flex-1 text-xs px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink-muted)]"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Import Song Card ──────────────────────────────────────────────────────

function ImportSongCard({ song, index, onAccept, onDiscard, onRestore, onUpdate }) {
  const [expanded, setExpanded] = useState(index < 3) // first 3 expanded by default
  const [editing, setEditing] = useState(false)

  const isAccepted = song.status === 'accepted' || song.status === 'edited'
  const isDiscarded = song.status === 'discarded'

  return (
    <div className={`
      border rounded-lg overflow-hidden transition-all duration-150
      ${isDiscarded
        ? 'border-[var(--color-border)] opacity-50'
        : isAccepted
          ? 'border-green-400 dark:border-green-700'
          : 'border-[var(--color-border)]'
      }
    `}>
      {/* Card header */}
      <div className={`
        flex items-center gap-3 px-4 py-3
        ${isAccepted ? 'bg-green-50 dark:bg-green-950' : 'bg-[var(--color-bg-warm)]'}
      `}>
        {/* Status icon */}
        <div className="shrink-0">
          {isAccepted
            ? <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
            : isDiscarded
              ? <XCircle size={16} className="text-[var(--color-ink-muted)]" />
              : <div className="w-4 h-4 rounded-full border-2 border-[var(--color-border)]" />
          }
        </div>

        {/* Title + key */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--color-ink)] truncate">
              {song.title}
            </span>
            {song.original_key && (
              <Badge variant="key">{song.original_key}</Badge>
            )}
            {song.artist && (
              <span className="text-xs text-[var(--color-ink-muted)]">{song.artist}</span>
            )}
            {song.has_warnings && (
              <Badge variant="warning">
                <AlertTriangle size={9} className="mr-0.5" />
                {song.uncertain_line_count} uncertain
              </Badge>
            )}
            {song.chord_count === 0 && (
              <Badge variant="warning">No chords detected</Badge>
            )}
          </div>
          <div className="text-[10px] text-[var(--color-ink-muted)] mt-0.5">
            {song.chord_count} chords · {song.parsed_content?.length || 0} lines
            {song.title_key && (
              <span className="ml-1">· key from title</span>
            )}
            {!song.title_key && song.detected_key && (
              <span className="ml-1">· key detected ({Math.round(song.detected_key.confidence * 100)}% confidence)</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {isDiscarded ? (
            <Button variant="ghost" size="xs" onClick={onRestore}>
              <RotateCcw size={11} /> Restore
            </Button>
          ) : isAccepted ? (
            <>
              <Button variant="ghost" size="xs" onClick={() => { setEditing(true); setExpanded(true) }}>
                <Edit3 size={11} /> Edit
              </Button>
              <Button variant="ghost" size="xs" onClick={onDiscard} className="text-red-400">
                <X size={11} />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="xs" onClick={() => { setEditing(true); setExpanded(true) }}>
                <Edit3 size={11} /> Edit
              </Button>
              <Button variant="danger" size="xs" onClick={onDiscard}>
                <X size={11} /> Discard
              </Button>
              <Button variant="accent" size="xs" onClick={onAccept}>
                <Check size={11} /> Accept
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpanded(e => !e)}
            className="ml-1"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </Button>
        </div>
      </div>

      {/* Expanded: edit form or preview */}
      {expanded && !isDiscarded && (
        <div className="border-t border-[var(--color-border)]">
          {editing ? (
            <EditForm
              song={song}
              onSave={(updates) => {
                // Re-parse if raw content changed
                let finalUpdates = { ...updates, status: 'edited' }
                if (updates.rawContent && updates.rawContent !== song.rawContent) {
                  const result = ingest(updates.rawContent, updates.title || song.title)
                  finalUpdates.parsed_content = result.parsed_content
                  finalUpdates.original_key = updates.original_key || result.original_key
                }
                onUpdate(finalUpdates)
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="p-4 bg-[var(--color-bg)] max-h-80 overflow-y-auto">
              <SongRenderer
                parsedContent={song.parsed_content}
                semitones={0}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Edit Form ─────────────────────────────────────────────────────────────

function EditForm({ song, onSave, onCancel }) {
  const [title, setTitle] = useState(song.title || '')
  const [artist, setArtist] = useState(song.artist || '')
  const [originalKey, setOriginalKey] = useState(song.original_key || '')
  const [rawContent, setRawContent] = useState(song.rawContent || '')
  const [tags, setTags] = useState(song.tags || [])

  // Live preview
  const liveResult = rawContent.trim() ? ingest(rawContent, title) : null

  return (
    <div className="p-4 bg-[var(--color-bg-warm)] space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Input
          label="Title *"
          value={title}
          onChange={e => setTitle(e.target.value)}
          containerClassName="sm:col-span-2"
        />
        <Input
          label="Artist"
          value={artist}
          onChange={e => setArtist(e.target.value)}
        />
        <Input
          label="Key"
          value={originalKey}
          onChange={e => setOriginalKey(e.target.value)}
          placeholder="e.g. G"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Tags</label>
        <TagInput tags={tags} onChange={setTags} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Textarea
          label="Chord sheet"
          value={rawContent}
          onChange={e => setRawContent(e.target.value)}
          className="h-52"
          spellCheck={false}
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Preview</label>
          <div className="border border-[var(--color-border)] rounded p-3 h-52 overflow-y-auto bg-[var(--color-bg)]">
            {liveResult
              ? <SongRenderer parsedContent={liveResult.parsed_content} />
              : <span className="text-xs text-[var(--color-ink-muted)] italic">Edit content to preview</span>
            }
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X size={13} /> Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onSave({ title, artist, originalKey, rawContent, tags })}
          disabled={!title.trim()}
        >
          <Check size={13} /> Save changes
        </Button>
      </div>
    </div>
  )
}
