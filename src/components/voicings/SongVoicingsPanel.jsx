import { useMemo, useRef, useState } from 'react'
import { X, FileDown, Music2, Link2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import FretboardDiagram from './FretboardDiagram'
import { PRESETS, candidatesForPreset, pickVoicingPath, chordSequenceFromParsedContent } from '../../lib/voicings/flow'
import { keyPrefersFlats } from '../../lib/voicings/notes'
import { difficultyOf } from '../../lib/voicings/difficulty'
import { exportSongToPDF, createPrintContainer } from '../../lib/pdf'
import { useSongs } from '../../lib/hooks'

/**
 * Slide-up panel listing every unique chord in a song with its best voicings.
 * Voice-leading: the first ("primary") voicing is selected by global optimization (Viterbi)
 * over the whole chord sequence under the active preset. Includes mode toggle (Chords/Song order)
 * and preset cycler to explore different fretboard zones or string groups.
 *
 * Props:
 *   song           song object with parsed_content
 *   semitones      current transposition
 *   targetKey      transposition target key (optional)
 *   onClose        handler
 */
export default function SongVoicingsPanel({ song, semitones = 0, targetKey = null, onClose }) {
  const printRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [mode, setMode] = useState('chords')       // 'chords' | 'sequence'
  const [presetIdx, setPresetIdx] = useState(0)    // index into PRESETS, 0 = Auto
  const { songs: allSongs } = useSongs()

  const preset = PRESETS[presetIdx]
  const cyclePreset = (dir) => setPresetIdx(i => (i + dir + PRESETS.length) % PRESETS.length)

  const preferFlats = keyPrefersFlats(targetKey || song?.target_key || song?.original_key)

  // Playing-order chord groups (split on section headers, consecutive dupes collapsed).
  const sequenceGroups = useMemo(
    () => chordSequenceFromParsedContent(song?.parsed_content, { semitones, preferFlats }),
    [song, semitones, preferFlats])

  // Unique chords in order of first appearance.
  const orderedChords = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const g of sequenceGroups) for (const ch of g.chords) if (!seen.has(ch)) { seen.add(ch); out.push(ch) }
    return out
  }, [sequenceGroups])

  // Chords mode: primary voicing per unique chord from the global DP path,
  // plus up to 2 preset-filtered alternates.
  const chordsWithVoicings = useMemo(() => {
    const fretSig = (f) => f.map(v => v == null ? 'x' : v).join('-')
    const path = pickVoicingPath(orderedChords, preset)
    return path.map(p => {
      if (!p.frets) return { chord: p.chord, voicings: [], primaryFrets: null }
      const primarySig = fretSig(p.frets)
      const alternates = candidatesForPreset(p.chord, preset)
        .filter(c => fretSig(c.frets) !== primarySig)
        .slice(0, 2)
      return {
        chord: p.chord,
        voicings: [
          { voicing: p.voicing, frets: p.frets, displayedName: p.displayedName, offPreset: p.offPreset },
          ...alternates,
        ],
        primaryFrets: p.frets,
      }
    })
  }, [orderedChords, preset])

  // Song-order mode: one voicing per occurrence, DP over the full flattened
  // sequence (voice-leading flows across section boundaries), with each item
  // carrying the previous occurrence's frets for shared-string highlighting.
  const sequenceWithVoicings = useMemo(() => {
    if (mode !== 'sequence') return []
    const flat = sequenceGroups.flatMap(g => g.chords)
    const path = pickVoicingPath(flat, preset)
    let k = 0
    let prevFrets = null
    return sequenceGroups.map(g => ({
      label: g.label,
      items: g.chords.map(() => {
        const p = path[k++]
        const item = { ...p, prevFrets }
        if (p.frets) prevFrets = p.frets
        return item
      }),
    }))
  }, [sequenceGroups, preset, mode])

  // Lookup: which other songs in the library use a given chord?
  const songsByChord = useMemo(() => {
    if (!allSongs) return new Map()
    const map = new Map()
    for (const s of allSongs) {
      if (!s?.parsed_content || s.id === song?.id) continue
      const chordSet = new Set()
      for (const line of s.parsed_content) {
        if (line.type !== 'chord_line' || !line.tokens) continue
        for (const tok of line.tokens) {
          const txt = (tok.text || '').trim()
          if (txt) chordSet.add(txt)
        }
      }
      for (const c of chordSet) {
        if (!map.has(c)) map.set(c, [])
        map.get(c).push({ id: s.id, title: s.title, artist: s.artist })
      }
    }
    return map
  }, [allSongs, song?.id])

  const onExport = async () => {
    if (!printRef.current) return
    setExporting(true)
    try {
      const container = createPrintContainer()
      container.innerHTML = printRef.current.innerHTML
      // Inline computed colors (since CSS vars don't carry into the cloned node)
      container.style.color = '#000'
      container.style.background = '#fff'
      await exportSongToPDF(`${song.title || 'song'}-voicings`, targetKey || song.target_key || song.original_key, container)
      document.body.removeChild(container)
    } finally { setExporting(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-[45] bg-black/40 no-print" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-bg)] border-t border-[var(--color-border)] shadow-2xl no-print max-h-[85vh] flex flex-col">
        <header className="flex items-center justify-between gap-3 px-4 h-12 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Music2 size={16} className="text-[var(--color-ink-soft)] shrink-0" />
            <span className="font-display text-base text-[var(--color-ink)] truncate">
              Voicings for {song.title}
            </span>
            <span className="text-xs text-[var(--color-ink-muted)] shrink-0">
              · {orderedChords.length} unique chord{orderedChords.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onExport}
              disabled={exporting}
              className="flex items-center gap-1 px-2 h-8 text-xs rounded border border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)] disabled:opacity-50"
              title="Export chord chart as PDF"
            ><FileDown size={12} /> {exporting ? 'Exporting…' : 'PDF'}</button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded flex items-center justify-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]"
              aria-label="Close"
            ><X size={16} /></button>
          </div>
        </header>

        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)] shrink-0 flex-wrap no-print">
          <div className="flex rounded border border-[var(--color-border)] overflow-hidden text-xs h-8">
            {[['chords', 'Chords'], ['sequence', 'Song order']].map(([m, label]) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-2.5 h-full ${mode === m
                  ? 'bg-[var(--color-bg-warm)] text-[var(--color-ink)] font-medium'
                  : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}
              >{label}</button>
            ))}
          </div>
          <div className="flex items-center rounded border border-[var(--color-border)] text-xs h-8">
            <button
              onClick={() => cyclePreset(-1)}
              aria-label="Previous voicing set"
              className="px-1.5 h-full flex items-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]"
            ><ChevronLeft size={14} /></button>
            <span className="px-1 min-w-[130px] text-center text-[var(--color-ink)]">{preset.label}</span>
            <button
              onClick={() => cyclePreset(1)}
              aria-label="Next voicing set"
              className="px-1.5 h-full flex items-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]"
            ><ChevronRight size={14} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div ref={printRef} className="bg-[var(--color-bg)]">
            {mode === 'sequence' ? (
              <div className="flex flex-col gap-5">
                {sequenceWithVoicings.map((group, gi) => (
                  <section key={gi}>
                    {group.label && (
                      <h3 className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)] mb-2">
                        {group.label}
                      </h3>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {group.items.map((item, i) => item.frets ? (
                        <div key={i} className="flex flex-col items-center gap-1 w-[120px]">
                          <span className="font-display text-sm text-[var(--color-ink)]">{item.chord}</span>
                          <FretboardDiagram
                            frets={item.frets}
                            width={120}
                            highlightRoot
                            chordName={item.displayedName || item.chord}
                            compareFrets={item.prevFrets}
                          />
                          <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
                            {item.frets.map(f => f == null ? 'x' : f).join(' ')}
                          </span>
                          {item.offPreset && (
                            <span className="text-[9px] uppercase tracking-wide text-[var(--color-ink-muted)] border border-[var(--color-border)] rounded px-1">
                              off set
                            </span>
                          )}
                        </div>
                      ) : (
                        <div key={i} className="w-[120px] min-h-[80px] flex items-center justify-center text-[10px] italic text-[var(--color-ink-muted)] border border-dashed border-[var(--color-border)] rounded p-2 text-center">
                          {item.chord}: no voicing
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(440px,100%),1fr))]">
              {chordsWithVoicings.map(({ chord, voicings }, idx) => {
                const otherSongs = songsByChord.get(chord) || []
                return (
                  <section key={chord} className="flex flex-col gap-2 p-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-warm)]">
                    <header className="flex items-center justify-between">
                      <div>
                        <span className="font-display text-xl text-[var(--color-ink)]">{chord}</span>
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                          {idx + 1}
                        </span>
                      </div>
                      {voicings[0] && (
                        <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide">
                          {difficultyOf(voicings[0].frets, voicings[0].voicing.tags || []).label}
                        </span>
                      )}
                    </header>

                    {voicings.length === 0 ? (
                      <div className="text-xs text-[var(--color-ink-muted)] italic py-2">No catalog voicings found.</div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 items-start">
                        {voicings.map((v, i) => (
                          <div key={i} className="flex flex-col items-center gap-1 min-w-0">
                            <FretboardDiagram
                              frets={v.frets}
                              width={160}
                              highlightRoot
                              chordName={v.displayedName || chord}
                              compareFrets={i === 0 && idx > 0 ? chordsWithVoicings[idx - 1]?.primaryFrets : null}
                            />
                            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
                              {v.frets.map(f => f == null ? 'x' : f).join(' ')}
                            </span>
                            {v.offPreset && (
                              <span className="text-[9px] uppercase tracking-wide text-[var(--color-ink-muted)] border border-[var(--color-border)] rounded px-1">
                                off set
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {otherSongs.length > 0 && (
                      <details className="text-[11px] text-[var(--color-ink-soft)]">
                        <summary className="cursor-pointer flex items-center gap-1 hover:text-[var(--color-ink)]">
                          <Link2 size={10} /> Used in {otherSongs.length} other song{otherSongs.length === 1 ? '' : 's'}
                        </summary>
                        <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                          {otherSongs.slice(0, 6).map(s => (
                            <li key={s.id}>
                              <Link to={`/songs/${s.id}`} onClick={onClose} className="hover:underline truncate block">
                                {s.title}{s.artist ? ` — ${s.artist}` : ''}
                              </Link>
                            </li>
                          ))}
                          {otherSongs.length > 6 && (
                            <li className="text-[var(--color-ink-muted)]">+ {otherSongs.length - 6} more</li>
                          )}
                        </ul>
                      </details>
                    )}
                  </section>
                )
              })}
            </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
