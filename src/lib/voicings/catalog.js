// Voicing catalog. Every entry is verified by scripts/verify-voicings.mjs to ensure
// its frets actually produce the notes implied by `displayName` (the verifier checks
// that the played pitch-classes match the chord's interval set).
//
// frets: [lowE, A, D, G, B, highE] — null = muted string, 0 = open, N = fret N.
// All voicings declared in their natural root (no abstract "key" — transposition is
// per-voicing via lookup.js / transpose.js).
//
// Movable voicings (no open strings) auto-transpose to all 12 keys.
// Open-string voicings stay in their declared root.

import { isMovable, voicingPosition } from './notes'

// All chord families covered (used to render the chord-chip rail).
// Major roots first, then minor, then dim/half-dim, then slash chords.
export const CHORD_ROOTS_IN_G = [
  'G', 'C', 'D', 'A', 'E', 'F', 'B',
  'Am', 'Em', 'Dm', 'Bm', 'Fm', 'Cm', 'Gm', 'F#m',
  'F#dim', 'Bdim', 'Bm7b5',
  'G/B', 'D/F#', 'C/E', 'C/G', 'E/G#', 'A/C#',
]

let _idCounter = 0
const mk = (rootChord, displayName, frets, opts = {}) => ({
  id: opts.id || `v${++_idCounter}-${rootChord.replace(/[^A-Za-z0-9]/g, '')}-${frets.map(f => f == null ? 'x' : f).join('-')}`,
  rootChord,
  displayName,
  frets,
  sourceKey: 'G',   // catalog reference key — used by ChordVoicings page only
  movable: isMovable(frets),
  position: voicingPosition(frets),
  shape: opts.shape || null,
  inversion: opts.inversion || null,
  tags: opts.tags || [],
  description: opts.description || '',
})

// ═════════════════════════════════════════════════════════════════════════
//   G family
// ═════════════════════════════════════════════════════════════════════════
const G_VOICINGS = [
  // open
  mk('G',  'G',     [3, 2, 0, 0, 0, 3],         { shape: 'open', tags: ['open', 'caged'], description: 'Standard open G — the classic.' }),
  mk('G',  'G',     [3, 2, 0, 0, 3, 3],         { shape: 'open', tags: ['open', 'big'], description: 'Open G with high D for full sound (the "Hendrix" G).' }),
  mk('G',  'G',     [3, 5, 5, 4, 3, 3],         { shape: 'E-shape', tags: ['barre', 'movable'], description: 'E-shape barre at the 3rd fret.' }),
  mk('G',  'G',     [null, 10, 12, 12, 12, 10], { shape: 'A-shape', tags: ['barre', 'movable', 'high-fret'], description: 'A-shape barre at the 10th fret.' }),
  // triads — D/G/B strings
  mk('G',  'G',     [null, null, 5, 4, 3, null], { tags: ['triad', 'movable', 'compact'], description: 'Compact G triad on D, G & B strings.' }),
  mk('G',  'G',     [null, null, 9, 7, 8, null], { inversion: '2nd', tags: ['triad', 'movable', 'inversion'], description: 'G triad, 2nd inversion (D, G, B → bass D).' }),
  // triads — G/B/E strings
  mk('G',  'G',     [null, null, null, 7, 8, 7], { shape: 'D-shape', tags: ['triad', 'top-strings', 'movable'], description: 'D-shape G triad on top three strings.' }),
  mk('G',  'G',     [null, null, null, 12, 12, 10], { inversion: '1st', tags: ['triad', 'top-strings', 'movable', 'high-fret'], description: 'High G triad, 1st inversion (B in bass).' }),
  // 7ths & extensions
  mk('G',  'G7',    [3, 2, 0, 0, 0, 1],         { shape: 'open', tags: ['dom7', 'open'], description: 'Standard open G7.' }),
  mk('G',  'Gmaj7', [3, 2, 0, 0, 0, 2],         { shape: 'open', tags: ['maj7', 'open'], description: 'Open Gmaj7 — bright and dreamy.' }),
  mk('G',  'Gmaj7', [3, null, 4, 4, 3, null],   { tags: ['maj7', 'movable', 'compact'], description: 'Compact Gmaj7 with root in bass.' }),
  mk('G',  'Gsus4', [3, 3, 0, 0, 1, 3],         { shape: 'open', tags: ['sus4', 'open', 'tension'], description: 'Open Gsus4 — adds a 4th (C) over G.' }),
  mk('G',  'Gadd9', [3, 0, 0, 2, 0, 3],         { shape: 'open', tags: ['add9', 'open'], description: 'Open Gadd9 — adds the 9th (A).' }),
  mk('G',  'G5',    [3, 5, 5, null, null, null],{ tags: ['power-chord', 'movable'], description: 'G power chord — root + 5th only.' }),
]

