// When may NewSong lift the first line of the chord sheet into the Title field?
//
// Only on a paste, or at the moment the content first becomes multi-line
// (≥ 2 non-empty lines). Never while the user is still typing the first line,
// otherwise typing "Th" would be yanked into the title on the first keystroke.

const nonEmptyLines = (s) => (s || '').split('\n').filter(l => l.trim()).length

export function shouldAutoDetectTitle(prevContent, nextContent, { pasted = false } = {}) {
  if (!(nextContent || '').trim()) return false
  if (pasted) return true
  return nonEmptyLines(prevContent) < 2 && nonEmptyLines(nextContent) >= 2
}
