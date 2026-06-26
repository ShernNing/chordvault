import { Chord, Interval, Note, Key } from 'tonal'

// ─── Enharmonic Normalization ──────────────────────────────────────────────

const SHARP_KEYS = ['G', 'D', 'A', 'E', 'B', 'F#', 'C#']
const FLAT_KEYS  = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']

/**
 * Determine if a key prefers sharps or flats based on music theory convention.
 */
export function keyPrefersFlats(keyName) {
  if (!keyName) return false
  const root = keyName.replace('m', '').replace('minor', '').trim()
  return FLAT_KEYS.includes(root)
}

export function keyPrefersSharps(keyName) {
  if (!keyName) return false
  const root = keyName.replace('m', '').replace('minor', '').trim()
  return SHARP_KEYS.includes(root)
}

/**
 * Convert a note to the correct enharmonic spelling for a given key.
 * e.g. in Bb major: A# → Bb, in E major: Db → C#
 */
export function normalizeNoteForKey(noteName, targetKey) {
  if (!noteName || !targetKey) return noteName

  const useFlats = keyPrefersFlats(targetKey)
  const useSharps = keyPrefersSharps(targetKey)

  if (!useFlats && !useSharps) return noteName

  // Try enharmonic equivalent
  const enharmonic = Note.enharmonic(noteName)
  if (!enharmonic || enharmonic === noteName) return noteName

  const noteHasFlat = noteName.includes('b') && /[A-G]b/.test(noteName)
  const noteHasSharp = noteName.includes('#')
  const enhHasFlat = enharmonic.includes('b') && /[A-G]b/.test(enharmonic)
  const enhHasSharp = enharmonic.includes('#')

  if (useFlats && noteHasSharp && enhHasFlat) return enharmonic
  if (useSharps && noteHasFlat && enhHasSharp) return enharmonic

  return noteName
}

// ─── Chord Transposition ───────────────────────────────────────────────────

/**
 * Transpose a single chord by semitones.
 * Preserves chord quality, extensions, slash bass notes.
 * Uses musical convention for enharmonic spelling.
 *
 * @param {string} chordName - e.g. "Am7", "F/A", "Bbmaj7"
 * @param {number} semitones - number of semitones to transpose
 * @param {string} targetKey - target key for enharmonic preference (optional)
 * @returns {string} transposed chord name
 */
export function transposeChord(chordName, semitones, targetKey = null) {
  if (semitones === 0) return chordName
  if (!chordName) return chordName

  try {
    const interval = Interval.fromSemitones(semitones)

    // Handle slash chords: "F/A" → transpose both parts
    if (chordName.includes('/')) {
      const [chordPart, bassPart] = chordName.split('/')
      const transposedChord = transposeSingleChord(chordPart, interval, targetKey)
      const transposedBass = transposeNote(bassPart, interval, targetKey)
      return `${transposedChord}/${transposedBass}`
    }

    return transposeSingleChord(chordName, interval, targetKey)
  } catch (e) {
    console.warn('Transpose failed for chord:', chordName, e)
    return chordName
  }
}