// ═════════════════════════════════════════════════════════════════════════
//   C family
// ═════════════════════════════════════════════════════════════════════════
const C_VOICINGS = [
  // open
  mk('C',  'C',     [null, 3, 2, 0, 1, 0],      { shape: 'open', tags: ['open', 'caged'], description: 'Standard open C — caged C-shape.' }),
  mk('C',  'C',     [null, 3, 2, 0, 1, 3],      { shape: 'open', tags: ['open', 'big'], description: 'Open C with high G for fuller sound.' }),
  mk('C',  'C',     [null, 3, 5, 5, 5, 3],      { shape: 'A-shape', tags: ['barre', 'movable'], description: 'A-shape barre at the 3rd fret.' }),
  mk('C',  'C',     [8, 10, 10, 9, 8, 8],       { shape: 'E-shape', tags: ['barre', 'movable', 'high-fret'], description: 'E-shape barre at the 8th fret.' }),
  // triads
  mk('C',  'C',     [null, null, 10, 9, 8, null], { tags: ['triad', 'movable'], description: 'C triad on D, G & B strings.' }),
  mk('C',  'C',     [null, null, null, 9, 8, 8], { inversion: '1st', tags: ['triad', 'top-strings', 'movable'], description: 'C triad, 1st inversion on top strings (E in bass).' }),
  mk('C',  'C',     [null, null, null, 5, 5, 3], { tags: ['triad', 'top-strings', 'movable'], description: 'C triad on top three strings — low position.' }),
  mk('C',  'C',     [null, null, null, 12, 13, 12],{ inversion: '2nd', tags: ['triad', 'top-strings', 'movable', 'high-fret'], description: 'High C triad, 2nd inversion (G in bass).' }),
  // 7ths & extensions
  mk('C',  'Cmaj7', [null, 3, 2, 0, 0, 0],      { shape: 'open', tags: ['maj7', 'open'], description: 'Open Cmaj7 — warm and lush.' }),
  mk('C',  'Cmaj7', [null, 3, 5, 4, 5, 3],      { shape: 'C-shape', tags: ['maj7', 'movable'], description: 'Movable C-shape Cmaj7.' }),
  mk('C',  'Cmaj7', [null, null, 10, 9, 8, 7],  { tags: ['maj7', 'movable', 'drop2'], description: 'Drop-2 Cmaj7 (R, 3, 5, 7) on inner strings.' }),
  mk('C',  'C7',    [null, 3, 2, 3, 1, 3],      { shape: 'open', tags: ['dom7', 'open'], description: 'Open C7 with G on top (full root-3-5-♭7).' }),
  mk('C',  'C7',    [null, 3, 5, 3, 5, 3],      { shape: 'A-shape', tags: ['dom7', 'movable'], description: 'A-shape barre C7.' }),
  mk('C',  'Csus4', [null, 3, 3, 0, 1, 1],      { shape: 'open', tags: ['sus4', 'open'], description: 'Open Csus4.' }),
  mk('C',  'Cadd9', [null, 3, 2, 0, 3, 0],      { shape: 'open', tags: ['add9', 'open'], description: 'Open Cadd9 — adds the 9th (D).' }),
  mk('C',  'Cadd9', [null, 3, 2, 0, 3, 3],      { shape: 'open', tags: ['add9', 'open'], description: 'Cadd9 with high G — rich and chimey.' }),
  mk('C',  'C5',    [null, 3, 5, 5, null, null],{ tags: ['power-chord', 'movable'], description: 'C power chord.' }),
]

