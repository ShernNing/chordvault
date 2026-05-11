/**
 * Document Import Pipeline
 *
 * Handles .docx and .pdf uploads.
 * Splits the document into individual songs, runs the ingestion pipeline on each,
 * and returns an array of song previews for user review before saving.
 *
 * Song boundary detection heuristics:
 *  - Bold/heading lines that look like "1. Song Title (Key)" or "Song Title – Artist (Key)"
 *  - "Communion" label lines (treated as a section break)
 *  - Two or more consecutive blank lines
 */

import { parseRawContent, extractChords, detectKey, extractKeyFromTitle, detectAccidentalPreference } from './ingestion'

// ─── DOCX Parsing ─────────────────────────────────────────────────────────

/**
 * Read a .docx file and return its plain text content.
 * Uses the mammoth library loaded dynamically.
 */
export async function extractTextFromDocx(file) {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value // plain text
}

// ─── PDF Parsing ──────────────────────────────────────────────────────────

/**
 * Read a PDF file and return its plain text content.
 * Uses pdf.js loaded from CDN.
 */
export async function extractTextFromPDF(file) {
  // Load pdfjs-dist from CDN
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const textParts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map(item => item.str).join(' ')
    textParts.push(pageText)
  }
  return textParts.join('\n')
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
}

// ─── Song Boundary Detection ───────────────────────────────────────────────

