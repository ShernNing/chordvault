import { ChevronLeft, ChevronRight } from 'lucide-react'
import FretboardDiagram from '../voicings/FretboardDiagram'
import { CHORD_RE } from '../../lib/voicings/inlineVoicings'

/**
 * Screen-only row of compact fretboard diagrams, one per chord token on a chord
 * line, rendered directly beneath that chord line when the Voicings toggle is on.
 *
 * Props:
 *   line       the chord_line object ({ tokens: [{ text, ... }] })
 *   lineIndex  index of this line within the rendered content array
 *   lookup     (key) => voicing object | null   (key = `${lineIndex}:${tokenIndex}`)
 *   onCycle    (key, name, dir) => void         (dir = 1 | -1)
 */
export default function InlineVoicingRow({ line, lineIndex, lookup, onCycle }) {
  if (!line?.tokens) return null

  const chips = []
  line.tokens.forEach((tok, ti) => {
    const name = (tok?.text || '').trim()
    if (!name || !CHORD_RE.test(name)) return
    chips.push({ key: `${lineIndex}:${ti}`, name })
  })
  if (!chips.length) return null

  return (
    <div className='inline-voicing-row no-print flex flex-wrap gap-4 mt-2 mb-3'>
      {chips.map(({ key, name }) => {
        const v = lookup(key)
        return (
          <div key={key} className='flex flex-col items-center gap-1 w-[150px]'>
            <span className='font-display text-sm text-[var(--color-ink)] leading-none'>
              {v?.displayedName || name}
            </span>
            {v?.frets ? (
              <FretboardDiagram
                frets={v.frets}
                width={150}
                highlightRoot
                chordName={v.displayedName || name}
              />
            ) : (
              <span className='text-xs italic text-[var(--color-ink-muted)] py-4'>
                no voicing
              </span>
            )}
            {v?.frets && (
              <div className='flex items-center gap-3'>
                <button
                  type='button'
                  aria-label={`Previous voicing for ${name}`}
                  onClick={() => onCycle(key, name, -1)}
                  className='text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type='button'
                  aria-label={`Next voicing for ${name}`}
                  onClick={() => onCycle(key, name, 1)}
                  className='text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