// ═════════════════════════════════════════════════════════════════════════
//   D family
// ═════════════════════════════════════════════════════════════════════════
const D_VOICINGS = [
  // open
  mk('D',  'D',     [null, null, 0, 2, 3, 2],   { shape: 'open', tags: ['open', 'caged'], description: 'Standard open D.' }),
  mk('D',  'D',     [null, 5, 7, 7, 7, 5],      { shape: 'A-shape', tags: ['barre', 'movable'], description: 'A-shape barre at the 5th fret.' }),
  mk('D',  'D',     [10, 12, 12, 11, 10, 10],   { shape: 'E-shape', tags: ['barre', 'movable', 'high-fret'], description: 'E-shape barre at the 10th fret.' }),
  // triads
  mk('D',  'D',     [null, null, 12, 11, 10, null], { tags: ['triad', 'movable', 'high-fret'], description: 'D triad on D, G & B strings.' }),
  mk('D',  'D',     [null, null, null, 7, 7, 5], { tags: ['triad', 'top-strings', 'movable'], description: 'D triad on top three strings.' }),
  mk('D',  'D',     [null, null, null, 11, 10, 10], { inversion: '1st', tags: ['triad', 'top-strings', 'movable', 'high-fret'], description: 'D triad, 1st inversion (F# in bass).' }),
  // 7ths & extensions
  mk('D',  'D7',    [null, null, 0, 2, 1, 2],   { shape: 'open', tags: ['dom7', 'open'], description: 'Open D7.' }),
  mk('D',  'Dmaj7', [null, null, 0, 2, 2, 2],   { shape: 'open', tags: ['maj7', 'open'], description: 'Open Dmaj7.' }),
  mk('D',  'Dsus2', [null, null, 0, 2, 3, 0],   { shape: 'open', tags: ['sus2', 'open'], description: 'Open Dsus2 — adds a 2nd (E).' }),
  mk('D',  'Dsus4', [null, null, 0, 2, 3, 3],   { shape: 'open', tags: ['sus4', 'open'], description: 'Open Dsus4 — adds a 4th (G).' }),
  mk('D',  'Dadd9', [null, 5, 4, 2, 3, 0],      { tags: ['add9'], description: 'Dadd9 with root in bass — D, F#, A & E (9th) all present.' }),
  mk('D',  'D5',    [null, 5, 7, 7, null, null],{ tags: ['power-chord', 'movable'], description: 'D power chord.' }),
]

// ═════════════════════════════════════════════════════════════════════════
//   E family
// ═════════════════════════════════════════════════════════════════════════
const E_VOICINGS = [
  mk('E',  'E',     [0, 2, 2, 1, 0, 0],         { shape: 'open', tags: ['open', 'caged'], description: 'Standard open E.' }),
  mk('E',  'E',     [null, 7, 9, 9, 9, 7],      { shape: 'A-shape', tags: ['barre', 'movable'], description: 'A-shape barre at the 7th fret.' }),
  mk('E',  'E7',    [0, 2, 0, 1, 0, 0],         { shape: 'open', tags: ['dom7', 'open'], description: 'Open E7.' }),
  mk('E',  'E7',    [0, 2, 2, 1, 3, 0],         { shape: 'open', tags: ['dom7', 'open', 'big'], description: 'Open E7 with high D — fuller voicing.' }),
  mk('E',  'Emaj7', [0, 2, 1, 1, 0, 0],         { shape: 'open', tags: ['maj7', 'open'], description: 'Open Emaj7.' }),
  mk('E',  'Esus4', [0, 2, 2, 2, 0, 0],         { shape: 'open', tags: ['sus4', 'open'], description: 'Open Esus4.' }),
  mk('E',  'E5',    [0, 2, 2, null, null, null],{ shape: 'open', tags: ['power-chord', 'open'], description: 'E power chord.' }),
]

