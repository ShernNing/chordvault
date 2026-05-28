import React, { useMemo, useState } from 'react'
import { X, Plus, Trash2, Edit3, Check, Zap } from 'lucide-react'
import FretboardDiagram from '../voicings/FretboardDiagram'
import { voicingsForChord } from '../../lib/voicings/lookup'
import { bestTransposeFrets } from '../../lib/voicings/transpose'
import { transposeChord } from '../../lib/transposition'
import { Button, Input } from '../ui'

// Entries stored in song.original_key reference frame.
// Two entry types:
//   chord: { id, type:'chord', chord, frets:[6], label }
//   lick:  { id, type:'lick', notes:[{string,fret}], label } — string 0=low E, 5=high e
// `semitones` shifts both for live display only.

const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e']
// E/e case-sensitive (low vs high). Other letters case-insensitive.
const STRING_INDEX = { E: 0, A: 1, a: 1, D: 2, d: 2, G: 3, g: 3, B: 4, b: 4, e: 5 }
const STRING_LETTER_RE = '[EeADGBadgb]'
const MAX_FRET_INPUT = 24
const GRID_FRETS = 14
const SECTION_PRESETS = ['Intro', 'Verse 1', 'Verse 2', 'Pre-Chorus', 'Chorus', 'Bridge', 'Solo', 'Outro']
const UNSECTIONED = '__unsectioned__'
// String row order in fretboard grid: high e on top, low E on bottom (standard tab notation)
const STRING_DISPLAY_ORDER = [5, 4, 3, 2, 1, 0]
const FRET_MARKER_SINGLE = new Set([3, 5, 7, 9, 15, 17, 19, 21])
const FRET_MARKER_DOUBLE = new Set([12])
const TOTAL_FRETS = 24 // 0 (open) + 1..23

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

function entryType(e) {
  return e?.type || 'chord'
}

function groupBySection(entries) {
  // Preserve section order by first appearance. Unsectioned bucket last.
  const order = []
  const map = new Map()
  for (const e of entries) {
    const sec = (e.section || '').trim() || UNSECTIONED
    if (!map.has(sec)) { map.set(sec, []); order.push(sec) }
    map.get(sec).push(e)
  }
  // Move UNSECTIONED to end if present
  const out = []
  for (const s of order) if (s !== UNSECTIONED) out.push({ section: s, entries: map.get(s) })
  if (map.has(UNSECTIONED)) out.push({ section: UNSECTIONED, entries: map.get(UNSECTIONED) })
  return out
}

function transposeChordEntry(e, semitones, displayKey) {
  return {
    ...e,
    chord: transposeChord(e.chord, semitones, displayKey),
    frets: bestTransposeFrets(e.frets, semitones) || e.frets,
  }
}

function transposeLickEntry(e, semitones) {
  return {
    ...e,
    notes: (e.notes || []).map(n => {
      let f = n.fret + semitones
      while (f < 0) f += 12
      while (f > MAX_FRET_INPUT) f -= 12
      return { string: n.string, fret: f }
    }),
  }
}

function transposeForDisplay(entry, semitones, displayKey) {
  if (!semitones) return entry
  return entryType(entry) === 'lick'
    ? transposeLickEntry(entry, semitones)
    : transposeChordEntry(entry, semitones, displayKey)
}

