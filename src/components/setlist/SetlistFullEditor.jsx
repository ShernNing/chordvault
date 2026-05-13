import React, { useState, useCallback, useRef } from 'react'
import { X, GripVertical, FileDown, Scissors, Clipboard } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, useSortable,
  verticalListSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '../ui'
import {
  transposeKey, semitonesFromKeyToKey, transposeParsedContent,
} from '../../lib/transposition'
import { cleanSongTitle } from '../../lib/ingestion'

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function parsedContentToSections(parsedContent) {
  const sections = []
  let cur = { id: uid(), header: null, lines: [] }
  for (const line of (parsedContent || [])) {
    if (line.type === 'section_header') {
      if (cur.header !== null || cur.lines.length > 0) sections.push(cur)
      cur = { id: uid(), header: { ...line }, lines: [] }
    } else {
      cur.lines.push({ ...line })
    }
  }
  if (cur.header !== null || cur.lines.length > 0) sections.push(cur)
  return sections
}

function sectionsToParsedContent(sections) {
  const lines = []
  for (const s of sections) {
    if (s.header) lines.push(s.header)
    for (const l of s.lines) lines.push(l)
  }
  return lines
}

function lineDisplayText(line) {
  if (line.type === 'chord_line') {
    if (line.tokens) return line.tokens.map(t => ' '.repeat(t.leadingSpaces || 0) + t.text).join('')
    return line.raw || ''
  }
  if (line.type === 'lyric_line') return line.text || ''
  if (line.type === 'section_header') return line.text || ''
  return ''
}

function lineWithNewText(line, text) {
  if (line.type === 'chord_line') return { ...line, raw: text, tokens: undefined }
  return { ...line, text }
}