// ═════════════════════════════════════════════════════════════════════════
//   A family
// ═════════════════════════════════════════════════════════════════════════
const A_VOICINGS = [
  mk('A',  'A',     [null, 0, 2, 2, 2, 0],      { shape: 'open', tags: ['open', 'caged'], description: 'Standard open A.' }),
  mk('A',  'A',     [5, 7, 7, 6, 5, 5],         { shape: 'E-shape', tags: ['barre', 'movable'], description: 'E-shape barre at the 5th fret.' }),
  // triads
  mk('A',  'A',     [null, null, 7, 6, 5, null], { tags: ['triad', 'movable'], description: 'A triad on D, G & B strings.' }),
  mk('A',  'A',     [null, null, null, 6, 5, 5], { inversion: '1st', tags: ['triad', 'top-strings', 'movable'], description: 'A triad, 1st inversion (C# in bass).' }),
  // 7ths & extensions
  mk('A',  'A7',    [null, 0, 2, 0, 2, 0],      { shape: 'open', tags: ['dom7', 'open'], description: 'Open A7.' }),
  mk('A',  'Amaj7', [null, 0, 2, 1, 2, 0],      { shape: 'open', tags: ['maj7', 'open'], description: 'Open Amaj7.' }),
  mk('A',  'Asus2', [null, 0, 2, 2, 0, 0],      { shape: 'open', tags: ['sus2', 'open'], description: 'Open Asus2.' }),
  mk('A',  'Asus4', [null, 0, 2, 2, 3, 0],      { shape: 'open', tags: ['sus4', 'open'], description: 'Open Asus4.' }),
  mk('A',  'Aadd9', [null, 0, 2, 4, 2, 0],      { shape: 'open', tags: ['add9', 'open'], description: 'Open Aadd9.' }),
  mk('A',  'A5',    [null, 0, 2, 2, null, null],{ shape: 'open', tags: ['power-chord', 'open'], description: 'A power chord.' }),
]

// ═════════════════════════════════════════════════════════════════════════
//   F family
// ═════════════════════════════════════════════════════════════════════════
const F_VOICINGS = [
  mk('F',  'F',     [1, 3, 3, 2, 1, 1],         { shape: 'E-shape', tags: ['barre', 'movable'], description: 'F barre chord — E-shape at the 1st fret.' }),
  mk('F',  'F',     [null, null, 3, 2, 1, 1],   { tags: ['compact', 'beginner'], description: 'Compact F — top four strings only.' }),
  mk('F',  'Fmaj7', [null, null, 3, 2, 1, 0],   { shape: 'open', tags: ['maj7', 'open'], description: 'Open-style Fmaj7 — easy & beautiful.' }),
  mk('F',  'Fmaj7', [1, 3, 3, 2, 1, 0],         { tags: ['maj7', 'movable'], description: 'Full Fmaj7 with E on top.' }),
  mk('F',  'F7',    [1, 3, 1, 2, 1, 1],         { shape: 'E-shape', tags: ['dom7', 'barre', 'movable'], description: 'E-shape barre F7.' }),
]

// ═════════════════════════════════════════════════════════════════════════
//   B family
// ═════════════════════════════════════════════════════════════════════════
const B_VOICINGS = [
  mk('B',  'B',     [null, 2, 4, 4, 4, 2],      { shape: 'A-shape', tags: ['barre', 'movable'], description: 'A-shape barre at the 2nd fret.' }),
  mk('B',  'B',     [7, 9, 9, 8, 7, 7],         { shape: 'E-shape', tags: ['barre', 'movable'], description: 'E-shape barre at the 7th fret.' }),
  mk('B',  'B7',    [null, 2, 1, 2, 0, 2],      { shape: 'open', tags: ['dom7', 'open'], description: 'Standard open B7.' }),
  mk('B',  'Bmaj7', [null, 2, 4, 3, 4, 2],      { shape: 'A-shape', tags: ['maj7', 'movable'], description: 'A-shape Bmaj7.' }),
]

