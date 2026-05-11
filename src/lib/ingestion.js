import { Note } from 'tonal'

const SECTION_NAME_MAP = {
  'intro': 'Intro',
  'verse': 'Verse',
  'pre-chorus': 'Pre-Chorus',
  'prechorus': 'Pre-Chorus',
  'pre chorus': 'Pre-Chorus',
  'chorus': 'Chorus',
  'bridge': 'Bridge',
  'instrumental': 'Instrumental',
  'outro': 'Outro',
  'tag': 'Tag',
  'hook': 'Hook',
  'interlude': 'Interlude',
  'coda': 'Coda',
  'ending': 'Ending',
  'turnaround': 'Turnaround',
  'vamp': 'Vamp',
}

export function cleanSongTitle(title) {
  if (!title) return title
  // Strip key annotation: (G), (Key G), (Bb major), etc.
  const stripped = title.replace(/\s*\((?:Key\s*)?[A-G][#b]?\s*(?:major|minor|maj|min)?\s*\)/gi, '').trim()
  // Title case: capitalize first letter of each word, lowercase rest
  return stripped.replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

export function normalizeSectionHeader(text) {
  const trimmed = text.trim()
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1).trim()
    : trimmed.replace(/:$/, '').trim()

  const lower = inner.toLowerCase()
  const numMatch = lower.match(/^(.+?)\s*(\d+)$/)
  const baseName = numMatch ? numMatch[1].trim() : lower
  const num = numMatch ? numMatch[2] : null

  const canonical = SECTION_NAME_MAP[baseName]
  if (canonical) {
    return `[${num ? `${canonical} ${num}` : canonical}]`
  }

  // Unknown section: title-case each word
  const titleCased = inner.replace(/\b\w/g, c => c.toUpperCase())
  return `[${titleCased}]`
}

export const CHORD_REGEX = /^[A-G][#b]?(maj|min|m|M|sus|dim|aug|add|6|7|9|11|13)?[0-9]*(\/[A-G][#b]?)?$/

export function isChord(token) {
  if (!token || token.length === 0) return false
  const clean = token.replace(/[()]/g, '').trim()
  return CHORD_REGEX.test(clean)
}

function isSectionHeader(line) {
  const trimmed = line.trim()
  if (/^\[.+\]$/.test(trimmed)) return true
  if (/^(Verse|Chorus|Bridge|Pre-Chorus|Outro|Intro|Tag|Ending|Interlude|Hook|Vamp|Turnaround|Coda)\s*\d*:?\s*$/i.test(trimmed)) return true
  return false
}

function isChordLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/[,!?]/.test(trimmed)) return false
  if (/\.$/.test(trimmed)) return false
  const tokens = trimmed.split(/\s+/).filter(t => t.length > 0)
  if (tokens.length === 0) return false
  const chordTokens = tokens.filter(t => isChord(t))
  const ratio = chordTokens.length / tokens.length
  return ratio >= 0.6 && chordTokens.length >= 1
}

export function classifyLine(line) {
  if (!line.trim()) return 'blank'
  if (isSectionHeader(line)) return 'section_header'
  if (isChordLine(line)) return 'chord_line'
  return 'lyric_line'
}

export function tokenizeChordLine(line) {
  const tokens = []
  const regex = /(\s*)(\S+)/g
  let match
  while ((match = regex.exec(line)) !== null) {
    tokens.push({ text: match[2], isChord: isChord(match[2]), leadingSpaces: match[1].length })
  }
  return tokens
}

export function parseInlineChordFormat(line) {
  const chordPattern = /\[([A-G][#b]?(?:maj|min|m|M|sus|dim|aug|add)?[0-9]*(?:\/[A-G][#b]?)?)\]/g
  if (!chordPattern.test(line)) return null
  chordPattern.lastIndex = 0
  let chordLine = '', lyricLine = '', lastIndex = 0, lyricPos = 0, match
  while ((match = chordPattern.exec(line)) !== null) {
    const beforeChord = line.slice(lastIndex, match.index).replace(/\[[^\]]*\]/g, '')
    lyricLine += beforeChord
    lyricPos += beforeChord.length
    while (chordLine.length < lyricPos) chordLine += ' '
    chordLine += match[1]
    lastIndex = match.index + match[0].length
  }
  lyricLine += line.slice(lastIndex).replace(/\[[^\]]*\]/g, '')
  return { chordLine, lyricLine }
}

export function parseRawContent(rawText) {
  const rawLines = rawText.split('\n')
  const parsedLines = []
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    const inlineResult = parseInlineChordFormat(line)
    if (inlineResult) {
      parsedLines.push({ type: 'chord_line', tokens: tokenizeChordLine(inlineResult.chordLine), raw: inlineResult.chordLine, uncertain: false })
      if (inlineResult.lyricLine.trim()) parsedLines.push({ type: 'lyric_line', text: inlineResult.lyricLine, uncertain: false })
      continue
    }
    const lineType = classifyLine(line)
    switch (lineType) {
      case 'section_header': parsedLines.push({ type: 'section_header', text: normalizeSectionHeader(line.trim()) }); break
      case 'chord_line': {
        const tokens = tokenizeChordLine(line)
        const chordCount = tokens.filter(t => t.isChord).length
        const confidence = tokens.length > 0 ? chordCount / tokens.length : 0
        parsedLines.push({ type: 'chord_line', tokens, raw: line, uncertain: confidence < 0.8 })
        break
      }
      case 'lyric_line': parsedLines.push({ type: 'lyric_line', text: line, uncertain: false }); break
      case 'blank': parsedLines.push({ type: 'blank', text: '' }); break
      default: parsedLines.push({ type: 'lyric_line', text: line, uncertain: false })
    }
  }
  return stripIntraPairBlanks(collapseBlanks(parsedLines))
}

function collapseBlanks(lines) {
  const result = []
  let lastWasBlank = false
  for (const line of lines) {
    if (line.type === 'blank') { if (!lastWasBlank) result.push(line); lastWasBlank = true }
    else { result.push(line); lastWasBlank = false }
  }
  return result
}

function stripIntraPairBlanks(lines) {
  return lines.filter((line, i) => {
    if (line.type !== 'blank') return true
    const prev = lines[i - 1]
    const next = lines[i + 1]
    if (prev?.type === 'chord_line' && next?.type === 'lyric_line') return false
    if (prev?.type === 'section_header') return false
    return true
  })
}

export function extractChords(parsedContent) {
  const chords = []
  for (const line of parsedContent) {
    if (line.type === 'chord_line' && line.tokens) {
      for (const token of line.tokens) { if (token.isChord) chords.push(token.text) }
    }
  }
  return chords
}

// ─── Key Detection: Roman Numeral Degree Weighting ────────────────────────
//
// Each chord is scored by its harmonic function (degree) relative to the candidate key.
// Degrees with higher harmonic significance get higher weights.
// A quality match bonus rewards when chord quality matches expected diatonic quality.
// A quality mismatch penalty identifies when a chord doesn't belong to the key.
// A tonic presence bonus strongly rewards keys whose I chord actually appears.
// This correctly resolves relative major/minor ambiguity (e.g. F major vs D minor).
// Title annotation "(F)" or "(Key G)" always overrides detection — it's ground truth.

const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

function pcIndex(note) {
  const pc = Note.pitchClass(note)
  const i = CHROMATIC.indexOf(pc)
  return i !== -1 ? i : CHROMATIC.indexOf(Note.pitchClass(Note.enharmonic(pc)))
}

function semitones(from, to) {
  const fi = pcIndex(from), ti = pcIndex(to)
  if (fi === -1 || ti === -1) return -1
  return (ti - fi + 12) % 12
}

function chordQuality(chord) {
  const base = chord.split('/')[0]
  const root = base.match(/^([A-G][#b]?)/)?.[1] || ''
  const qual = base.slice(root.length)
  if (!qual || /^(maj|M|add|sus|6|9|11|13)/.test(qual)) return 'major'
  if (/^(m|min)/.test(qual) && !/^maj/.test(qual)) return 'minor'
  if (/^dim/.test(qual)) return 'dim'
  return 'ext'
}

// Degree weights: I=3, IV=V=2, ii=vi=1, iii=0.5, vii=0.3
const MAJ_W = { 0:3.0, 2:1.0, 4:0.5, 5:2.0, 7:2.0, 9:1.0, 11:0.3 }
const MAJ_Q = { 0:'major', 2:'minor', 4:'minor', 5:'major', 7:'major', 9:'minor', 11:'dim' }
const MIN_W = { 0:3.0, 2:1.0, 3:2.0, 5:1.5, 7:2.5, 8:1.0, 10:0.8 }
const MIN_Q = { 0:'minor', 2:'dim', 3:'major', 5:'minor', 7:'minor', 8:'major', 10:'major' }

function scoreKey(tonic, chords, weights, qualities, expectedTonicQuality) {
  let score = 0
  const tonicPC = Note.pitchClass(tonic)
  for (const chord of chords) {
    const rootRaw = chord.split('/')[0].match(/^([A-G][#b]?)/)?.[1]
    if (!rootRaw) continue
    const iv = semitones(tonic, rootRaw)
    const w = weights[iv]
    if (!w) continue
    score += w
    const eq = qualities[iv], aq = chordQuality(chord)
    if (eq && aq !== 'ext') score += (aq === eq ? 1.5 : -1.0)
  }
  // Tonic presence bonus: tonic chord with correct quality appears in song
  const tonicAppearsCorrectly = chords.some(chord => {
    const rootRaw = chord.split('/')[0].match(/^([A-G][#b]?)/)?.[1]
    if (!rootRaw) return false
    const rootPC = Note.pitchClass(rootRaw)
    const sameRoot = rootPC === tonicPC || Note.pitchClass(Note.enharmonic(rootRaw)) === tonicPC
    return sameRoot && chordQuality(chord) === expectedTonicQuality
  })
  if (tonicAppearsCorrectly) score += 3.0
  return score
}

export function detectKey(chords) {
  if (!chords || chords.length === 0) return null
  const ALL_MAJOR_KEYS = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F']
  const results = []
  for (const keyName of ALL_MAJOR_KEYS) {
    const ms = scoreKey(keyName, chords, MAJ_W, MAJ_Q, 'major')
    if (ms > 0) results.push({ key: keyName, mode: 'major', score: ms })
    const minorIdx = (pcIndex(keyName) + 9) % 12
    const minorTonic = CHROMATIC[minorIdx]
    const mns = scoreKey(minorTonic, chords, MIN_W, MIN_Q, 'minor')
    if (mns > 0) results.push({ key: minorTonic + 'm', mode: 'minor', score: mns })
  }
  if (results.length === 0) return null
  results.sort((a, b) => b.score - a.score)
  const best = results[0]
  const tonicNote = best.key.replace(/m$/, '')
  const weights = best.mode === 'minor' ? MIN_W : MAJ_W
  const fitting = chords.filter(c => {
    const r = c.split('/')[0].match(/^([A-G][#b]?)/)?.[1]
    return r && weights[semitones(tonicNote, r)] !== undefined
  }).length
  const confidence = fitting / chords.length
  if (confidence < 0.35) return null
  return { key: best.key, mode: best.mode, confidence, score: best.score }
}

export function extractKeyFromTitle(title) {
  if (!title) return null
  // Matches: (F), (Key G), (Bb), (F#), (Key Eb major), etc.
  const match = title.match(/\((?:Key\s*)?([A-G][#b]?)\s*(?:major|minor|maj|min)?\s*\)/i)
  return match ? match[1] : null
}

export function detectAccidentalPreference(chords) {
  let flats = 0, sharps = 0
  for (const chord of chords) {
    if (/[A-G]b/.test(chord)) flats++
    if (chord.includes('#')) sharps++
  }
  if (flats > sharps) return 'flat'
  if (sharps > flats) return 'sharp'
  return 'natural'
}

export function ingest(rawText, title = '') {
  const parsedContent = parseRawContent(rawText)
  const chords = extractChords(parsedContent)
  const titleKey = extractKeyFromTitle(title)
  const detectedKey = detectKey(chords)
  const accidentalPref = detectAccidentalPreference(chords)

  // Title annotation always wins — it's what the worship leader wrote
  let originalKey = titleKey || detectedKey?.key || null
  const keyMismatch = !!(titleKey && detectedKey?.key && detectedKey.key !== titleKey && detectedKey.confidence > 0.7)
  const uncertainLines = parsedContent.filter(l => l.uncertain).length

  return {
    parsed_content: parsedContent,
    original_key: originalKey,
    detected_key: detectedKey,
    title_key: titleKey,
    key_mismatch: keyMismatch,
    accidental_preference: accidentalPref,
    chord_count: chords.length,
    uncertain_line_count: uncertainLines,
    has_warnings: keyMismatch || uncertainLines > 0,
  }
}