export default function ElectricGuitarNotesPanel({ song, semitones = 0, displayKey = null, onSave, onClose }) {
  const stored = song.electric_guitar_notes || []
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)

  const displayed = useMemo(
    () => stored.map(e => transposeForDisplay(e, semitones, displayKey)),
    [stored, semitones, displayKey]
  )

  const startAddChord = () => {
    setDraft({ id: 'new', type: 'chord', chord: '', frets: [null, null, null, null, null, null], label: '', section: '' })
    setEditingId('new')
  }
  const startAddLick = () => {
    setDraft({ id: 'new', type: 'lick', notes: [], label: '', section: '', lickText: '' })
    setEditingId('new')
  }

  const startEdit = (entry) => {
    const live = displayed.find(e => e.id === entry.id)
    if (!live) return
    if (entryType(live) === 'lick') {
      setDraft({ ...live, notes: (live.notes || []).map(n => ({ ...n })), lickText: notesToText(live.notes) })
    } else {
      setDraft({ ...live, frets: live.frets.slice() })
    }
    setEditingId(entry.id)
  }

  const cancelEdit = () => { setDraft(null); setEditingId(null) }

  const saveEntry = async () => {
    if (!draft) return
    const type = entryType(draft)

    let finalEntry
    if (type === 'lick') {
      const notes = parseLickText(draft.lickText || '')
      if (notes.length === 0) return
      // Convert displayed → stored frame
      const storedNotes = semitones
        ? notes.map(n => {
            let f = n.fret - semitones
            while (f < 0) f += 12
            while (f > MAX_FRET_INPUT) f -= 12
            return { string: n.string, fret: f }
          })
        : notes
      finalEntry = {
        id: draft.id === 'new' ? genId() : draft.id,
        type: 'lick',
        notes: storedNotes,
        label: (draft.label || '').trim(),
        section: (draft.section || '').trim(),
      }
    } else {
      if (!draft.chord.trim()) return
      const storedChord = semitones
        ? transposeChord(draft.chord.trim(), -semitones, song.original_key)
        : draft.chord.trim()
      const storedFrets = semitones
        ? (bestTransposeFrets(draft.frets, -semitones) || draft.frets)
        : draft.frets
      finalEntry = {
        id: draft.id === 'new' ? genId() : draft.id,
        type: 'chord',
        chord: storedChord,
        frets: storedFrets,
        label: (draft.label || '').trim(),
        section: (draft.section || '').trim(),
      }
    }

    const next = draft.id === 'new'
      ? [...stored, finalEntry]
      : stored.map(e => e.id === finalEntry.id ? finalEntry : e)
    try {
      await onSave(next)
      cancelEdit()
    } catch (e) {
      // Error already surfaced by parent; keep editor open so user can retry
    }
  }

  const deleteEntry = async (id) => {
    if (!confirm('Delete this voicing?')) return
    await onSave(stored.filter(e => e.id !== id))
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 no-print" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[460px] bg-[var(--color-bg)] border-l border-[var(--color-border)] shadow-2xl no-print flex flex-col">
        <header className="flex items-center justify-between gap-3 px-4 h-12 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Zap size={16} className="text-[var(--color-ink-soft)] shrink-0" />
            <span className="font-display text-base text-[var(--color-ink)] truncate">Electric guitar voicings</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded flex items-center justify-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]"
            aria-label="Close"
          ><X size={16} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {displayed.length === 0 && editingId !== 'new' && (
            <div className="text-xs text-[var(--color-ink-muted)] italic text-center py-8">
              No voicings yet.<br />Add a chord voicing or a lick/run.
            </div>
          )}

          {groupBySection(displayed).map(({ section, entries }) => (
            <section key={section} className="space-y-1.5">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] px-1 pt-1">
                {section === UNSECTIONED ? 'No section' : section}
              </h3>
              {entries.map(entry => editingId === entry.id ? (
                <EntryEditor
                  key={entry.id}
                  draft={draft}
                  setDraft={setDraft}
                  originalKey={song.original_key}
                  onSave={saveEntry}
                  onCancel={cancelEdit}
                />
              ) : (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onEdit={() => startEdit(entry)}
                  onDelete={() => deleteEntry(entry.id)}
                />
              ))}
            </section>
          ))}

          {editingId === 'new' && (
            <EntryEditor
              draft={draft}
              setDraft={setDraft}
              originalKey={song.original_key}
              onSave={saveEntry}
              onCancel={cancelEdit}
            />
          )}
        </div>

        <footer className="border-t border-[var(--color-border)] px-3 py-2 shrink-0 space-y-1">
          {editingId !== 'new' && (
            <div className="flex gap-1">
              <Button variant="primary" size="sm" onClick={startAddChord} className="flex-1">
                <Plus size={13} /> Chord
              </Button>
              <Button variant="primary" size="sm" onClick={startAddLick} className="flex-1">
                <Plus size={13} /> Lick / Run
              </Button>
            </div>
          )}
          {semitones !== 0 && (
            <p className="text-[10px] text-[var(--color-ink-muted)] italic text-center">
              Live transposition. Save key on main page to persist.
            </p>
          )}
        </footer>
      </aside>
    </>
  )
}

