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

import { parseRawContent, extractChords, detectKey, extractKeyFromTitle, detectAccidentalPreference, cleanSongTitle, cleanArtistName } from './ingestion'

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
 *
 * Groups text items by Y position to reconstruct lines — critical for chord sheets
 * where each chord line and lyric line must be on its own text line.
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
  const pageTexts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    pageTexts.push(reconstructLinesFromPDF(textContent.items))
  }
  return pageTexts.join('\n')
}

/**
 * Reconstruct text lines from pdf.js text items by grouping on Y position.
 *
 * pdf.js gives raw text runs with (x, y) coordinates. A naive join(' ') collapses
 * all lines into one blob and splits words mid-character. This function:
 *  1. Buckets items by Y coordinate (within a 3-unit tolerance)
 *  2. Sorts each bucket left-to-right by X
 *  3. Joins items with a space only when there's a real gap between them
 *  4. Inserts blank lines where the vertical gap between consecutive lines is
 *     larger than ~1.5 line heights (paragraph break)
 */
function reconstructLinesFromPDF(items) {
  if (!items.length) return ''

  // Bucket items by Y position — PDF y=0 is page bottom, so higher y = higher on page
  const Y_TOLERANCE = 3
  const buckets = []
  for (const item of items) {
    if (!item.str) continue
    const y = item.transform[5]
    const existing = buckets.find(b => Math.abs(b.y - y) <= Y_TOLERANCE)
    if (existing) {
      existing.items.push(item)
    } else {
      buckets.push({ y, items: [item] })
    }
  }

  // Sort top-to-bottom (descending y in PDF space)
  buckets.sort((a, b) => b.y - a.y)

  // Estimate typical line height from median y-gap between consecutive buckets
  let lineHeight = 12 // default ~12pt
  if (buckets.length > 1) {
    const gaps = []
    for (let i = 1; i < buckets.length; i++) {
      gaps.push(buckets[i - 1].y - buckets[i].y)
    }
    gaps.sort((a, b) => a - b)
    lineHeight = gaps[Math.floor(gaps.length / 2)] || 12
  }

  const lines = []
  for (let i = 0; i < buckets.length; i++) {
    // Insert a blank line when vertical gap is larger than 1.5 line heights
    if (i > 0) {
      const gap = buckets[i - 1].y - buckets[i].y
      if (gap > lineHeight * 1.5) lines.push('')
    }

    // Sort items in this line left-to-right
    const sortedItems = [...buckets[i].items].sort((a, b) => a.transform[4] - b.transform[4])

    // Join items — no space when items are immediately adjacent (kerning), space when gap exists
    let lineStr = ''
    for (let j = 0; j < sortedItems.length; j++) {
      const item = sortedItems[j]
      if (j === 0) {
        lineStr = item.str
      } else {
        const prev = sortedItems[j - 1]
        const prevRight = prev.transform[4] + (prev.width || 0)
        const gap = item.transform[4] - prevRight
        lineStr += (gap > 2 ? ' ' : '') + item.str
      }
    }

    const trimmed = lineStr.trim()
    if (trimmed) lines.push(trimmed)
  }

  return lines.join('\n')
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

// Patterns that indicate the start of a new song.
// Keep these strict — false positives are worse than false negatives.
// Chord lines are all-caps letters+spaces, so never use a generic all-caps pattern.
const SONG_TITLE_PATTERNS = [
  // "1. The Joy (F)" or "2. TRIBES – Victory Worship (G)"
  /^\d+[.)]\s+.{2,}/,
  // "Matchless Love – Sinach (B)" — hyphen + key annotation
  /^[A-Z].+[–-].+\([A-G][#b]?\)/,
  // "Precious Jesus – Sinach" — em/en-dash without key (strong artist separator signal)
  /^[A-Z].+[–—].+/,
  // Category separator labels
  /^(?:communion|post[\s-]?sermon)\s*$/i,
]

// Category labels that are section separators, not song titles.
// When detected as rawTitle, the real song title is the first line of rawContent.
const CATEGORY_LABEL_RE = /^(?:\d+[.)]\s*)?(?:communion|post[\s-]?sermon)\s*$/i

// Patterns that are definitely NOT song titles
const SKIP_PATTERNS = [
  /^\[/,           // section header like [Verse 1]
  /^INTERLUDE/i,
  /^(Ayo|ayo)/,    // phonetic/vocal lines
]

function looksLikeSongTitle(trimmed) {
  if (!trimmed || trimmed.length < 2) return false
  if (SKIP_PATTERNS.some(p => p.test(trimmed))) return false
  return SONG_TITLE_PATTERNS.some(p => p.test(trimmed))
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

    if (!trimmed) {
      consecutiveBlanks++
      // Preserve up to 2 consecutive blank lines inside a song (chord-lyric formatting)
      if (currentTitle && consecutiveBlanks <= 2) {
        currentLines.push(line)
      }
      continue
    }
    consecutiveBlanks = 0

    if (looksLikeSongTitle(trimmed)) {
      // Save the current song if it has real content
      if (currentTitle && currentLines.some(l => l.trim())) {
        songs.push({ rawTitle: currentTitle, rawContent: currentLines.join('\n').trim() })
      }
      currentTitle = trimmed
      currentLines = []
      continue
    }

    if (currentTitle) {
      currentLines.push(line)
    }
  }

  // Flush last song
  if (currentTitle && currentLines.some(l => l.trim())) {
    songs.push({ rawTitle: currentTitle, rawContent: currentLines.join('\n').trim() })
  }

  return songs
}

// ─── Title Cleaning ────────────────────────────────────────────────────────

/**
 * Clean a raw title for use as the song's display title.
 * "1. The Joy (F)" → "The Joy"
 * "2. TRIBES – Victory Worship (G)" → "TRIBES"
 * "Matchless Love – Sinach (B)" → "Matchless Love"
 */
export function cleanTitle(rawTitle) {
  let title = rawTitle.trim()
  // Remove leading number: "1. " or "1) "
  title = title.replace(/^\d+[.)]\s+/, '')
  // Remove key annotation: " (F)" or " (Key G)"
  title = title.replace(/\s*\((?:Key\s*)?[A-G][#b]?\s*(?:major|minor|maj|min)?\s*\)\s*$/i, '')
  // Strip artist credit "Song – Artist" — only when original had a key annotation,
  // which is the reliable signal that this is "Song – Artist (Key)" not a dash in a title.
  if (extractArtistFromTitle(rawTitle)) {
    title = title.replace(/\s*[–-]\s*.+$/, '')
  }
  return cleanSongTitle(title.trim())
}

/**
 * Extract artist from title if present.
 * "Matchless Love – Sinach (B)" → "Sinach"
 * "TRIBES – Victory Worship (G)" → "Victory Worship"
 *
 * Requires a key annotation to be present — distinguishes "Song – Artist (Key)"
 * from song titles that contain dashes (e.g. "Spirit Lead Me – Into Your Will").
 */
export function extractArtistFromTitle(rawTitle) {
  // Try: "Song – Artist (Key)" — hyphen/dash + key annotation
  const withKey = rawTitle.match(/[–-]\s*([^(–-]+?)\s*\((?:Key\s*)?[A-G][#b]?\s*(?:major|minor|maj|min)?\s*\)/i)
  if (withKey) return cleanArtistName(withKey[1])
  // Try: "Song – Artist" — em/en-dash without key (strong separator signal)
  const emDash = rawTitle.match(/[–—]\s*([^–—(]+?)\s*$/)
  if (emDash) return cleanArtistName(emDash[1])
  return ''
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
    // When rawTitle is a category label (Communion, Post Sermon, etc.),
    // the real song title is the first non-blank line of rawContent.
    let effectiveRawTitle = raw.rawTitle
    let effectiveRawContent = raw.rawContent
    if (CATEGORY_LABEL_RE.test(raw.rawTitle.trim())) {
      const contentLines = raw.rawContent.split('\n')
      const firstIdx = contentLines.findIndex(l => l.trim())
      if (firstIdx !== -1) {
        effectiveRawTitle = contentLines[firstIdx].trim()
        contentLines.splice(firstIdx, 1)
        while (contentLines.length > 0 && !contentLines[0].trim()) contentLines.shift()
        effectiveRawContent = contentLines.join('\n').trim()
      }
    }

    const title = cleanTitle(effectiveRawTitle)
    const artist = extractArtistFromTitle(effectiveRawTitle)
    const parsedContent = parseRawContent(effectiveRawContent)
    const chords = extractChords(parsedContent)
    const titleKey = extractKeyFromTitle(effectiveRawTitle)
    const detectedKey = detectKey(chords)
    const originalKey = titleKey || detectedKey?.key || null
    const accidentalPref = detectAccidentalPreference(chords)
    const uncertainLines = parsedContent.filter(l => l.uncertain).length

    return {
      id: `import-${Date.now()}-${index}`,
      rawTitle: effectiveRawTitle,
      title,
      artist,
      rawContent: effectiveRawContent,
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
