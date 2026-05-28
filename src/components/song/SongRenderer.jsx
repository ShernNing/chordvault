import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { transposeParsedContent } from '../../lib/transposition'
import { normalizeSectionHeader, cleanSongTitle } from '../../lib/ingestion'

// ─── Column layout helpers ───────────────────────────────────────────────────
// JS-based section splitting so sections never break across columns.
// Fill left column first; only start right column when left overflows.

const SCREEN_COLUMN_HEIGHT = 856  // 920px container − 2×32px padding
const PRINT_COLUMN_HEIGHT = 1000  // ~A4 content area minus song header

function _estimateGroupHeight(group) {
  if (group.type === 'pair') return 35  // chord(14) + lyric(17) + gap(4)
  switch (group.line?.type) {
    case 'section_header': return 38   // text(14) + margin-top(16) + margin-bottom(8)
    case 'chord_line':     return 18
    case 'lyric_line':     return 17
    case 'blank':          return 16
    default:               return 17
  }
}

function _groupIntoSections(groups) {
  const sections = []
  let cur = { header: null, groups: [] }
  for (const g of groups) {
    if (g.type === 'single' && g.line?.type === 'section_header') {
      sections.push(cur)
      cur = { header: g, groups: [] }
    } else {
      cur.groups.push(g)
    }
  }
  sections.push(cur)
  return sections.filter(s => s.header !== null || s.groups.length > 0)
}

function _estimateSectionHeight(section, isFirst) {
  // First section has no margin-top on its header
  let h = section.header ? (isFirst ? 22 : 38) : 0
  for (const g of section.groups) h += _estimateGroupHeight(g)
  return h
}

function _splitSections(sections, colHeight) {
  const left = [], right = []
  let leftH = 0, useRight = false
  for (let i = 0; i < sections.length; i++) {
    const h = _estimateSectionHeight(sections[i], i === 0)
    if (useRight || (leftH > 0 && leftH + h > colHeight)) {
      useRight = true
      right.push(sections[i])
    } else {
      left.push(sections[i])
      leftH += h
    }
  }
  return { left, right }
}

function _estimatePrintLineHeight(line) {
  switch (line.type) {
    case 'chord_line': return 20  // 16px × 1.2 lineHeight = 19.2 → 20
    case 'lyric_line': return 22  // 19.2 + 2px margin-bottom = 21.2 → 22
    case 'blank':      return 8
    default:           return 22
  }
}

// Strip blank lines between chord→lyric pairs and after section headers.
// Also collapses consecutive blanks to 1 and removes trailing blanks.
function _stripIntraPairBlanks(lines) {
  // Collapse consecutive blanks to 1
  const collapsed = []
  let lastBlank = false
  for (const l of lines) {
    if (l.type === 'blank') { if (!lastBlank) collapsed.push(l); lastBlank = true }
    else { collapsed.push(l); lastBlank = false }
  }
  // Strip intra-pair and post-header blanks
  const stripped = collapsed.filter((line, i) => {
    if (line.type !== 'blank') return true
    const prev = collapsed[i - 1]
    const next = collapsed[i + 1]
    if (prev?.type === 'chord_line' && next?.type === 'lyric_line') return false
    if (prev?.type === 'lyric_line' && next?.type === 'chord_line') return false
    if (prev?.type === 'section_header') return false
    return true
  })
  // Remove trailing blanks
  while (stripped.length > 0 && stripped[stripped.length - 1].type === 'blank') stripped.pop()
  return stripped
}

function _groupPrintSections(lines) {
  const sections = []
  let cur = { header: null, lines: [] }
  for (const l of lines) {
    if (l.type === 'section_header') {
      sections.push(cur)
      cur = { header: l, lines: [] }
    } else {
      cur.lines.push(l)
    }
  }
  sections.push(cur)
  return sections.filter(s => s.header !== null || s.lines.length > 0)
}