function getTransposeData(slot) {
  const displayKey = slot.chosen_key || slot.song?.original_key
  const semitones = slot.chosen_key && slot.song?.original_key
    ? semitonesFromKeyToKey(slot.song.original_key, slot.chosen_key)
    : 0
  const capo = slot.capo || 0
  const shapeSemitones = semitones - capo
  const shapeKey = capo > 0 && displayKey ? transposeKey(displayKey, -capo) : displayKey
  const keyLabel = `${displayKey || ''}${capo > 0 ? ` (capo ${capo})` : ''}`
  return { shapeSemitones, shapeKey, keyLabel, displayKey }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SetlistFullEditor({
  setlist,
  slots,
  onClose,
  onReorder,
  handleExportPDF,
  handleExportDocx,
  exporting,
  exportingDocx,
}) {
  const [editedSlots, setEditedSlots] = useState(() =>
    slots.filter(s => s.song).map(slot => {
      const { shapeSemitones, shapeKey, keyLabel, displayKey } = getTransposeData(slot)
      const raw = slot.song.parsed_content || []
      const content = shapeSemitones !== 0
        ? transposeParsedContent(raw, shapeSemitones, shapeKey)
        : raw
      return {
        ...slot,
        _keyLabel: keyLabel,
        _displayKey: displayKey || slot.song?.original_key || '',
        sections: parsedContentToSections(content),
      }
    })
  )

  const [clipboard, setClipboard] = useState(null) // { section }

  // ── Section mutations ─────────────────────────────────────────────────────

  const mutateSections = useCallback((slotId, fn) => {
    setEditedSlots(prev =>
      prev.map(s => s.id === slotId ? { ...s, sections: fn(s.sections) } : s)
    )
  }, [])

  const handleReorderSections = useCallback((slotId, activeId, overId) => {
    mutateSections(slotId, secs => {
      const a = secs.findIndex(s => s.id === activeId)
      const b = secs.findIndex(s => s.id === overId)
      return a < 0 || b < 0 ? secs : arrayMove(secs, a, b)
    })
  }, [mutateSections])

  const handleEditLine = useCallback((slotId, sectionId, lineIdx, text) => {
    mutateSections(slotId, secs =>
      secs.map(sec => {
        if (sec.id !== sectionId) return sec
        if (lineIdx === -1) {
          return { ...sec, header: sec.header ? lineWithNewText(sec.header, text) : sec.header }
        }
        const newLines = [...sec.lines]
        newLines[lineIdx] = lineWithNewText(newLines[lineIdx], text)
        return { ...sec, lines: newLines }
      })
    )
  }, [mutateSections])

  const handleCutSection = useCallback((slotId, sectionId) => {
    mutateSections(slotId, secs => {
      const section = secs.find(s => s.id === sectionId)
      if (section) setClipboard({ section })
      return secs.filter(s => s.id !== sectionId)
    })
  }, [mutateSections])

  const handlePasteAfter = useCallback((slotId, afterSectionId) => {
    if (!clipboard) return
    const pasted = { ...clipboard.section, id: uid() }
    mutateSections(slotId, secs => {
      const idx = afterSectionId ? secs.findIndex(s => s.id === afterSectionId) : -1
      const out = [...secs]
      out.splice(idx + 1, 0, pasted)
      return out
    })
    setClipboard(null)
  }, [clipboard, mutateSections])

  // ── Slot reorder ──────────────────────────────────────────────────────────

  const slotSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleSlotDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return
    const a = editedSlots.findIndex(s => s.id === active.id)
    const b = editedSlots.findIndex(s => s.id === over.id)
    const next = arrayMove(editedSlots, a, b)
    setEditedSlots(next)
    await onReorder(next.map(s => s.id))
  }

  // ── Build export-ready slots (content already transposed, semitones = 0) ──

  const buildExportSlots = useCallback(() =>
    editedSlots.map(slot => ({
      ...slot,
      chosen_key: null,
      capo: 0,
      song: {
        ...slot.song,
        original_key: slot._displayKey,
        parsed_content: sectionsToParsedContent(slot.sections),
      },
    }))
  , [editedSlots])

  const onExportPDF = () => handleExportPDF(buildExportSlots())
  const onExportDocx = () => handleExportDocx(buildExportSlots())

  const slotIds = editedSlots.map(s => s.id)

  return (
    <div className='fixed inset-0 z-50 flex flex-col' style={{ backgroundColor: '#f0f0f0' }}>
      {/* Top bar */}
      <div className='flex items-center justify-between gap-4 px-5 py-3 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-bg-warm)]'>
        <div className='flex items-center gap-3 min-w-0'>
          <Button variant='ghost' size='icon-sm' onClick={onClose} title='Close editor'>
            <X size={15} />
          </Button>
          <h2 className='font-display text-lg text-[var(--color-ink)] truncate'>{setlist.name}</h2>
          <span className='text-xs text-[var(--color-ink-muted)]'>{editedSlots.length} songs</span>
          {clipboard && (
            <span className='flex items-center gap-1 text-xs text-amber-600'>
              <Clipboard size={11} />
              &ldquo;{clipboard.section?.header?.text || 'Section'}&rdquo; cut — click Paste to place
            </span>
          )}
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <span className='text-xs text-[var(--color-ink-muted)] hidden md:inline'>
            Click any text to edit · Drag <GripVertical size={11} className='inline' /> to reorder · <Scissors size={11} className='inline' /> to cut sections
          </span>
          <Button variant='secondary' size='sm' onClick={onExportPDF} loading={exporting}>
            <FileDown size={13} /> Export PDF
          </Button>
          <Button variant='secondary' size='sm' onClick={onExportDocx} loading={exportingDocx}>
            <FileDown size={13} /> Export Word
          </Button>
        </div>
      </div>

      {/* Editor canvas */}
      <div className='flex-1 overflow-y-auto py-8 px-4'>
        <DndContext
          sensors={slotSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSlotDragEnd}
        >
          <SortableContext items={slotIds} strategy={verticalListSortingStrategy}>
            <div className='space-y-6' style={{ width: '794px', margin: '0 auto' }}>
              {editedSlots.map((slot, index) => (
                <EditableSongBlock
                  key={slot.id}
                  slot={slot}
                  index={index}
                  clipboard={clipboard}
                  onReorderSections={(activeId, overId) => handleReorderSections(slot.id, activeId, overId)}
                  onEditLine={(sectionId, lineIdx, text) => handleEditLine(slot.id, sectionId, lineIdx, text)}
                  onCutSection={(sectionId) => handleCutSection(slot.id, sectionId)}
                  onPasteAfter={(afterId) => handlePasteAfter(slot.id, afterId)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}

// ── Editable Song Block ───────────────────────────────────────────────────────

function EditableSongBlock({
  slot, index, clipboard,
  onReorderSections, onEditLine, onCutSection, onPasteAfter,
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: slot.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  const sectionIds = slot.sections.map(s => s.id)
  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleSectionDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) onReorderSections(active.id, over.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#000000',
        backgroundColor: '#ffffff',
        padding: '12px 24px 24px',
        boxShadow: isDragging ? '0 8px 32px rgba(0,0,0,0.18)' : '0 1px 4px rgba(0,0,0,0.10)',
      }}
    >
      {/* Song header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <button
          title='Drag to reorder songs'
          style={{ color: '#aaa', cursor: 'grab', flexShrink: 0, lineHeight: 0 }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <span style={{ fontSize: '19px', fontWeight: '700', flex: 1 }}>
          {index + 1}. {cleanSongTitle(slot.song?.title || '')}
          {slot.song?.artist ? ` - ${slot.song.artist}` : ''}
          {slot._keyLabel ? ` (${slot._keyLabel})` : ''}
        </span>
      </div>

      {/* Sections */}
      <DndContext
        sensors={sectionSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
          {clipboard && (
            <PasteZone label='Paste at top' onPaste={() => onPasteAfter(null)} />
          )}
          {slot.sections.map((section) => (
            <React.Fragment key={section.id}>
              <EditableSection
                section={section}
                onEditLine={(lineIdx, text) => onEditLine(section.id, lineIdx, text)}
                onCut={() => onCutSection(section.id)}
              />
              {clipboard && (
                <PasteZone label='Paste here' onPaste={() => onPasteAfter(section.id)} />
              )}
            </React.Fragment>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

// ── Paste Zone ────────────────────────────────────────────────────────────────

function PasteZone({ label, onPaste }) {
  return (
    <button
      onClick={onPaste}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '4px', width: '100%', padding: '4px 0', margin: '2px 0',
        fontSize: '11px', color: '#d97706',
        border: '1px dashed #fbbf24', borderRadius: '3px',
        background: 'transparent', cursor: 'pointer',
      }}
      onMouseOver={e => e.currentTarget.style.background = '#fffbeb'}
      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
    >
      <Clipboard size={11} /> {label}
    </button>
  )
}

// ── Editable Section ──────────────────────────────────────────────────────────

function EditableSection({ section, onEditLine, onCut }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: section.id })

  const [hovered, setHovered] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 40 : undefined,
    position: 'relative',
    marginTop: section.header ? '12px' : '0',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover toolbar */}
      {(hovered || isDragging) && (
        <div
          style={{
            position: 'absolute', right: 0, top: 0, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: '2px',
            background: '#fff', border: '1px solid #ddd',
            borderRadius: '4px', padding: '2px 4px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          }}
        >
          <button
            title='Drag to reorder section'
            style={{ color: '#999', cursor: 'grab', lineHeight: 0, padding: '2px' }}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={13} />
          </button>
          <button
            title='Cut section (to paste elsewhere)'
            style={{ color: '#999', cursor: 'pointer', lineHeight: 0, padding: '2px' }}
            onClick={onCut}
            onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
            onMouseOut={e => e.currentTarget.style.color = '#999'}
          >
            <Scissors size={13} />
          </button>
        </div>
      )}

      {/* Section header line */}
      {section.header && (
        <EditableLineItem
          line={section.header}
          lineIdx={-1}
          onCommit={(text) => onEditLine(-1, text)}
        />
      )}

      {/* Body lines */}
      {section.lines.map((line, li) =>
        line.type === 'blank'
          ? <div key={li} style={{ height: '8px' }} />
          : (
            <EditableLineItem
              key={li}
              line={line}
              lineIdx={li}
              onCommit={(text) => onEditLine(li, text)}
            />
          )
      )}
    </div>
  )
}

// ── Editable Line Item ────────────────────────────────────────────────────────

const CHORD_STYLE = {
  fontFamily: 'monospace',
  fontSize: '14px',
  color: '#1d4ed8',
  display: 'block',
  lineHeight: '1.3',
  whiteSpace: 'pre',
  cursor: 'text',
  borderRadius: '2px',
  padding: '0 2px',
}

const LYRIC_STYLE = {
  fontFamily: 'Arial, sans-serif',
  fontSize: '16px',
  color: '#000000',
  display: 'block',
  lineHeight: '1.35',
  marginBottom: '2px',
  cursor: 'text',
  borderRadius: '2px',
  padding: '0 2px',
}

const HEADER_STYLE = {
  fontFamily: 'Arial, sans-serif',
  fontSize: '16px',
  fontWeight: '700',
  color: '#000000',
  display: 'block',
  lineHeight: '1.2',
  marginBottom: '2px',
  cursor: 'text',
  borderRadius: '2px',
  padding: '0 2px',
}

const INPUT_EXTRA = {
  border: '1px solid #60a5fa',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  background: '#eff6ff',
}

function EditableLineItem({ line, lineIdx, onCommit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  const displayText = lineDisplayText(line)

  const startEdit = () => {
    setDraft(displayText)
    setEditing(true)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }

  const commit = () => {
    onCommit(draft)
    setEditing(false)
  }

  const cancel = () => setEditing(false)

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') cancel()
  }

  if (line.type === 'section_header') {
    if (editing) {
      return (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          style={{ ...HEADER_STYLE, ...INPUT_EXTRA }}
        />
      )
    }
    return (
      <span
        style={HEADER_STYLE}
        title='Click to edit'
        onClick={startEdit}
        onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        {displayText || <span style={{ color: '#bbb', fontStyle: 'italic' }}>Section header</span>}
      </span>
    )
  }

  if (line.type === 'chord_line') {
    if (editing) {
      return (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          style={{ ...CHORD_STYLE, ...INPUT_EXTRA }}
        />
      )
    }
    return (
      <span
        style={CHORD_STYLE}
        title='Click to edit'
        onClick={startEdit}
        onMouseOver={e => e.currentTarget.style.background = '#eff6ff'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        {displayText || ' '}
      </span>
    )
  }

  if (line.type === 'lyric_line') {
    if (editing) {
      return (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          style={{ ...LYRIC_STYLE, ...INPUT_EXTRA }}
        />
      )
    }
    return (
      <span
        style={LYRIC_STYLE}
        title='Click to edit'
        onClick={startEdit}
        onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        {displayText || ' '}
      </span>
    )
  }

  return null
}
