import React, { useMemo, useRef, useState } from 'react'
import { X, FileDown, Music2, Link2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import FretboardDiagram from './FretboardDiagram'
import { voicingsForChord } from '../../lib/voicings/lookup'
import { pickBestNext } from '../../lib/voicings/voiceLeading'
import { transposeChordName, semitoneDelta, pitchClassIndex } from '../../lib/voicings/transpose'
import { keyPrefersFlats } from '../../lib/voicings/notes'
import { difficultyOf } from '../../lib/voicings/difficulty'
import { exportSongToPDF, createPrintContainer } from '../../lib/pdf'
import { useSongs } from '../../lib/hooks'

/**
 * Slide-up panel listing every unique chord in a song with its best voicings.
 * Voice-leading: the first ("primary") voicing is auto-picked to flow from the previous chord.
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
  const { songs: allSongs } = useSongs()

  // Walk parsed_content, collect unique chord tokens in order of first appearance.
  const orderedChords = useMemo(() => {
    if (!song?.parsed_content) return []
    const seen = new Map()
    const preferFlats = keyPrefersFlats(targetKey || song?.target_key || song?.original_key)
    for (const line of song.parsed_content) {
      if (line.type !== 'chord_line' || !line.tokens) continue
      for (const tok of line.tokens) {
        const txt = (tok.text || '').trim()
        if (!txt || !/^[A-G][b#]?/.test(txt)) continue
        let displayed = txt
        if (semitones !== 0) displayed = transposeChordName(txt, semitones, preferFlats)
        if (!seen.has(displayed)) seen.set(displayed, true)
      }
    }
    return [...seen.keys()]
  }, [song, semitones, targetKey])

  // Pick 3 best voicings per chord. First one is voice-led from previous chord's pick.
  const chordsWithVoicings = useMemo(() => {
    const out = []
    let prevFrets = null
    for (const ch of orderedChords) {
      const candidates = voicingsForChord(ch)
      if (candidates.length === 0) { out.push({ chord: ch, voicings: [] }); prevFrets = null; continue }

      let primaryIdx = 0
      if (prevFrets) {
        const idx = pickBestNext(prevFrets, candidates.map(c => c.frets))
        if (idx >= 0) primaryIdx = idx
      }
      // Move primary to front, keep up to 3
      const ordered = [candidates[primaryIdx], ...candidates.filter((_, i) => i !== primaryIdx)].slice(0, 3)
      out.push({ chord: ch, voicings: ordered, primaryFrets: ordered[0]?.frets || null })
      prevFrets = ordered[0]?.frets || null
    }
    return out
  }, [orderedChords])

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
      <div className="fixed inset-0 z-40 bg-black/40 no-print" onClick={onClose} />
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

        <div className="flex-1 overflow-y-auto p-4">
          <div ref={printRef} className="bg-[var(--color-bg)]">
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(440px,1fr))]">
              {chordsWithVoicings.map(({ chord, voicings, primaryFrets }, idx) => {
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
          </div>
        </div>
      </div>
    </>
  )
}