// ═════════════════════════════════════════════════════════════════════════
//   Minor families
// ═════════════════════════════════════════════════════════════════════════

// Am
const AM_VOICINGS = [
  mk('Am', 'Am',    [null, 0, 2, 2, 1, 0],      { shape: 'open', tags: ['open', 'caged'], description: 'Standard open Am.' }),
  mk('Am', 'Am',    [5, 7, 7, 5, 5, 5],         { shape: 'Em-shape', tags: ['barre', 'movable'], description: 'Em-shape minor barre at 5th fret.' }),
  // triads
  mk('Am', 'Am',    [null, null, 7, 5, 5, null], { tags: ['triad', 'movable'], description: 'Am triad on D, G & B strings.' }),
  mk('Am', 'Am',    [null, null, 10, 9, 10, null], { inversion: '1st', tags: ['triad', 'movable', 'inversion'], description: 'Am triad, 1st inversion (C in bass).' }),
  mk('Am', 'Am',    [null, null, null, 9, 10, 8], { tags: ['triad', 'top-strings', 'movable'], description: 'Am triad on top three strings.' }),
  // 7ths
  mk('Am', 'Am7',   [null, 0, 2, 0, 1, 0],      { shape: 'open', tags: ['m7', 'open'], description: 'Open Am7.' }),
  mk('Am', 'Am7',   [5, 7, 5, 5, 5, 5],         { shape: 'Em-shape', tags: ['m7', 'barre', 'movable'], description: 'Em-shape barre Am7.' }),
  mk('Am', 'Am7',   [null, null, 7, 9, 8, 8],   { tags: ['m7', 'movable'], description: 'Am7 with root in bass (A, G, C, E).' }),
  mk('Am', 'Am9',   [null, 0, 2, 4, 1, 3],      { shape: 'open', tags: ['m9', 'open', 'jazz'], description: 'Open Am9 — lush minor color.' }),
]

// Em
const EM_VOICINGS = [
  mk('Em', 'Em',    [0, 2, 2, 0, 0, 0],         { shape: 'open', tags: ['open', 'caged'], description: 'Standard open Em.' }),
  mk('Em', 'Em',    [null, 7, 9, 9, 8, 7],      { shape: 'Am-shape', tags: ['barre', 'movable'], description: 'Am-shape minor barre at 7th fret.' }),
  mk('Em', 'Em',    [12, 14, 14, 12, 12, 12],   { shape: 'Em-shape', tags: ['barre', 'movable', 'high-fret'], description: 'Em-shape barre at the 12th fret.' }),
  // triads
  mk('Em', 'Em',    [null, null, null, 9, 8, 7], { tags: ['triad', 'top-strings', 'movable'], description: 'Em triad on top three strings.' }),
  mk('Em', 'Em',    [null, null, 14, 12, 12, null], { inversion: '1st', tags: ['triad', 'movable', 'inversion', 'high-fret'], description: 'Em triad, 1st inversion (G in bass).' }),
  // 7ths
  mk('Em', 'Em7',   [0, 2, 0, 0, 0, 0],         { shape: 'open', tags: ['m7', 'open'], description: 'Open Em7.' }),
  mk('Em', 'Em7',   [null, 7, 9, 7, 8, 7],      { shape: 'Am-shape', tags: ['m7', 'movable'], description: 'Am-shape Em7.' }),
  mk('Em', 'Em7',   [12, 14, 12, 12, 12, 12],   { shape: 'Em-shape', tags: ['m7', 'barre', 'movable', 'high-fret'], description: 'Em-shape Em7 barre at 12th fret (full six-string voicing).' }),
]