// ─── Entry card display ───────────────────────────────────────────────────

function EntryCard({ entry, onEdit, onDelete }) {
  const type = entryType(entry)
  return (
    <article className="p-2 border border-[var(--color-border)] rounded bg-[var(--color-bg-warm)]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-ink-muted)]">
            {type}
          </span>
          {type === 'chord' && (
            <span className="font-mono text-sm font-bold text-[var(--color-ink)] truncate">{entry.chord}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-ink-soft)]"
            title="Edit"
          ><Edit3 size={12} /></button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-[var(--color-bg)] text-red-500"
            title="Delete"
          ><Trash2 size={12} /></button>
        </div>
      </div>

      {type === 'chord' ? (
        <div className="flex items-start gap-2">
          <div className="shrink-0" style={{ width: 120 }}>
            <FretboardDiagram frets={entry.frets} width={120} highlightRoot chordName={entry.chord} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[10px] text-[var(--color-ink-muted)]">
              {entry.frets.map(f => f == null ? 'x' : f).join(' ')}
            </div>
            {entry.label && <p className="text-xs text-[var(--color-ink-soft)] mt-1 break-words">{entry.label}</p>}
          </div>
        </div>
      ) : (
        <>
          <LickTabStrip notes={entry.notes || []} />
          {entry.label && <p className="text-xs text-[var(--color-ink-soft)] mt-1 break-words">{entry.label}</p>}
        </>
      )}
    </article>
  )
}

// ─── Editor — branches on draft.type ──────────────────────────────────────

function EntryEditor({ draft, setDraft, originalKey, onSave, onCancel }) {
  const type = entryType(draft)
  return (
    <article className="p-2 border border-[var(--color-accent)] rounded bg-[var(--color-bg-warm)] space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-accent)] text-white">
          {type === 'lick' ? 'Lick / Run' : 'Chord'}
        </span>
      </div>

      {type === 'chord'
        ? <ChordEditor draft={draft} setDraft={setDraft} />
        : <LickEditor draft={draft} setDraft={setDraft} />}

      <div>
        <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1">Section</span>
        <input
          type="text"
          list="cv-section-presets"
          placeholder="e.g. Verse 1, Chorus"
          value={draft.section || ''}
          onChange={e => setDraft({ ...draft, section: e.target.value })}
          className="w-full h-7 px-2 text-xs border border-[var(--color-border)] rounded bg-[var(--color-bg)] text-[var(--color-ink)]"
        />
        <datalist id="cv-section-presets">
          {SECTION_PRESETS.map(s => <option key={s} value={s} />)}
        </datalist>
      </div>

      <Input
        placeholder="Notes (optional) — extra detail"
        value={draft.label || ''}
        onChange={e => setDraft({ ...draft, label: e.target.value })}
        className="h-7 text-xs"
      />

      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={type === 'chord' ? !draft.chord?.trim() : parseLickText(draft.lickText || '').length === 0}
        >
          <Check size={12} /> Save
        </Button>
      </div>
    </article>
  )
}

// ─── Chord editor: click-grid + catalog picker ────────────────────────────

function ChordEditor({ draft, setDraft }) {
  const suggestions = useMemo(() => {
    const ch = draft.chord?.trim()
    if (!ch) return []
    return voicingsForChord(ch).slice(0, 8)
  }, [draft.chord])

  const setFret = (stringIdx, val) => {
    const next = [...draft.frets]
    next[stringIdx] = val
    setDraft({ ...draft, frets: next })
  }

  return (
    <>
      <Input
        placeholder="Chord (e.g. Am7, F#m, D/F#)"
        value={draft.chord || ''}
        onChange={e => setDraft({ ...draft, chord: e.target.value })}
        className="h-8 text-sm"
        autoFocus
      />

      <VoicingGrid frets={draft.frets} onSetFret={setFret} />

      {suggestions.length > 0 && (
        <div>
          <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1">
            Pick from catalog
          </span>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setDraft({ ...draft, frets: s.frets.slice() })}
                className="shrink-0 border border-[var(--color-border)] rounded hover:border-[var(--color-accent)] p-1 bg-[var(--color-bg)]"
                title={`Use ${s.frets.map(f => f == null ? 'x' : f).join(' ')}`}
              >
                <FretboardDiagram frets={s.frets} width={70} responsive={false} />
              </button>
            ))}
          </div>
        </div>
      )}

      {draft.chord?.trim() && draft.frets.some(f => f != null) && (
        <div className="flex justify-center pt-1 border-t border-[var(--color-border)]">
          <FretboardDiagram frets={draft.frets} width={130} highlightRoot chordName={draft.chord.trim()} />
        </div>
      )}
    </>
  )
}

