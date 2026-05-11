import React, { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Edit3, Save, X, Columns2, FileDown,
  Trash2, Music2, AlertTriangle, Check, RefreshCw
} from 'lucide-react'
import { useSong, useLocalStorage } from '../lib/hooks'
import { transposeKey, getCapoDisplay } from '../lib/transposition'
import { exportSongToPDF, createPrintContainer } from '../lib/pdf'
import { ingest } from '../lib/ingestion'
import {
  Button, Input, Textarea, TagInput, Badge, Modal,
  EmptyState, ErrorState, SongViewSkeleton, Tooltip
} from '../components/ui'
import SongRenderer, { PrintableSongSheet } from '../components/song/SongRenderer'
import TransposeControls from '../components/song/TransposeControls'

export default function SongView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { song, loading, error, reload, update } = useSong(id)

  // Per-song transpose state stored in localStorage
  const [transpose, setTranspose] = useLocalStorage(`cv-transpose-${id}`, { semitones: 0, capo: 0 })
  const [twoColumn, setTwoColumn] = useLocalStorage(`cv-2col-${id}`, 'auto')

  const [isEditing, setIsEditing] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [exporting, setExporting] = useState(false)

  const printRef = useRef(null)

  if (loading) return <SongViewSkeleton />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!song) return <ErrorState message="Song not found" />

  const displayKey = song.original_key
    ? transposeKey(song.original_key, transpose.semitones)
    : null

  const handleTransposeChange = (semitones, capo) => {
    setTranspose({ semitones, capo })
  }

  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const container = createPrintContainer()
      // Render a PrintableSongSheet into the container
      const { createRoot } = await import('react-dom/client')
      const root = createRoot(container)
      root.render(
        <PrintableSongSheet
          song={song}
          semitones={transpose.semitones}
          targetKey={displayKey}
          keyLabel={displayKey ? `${displayKey}${transpose.capo > 0 ? ` (capo ${transpose.capo})` : ''}` : null}
        />
      )
      // Wait for render
      await new Promise(r => setTimeout(r, 300))
      await exportSongToPDF(song.title, displayKey || song.original_key, container)
      root.unmount()
      document.body.removeChild(container)
    } catch (e) {
      console.error('PDF export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* ── Breadcrumb ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Link to="/" className="flex items-center gap-1 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors">
          <ArrowLeft size={12} /> Library
        </Link>
        <span className="text-xs text-[var(--color-ink-muted)]">/</span>
        <span className="text-xs text-[var(--color-ink-soft)] truncate">{song.title}</span>
      </div>

      {/* ── Song Header ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* Title styled like the printed chord sheet: bold title + key in parens */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="font-mono text-base font-bold text-[var(--color-ink)] leading-tight">
              {song.title}
              {song.original_key && (
                <span className="font-mono text-base font-bold text-[var(--color-ink)] ml-1">
                  ({displayKey || song.original_key})
                </span>
              )}
            </h1>
          </div>
          {song.artist && (
            <p className="text-xs text-[var(--color-ink-soft)] mt-0.5 font-sans">{song.artist}</p>
          )}
          {song.tags?.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {song.tags.map(tag => (
                <Badge key={tag} variant="default">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0 no-print">
          <Tooltip content="Export PDF">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleExportPDF}
              loading={exporting}
              title="Export PDF"
            >
              <FileDown size={14} />
            </Button>
          </Tooltip>
          <Tooltip content={twoColumn === true ? '2-col on' : twoColumn === false ? '1-col' : '2-col auto'}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTwoColumn(c => c === 'auto' ? true : c === true ? false : 'auto')}
              className={twoColumn !== false ? 'text-[var(--color-accent)]' : ''}
              title="Toggle 2-column layout"
            >
              <Columns2 size={14} />
            </Button>
          </Tooltip>
          <Tooltip content="Edit song">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsEditing(true)}
              title="Edit song"
            >
              <Edit3 size={14} />
            </Button>
          </Tooltip>
          <Tooltip content="Delete song">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDeleteModal(true)}
              className="text-red-400 hover:text-red-600"
              title="Delete song"
            >
              <Trash2 size={14} />
            </Button>
          </Tooltip>
          <Tooltip content="Re-detect key from chords">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Re-detect key"
              onClick={async () => {
                const { extractChords, detectKey } = await import('../lib/ingestion')
                const chords = extractChords(song.parsed_content)
                const result = detectKey(chords)
                if (result?.key) await update({ original_key: result.key })
              }}
            >
              <RefreshCw size={14} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* ── Transpose Controls ────────────────────────────────────── */}
      <div className="no-print">
        <TransposeControls
          originalKey={song.original_key}
          semitones={transpose.semitones}
          capo={transpose.capo}
          onChange={handleTransposeChange}
        />
      </div>

      {/* ── Chord Sheet ───────────────────────────────────────────── */}
      <ChordSheetPage
        song={song}
        semitones={transpose.semitones}
        targetKey={displayKey}
        twoColumn={twoColumn}
        onTwoColumnChange={setTwoColumn}
        printRef={printRef}
      />

      {/* ── Edit Modal ────────────────────────────────────────────── */}
      {isEditing && (
        <EditSongModal
          song={song}
          onSave={async (updates) => {
            await update(updates)
            setIsEditing(false)
          }}
          onClose={() => setIsEditing(false)}
        />
      )}

      {/* ── Delete Modal ──────────────────────────────────────────── */}
      <Modal
        isOpen={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Delete song"
      >
        <p className="text-sm text-[var(--color-ink-soft)] mb-5">
          Are you sure you want to delete <strong>"{song.title}"</strong>?
          This will also remove it from all setlists. This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteModal(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              const { songOps } = await import('../lib/db')
              await songOps.delete(song.id)
              navigate('/')
            }}
          >
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Edit Modal ────────────────────────────────────────────────────────────

function EditSongModal({ song, onSave, onClose }) {
  const [title, setTitle] = useState(song.title || '')
  const [artist, setArtist] = useState(song.artist || '')
  const [tags, setTags] = useState(song.tags || [])
  const [rawContent, setRawContent] = useState(song.raw_content || '')
  const [originalKey, setOriginalKey] = useState(song.original_key || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Live preview of re-parsed content
  const liveResult = rawContent.trim() ? ingest(rawContent, title) : null

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        artist: artist.trim(),
        tags,
        raw_content: rawContent,
        original_key: originalKey || null,
      })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-2xl w-full max-w-5xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Edit Song</h2>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-500">{error}</span>}
            <Button variant="secondary" size="sm" onClick={onClose}>
              <X size={13} /> Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              <Save size={13} /> Save
            </Button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Metadata row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input
              label="Title *"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="sm:col-span-2"
              containerClassName="sm:col-span-2"
            />
            <Input
              label="Artist"
              value={artist}
              onChange={e => setArtist(e.target.value)}
            />
            <Input
              label="Key (override)"
              value={originalKey}
              onChange={e => setOriginalKey(e.target.value)}
              placeholder="e.g. G"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">
              Tags
            </label>
            <TagInput tags={tags} onChange={setTags} />
          </div>

          {/* Editor + Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Textarea
              label="Chord sheet"
              value={rawContent}
              onChange={e => setRawContent(e.target.value)}
              className="h-[400px]"
              spellCheck={false}
            />
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">
                Preview
              </label>
              <div className="border border-[var(--color-border)] rounded p-4 h-[400px] overflow-y-auto bg-[var(--color-bg)]">
                {liveResult ? (
                  <SongRenderer parsedContent={liveResult.parsed_content} />
                ) : (
                  <p className="text-xs text-[var(--color-ink-muted)] italic">
                    Edit the chord sheet to see changes.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ChordSheetPage ────────────────────────────────────────────────────────
// Renders the chord sheet in an A4-proportioned container.
// Auto-detects overflow and switches to 2-column when content is tall.
// twoColumn: 'auto' | true | false

function ChordSheetPage({ song, semitones, targetKey, twoColumn, onTwoColumnChange, printRef }) {
  const measureRef = React.useRef(null)
  const [isOverflowing, setIsOverflowing] = React.useState(false)

  const A4_CONTENT_HEIGHT = 920

  // Measure natural single-column height from a hidden mirror so the
  // measurement isn't contaminated when the visible content reflows into 2-col.
  React.useLayoutEffect(() => {
    if (!measureRef.current) return
    const h = measureRef.current.scrollHeight || 0
    setIsOverflowing(h > A4_CONTENT_HEIGHT)
  }, [song.parsed_content, semitones])

  const effectiveTwoCol = twoColumn === true || (twoColumn === 'auto' && isOverflowing)

  return (
    <div
      ref={printRef}
      className="relative border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] overflow-hidden"
    >
      {/* Page header strip */}
      <div className="flex items-center justify-between px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-warm)] no-print">
        <span className="text-[10px] font-mono text-[var(--color-ink-muted)] uppercase tracking-widest">
          {effectiveTwoCol ? '2 col' : '1 col'}
          {twoColumn === 'auto' && (
            <span className="ml-1 opacity-60">· auto</span>
          )}
        </span>
        {isOverflowing && twoColumn === 'auto' && (
          <span className="text-[10px] text-[var(--color-ink-muted)]">
            Switched to 2-col (content exceeds one page)
          </span>
        )}
      </div>

      {/* A4-proportioned content area */}
      <div
        className="p-8"
        style={{
          minHeight: `${A4_CONTENT_HEIGHT}px`,
        }}
      >
        <SongRenderer
          parsedContent={song.parsed_content}
          semitones={semitones}
          targetKey={targetKey}
          twoColumn={effectiveTwoCol}
        />
      </div>

      {/* Hidden single-column mirror used only to measure natural height.
          Kept in DOM (not display:none) so layout/scrollHeight is valid. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          pointerEvents: 'none',
          left: '-9999px',
          top: 0,
          width: '100%',
        }}
      >
        <div ref={measureRef} className="p-8">
          <SongRenderer
            parsedContent={song.parsed_content}
            semitones={semitones}
            targetKey={targetKey}
            twoColumn={false}
          />
        </div>
      </div>
    </div>
  )
}