// Dm
const DM_VOICINGS = [
  mk('Dm', 'Dm',    [null, null, 0, 2, 3, 1],   { shape: 'open', tags: ['open', 'caged'], description: 'Standard open Dm.' }),
  mk('Dm', 'Dm',    [null, 5, 7, 7, 6, 5],      { shape: 'Am-shape', tags: ['barre', 'movable'], description: 'Am-shape Dm barre at 5th fret.' }),
  mk('Dm', 'Dm7',   [null, null, 0, 2, 1, 1],   { shape: 'open', tags: ['m7', 'open'], description: 'Open Dm7.' }),
  mk('Dm', 'Dm',    [null, null, null, 7, 6, 5], { tags: ['triad', 'top-strings', 'movable'], description: 'Dm triad on top three strings.' }),
]

// Bm
const BM_VOICINGS = [
  mk('Bm', 'Bm',    [null, 2, 4, 4, 3, 2],      { shape: 'Am-shape', tags: ['barre', 'movable'], description: 'Am-shape Bm barre at 2nd fret.' }),
  mk('Bm', 'Bm',    [7, 9, 9, 7, 7, 7],         { shape: 'Em-shape', tags: ['barre', 'movable'], description: 'Em-shape Bm barre at 7th fret.' }),
  mk('Bm', 'Bm',    [null, null, 9, 7, 7, null], { tags: ['triad', 'movable'], description: 'Bm triad on D, G & B strings.' }),
  mk('Bm', 'Bm',    [null, null, null, 4, 3, 2], { tags: ['triad', 'top-strings', 'movable'], description: 'Bm triad on top three strings.' }),
  mk('Bm', 'Bm7',   [null, 2, 4, 2, 3, 2],      { shape: 'Am-shape', tags: ['m7', 'movable'], description: 'Am-shape Bm7 barre.' }),
  mk('Bm', 'Bm7',   [7, 9, 7, 7, 7, 7],         { shape: 'Em-shape', tags: ['m7', 'movable'], description: 'Em-shape Bm7 barre.' }),
  mk('Bm', 'Bm7',   [null, null, 9, 11, 10, 10],{ tags: ['m7', 'movable'], description: 'Bm7 with root on D string (B, A, D, F#).' }),
]

// Fm
const FM_VOICINGS = [
  mk('Fm', 'Fm',    [1, 3, 3, 1, 1, 1],         { shape: 'Em-shape', tags: ['barre', 'movable'], description: 'Em-shape Fm barre at 1st fret.' }),
  mk('Fm', 'Fm7',   [1, 3, 1, 1, 1, 1],         { shape: 'Em-shape', tags: ['m7', 'movable'], description: 'Em-shape Fm7 barre.' }),
]

// Cm, Gm, F#m — movable minor shapes (no opens)
const OTHER_MINOR_VOICINGS = [
  mk('Cm', 'Cm',    [null, 3, 5, 5, 4, 3],      { shape: 'Am-shape', tags: ['barre', 'movable'], description: 'Am-shape Cm barre.' }),
  mk('Cm', 'Cm7',   [null, 3, 5, 3, 4, 3],      { shape: 'Am-shape', tags: ['m7', 'movable'], description: 'Am-shape Cm7 barre.' }),
  mk('Gm', 'Gm',    [3, 5, 5, 3, 3, 3],         { shape: 'Em-shape', tags: ['barre', 'movable'], description: 'Em-shape Gm barre.' }),
  mk('Gm', 'Gm7',   [3, 5, 3, 3, 3, 3],         { shape: 'Em-shape', tags: ['m7', 'movable'], description: 'Em-shape Gm7 barre.' }),
  mk('F#m','F#m',   [2, 4, 4, 2, 2, 2],         { shape: 'Em-shape', tags: ['barre', 'movable'], description: 'Em-shape F#m barre.' }),
  mk('F#m','F#m7',  [2, 4, 2, 2, 2, 2],         { shape: 'Em-shape', tags: ['m7', 'movable'], description: 'Em-shape F#m7 barre.' }),
]