function transposeSingleChord(chordName, interval, targetKey) {
  // Parse the chord to extract root + quality
  const parsed = Chord.get(chordName)
  if (!parsed || !parsed.tonic) {
    // Fallback: try to transpose just the root
    const rootMatch = chordName.match(/^([A-G][#b]?)(.*)$/)
    if (rootMatch) {
      const transposedRoot = transposeNote(rootMatch[1], interval, targetKey)
      return transposedRoot + rootMatch[2]
    }
    return chordName
  }

  const transposedRoot = transposeNote(parsed.tonic, interval, targetKey)

  // Rebuild chord with new root but same quality
  // Use the aliases array to get the original quality string
  const quality = chordName.slice(parsed.tonic.length)
  return transposedRoot + quality
}

function transposeNote(noteName, interval, targetKey) {
  try {
    let transposed = Note.transpose(noteName, interval)

    // Interval.fromSemitones can yield spellings (e.g. a tritone as a diminished
    // fifth) that, combined with flat/sharp roots, produce unreadable double
    // accidentals like Bbb or E##. Simplify first to collapse those to a single
    // accidental, then re-spell for the target key's preference below.
    const simplified = Note.simplify(transposed)
    if (simplified && simplified !== 'undefined') {
      transposed = simplified
    }

    // Apply enharmonic convention based on target key
    if (targetKey) {
      transposed = normalizeNoteForKey(transposed, targetKey)
    }

    // Remove octave number if present
    transposed = transposed.replace(/\d+$/, '')

    return transposed
  } catch (e) {
    return noteName
  }
}

// ─── Key Transposition ─────────────────────────────────────────────────────

/**
 * Transpose a key name by semitones.
 * @param {string} key - e.g. "G", "Bb", "F#m"
 * @param {number} semitones
 * @returns {string} transposed key
 */
export function transposeKey(key, semitones) {
  if (!key || semitones === 0) return key
  try {
    const isMinor = key.endsWith('m') && key.length > 1
    const root = isMinor ? key.slice(0, -1) : key
    const interval = Interval.fromSemitones(semitones)
    let newRoot = Note.transpose(root, interval)

    // Remove octave
    newRoot = newRoot.replace(/\d+$/, '')

    // Find correct enharmonic spelling
    // A target key's enharmonic is determined by how many accidentals it would have
    newRoot = chooseBestSpelling(newRoot)

    return isMinor ? newRoot + 'm' : newRoot
  } catch (e) {
    return key
  }
}

/**
 * Choose the enharmonic spelling that results in fewer accidentals
 * (i.e. the "simpler" key)
 */
function chooseBestSpelling(noteName) {
  if (!noteName) return noteName
  const enharmonic = Note.enharmonic(noteName)
  if (!enharmonic || enharmonic === noteName) return noteName

  // Count accidentals in the key signature for each spelling
  const countAccidentals = (note) => {
    try {
      const keyInfo = Key.majorKey(note)
      return Math.abs(keyInfo?.keySignature?.length || 99)
    } catch (_) {
      return 99
    }
  }

  const acc1 = countAccidentals(noteName)
  const acc2 = countAccidentals(enharmonic)

  return acc1 <= acc2 ? noteName : enharmonic
}

// ─── Semitone Calculator ───────────────────────────────────────────────────

/**
 * Calculate semitones needed to go from one key to another.
 * @param {string} fromKey
 * @param {string} toKey
 * @returns {number} semitones (-6 to +6 preferred, but can be up to ±12)
 */
export function semitonesFromKeyToKey(fromKey, toKey) {
  if (!fromKey || !toKey) return 0
  try {
    const fromRoot = fromKey.replace(/m$/, '')
    const toRoot = toKey.replace(/m$/, '')
    const fromPc = Note.get(fromRoot + '4')
    const toPc = Note.get(toRoot + '4')
    if (!fromPc.midi || !toPc.midi) return 0
    let diff = toPc.midi - fromPc.midi
    // Normalize to -6..+6
    while (diff > 6) diff -= 12
    while (diff < -6) diff += 12
    return diff
  } catch (_) {
    return 0
  }
}

// ─── Transpose Entire Parsed Content ──────────────────────────────────────

/**
 * Transpose all chords in parsed_content by semitones.
 * Returns a new parsed_content array (does not mutate original).
 *
 * @param {Array} parsedContent
 * @param {number} semitones
 * @param {string} targetKey - for enharmonic preference
 * @returns {Array} transposed parsed content
 */
export function transposeParsedContent(parsedContent, semitones, targetKey = null) {
  if (semitones === 0) return parsedContent

  return parsedContent.map(line => {
    if (line.type !== 'chord_line') return line

    const newTokens = line.tokens.map(token => {
      if (!token.isChord) return token
      return {
        ...token,
        text: transposeChord(token.text, semitones, targetKey),
      }
    })

    return { ...line, tokens: newTokens }
  })
}

// ─── Capo Logic ───────────────────────────────────────────────────────────

/**
 * Calculate the shape key when using a capo.
 * The guitarist plays shapes transposed DOWN by capo frets.
 *
 * e.g. Display key: E, Capo: 2 → Shape key: D
 * (Playing D shapes with capo 2 sounds like E)
 *
 * @param {string} displayKey - the key the song sounds in
 * @param {number} capo - capo fret
 * @returns {string} the key of shapes to play
 */
export function getCapoShapeKey(displayKey, capo) {
  if (!displayKey || !capo) return displayKey
  return transposeKey(displayKey, -capo)
}

/**
 * Generate capo display string.
 * e.g. "Play [D] shapes with capo 2 → sounds like [E]"
 */
export function getCapoDisplay(displayKey, capo) {
  if (!displayKey || !capo) return null
  const shapeKey = getCapoShapeKey(displayKey, capo)
  return `Play ${shapeKey} with capo ${capo} → sounds like ${displayKey}`
}

// ─── All Keys List ─────────────────────────────────────────────────────────

export const ALL_KEYS = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'
]

export const ALL_KEYS_WITH_MINOR = [
  'C', 'Cm', 'Db', 'Dbm', 'D', 'Dm', 'Eb', 'Ebm',
  'E', 'Em', 'F', 'Fm', 'F#', 'F#m', 'G', 'Gm',
  'Ab', 'Abm', 'A', 'Am', 'Bb', 'Bbm', 'B', 'Bm'
]
