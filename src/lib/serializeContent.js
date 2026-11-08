// Serialise parsed_content back into raw chord-sheet text that parseRawContent
// (ingestion.js) turns back into the same lines.
//
// Why: songs store both raw_content (what the Edit modal shows and re-parses)
// and parsed_content (what is rendered). Any write that changes parsed_content
// directly — Save key, arrangement, line-type fixes, Accept all — must also
// write a matching raw_content, otherwise the next Edit → Save re-parses the
// OLD raw text and silently wipes the change.
//
// Syntax mirrored from parseRawContent:
//   annotation      → "! text"
//   section_header  → "[Verse 1]" (already normalised; re-normalises to itself)
//   chord_line      → tokens re-joined with their leadingSpaces. If the plain
//                     text would not re-parse as the same chord line (e.g. a
//                     line the user forced to "chord"), all-chord lines are
//                     written in inline-bracket form "[G]   [C]", which the
//                     parser maps back to the same chord columns.
//   lyric_line      → text verbatim
//   blank           → ""
//
// Known limitation: the parser has no syntax to force a line to be a lyric, so a
// lyric line whose text looks like chords (a manual chord→lyric fix) re-parses
// as a chord line, and per-line `uncertain` flags are re-derived on re-parse.

import { parseRawContent } from './ingestion'

// Same pattern parseInlineChordFormat accepts inside brackets.
const INLINE_CHORD_RE = /^[A-G][#b]?(?:maj|min|m|M|sus|dim|aug|add)?[0-9]*(?:\/[A-G][#b]?)?$/

function tokensToText(tokens) {
  return (tokens || []).map(t => ' '.repeat(t.leadingSpaces || 0) + (t.text ?? '')).join('')
}

function sameTokens(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((t, i) => t.text === b[i].text && (t.leadingSpaces || 0) === (b[i].leadingSpaces || 0))
}

function reparsesAsChordLine(text, tokens) {
  const out = parseRawContent(text)
  return out.length === 1 && out[0].type === 'chord_line' && sameTokens(out[0].tokens, tokens)
}

// Inline-bracket form: "[G]" placed so the parser's chord column equals the
// token's original column. The parser pads the chord line up to the lyric
// position (= count of spaces emitted so far), so spaces before token i are
// col_i - col_{i-1}.
function inlineChordText(tokens) {
  let out = ''
  let prevCol = 0
  let col = 0
  tokens.forEach((t, i) => {
    col += (t.leadingSpaces || 0)
    out += ' '.repeat(i === 0 ? col : col - prevCol) + `[${t.text}]`
    prevCol = col
    col += t.text.length
  })
  return out
}

function serializeChordLine(line) {
  const tokens = line.tokens
  if (!Array.isArray(tokens) || tokens.length === 0) return line.raw ?? ''
  const plain = tokensToText(tokens)
  if (reparsesAsChordLine(plain, tokens)) return plain
  if (tokens.every(t => INLINE_CHORD_RE.test(t.text || ''))) {
    const inline = inlineChordText(tokens)
    if (reparsesAsChordLine(inline, tokens)) return inline
  }
  return plain
}

function serializeHeader(text) {
  const t = (text || '').trim()
  if (!t) return ''
  return /^\[.*\]$/.test(t) ? t : `[${t}]`
}

export function serializeLine(line) {
  switch (line?.type) {
    case 'annotation': return `! ${line.text ?? ''}`
    case 'section_header': return serializeHeader(line.text)
    case 'chord_line': return serializeChordLine(line)
    case 'blank': return ''
    case 'lyric_line':
    default:
      return line?.text ?? ''
  }
}

/** parsed_content (array of line objects) → raw chord-sheet text. */
export function serializeParsedContent(parsed) {
  if (!Array.isArray(parsed)) return ''
  return parsed.map(serializeLine).join('\n')
}