// ─── Click-grid voicing builder ───────────────────────────────────────────

function VoicingGrid({ frets, onSetFret }) {
  const cellBase = 'border border-[var(--color-border)] rounded flex items-center justify-center cursor-pointer transition-colors text-xs font-mono select-none'
  const activeCell = 'bg-[var(--color-ink)] text-white border-[var(--color-ink)]'
  const idleCell = 'bg-[var(--color-bg)] hover:bg-[var(--color-bg-warm)] text-[var(--color-ink-soft)]'

  const Cell = ({ stringIdx, value, children }) => {
    const active = frets[stringIdx] === value
    return (
      <button
        type="button"
        onClick={() => onSetFret(stringIdx, active ? null : value)}
        className={`${cellBase} ${active ? activeCell : idleCell} aspect-square w-full`}
      >{children}</button>
    )
  }

  return (
    <div>
      <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1">
        Build voicing — click cell to set fret per string
      </span>
      <div className="grid grid-cols-6 gap-1">
        {/* mute row */}
        {STRING_LABELS.map((_, i) => (
          <Cell key={`x-${i}`} stringIdx={i} value={null}>×</Cell>
        ))}
        {/* open row */}
        {STRING_LABELS.map((_, i) => (
          <Cell key={`o-${i}`} stringIdx={i} value={0}>O</Cell>
        ))}
        {/* fret rows */}
        {Array.from({ length: GRID_FRETS }, (_, fIdx) => {
          const f = fIdx + 1
          return STRING_LABELS.map((_, i) => (
            <Cell key={`f${f}-${i}`} stringIdx={i} value={f}>
              <span className="text-[10px] opacity-60">{frets[i] === f ? f : ''}</span>
            </Cell>
          ))
        })}
        {/* string labels */}
        {STRING_LABELS.map((label, i) => (
          <div key={`l-${i}`} className="text-center text-[10px] font-mono text-[var(--color-ink-muted)]">{label}</div>
        ))}
      </div>
    </div>
  )
}

// ─── Lick editor & tab strip ──────────────────────────────────────────────

// Parse free-text lick: letters E/A/D/G/B/e set current string. Numbers add notes.
// "G 4 6 8 9 B 5 7" → string G frets 4,6,8,9 then string B frets 5,7.
// Also accepts "G:4 B:5" pair form.
function parseLickText(text) {
  if (!text) return []
  const notes = []
  let currentString = 5 // default high e
  const tokens = text.replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean)
  const pairRe = new RegExp(`^(${STRING_LETTER_RE}):?(\\d+)$`)
  const letterRe = new RegExp(`^${STRING_LETTER_RE}$`)
  for (const tok of tokens) {
    if (pairRe.test(tok)) {
      const m = tok.match(pairRe)
      const s = STRING_INDEX[m[1]]
      const f = parseInt(m[2], 10)
      if (s != null && f >= 0 && f <= MAX_FRET_INPUT) notes.push({ string: s, fret: f })
      continue
    }
    if (letterRe.test(tok)) {
      currentString = STRING_INDEX[tok]
      continue
    }
    if (/^\d+$/.test(tok)) {
      const f = parseInt(tok, 10)
      if (f >= 0 && f <= MAX_FRET_INPUT) notes.push({ string: currentString, fret: f })
      continue
    }
  }
  return notes
}

function notesToText(notes) {
  if (!notes || notes.length === 0) return ''
  let out = ''
  let prevString = null
  for (const n of notes) {
    if (n.string !== prevString) {
      out += (out ? ' ' : '') + STRING_LABELS[n.string] + ' ' + n.fret
      prevString = n.string
    } else {
      out += ' ' + n.fret
    }
  }
  return out
}