// ═════════════════════════════════════════════════════════════════════════
//   Diminished family
// ═════════════════════════════════════════════════════════════════════════
const DIM_VOICINGS = [
  // F#dim7 — symmetric, repeats every 3 frets
  mk('F#dim', 'F#dim7', [2, null, 1, 2, 1, null],     { tags: ['dim7', 'movable'], description: 'F#dim7 with root in bass.' }),
  mk('F#dim', 'F#dim7', [null, null, 1, 2, 1, 2],     { tags: ['dim7', 'movable', 'compact'], description: 'Compact F#dim7 on top four strings.' }),
  mk('F#dim', 'F#dim7', [null, null, 4, 5, 4, 5],     { tags: ['dim7', 'movable'], description: 'F#dim7 inversion (a minor 3rd up).' }),
  mk('F#dim', 'F#dim7', [null, null, 7, 8, 7, 8],     { tags: ['dim7', 'movable'], description: 'F#dim7 inversion (a tritone up).' }),
  mk('F#dim', 'F#dim',  [2, null, null, 2, 1, null],  { tags: ['dim', 'movable'], description: 'F#dim triad — F#, A, C (3-string triad with root in bass).', id: 'fsharp-dim-triad' }),
  // Bdim, also diatonic in many keys
  mk('Bdim', 'Bdim7',   [null, 2, 0, 1, 0, 1],        { shape: 'open', tags: ['dim7', 'open'], description: 'Open Bdim7.' }),
  mk('Bdim', 'Bdim',    [null, 2, 3, 4, 3, null],     { tags: ['dim', 'movable'], description: 'Bdim triad.' }),
  // m7b5 (half-diminished) — commonly used diatonically
  mk('Bm7b5','Bm7b5',   [null, 2, 3, 2, 3, null],     { tags: ['m7b5', 'movable'], description: 'Bm7♭5 (B half-diminished) — iiø in A minor.' }),
  mk('Bm7b5','Bm7b5',   [7, null, null, 10, 10, 10],   { tags: ['m7b5', 'movable'], description: 'Bm7♭5 with root in bass and rootless top triad (D, F, A).' }),
]

// ═════════════════════════════════════════════════════════════════════════
//   Slash chords (common in folk/pop)
// ═════════════════════════════════════════════════════════════════════════
const SLASH_VOICINGS = [
  mk('D/F#', 'D/F#',  [2, null, 0, 2, 3, 2],   { shape: 'open', tags: ['slash', 'open', 'inversion'], description: 'D over F# — D with F# in bass for smooth voice-leading.' }),
  mk('D/F#', 'D/F#',  [2, 0, 0, 2, 3, 2],      { shape: 'open', tags: ['slash', 'open'], description: 'D/F# with A on the A string ringing.' }),
  mk('C/E',  'C/E',   [0, 3, 2, 0, 1, 0],      { shape: 'open', tags: ['slash', 'open', 'inversion'], description: 'C with E in bass (1st inversion).' }),
  mk('C/G',  'C/G',   [3, 3, 2, 0, 1, 0],      { shape: 'open', tags: ['slash', 'open', 'inversion'], description: 'C with G in bass (2nd inversion).' }),
  mk('G/B',  'G/B',   [null, 2, 0, 0, 0, 3],   { shape: 'open', tags: ['slash', 'open', 'inversion'], description: 'G with B in bass (1st inversion).' }),
  mk('E/G#', 'E/G#',  [4, null, 2, 1, 0, 0],   { shape: 'open', tags: ['slash', 'open', 'inversion'], description: 'E with G# in bass (1st inversion).' }),
  mk('A/C#', 'A/C#',  [null, 4, 2, 2, 2, 0],   { shape: 'open', tags: ['slash', 'open', 'inversion'], description: 'A with C# in bass (1st inversion).' }),
]

