import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Eye, EyeOff, Save } from 'lucide-react'
import { useSongs } from '../lib/hooks'
import { ingest, classifyLine } from '../lib/ingestion'
import { Button, Input, Textarea, TagInput, Badge, ErrorState } from '../components/ui'
import SongRenderer from '../components/song/SongRenderer'

export default function NewSong() {
  const navigate = useNavigate()
  const { createSong } = useSongs()

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [tags, setTags] = useState([])
  const [rawContent, setRawContent] = useState('')
  const [showPreview, setShowPreview] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [titleAutoDetected, setTitleAutoDetected] = useState(false)
  const [artistAutoDetected, setArtistAutoDetected] = useState(false)

  // Live parse result
  const ingestionResult = rawContent.trim() ? ingest(rawContent, title) : null

  const handleRawContentChange = (e) => {
    let content = e.target.value

    // Auto-detect title (and optionally artist) from first non-blank line when title is empty.
    // Handles formats like:
    //   "2. TRIBES – Victory Worship (G)"  → title=TRIBES, artist=Victory Worship
    //   "1. Amazing Grace (F)"             → title=Amazing Grace
    //   "Lord I Need You (F)"              → title=Lord I Need You
    if (!title.trim() && content.trim()) {
      const contentLines = content.split('\n')
      const firstIdx = contentLines.findIndex(l => l.trim())
      if (firstIdx !== -1) {
        const firstLine = contentLines[firstIdx].trim()
        if (
          classifyLine(firstLine) === 'lyric_line' &&
          firstLine.length > 1 &&
          firstLine.length < 120
        ) {
          // Artist extraction: only when key annotation is present — that's the reliable
          // signal for "Song – Artist (Key)" vs a dash in the song title itself.
          const artistMatch = firstLine.match(
            /[–\-]\s*([^(\-–]+?)\s*\((?:Key\s*)?[A-G][#b]?\s*(?:major|minor|maj|min)?\s*\)/i
          )
          const detectedArtist = artistMatch ? artistMatch[1].trim() : ''

          let detected = firstLine
            .replace(/\s*\((?:Key\s*)?[A-G][#b]?\s*(?:major|minor|maj|min)?\s*\)\s*$/i, '')
            .replace(/^\d+[\.\)]\s+/, '')
            .trim()

          // Strip artist credit from title
          if (detectedArtist) {
            detected = detected.replace(/\s*[–\-]\s*.+$/, '').trim()
          }

          if (detected.length > 0) {
            setTitle(detected)
            setTitleAutoDetected(true)
            if (detectedArtist && !artist.trim()) {
              setArtist(detectedArtist)
              setArtistAutoDetected(true)
            }
            contentLines.splice(firstIdx, 1)
            while (contentLines.length > 0 && !contentLines[0].trim()) contentLines.shift()
            content = contentLines.join('\n')
          }
        }
      }
    }

    setRawContent(content)
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    if (!rawContent.trim()) { setError('Chord sheet content is required'); return }
    setSaving(true)
    setError(null)
    try {
      const { song } = await createSong(rawContent, title.trim(), artist.trim(), tags)
      navigate(`/songs/${song.id}`)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-[var(--color-ink)]">Add Song</h1>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={saving}
          disabled={!title.trim() || !rawContent.trim()}
        >
          <Save size={14} /> Save song
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 border border-red-200 bg-red-50 rounded text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)]">
        <div className="flex flex-col gap-1">
          <Input
            label="Song title *"
            placeholder="e.g. Amazing Grace"
            value={title}
            onChange={e => { setTitle(e.target.value); setTitleAutoDetected(false) }}
          />
          {titleAutoDetected && (
            <p className="text-[10px] text-[var(--color-ink-muted)]">Title auto-detected from content</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Input
            label="Artist / Songwriter"
            placeholder="e.g. John Newton"
            value={artist}
            onChange={e => { setArtist(e.target.value); setArtistAutoDetected(false) }}
          />
          {artistAutoDetected && (
            <p className="text-[10px] text-[var(--color-ink-muted)]">Artist auto-detected from content</p>
          )}
        </div>
        <div className="sm:col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">
            Tags
          </label>
          <TagInput tags={tags} onChange={setTags} placeholder="worship, sunday, fast…" />
        </div>
      </div>

      {/* Editor + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw editor */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">
              Paste chord sheet
            </label>
            {ingestionResult && (
              <IngestionStatus result={ingestionResult} />
            )}
          </div>
          <Textarea
            value={rawContent}
            onChange={handleRawContentChange}
            placeholder={PASTE_PLACEHOLDER}
            className="h-[500px] leading-relaxed"
            spellCheck={false}
          />
          <p className="text-[10px] text-[var(--color-ink-muted)]">
            Supports standard chord-above-lyric format and inline [chord] format.
            Chords are detected automatically.
          </p>
        </div>

        {/* Live preview */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">
              Preview
            </label>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowPreview(p => !p)}
            >
              {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
              {showPreview ? 'Hide' : 'Show'}
            </Button>
          </div>

          {showPreview && (
            <div className="border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-bg)] h-[500px] overflow-y-auto">
              {ingestionResult ? (
                <SongRenderer
                  parsedContent={ingestionResult.parsed_content}
                  onLineTypeOverride={(idx, type) => {
                    // In live preview mode, overrides are visual only
                    // They'll be saved when the user saves the song
                  }}
                />
              ) : (
                <p className="text-xs text-[var(--color-ink-muted)] italic">
                  Start typing or paste a chord sheet on the left to see the preview.
                </p>
              )}
            </div>
          )}

          {/* Key detection result */}
          {ingestionResult?.original_key && (
            <div className="flex items-center gap-2 p-2 border border-[var(--color-border)] rounded text-xs bg-[var(--color-bg-warm)]">
              <span className="text-[var(--color-ink-muted)]">Detected key:</span>
              <Badge variant="key">{ingestionResult.original_key}</Badge>
              {ingestionResult.detected_key?.confidence && (
                <span className="text-[var(--color-ink-muted)]">
                  ({Math.round(ingestionResult.detected_key.confidence * 100)}% confidence)
                </span>
              )}
              {ingestionResult.key_mismatch && (
                <Badge variant="warning">⚠ Mismatch with title</Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function IngestionStatus({ result }) {
  const warnings = result.uncertain_line_count + (result.key_mismatch ? 1 : 0)
  if (warnings === 0) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
        <CheckCircle size={11} /> Parsed OK
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
      <AlertTriangle size={11} /> {warnings} {warnings === 1 ? 'warning' : 'warnings'}
    </span>
  )
}

const PASTE_PLACEHOLDER = `[Verse 1]
G              Em
Amazing grace how sweet the sound
C              G
That saved a wretch like me

[Chorus]
G
I once was lost
C          G
But now am found`
