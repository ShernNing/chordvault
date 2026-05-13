import { Document, Paragraph, TextRun, Packer } from 'docx'
import { transposeParsedContent } from './transposition'
import { normalizeSectionHeader, cleanSongTitle } from './ingestion'

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
        children: [new TextRun({ text: normalizeSectionHeader(line.text), bold: true, size: 28, font: 'Arial' })],
        spacing: { before: 120, after: 40 },
      }))
    } else if (line.type === 'chord_line') {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: chordLineToText(line), bold: true, font: 'Arial', size: 28 })],
        spacing: { before: 40, after: 0 },
      }))
    } else {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: line.text || '', font: 'Arial', size: 28 })],
        spacing: { after: 0 },
      }))
    }
  }

  return paragraphs
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
  const safeTitle = (song.title || 'song').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  await triggerDownload(doc, `${safeTitle}.docx`)
}

export async function exportSetlistToDocx(setlistName, slots, getSongData) {
  const allParagraphs = []

  for (let i = 0; i < slots.length; i++) {
    const { song, semitones, targetKey, keyLabel } = getSongData(slots[i])
    if (!song) continue
    if (allParagraphs.length > 0) {
      allParagraphs.push(new Paragraph({ pageBreakBefore: true, children: [] }))
    }
    allParagraphs.push(...songToParagraphs(song, semitones, targetKey, keyLabel, i + 1))
  }

  const doc = new Document({
    sections: [{ properties: {}, children: allParagraphs }],
  })
  const safeName = (setlistName || 'setlist').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  await triggerDownload(doc, `${safeName}.docx`)
}