// Patterns that indicate the start of a new song
const SONG_TITLE_PATTERNS = [
  // "1. The Joy (F)" or "2. TRIBES – Victory Worship (G)"
  /^\d+\.\s+.{2,}/,
  // "Matchless Love – Sinach (B)" — has an em-dash or hyphen + key at end
  /^[A-Z].+[–\-].+\([A-G][#b]?\)/,
  // "Communion" as a standalone label
  /^Communion\s*$/i,
  // All-caps song title line (e.g. "AMAZING GRACE")
  /^[A-Z][A-Z\s\-']{4,}$/,
]

// Patterns that are definitely NOT song titles
const SKIP_PATTERNS = [
  /^\[/,           // section header
  /^INTERLUDE/i,
  /^(Ayo|ayo)/,    // phonetic lines
]

function looksLikeSongTitle(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length < 3) return false
  if (SKIP_PATTERNS.some(p => p.test(trimmed))) return false
  return SONG_TITLE_PATTERNS.some(p => p.test(trimmed))
}

function countConsecutiveBlanks(lines, fromIndex) {
  let count = 0
  for (let i = fromIndex; i < lines.length; i++) {
    if (!lines[i].trim()) count++
    else break
  }
  return count
}

/**
 * Split document text into an array of { rawTitle, rawContent } objects.
 * Each represents one detected song.
 */
export function splitDocumentIntoSongs(text) {
  const lines = text.split('\n')
  const songs = []
  let currentTitle = null
  let currentLines = []
  let consecutiveBlanks = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Track consecutive blanks — 3+ in a row = section break
    if (!trimmed) {
      consecutiveBlanks++
      if (currentTitle && consecutiveBlanks <= 2) {
        currentLines.push(line)
      }
      continue
    }
    consecutiveBlanks = 0

    // Check if this line is a new song title
    if (looksLikeSongTitle(trimmed)) {
      // Save the current song if we have content
      if (currentTitle && currentLines.some(l => l.trim())) {
        songs.push({ rawTitle: currentTitle, rawContent: currentLines.join('\n').trim() })
      }
      // Start new song
      currentTitle = trimmed
      currentLines = []
      continue
    }

    // Accumulate lines for current song
    if (currentTitle) {
      currentLines.push(line)
    }
  }

  // Don't forget the last song
  if (currentTitle && currentLines.some(l => l.trim())) {
    songs.push({ rawTitle: currentTitle, rawContent: currentLines.join('\n').trim() })
  }

  return songs
}

// ─── Title Cleaning ────────────────────────────────────────────────────────

/**
 * Clean a raw title for use as the song's display title.
 * "1. The Joy (F)" → "The Joy"
 * "Matchless Love – Sinach (B)" → "Matchless Love"
 */
export function cleanTitle(rawTitle) {
  let title = rawTitle.trim()
  // Remove leading number: "1. " or "1) "
  title = title.replace(/^\d+[\.\)]\s+/, '')
  // Remove key annotation: " (F)" or " (Key G)"
  title = title.replace(/\s*\((?:Key\s*)?[A-G][#b]?\s*(?:major|minor|maj|min)?\s*\)\s*$/i, '')
  // Remove artist after dash: "Song – Artist" → "Song"
  // BUT keep if no dash, or if it's part of the title
  // Only strip if followed by artist-looking text and a key annotation was already present
  return title.trim()
}

/**
 * Extract artist from title if present.
 * "Matchless Love – Sinach (B)" → "Sinach"
 * "TRIBES – Victory Worship (G)" → "Victory Worship"
 */
export function extractArtistFromTitle(rawTitle) {
  // Match "Song Name – Artist (Key)" or "Song Name - Artist (Key)"
  const match = rawTitle.match(/[–\-]\s*([^(\-–]+?)\s*(?:\([A-G][#b]?\))?$/)
  if (!match) return ''
  const candidate = match[1].trim()
  // Don't treat key annotations as artists
  if (/^\([A-G][#b]?\)$/.test(candidate)) return ''
  return candidate
}

// ─── Full Document Import Pipeline ────────────────────────────────────────

/**
 * Main entry point.
 * Takes a File object (.docx or .pdf), extracts text, splits into songs,
 * runs the ingestion pipeline on each, and returns preview objects.
 *
 * Returns array of:
 * {
 *   id: string (temp),
 *   rawTitle: string,
 *   title: string (cleaned),
 *   artist: string,
 *   rawContent: string,
 *   parsed_content: array,
 *   original_key: string | null,
 *   detected_key: object | null,
 *   title_key: string | null,
 *   chord_count: number,
 *   uncertain_line_count: number,
 *   has_warnings: boolean,
 *   status: 'pending' | 'accepted' | 'discarded'
 * }
 */
export async function importDocument(file) {
  let text = ''

  if (file.name.endsWith('.docx')) {
    text = await extractTextFromDocx(file)
  } else if (file.name.endsWith('.pdf')) {
    text = await extractTextFromPDF(file)
  } else {
    throw new Error('Unsupported file type. Please upload a .docx or .pdf file.')
  }

  const rawSongs = splitDocumentIntoSongs(text)

  if (rawSongs.length === 0) {
    throw new Error('No songs detected in this document. Make sure the document contains song titles followed by chord sheets.')
  }

  return rawSongs.map((raw, index) => {
    const title = cleanTitle(raw.rawTitle)
    const artist = extractArtistFromTitle(raw.rawTitle)
    const parsedContent = parseRawContent(raw.rawContent)
    const chords = extractChords(parsedContent)
    const titleKey = extractKeyFromTitle(raw.rawTitle)
    const detectedKey = detectKey(chords)
    const originalKey = titleKey || detectedKey?.key || null
    const accidentalPref = detectAccidentalPreference(chords)
    const uncertainLines = parsedContent.filter(l => l.uncertain).length

    return {
      id: `import-${Date.now()}-${index}`,
      rawTitle: raw.rawTitle,
      title,
      artist,
      rawContent: raw.rawContent,
      parsed_content: parsedContent,
      original_key: originalKey,
      detected_key: detectedKey,
      title_key: titleKey,
      accidental_preference: accidentalPref,
      chord_count: chords.length,
      uncertain_line_count: uncertainLines,
      has_warnings: uncertainLines > 0,
      status: 'pending', // 'pending' | 'accepted' | 'edited' | 'discarded'
      tags: [],
    }
  })
}