function _estimatePrintSectionHeight(section, isFirst) {
  // first header: 16px × 1.2 + 2px margin-bottom = 21.2 → 22
  // non-first header: 19.2 + 8px margin-top + 2px margin-bottom = 29.2 → 30
  let h = section.header ? (isFirst ? 22 : 30) : 0
  for (const l of section.lines) h += _estimatePrintLineHeight(l)
  return h
}

function _splitPrintSections(sections) {
  const left = [], right = []
  let leftH = 0, useRight = false
  for (let i = 0; i < sections.length; i++) {
    const h = _estimatePrintSectionHeight(sections[i], i === 0)
    if (useRight || (leftH > 0 && leftH + h > PRINT_COLUMN_HEIGHT)) {
      useRight = true
      right.push(sections[i])
    } else {
      left.push(sections[i])
      leftH += h
    }
  }
  return { left, right }
}

// Estimate total print height of a song at half-page column width.
// Title: 19px × 1.2 lineHeight + 8px margin-bottom = 30.8 → 31px
export function estimateSongPrintHeight(parsedContent) {
  const content = _stripIntraPairBlanks(parsedContent || [])
  const sections = _groupPrintSections(content)
  const bodyH = sections.reduce((h, s, i) => h + _estimatePrintSectionHeight(s, i === 0), 0)
  return 31 + bodyH
}

// ─── SongRenderer ────────────────────────────────────────────────────────────

// Render chord-line text. When `onChordClick` is supplied, each chord token is
// rendered as a clickable button — used to open the voicings drawer.
function renderChordTextInline(line, onChordClick) {
  if (!line) return ''
  if (!line.tokens || !onChordClick) {
    return line.tokens
      ? line.tokens.map(t => ' '.repeat(t.leadingSpaces || 0) + t.text).join('')
      : (line.raw || '')
  }
  return line.tokens.map((t, i) => (
    <React.Fragment key={i}>
      {' '.repeat(t.leadingSpaces || 0)}
      <button
        type="button"
        className="chord-token-btn"
        onClick={() => onChordClick(t.text)}
      >{t.text}</button>
    </React.Fragment>
  ))
}

