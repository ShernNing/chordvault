import { Document, Paragraph, TextRun, Packer, UnderlineType } from 'docx'
import { transposeParsedContent } from './transposition'
import { normalizeSectionHeader, cleanSongTitle } from './ingestion'
import { numberSlots } from './setlistSegments'

function chordLineToText(line) {
  if (line.tokens) {
    return line.tokens.map(t => ' '.repeat(t.leadingSpaces || 0) + t.text).join('')
  }
  return line.raw || ''
}

function stripBlanks(lines) {
  return lines.filter((line, i) => {
    if (line.type !== 'blank') return true
    const prev = lines[i - 1]
    const next = lines[i + 1]
    if (prev?.type === 'chord_line' && next?.type === 'lyric_line') return false
    if (prev?.type === 'lyric_line' && next?.type === 'chord_line') return false
    if (prev?.type === 'section_header') return false
    return true
  })
}

function songToParagraphs(song, semitones, targetKey, keyLabel, songNumber) {
  const raw = semitones !== 0
    ? transposeParsedContent(song.parsed_content, semitones, targetKey)
    : song.parsed_content
  const content = stripBlanks(raw || [])

  const titleParts = [
    songNumber != null ? `${songNumber}.` : null,
    cleanSongTitle(song.title),
    song.artist ? `- ${song.artist}` : null,
    keyLabel ? `(${keyLabel})` : null,
  ].filter(Boolean).join(' ')

  const paragraphs = [
    new Paragraph({
      children: [new TextRun({ text: titleParts, bold: true, size: 28, font: 'Calibri' })],
      spacing: { after: 120 },
    }),
  ]

  for (const line of content) {
    if (line.type === 'blank') {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 0 } }))
    } else if (line.type === 'section_header') {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: normalizeSectionHeader(line.text), bold: true, size: 24, font: 'Arial' })],
        spacing: { before: 120, after: 40 },
      }))
    } else if (line.type === 'chord_line') {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: chordLineToText(line), bold: true, font: 'Arial', size: 24 })],
        spacing: { before: 40, after: 0 },
      }))
    } else {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: line.text || '', font: 'Arial', size: 24 })],
        spacing: { after: 0 },
      }))
    }
  }

  return paragraphs
}

// Mirrors the PDF SegmentHeading: big bold uppercase with a thick rule under
// the text only (thick underline, NOT a paragraph border — a paragraph border
// would span the full page width).
function segmentHeadingParagraph(label) {
  return new Paragraph({
    children: [
      new TextRun({
        text: (label || '').toUpperCase(),
        bold: true,
        size: 30, // half-points: 15pt ≈ the PDF's 20px
        font: 'Arial',
        underline: { type: UnderlineType.THICK, color: '000000' },
      }),
    ],
    spacing: { after: 240 },
  })
}

async function triggerDownload(doc, filename) {
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportSongToDocx(song, semitones, targetKey, keyLabel) {
  const doc = new Document({
    sections: [{ properties: {}, children: songToParagraphs(song, semitones, targetKey, keyLabel, null) }],
  })
  const safeTitle = (song.title || 'song').replace(/[/\\:*?"<>|]/g, '_')
  await triggerDownload(doc, `${safeTitle}.docx`)
}

export async function exportSetlistToDocx(setlistName, slots, getSongData) {
  const allParagraphs = []
  // A divider's heading is emitted with the first song of its segment so they
  // share a page (songs are one-per-page in docx, unlike the packed PDF).
  let pendingHeading = null

  const pushPageBreak = () => {
    if (allParagraphs.length > 0) {
      allParagraphs.push(new Paragraph({ pageBreakBefore: true, children: [] }))
    }
  }

  for (const entry of numberSlots(slots)) {
    if (entry.kind === 'divider') {
      // A divider directly after another divider would otherwise be lost.
      if (pendingHeading != null) {
        pushPageBreak()
        allParagraphs.push(segmentHeadingParagraph(pendingHeading))
      }
      pendingHeading = entry.label
      continue
    }
    const { song, semitones, targetKey, keyLabel } = getSongData(entry.slot)
    if (!song) continue
    pushPageBreak()
    if (pendingHeading != null) {
      allParagraphs.push(segmentHeadingParagraph(pendingHeading))
      pendingHeading = null
    }
    allParagraphs.push(...songToParagraphs(song, semitones, targetKey, keyLabel, entry.songNumber))
  }

  // Trailing divider with no songs after it still shows up in the export.
  if (pendingHeading != null) {
    pushPageBreak()
    allParagraphs.push(segmentHeadingParagraph(pendingHeading))
  }

  const doc = new Document({
    sections: [{ properties: {}, children: allParagraphs }],
  })
  const safeName = (setlistName || 'setlist').replace(/[/\\:*?"<>|]/g, '_')
  await triggerDownload(doc, `${safeName}.docx`)
}
