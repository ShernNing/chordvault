import React, { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { transposeParsedContent } from '../../lib/transposition'
import { Button } from '../ui'

/**
 * Renders parsed_content array as a formatted chord sheet.
 * Handles: section headers, chord lines, lyric lines, blanks, instructions.
 * Supports transposition (semitones) and 2-column layout.
 * Supports uncertain line overrides.
 */
export default function SongRenderer({
  parsedContent,
  semitones = 0,
  targetKey = null,
  twoColumn = false,
  printMode = false,
  onLineTypeOverride = null, // (lineIndex, newType) => void
}) {
  const [overrides, setOverrides] = useState({}) // { lineIndex: newType }

  // Apply transposition
  const content = semitones !== 0
    ? transposeParsedContent(parsedContent, semitones, targetKey)
    : parsedContent

  if (!content || content.length === 0) {
    return (
      <div className="chord-sheet text-[var(--color-ink-muted)] text-xs italic py-4">
        No content to display.
      </div>
    )
  }

  const handleOverride = (index, newType) => {
    setOverrides(prev => ({ ...prev, [index]: newType }))
    onLineTypeOverride?.(index, newType)
  }

  // Group chord+lyric lines into pairs so they stay together in columns.
  // A chord_line followed immediately by a lyric_line = one paired block.
  // Everything else renders individually.
  const groups = []
  let i = 0
  while (i < content.length) {
    const line = content[i]
    const effectiveType = overrides[i] || line.type

    if (effectiveType === 'chord_line' && i + 1 < content.length) {
      const nextType = overrides[i + 1] || content[i + 1].type
      if (nextType === 'lyric_line') {
        groups.push({ type: 'pair', chord: { ...line, type: effectiveType }, lyric: { ...content[i + 1], type: nextType }, chordIndex: i, lyricIndex: i + 1 })
        i += 2
        continue
      }
    }
    groups.push({ type: 'single', line: { ...line, type: effectiveType }, index: i })
    i++
  }

  return (
    <div className={`chord-sheet ${twoColumn ? 'chord-sheet-2col' : ''}`}>
      {groups.map((group, gi) => {
        if (group.type === 'pair') {
          const { chord, lyric, chordIndex, lyricIndex } = group
          const chordText = chord.tokens
            ? chord.tokens.map(t => ' '.repeat(t.leadingSpaces || 0) + t.text).join('')
            : (chord.raw || '')
          return (
            <div key={gi} className={`chord-lyric-pair ${chord.uncertain ? 'uncertain-line' : ''}`}>
              <span className="chord-line">{chordText}</span>
              <span className="lyric-line">{lyric.text}</span>
              {chord.uncertain && !printMode && onLineTypeOverride && (
                <UncertainOverlay
                  label="Chord line?"
                  onConfirm={() => handleOverride(chordIndex, 'chord_line')}
                  onReject={() => handleOverride(chordIndex, 'lyric_line')}
                />
              )}
            </div>
          )
        }
        return (
          <RenderLine
            key={gi}
            line={group.line}
            index={group.index}
            printMode={printMode}
            onOverride={onLineTypeOverride ? handleOverride : null}
          />
        )
      })}
    </div>
  )
}

function RenderLine({ line, index, printMode, onOverride }) {
  switch (line.type) {
    case 'section_header':
      return (
        <div key={index} className="section-header">
          {line.text}
        </div>
      )

    case 'chord_line':
      return (
        <ChordLineRender
          key={index}
          line={line}
          index={index}
          printMode={printMode}
          onOverride={onOverride}
        />
      )

    case 'lyric_line':
      return (
        <LyricLineRender
          key={index}
          line={line}
          index={index}
          printMode={printMode}
          onOverride={onOverride}
        />
      )

    case 'blank':
      return <div key={index} className="blank-line" />

    case 'instruction':
      return (
        <div key={index} className="instruction-line">
          {line.text}
        </div>
      )

    default:
      return (
        <div key={index} className="lyric-line">
          {line.text}
        </div>
      )
  }
}

function ChordLineRender({ line, index, printMode, onOverride }) {
  const chordText = line.tokens
    ? line.tokens.map(t => {
        const spaces = ' '.repeat(t.leadingSpaces || 0)
        return spaces + t.text
      }).join('')
    : (line.raw || '')

  return (
    <div className={`chord-lyric-pair ${line.uncertain ? 'uncertain-line' : ''}`}>
      <span className="chord-line">{chordText}</span>
      {line.uncertain && !printMode && onOverride && (
        <UncertainOverlay
          label="Chord line?"
          onConfirm={() => onOverride(index, 'chord_line')}
          onReject={() => onOverride(index, 'lyric_line')}
        />
      )}
    </div>
  )
}

function LyricLineRender({ line, index, printMode, onOverride }) {
  return (
    <div className={`${line.uncertain ? 'uncertain-line' : ''}`}>
      <span className="lyric-line">{line.text}</span>
      {line.uncertain && !printMode && onOverride && (
        <UncertainOverlay
          label="Lyric line?"
          onConfirm={() => onOverride(index, 'lyric_line')}
          onReject={() => onOverride(index, 'chord_line')}
        />
      )}
    </div>
  )
}

function UncertainOverlay({ label, onConfirm, onReject }) {
  return (
    <div className="inline-flex items-center gap-1 ml-2 align-middle">
      <AlertTriangle size={10} className="text-amber-500" />
      <span className="text-[10px] text-amber-600 dark:text-amber-400">Did we get this right?</span>
      <button
        onClick={onConfirm}
        className="text-[10px] px-1 py-0 border border-amber-400 text-amber-700 rounded hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900 transition-colors"
      >
        ✓ {label}
      </button>
      <button
        onClick={onReject}
        className="text-[10px] px-1 py-0 border border-[var(--color-border)] text-[var(--color-ink-muted)] rounded hover:bg-[var(--color-bg-warm)] transition-colors"
      >
        ✗ Other
      </button>
    </div>
  )
}

// ─── Chord Sheet Print Wrapper ─────────────────────────────────────────────
// Used by PDF export — renders at A4 width with print styles.
// Uses flex-based 2-col split instead of CSS columns (html2canvas ignores CSS multi-column).

function splitForTwoColumns(content) {
  if (!content || content.length === 0) return { left: [], right: [] }

  const mid = Math.floor(content.length / 2)
  const sectionIndices = content
    .map((line, i) => line.type === 'section_header' ? i : -1)
    .filter(i => i > 0) // skip index 0 — always stays in left col

  if (sectionIndices.length === 0) {
    return { left: content.slice(0, mid), right: content.slice(mid) }
  }

  // Find section header closest to midpoint
  let bestIdx = sectionIndices[0]
  let bestDist = Math.abs(sectionIndices[0] - mid)
  for (const idx of sectionIndices.slice(1)) {
    const dist = Math.abs(idx - mid)
    if (dist < bestDist) { bestDist = dist; bestIdx = idx }
  }

  return { left: content.slice(0, bestIdx), right: content.slice(bestIdx) }
}

export function PrintableSongSheet({ song, semitones, targetKey, title, keyLabel }) {
  const content = semitones !== 0
    ? transposeParsedContent(song.parsed_content, semitones, targetKey)
    : song.parsed_content

  const { left, right } = splitForTwoColumns(content || [])

  return (
    <div style={{
      width: '794px',
      padding: '48px',
      backgroundColor: '#ffffff',
      color: '#111111',
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: '12px',
      boxSizing: 'border-box',
    }}>
      {/* Song header */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #e5e5e5', paddingBottom: '12px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '2px' }}>
          {song.title}
        </div>
        {song.artist && (
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            {song.artist}
          </div>
        )}
        {keyLabel && (
          <div style={{ fontSize: '11px', color: '#888', fontFamily: 'Courier New' }}>
            Key: {keyLabel}
          </div>
        )}
      </div>

      {/* Two-column content via flex (CSS columns not supported by html2canvas) */}
      <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {left.map((line, i) => <PrintLine key={i} line={line} />)}
        </div>
        {right.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            {right.map((line, i) => <PrintLine key={i} line={line} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function PrintLine({ line }) {
  const sectionStyle = {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '12px',
    fontWeight: '700',
    color: '#111111',
    lineHeight: '1.2',
    marginTop: '16px',
    marginBottom: '4px',
    display: 'block',
  }

  const chordStyle = {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '12px',
    fontWeight: '700',
    color: '#111111',
    whiteSpace: 'pre',
    display: 'block',
    lineHeight: '1.2',
    marginBottom: '0',
  }

  const lyricStyle = {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '12px',
    fontWeight: '400',
    color: '#111111',
    whiteSpace: 'pre-wrap',
    display: 'block',
    lineHeight: '1.4',
    marginBottom: '4px',
  }

  switch (line.type) {
    case 'section_header':
      return <span style={sectionStyle}>{line.text}</span>

    case 'chord_line': {
      const text = line.tokens
        ? line.tokens.map(t => ' '.repeat(t.leadingSpaces || 0) + t.text).join('')
        : (line.raw || '')
      return <span style={chordStyle}>{text}</span>
    }

    case 'lyric_line':
      return <span style={lyricStyle}>{line.text}</span>

    case 'blank':
      return <div style={{ height: '16px' }} />

    default:
      return <span style={lyricStyle}>{line.text}</span>
  }
}
