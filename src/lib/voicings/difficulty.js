// Auto-score a voicing's playability.
//
// Heuristic — does NOT replace human judgement, but gives a useful filter.
// Inputs:
//   frets: [lowE, A, D, G, B, highE] (null = mute, 0 = open, N = fret)
//   tags:  optional array of catalog tags

export function difficultyOf(frets, tags = []) {
  const fretted = frets.filter(f => f != null && f > 0)
  if (fretted.length === 0) return { level: 'easy', label: 'Easy', reasons: ['All open strings.'] }

  const minFret = Math.min(...fretted)
  const maxFret = Math.max(...fretted)
  const span = maxFret - minFret
  const open = frets.filter(f => f === 0).length
  const hasInteriorMute = hasInteriorMutedString(frets)
  const isBarre = tags.includes('barre') || looksLikeBarre(frets)

  const reasons = []
  let score = 0

  if (span >= 5) { score += 3; reasons.push(`${span}-fret stretch`) }
  else if (span === 4) { score += 2; reasons.push('4-fret stretch') }
  else if (span === 3) { score += 1 }

  if (isBarre) { score += 2; reasons.push('Requires a barre.') }

  if (hasInteriorMute) { score += 1; reasons.push('Interior string must be muted.') }

  if (fretted.length >= 5 && open === 0) { score += 1; reasons.push('Five fingers needed.') }

  if (open >= 3) { score -= 1; reasons.push('Uses open strings.') }

  if (minFret >= 10) { score += 1; reasons.push('High up the neck.') }

  let level
  if (score <= 0) level = 'easy'
  else if (score <= 2) level = 'medium'
  else level = 'hard'

  const labels = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
  return { level, label: labels[level], reasons, score }
}

function looksLikeBarre(frets) {
  // 3+ strings share the lowest fret → likely a barre
  const fretted = frets.filter(f => f != null && f > 0)
  if (fretted.length < 3) return false
  const minF = Math.min(...fretted)
  const onMin = fretted.filter(f => f === minF).length
  return onMin >= 3 && minF > 0
}

function hasInteriorMutedString(frets) {
  // muted string between two played strings is harder (right-hand mute / thumb mute)
  let firstPlayed = -1, lastPlayed = -1
  for (let i = 0; i < 6; i++) if (frets[i] != null) { if (firstPlayed === -1) firstPlayed = i; lastPlayed = i }
  for (let i = firstPlayed + 1; i < lastPlayed; i++) {
    if (frets[i] == null) return true
  }
  return false
}
