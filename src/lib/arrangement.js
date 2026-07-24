// Arrangement editor core: split a song's parsed_content into sections, then
// re-assemble them in a chosen order with repeats — without hand-editing text.
// Pure (no React) so it unit-tests and is reused by the panel + any export.

/**
 * Split parsed_content into sections. A section starts at each section_header;
 * any lines before the first header become a leading (unlabeled) section.
 * Returns [{ id, label, lines }] where `lines` includes the header line itself.
 */
export function splitSections(parsedContent) {
  const segs = []
  let cur = null
  for (const line of parsedContent || []) {
    if (line?.type === 'section_header') {
      if (cur) segs.push(cur)
      cur = { label: (line.text || 'Section').trim() || 'Section', lines: [line] }
    } else {
      if (!cur) cur = { label: null, lines: [] }
      cur.lines.push(line)
    }
  }
  if (cur) segs.push(cur)
  // Trim trailing blank lines inside each section so repeats join cleanly.
  return segs.map((s, i) => {
    const lines = s.lines.slice()
    while (lines.length && lines[lines.length - 1]?.type === 'blank') lines.pop()
    return { id: i, label: s.label || (i === 0 ? 'Intro' : `Section ${i + 1}`), lines }
  }).filter((s) => s.lines.length > 0)
}

/**
 * A default plan mirroring the original order, each section once.
 *   [{ index, repeat }]
 */
export function defaultPlan(parsedContent) {
  return splitSections(parsedContent).map((s) => ({ index: s.id, repeat: 1 }))
}

/**
 * Expand a plan into a fresh parsed_content array. Sections join with a single
 * blank line; a section with repeat N is emitted N times. Unknown indices are
 * skipped. An empty/absent plan returns the original content unchanged.
 */
export function applyArrangement(parsedContent, plan) {
  if (!Array.isArray(plan) || plan.length === 0) return parsedContent
  const segs = splitSections(parsedContent)
  const byId = new Map(segs.map((s) => [s.id, s]))
  const out = []
  for (const step of plan) {
    const seg = byId.get(step.index)
    if (!seg) continue
    const reps = Math.max(1, Math.floor(step.repeat) || 1)
    for (let r = 0; r < reps; r++) {
      if (out.length) out.push({ type: 'blank' })
      for (const line of seg.lines) out.push({ ...line })
    }
  }
  return out.length ? out : parsedContent
}