export const VOICINGS = [
  ...G_VOICINGS,
  ...C_VOICINGS,
  ...D_VOICINGS,
  ...E_VOICINGS,
  ...A_VOICINGS,
  ...F_VOICINGS,
  ...B_VOICINGS,
  ...AM_VOICINGS,
  ...EM_VOICINGS,
  ...DM_VOICINGS,
  ...BM_VOICINGS,
  ...FM_VOICINGS,
  ...OTHER_MINOR_VOICINGS,
  ...DIM_VOICINGS,
  ...SLASH_VOICINGS,
]

export const VOICINGS_BY_CHORD = VOICINGS.reduce((acc, v) => {
  (acc[v.rootChord] = acc[v.rootChord] || []).push(v)
  return acc
}, {})

// ─── Progression Sets (key of G) ──────────────────────────────────────────
function findId(rootChord, fretsSig) {
  const v = VOICINGS.find(v => v.rootChord === rootChord
    && v.frets.map(f => f == null ? 'x' : f).join('-') === fretsSig)
  return v?.id
}

export const PROGRESSION_SETS = [
  {
    id: 'step-up',
    label: 'Step-Up (Ascending)',
    description: 'Builds forward motion / climax — each chord climbs in position.',
    sourceKey: 'G',
    chords: [
      { rootChord: 'G',     voicingId: findId('G',     'x-x-5-4-3-x') },
      { rootChord: 'Am',    voicingId: findId('Am',    'x-x-7-5-5-x') },
      { rootChord: 'Bm',    voicingId: findId('Bm',    'x-x-9-7-7-x') },
      { rootChord: 'C',     voicingId: findId('C',     'x-x-10-9-8-x') },
      { rootChord: 'D',     voicingId: findId('D',     'x-x-12-11-10-x') },
      { rootChord: 'Em',    voicingId: findId('Em',    'x-x-14-12-12-x') },
      { rootChord: 'F#dim', voicingId: findId('F#dim', 'x-x-4-5-4-5') },
    ],
  },
  {
    id: 'step-down',
    label: 'Step-Down (Descending)',
    description: 'Smooth resolving motion, descending the fretboard.',
    sourceKey: 'G',
    chords: [
      { rootChord: 'G',     voicingId: findId('G',     'x-x-x-12-12-10') },
      { rootChord: 'Am',    voicingId: findId('Am',    'x-x-10-9-10-x') },
      { rootChord: 'Bm',    voicingId: findId('Bm',    'x-x-9-7-7-x') },
      { rootChord: 'C',     voicingId: findId('C',     'x-x-10-9-8-x') },
      { rootChord: 'D',     voicingId: findId('D',     'x-x-x-7-7-5') },
      { rootChord: 'Em',    voicingId: findId('Em',    'x-x-x-9-8-7') },
      { rootChord: 'F#dim', voicingId: findId('F#dim', 'x-x-4-5-4-5') },
    ],
  },
  {
    id: 'top-strings',
    label: 'Top-Strings Set (G major)',
    description: 'Compact triads on the G, B & high-E strings — clear and articulate.',
    sourceKey: 'G',
    chords: [
      { rootChord: 'G',     voicingId: findId('G',     'x-x-x-7-8-7') },
      { rootChord: 'Am',    voicingId: findId('Am',    'x-x-x-9-10-8') },
      { rootChord: 'Bm',    voicingId: findId('Bm',    'x-x-x-4-3-2') },
      { rootChord: 'C',     voicingId: findId('C',     'x-x-x-5-5-3') },
      { rootChord: 'D',     voicingId: findId('D',     'x-x-x-7-7-5') },
      { rootChord: 'Em',    voicingId: findId('Em',    'x-x-x-9-8-7') },
    ],
  },
]

export function getVoicingById(id) {
  return VOICINGS.find(v => v.id === id) || null
}