function LickEditor({ draft, setDraft }) {
  const notes = useMemo(() => parseLickText(draft.lickText || ''), [draft.lickText])

  const updateNotes = (newNotes) => {
    setDraft({ ...draft, lickText: notesToText(newNotes) })
  }
  const addNote = (string, fret) => updateNotes([...notes, { string, fret }])
  const removeAt = (idx) => updateNotes(notes.filter((_, i) => i !== idx))
  const undoLast = () => updateNotes(notes.slice(0, -1))
  const clearLick = () => setDraft({ ...draft, lickText: '' })

  return (
    <>
      <FretboardClickGrid
        notes={notes}
        onAdd={addNote}
        onRemoveAt={removeAt}
        onUndo={undoLast}
      />

      <div>
        <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1">
          Or type — letter (E/A/D/G/B/e) sets string, numbers = frets
        </span>
        <textarea
          value={draft.lickText || ''}
          onChange={e => setDraft({ ...draft, lickText: e.target.value })}
          placeholder="G 4 6 8 9 B 5 7 10"
          className="w-full h-14 px-2 py-1 text-sm font-mono border border-[var(--color-border)] rounded bg-[var(--color-bg)] text-[var(--color-ink)] resize-y"
        />
        {(draft.lickText || '').length > 0 && (
          <button
            type="button"
            onClick={clearLick}
            className="text-[10px] text-[var(--color-ink-muted)] hover:text-red-500 mt-1"
          >Clear all</button>
        )}
      </div>

      {notes.length > 0 && (
        <div className="pt-1 border-t border-[var(--color-border)]">
          <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1">
            Preview ({notes.length} note{notes.length === 1 ? '' : 's'})
          </span>
          <LickTabStrip notes={notes} />
        </div>
      )}
    </>
  )
}

// ─── Scrollable fretboard click grid ──────────────────────────────────────
// Frets 0..23 across, 6 strings (high e top → low E bottom).
// Click cell = append note to sequence. Hover existing cell → × to remove last occurrence.
// Undo button removes most recent in sequence.