export default function SongRenderer({
  parsedContent,
  semitones = 0,
  targetKey = null,
  twoColumn = false,
  printMode = false,
  onLineTypeOverride = null,
  onChordClick = null,
  fontSize = 14,
}) {
  const [overrides, setOverrides] = useState({})

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

  // Pair adjacent chord+lyric lines into a single block
  const groups = []
  let i = 0
  while (i < content.length) {
    const line = content[i]
    const effectiveType = overrides[i] || line.type

    // Skip blank lines immediately after a section header or between chord/lyric pairs
    if (effectiveType === 'blank') {
      const prev = groups[groups.length - 1]
      if (prev?.type === 'single' && prev.line.type === 'section_header') {
        i++
        continue
      }
      // Skip blank between pairs (lyric → chord): peek at next non-blank
      if (prev?.type === 'pair') {
        let j = i + 1
        while (j < content.length && (overrides[j] || content[j].type) === 'blank') j++
        if (j < content.length && (overrides[j] || content[j].type) === 'chord_line') {
          i++
          continue
        }
      }
    }

    if (effectiveType === 'chord_line') {
      // Skip past any blank lines to find a lyric partner
      let j = i + 1
      while (j < content.length && (overrides[j] || content[j].type) === 'blank') j++
      if (j < content.length && (overrides[j] || content[j].type) === 'lyric_line') {
        const lyricType = overrides[j] || content[j].type
        groups.push({ type: 'pair', chord: { ...line, type: effectiveType }, lyric: { ...content[j], type: lyricType }, chordIndex: i, lyricIndex: j })
        i = j + 1
        continue
      }
    }
    groups.push({ type: 'single', line: { ...line, type: effectiveType }, index: i })
    i++
  }

  const getKey = (g) => g.type === 'pair' ? `p${g.chordIndex}` : `s${g.index}`

  const renderGroup = (group) => {
    if (group.type === 'pair') {
      const { chord, lyric, chordIndex } = group
      const chordContent = renderChordTextInline(chord, !printMode ? onChordClick : null)
      return (
        <div key={getKey(group)} className={`chord-lyric-pair ${chord.uncertain ? 'uncertain-line' : ''}`}>
          <span className="chord-line">{chordContent}</span>
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
        key={getKey(group)}
        line={group.line}
        index={group.index}
        printMode={printMode}
        onOverride={onLineTypeOverride ? handleOverride : null}
        onChordClick={!printMode ? onChordClick : null}
      />
    )
  }

  if (!twoColumn) {
    return (
      <div className="chord-sheet">
        {groups.map(renderGroup)}
      </div>
    )
  }

  // 2-column: group by section, split left-first, render as flex columns
  const sections = _groupIntoSections(groups)
  const { left, right } = _splitSections(sections, SCREEN_COLUMN_HEIGHT * (12 / Math.max(fontSize, 10)))

  const renderCol = (colSections) =>
    colSections.flatMap(section =>
      (section.header ? [section.header, ...section.groups] : section.groups).map(renderGroup)
    )

  return (
    <div className="chord-sheet flex gap-8">
      <div className="flex-1 min-w-0">
        {renderCol(left)}
      </div>
      <div className="flex-1 min-w-0">
        {renderCol(right)}
      </div>
    </div>
  )
}

function RenderLine({ line, index, printMode, onOverride, onChordClick }) {
  switch (line.type) {
    case 'section_header':
      return (
        <div key={index} className="section-header">
          {normalizeSectionHeader(line.text)}
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
          onChordClick={onChordClick}
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

function ChordLineRender({ line, index, printMode, onOverride, onChordClick }) {
  const chordContent = renderChordTextInline(line, !printMode ? onChordClick : null)

  return (
    <div className={`chord-lyric-pair ${line.uncertain ? 'uncertain-line' : ''}`}>
      <span className="chord-line">{chordContent}</span>
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

// ─── Print components ────────────────────────────────────────────────────────

const PRINT_WRAPPER_STYLE = {
  width: '794px',
  padding: '12px 24px 24px',
  backgroundColor: '#ffffff',
  color: '#000000',
  fontFamily: 'Arial, sans-serif',
  fontSize: '16px',
}

function PrintSongHeader({ song, keyLabel, songNumber }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <span style={{ fontSize: '19px', fontWeight: '700', color: '#000000', display: 'block', wordBreak: 'break-word' }}>
        {[songNumber != null ? `${songNumber}.` : null, cleanSongTitle(song.title), song.artist ? `- ${song.artist}` : null, keyLabel ? `(${keyLabel})` : null].filter(Boolean).join(' ')}
      </span>
    </div>
  )
}

function PrintSection({ section, sectionKey }) {
  return (
    <div key={sectionKey}>
      {section.header && <PrintLine line={section.header} />}
      {section.lines.map((line, li) => <PrintLine key={li} line={line} />)}
    </div>
  )
}

export function PrintableSongSheet({ song, semitones, targetKey, keyLabel, songNumber }) {
  const content = semitones !== 0
    ? transposeParsedContent(song.parsed_content, semitones, targetKey)
    : song.parsed_content

  const sections = _groupPrintSections(_stripIntraPairBlanks(content || []))
  const nonBlankLines = (content || []).filter(l => l.type !== 'blank').length
  const useColumns = nonBlankLines > 45

  if (!useColumns) {
    return (
      <div style={PRINT_WRAPPER_STYLE}>
        <PrintSongHeader song={song} keyLabel={keyLabel} songNumber={songNumber} />
        {sections.map((s, si) => <PrintSection key={si} section={s} sectionKey={si} />)}
      </div>
    )
  }

  const { left, right } = _splitPrintSections(sections)
  return (
    <div style={PRINT_WRAPPER_STYLE}>
      <PrintSongHeader song={song} keyLabel={keyLabel} songNumber={songNumber} />
      <div style={{ display: 'flex', gap: '32px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {left.map((s, si) => <PrintSection key={si} section={s} sectionKey={si} />)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {right.map((s, si) => <PrintSection key={1000 + si} section={s} sectionKey={1000 + si} />)}
        </div>
      </div>
    </div>
  )
}

// Two short songs side by side on one page (used by setlist PDF export)
export function TwoPrintableSongSheets({ song1, semitones1, targetKey1, keyLabel1, songNumber1, song2, semitones2, targetKey2, keyLabel2, songNumber2 }) {
  const renderSong = (song, semitones, targetKey, keyLabel, songNumber) => {
    const content = semitones !== 0
      ? transposeParsedContent(song.parsed_content, semitones, targetKey)
      : song.parsed_content
    const sections = _groupPrintSections(_stripIntraPairBlanks(content || []))
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <PrintSongHeader song={song} keyLabel={keyLabel} songNumber={songNumber} />
        {sections.map((s, si) => <PrintSection key={si} section={s} sectionKey={si} />)}
      </div>
    )
  }

  return (
    <div style={PRINT_WRAPPER_STYLE}>
      <div style={{ display: 'flex', gap: '32px' }}>
        {renderSong(song1, semitones1, targetKey1, keyLabel1, songNumber1)}
        {renderSong(song2, semitones2, targetKey2, keyLabel2, songNumber2)}
      </div>
    </div>
  )
}

// Song rendered inside a column — no page wrapper, no internal 2-col split
export function SingleSongForColumn({ song, semitones, targetKey, keyLabel, songNumber }) {
  const content = semitones !== 0
    ? transposeParsedContent(song.parsed_content, semitones, targetKey)
    : song.parsed_content
  const sections = _groupPrintSections(_stripIntraPairBlanks(content || []))
  return (
    <div>
      <PrintSongHeader song={song} keyLabel={keyLabel} songNumber={songNumber} />
      {sections.map((s, si) => <PrintSection key={si} section={s} sectionKey={si} />)}
    </div>
  )
}

// Page with bin-packed songs in up to 2 columns, left filled first
export function MultiSongPage({ leftColumn, rightColumn }) {
  const hasTwoColumns = rightColumn && rightColumn.length > 0
  return (
    <div style={PRINT_WRAPPER_STYLE}>
      <div style={hasTwoColumns ? { display: 'flex', gap: '32px' } : {}}>
        <div style={{
          ...(hasTwoColumns ? { flex: 1, minWidth: 0 } : {}),
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}>
          {leftColumn.map((item, i) => <SingleSongForColumn key={i} {...item} />)}
        </div>
        {hasTwoColumns && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {rightColumn.map((item, i) => <SingleSongForColumn key={i} {...item} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function PrintLine({ line }) {
  const sectionStyle = {
    fontFamily: 'Arial, sans-serif',
    fontSize: '16px',
    fontWeight: '700',
    color: '#000000',
    lineHeight: '1.2',
    marginTop: '8px',
    marginBottom: '2px',
    display: 'block',
  }

  const chordStyle = {
    fontFamily: 'Arial, sans-serif',
    fontSize: '16px',
    fontWeight: '700',
    color: '#000000',
    whiteSpace: 'pre',
    display: 'block',
    lineHeight: '1.2',
    marginBottom: '0',
  }

  const lyricStyle = {
    fontFamily: 'Arial, sans-serif',
    fontSize: '16px',
    fontWeight: '400',
    color: '#000000',
    whiteSpace: 'pre-wrap',
    display: 'block',
    lineHeight: '1.2',
    marginBottom: '2px',
  }

  switch (line.type) {
    case 'section_header':
      return <span style={sectionStyle}>{normalizeSectionHeader(line.text)}</span>

    case 'chord_line': {
      const text = line.tokens
        ? line.tokens.map(t => ' '.repeat(t.leadingSpaces || 0) + t.text).join('')
        : (line.raw || '')
      return <span style={chordStyle}>{text}</span>
    }

    case 'lyric_line':
      return <span style={lyricStyle}>{line.text}</span>

    case 'blank':
      return <div style={{ height: '8px' }} />

    default:
      return <span style={lyricStyle}>{line.text}</span>
  }
}
