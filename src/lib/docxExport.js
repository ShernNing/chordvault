import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  ShadingType,
} from 'docx'
import { transposeParsedContent } from './transposition'

function chordLineToText(line) {
  if (line.tokens) {
    return line.tokens.map(t => ' '.repeat(t.leadingSpaces || 0) + t.text).join('')
  }
  return line.raw || ''
}

function songToParagraphs(song, semitones, targetKey, keyLabel, songNumber) {
  const content = semitones !== 0
    ? transposeParsedContent(song.parsed_content, semitones, targetKey)
    : song.parsed_content

  const titleParts = [
    songNumber != null ? `${songNumber}.` : null,
    song.title,
    song.artist ? `- ${song.artist}` : null,
    keyLabel ? `(${keyLabel})` : null,
  ].filter(Boolean).join(' ')

  const paragraphs = [
    new Paragraph({
      children: [
        new TextRun({
          text: titleParts,
          bold: true,
          color: 'FFFFFF',
          size: 26,
        }),
      ],
      shading: {
        type: ShadingType.SOLID,
        color: '000000',
        fill: '000000',
      },
      spacing: { after: 120 },
    }),
  ]

  for (const line of (content || [])) {
    if (line.type === 'blank') {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 0 } }))
    } else if (line.type === 'section_header') {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: line.text, bold: true, size: 22 })],
        spacing: { before: 120, after: 40 },
      }))
    } else if (line.type === 'chord_line') {
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: chordLineToText(line),
          bold: true,
          font: 'Courier New',
          size: 20,
        })],
        spacing: { before: 60, after: 0 },
      }))
    } else {
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: line.text || '',
          font: 'Courier New',
          size: 20,
        })],
        spacing: { after: 0 },
      }))
    }
  }

  return paragraphs
}

export async function exportSongToDocx(song, semitones, targetKey, keyLabel) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: songToParagraphs(song, semitones, targetKey, keyLabel, null),
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeTitle = (song.title || 'song').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  a.download = `${safeTitle}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportSetlistToDocx(setlistName, slots, getSongData) {
  const allParagraphs = []

  for (let i = 0; i < slots.length; i++) {
    const { song, semitones, targetKey, keyLabel } = getSongData(slots[i])
    if (!song) continue
    if (allParagraphs.length > 0) {
      allParagraphs.push(new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true }))
    }
    allParagraphs.push(...songToParagraphs(song, semitones, targetKey, keyLabel, i + 1))
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: allParagraphs,
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().split('T')[0]
  const safeName = (setlistName || 'setlist').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  a.download = `${safeName}-${date}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