function FretboardClickGrid({ notes, onAdd, onRemoveAt, onUndo }) {
  const cellW = 30
  const cellH = 22
  const labelW = 18

  const occurrencesAt = useMemo(() => {
    const m = new Map()
    notes.forEach((n, idx) => {
      const k = `${n.string}-${n.fret}`
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(idx)
    })
    return m
  }, [notes])

  const removeLastAt = (s, f) => {
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].string === s && notes[i].fret === f) {
        onRemoveAt(i)
        return
      }
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide">
          Click frets — sequence builds in order
        </span>
        <button
          type="button"
          onClick={onUndo}
          disabled={notes.length === 0}
          className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-warm)] disabled:opacity-40 disabled:cursor-not-allowed"
        >Undo last</button>
      </div>

      <div
        className="overflow-x-auto border border-[var(--color-border)] rounded bg-[var(--color-bg)]"
        style={{ maxWidth: '100%' }}
      >
        <div style={{ width: 'max-content' }}>
          {/* Fret number header row */}
          <div className="flex" style={{ height: 16 }}>
            <div style={{ width: labelW }} />
            {Array.from({ length: TOTAL_FRETS }, (_, f) => {
              const isMarker = f === 0 || FRET_MARKER_SINGLE.has(f) || FRET_MARKER_DOUBLE.has(f)
              return (
                <div
                  key={f}
                  style={{ width: cellW }}
                  className="text-center text-[9px] font-mono text-[var(--color-ink-muted)] leading-4"
                >
                  {isMarker ? (f === 12 ? '12' : f) : ''}
                </div>
              )
            })}
          </div>

          {/* 6 string rows — high e to low E */}
          {STRING_DISPLAY_ORDER.map((stringIdx, rowIdx) => {
            const isFirstRow = rowIdx === 0
            const isLastRow = rowIdx === 5
            return (
              <div key={stringIdx} className="flex items-center" style={{ height: cellH }}>
                <div
                  style={{ width: labelW }}
                  className="text-center text-[10px] font-mono font-bold text-[var(--color-ink-soft)]"
                >
                  {STRING_LABELS[stringIdx]}
                </div>
                {Array.from({ length: TOTAL_FRETS }, (_, f) => (
                  <FretCell
                    key={f}
                    width={cellW}
                    height={cellH}
                    fret={f}
                    stringIdx={stringIdx}
                    isMiddleRow={rowIdx === 2 || rowIdx === 3}
                    occurrences={occurrencesAt.get(`${stringIdx}-${f}`) || []}
                    isTopBorder={isFirstRow}
                    isBottomBorder={isLastRow}
                    onClick={() => onAdd(stringIdx, f)}
                    onRemove={() => removeLastAt(stringIdx, f)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FretCell({ width, height, fret, stringIdx, isMiddleRow, occurrences, isTopBorder, isBottomBorder, onClick, onRemove }) {
  const [hover, setHover] = useState(false)
  const hasNote = occurrences.length > 0
  const isOpenCol = fret === 0
  const isNut = fret === 0
  const isMarkerFret = !isOpenCol && (FRET_MARKER_SINGLE.has(fret) || FRET_MARKER_DOUBLE.has(fret))

  // 1-based sequence numbers shown to user
  const seqLabels = occurrences.map(i => i + 1)
  const seqText = seqLabels.length > 2
    ? `${seqLabels[0]}+${seqLabels.length - 1}`
    : seqLabels.join(',')

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{
        width,
        height,
        borderRight: isNut ? '3px solid var(--color-ink)' : '1px solid var(--color-border)',
        borderTop: isTopBorder ? '1px solid var(--color-border)' : 'none',
        borderBottom: '1px solid var(--color-border)',
        borderLeft: fret === 0 ? '1px solid var(--color-border)' : 'none',
        background: hover && !hasNote ? 'var(--color-bg-warm)' : 'transparent',
      }}
      className="relative cursor-pointer select-none flex items-center justify-center"
    >
      {/* Fret marker dot — show in middle rows only, behind notes */}
      {isMarkerFret && isMiddleRow && !hasNote && (
        <span
          className="absolute rounded-full bg-[var(--color-ink-soft)] opacity-20 pointer-events-none"
          style={{ width: 6, height: 6 }}
        />
      )}

      {hasNote && (
        <span
          className="bg-[var(--color-accent)] text-white text-[9px] font-mono font-bold rounded-full px-1 leading-none flex items-center justify-center"
          style={{ minWidth: 16, height: 16 }}
        >
          {seqText}
        </span>
      )}

      {hasNote && hover && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full text-[10px] leading-none flex items-center justify-center shadow"
          style={{ width: 14, height: 14 }}
          title="Remove last note at this fret"
        >×</button>
      )}
    </div>
  )
}

// Horizontal tab strip — 6 horizontal lines, notes plotted left→right with fret number.
function LickTabStrip({ notes }) {
  if (!notes || notes.length === 0) {
    return <div className="text-xs text-[var(--color-ink-muted)] italic">No notes</div>
  }
  const width = Math.max(220, notes.length * 28)
  const padX = 18
  const padY = 6
  const stringSpacing = 14
  const noteSpacing = (width - padX * 2) / Math.max(notes.length - 1, 1)
  const height = padY * 2 + stringSpacing * 5

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width, display: 'block' }}>
      {/* string lines — index 0 = low E at bottom (line y=padY + 5*spacing), index 5 = high e at top */}
      {STRING_LABELS.map((label, i) => {
        const y = padY + (5 - i) * stringSpacing
        return (
          <g key={`s-${i}`}>
            <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="var(--color-ink-soft)" strokeWidth={0.5} />
            <text x={4} y={y + 3} fontSize={9} fill="var(--color-ink-muted)" fontFamily="ui-monospace, monospace">{label}</text>
          </g>
        )
      })}
      {/* notes */}
      {notes.map((n, idx) => {
        const x = padX + (notes.length === 1 ? (width - padX * 2) / 2 : idx * noteSpacing)
        const y = padY + (5 - n.string) * stringSpacing
        return (
          <g key={`n-${idx}`}>
            <rect x={x - 8} y={y - 6} width={16} height={12} rx={2} fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth={1} />
            <text
              x={x} y={y + 3.5}
              textAnchor="middle"
              fontSize={9}
              fontFamily="ui-monospace, monospace"
              fill="var(--color-ink)"
              fontWeight="700"
            >{n.fret}</text>
          </g>
        )
      })}
    </svg>
  )
}
