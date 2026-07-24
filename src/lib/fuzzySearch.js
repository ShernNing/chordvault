// Typo-tolerant search matching for the song library.
//
// Goals: an accent-insensitive, punctuation-insensitive match that also
// forgives small spelling slips — "praise" still finds "paise", "beatles"
// finds "beatls". Exact substrings always win; fuzziness only kicks in for
// tokens long enough that an edit-distance match isn't just noise.

/** Lowercase, strip diacritics, collapse punctuation to single spaces. */
export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining marks (accents)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Levenshtein edit distance with an early-exit ceiling. Returns the true
 * distance when it is ≤ max, otherwise max + 1 (cheap "too far" signal).
 */
export function boundedLevenshtein(a, b, max) {
  if (a === b) return 0
  const al = a.length
  const bl = b.length
  if (al === 0) return bl <= max ? bl : max + 1
  if (bl === 0) return al <= max ? al : max + 1
  if (Math.abs(al - bl) > max) return max + 1

  let prev = new Array(bl + 1)
  for (let j = 0; j <= bl; j++) prev[j] = j
  for (let i = 1; i <= al; i++) {
    const cur = new Array(bl + 1)
    cur[0] = i
    let rowMin = cur[0]
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= bl; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[bl]
}

// Longer query words tolerate more typos; short ones must match as substrings
// so a 3-letter query doesn't fuzzily hit half the library.
function fuzzThreshold(len) {
  if (len <= 3) return 0
  if (len <= 5) return 1
  if (len <= 8) return 2
  return 3
}

/** Does one query token match one haystack word (substring or near-typo)? */
export function wordMatches(qWord, hayWord) {
  if (!qWord) return true
  // Forward substring only — a typed prefix/fragment of a stored word. The
  // reverse (query contains the word) would let any long query match a 1–2
  // letter word like "o", so extra characters are left to edit distance.
  if (hayWord.includes(qWord)) return true
  const max = fuzzThreshold(qWord.length)
  if (max === 0) return false
  return boundedLevenshtein(qWord, hayWord, max) <= max
}

/**
 * Fuzzy-match a raw query against a list of fields (title, artist, key, tags).
 * Returns true when the whole query is a contiguous substring of the joined
 * text, OR every query token near-matches some word in it.
 */
export function fuzzyMatch(query, fields) {
  const qn = normalizeText(query)
  if (!qn) return true
  const hay = normalizeText(Array.isArray(fields) ? fields.join(' ') : fields)
  if (!hay) return false
  if (hay.includes(qn)) return true // fast path: exact contiguous match

  const hayWords = hay.split(' ')
  const qTokens = qn.split(' ')
  return qTokens.every((qt) => hayWords.some((hw) => wordMatches(qt, hw)))
}

/**
 * Relevance score for a query against weighted fields
 *   fields: [{ text, weight }]   (higher weight = more important, e.g. title)
 * Returns 0 when any query token matches nothing (so the row is filtered out),
 * otherwise a positive number where a title hit outranks a lyric hit. Exact
 * word > prefix > substring > near-typo; a whole-query contiguous hit adds a
 * bonus so phrase matches float to the top.
 */
export function scoreFields(query, fields) {
  const qn = normalizeText(query)
  if (!qn) return 1
  const qTokens = qn.split(' ')
  const norm = fields.map((f) => {
    const text = normalizeText(f.text)
    return { weight: f.weight ?? 1, text, words: text ? text.split(' ') : [] }
  })

  let total = 0
  for (const qt of qTokens) {
    let best = 0
    const max = fuzzThreshold(qt.length)
    for (const f of norm) {
      if (!f.text) continue
      let s = 0
      for (const w of f.words) {
        if (w === qt) s = Math.max(s, 4)
        else if (w.startsWith(qt)) s = Math.max(s, 3)
        else if (w.includes(qt)) s = Math.max(s, 2.5)
        else if (max > 0) {
          const d = boundedLevenshtein(qt, w, max)
          if (d <= max) s = Math.max(s, 2 - d * 0.4)
        }
        if (s >= 4) break
      }
      best = Math.max(best, s * f.weight)
    }
    if (best === 0) return 0 // every token must land somewhere
    total += best
  }
  for (const f of norm) {
    if (f.text.includes(qn)) { total += 5 * f.weight; break }
  }
  return total
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Split `text` into [{ text, hit }] segments, marking case-insensitive matches
 * of any query token (≥2 chars) as hits. Highlights exact/substring matches
 * only — near-typo matches stay unmarked. Used to render <mark> spans.
 */
export function highlightSegments(text, query) {
  const raw = String(text ?? '')
  const tokens = [...new Set(normalizeText(query).split(' '))].filter(
    (t) => t.length >= 2,
  )
  if (!tokens.length || !raw) return [{ text: raw, hit: false }]
  const re = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'ig')
  const out = []
  let last = 0
  let m
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) out.push({ text: raw.slice(last, m.index), hit: false })
    out.push({ text: m[0], hit: true })
    last = m.index + m[0].length
    if (m.index === re.lastIndex) re.lastIndex++ // guard against zero-width
  }
  if (last < raw.length) out.push({ text: raw.slice(last), hit: false })
  return out
}
