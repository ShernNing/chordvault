# Setlist Segments, Drag Fix & Open-in-Chosen-Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add liturgical segments (Communion / Post-Sermon / Prayer Meeting) that songs can be dragged into and that print as title-size headers in PDF & Word exports; fix the drag-reorder disappear bug; and make clicking a setlist song open it in that slot's chosen key.

**Architecture:** A new pure module `src/lib/setlistSegments.js` owns the fixed segment list and all ordering/drop math (unit-tested). `SetlistView` groups slots into a main set + three drop zones using one dnd-kit `DndContext`, persists segment + position via existing hook ops, and links songs with `?key=&capo=`. `SongView` seeds its transpose from those query params once per navigation. The shared print component `PrintSongHeader` gains a `segmentLabel` prop that all export paths (PDF, Word, full editor) thread through; the segment header bundles with its segment's first song in the existing bin-packer.

**Tech Stack:** React 18, react-router-dom v6, @dnd-kit/core + /sortable, framer-motion, jspdf + html2canvas, docx, Supabase, Vitest.

---

## File Structure

- **Create** `src/lib/setlistSegments.js` — fixed segment list + pure helpers (`SETLIST_SEGMENTS`, `segmentOf`, `groupSlotsBySegment`, `orderSlotsForExport`, `resolveSegment`, `computeSegmentDrop`).
- **Create** `src/lib/setlistSegments.test.js` — unit tests for the helpers.
- **Create** `supabase/migrations/20260630000000_setlist_segments.sql` — add `segment` column.
- **Modify** `src/components/song/SongRenderer.jsx` — `PrintSongHeader`, `PrintableSongSheet`, `SingleSongForColumn` gain `segmentLabel`.
- **Modify** `src/lib/docxExport.js` — `songToParagraphs` + `exportSetlistToDocx` emit a segment header.
- **Modify** `src/views/SetlistView.jsx` — drag fix, segment drop zones + cross-group drag, ordered/labeled export slots, song links with key/capo params.
- **Modify** `src/views/SongView.jsx` — seed transpose from `key`/`capo` query params.
- **Modify** `src/components/setlist/SetlistFullEditor.jsx` — order by segment + render segment headers for parity.

---

## Task 1: Pure segment module (helpers + tests)

**Files:**
- Create: `src/lib/setlistSegments.js`
- Test: `src/lib/setlistSegments.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/setlistSegments.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  SETLIST_SEGMENTS,
  segmentOf,
  groupSlotsBySegment,
  orderSlotsForExport,
  resolveSegment,
  computeSegmentDrop,
} from './setlistSegments'

// helper: minimal slot
const slot = (id, segment = null) => ({ id, song_id: id, segment, song: { title: id } })

describe('segmentOf', () => {
  it('returns null for missing/null segment', () => {
    expect(segmentOf({ id: 'a' })).toBe(null)
    expect(segmentOf({ id: 'a', segment: null })).toBe(null)
  })
  it('returns the segment key when valid', () => {
    expect(segmentOf({ id: 'a', segment: 'communion' })).toBe('communion')
  })
  it('treats unknown segment values as main (null)', () => {
    expect(segmentOf({ id: 'a', segment: 'bogus' })).toBe(null)
  })
})

describe('groupSlotsBySegment', () => {
  it('returns one entry per segment in fixed order, preserving input order within a group', () => {
    const slots = [slot('a'), slot('b', 'communion'), slot('c'), slot('d', 'prayer_meeting')]
    const groups = groupSlotsBySegment(slots)
    expect(groups.map(g => g.key)).toEqual([null, 'communion', 'post_sermon', 'prayer_meeting'])
    expect(groups[0].slots.map(s => s.id)).toEqual(['a', 'c'])
    expect(groups[1].slots.map(s => s.id)).toEqual(['b'])
    expect(groups[2].slots).toEqual([])
    expect(groups[3].slots.map(s => s.id)).toEqual(['d'])
  })
})

describe('orderSlotsForExport', () => {
  it('flattens in segment order and tags only the first slot of each non-null segment', () => {
    const slots = [slot('a'), slot('b', 'communion'), slot('c', 'communion'), slot('d', 'post_sermon')]
    const out = orderSlotsForExport(slots)
    expect(out.map(s => s.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(out.map(s => s.segmentLabel)).toEqual([null, 'Communion', null, 'Post-Sermon'])
  })
  it('main set songs never get a label', () => {
    const out = orderSlotsForExport([slot('a'), slot('b')])
    expect(out.every(s => s.segmentLabel === null)).toBe(true)
  })
})

describe('resolveSegment', () => {
  const slots = [slot('a'), slot('b', 'communion')]
  it('resolves a zone droppable id to its segment key', () => {
    expect(resolveSegment('segzone:main', slots)).toBe(null)
    expect(resolveSegment('segzone:communion', slots)).toBe('communion')
  })
  it('resolves a row id to that row\'s segment', () => {
    expect(resolveSegment('a', slots)).toBe(null)
    expect(resolveSegment('b', slots)).toBe('communion')
  })
})

describe('computeSegmentDrop', () => {
  const slots = [slot('a'), slot('b'), slot('c', 'communion')]

  it('reorders within the same group when dropped on a sibling row', () => {
    const r = computeSegmentDrop(slots, 'b', 'a')
    expect(r.orderedIds).toEqual(['b', 'a', 'c'])
    expect(r.destSegment).toBe(null)
    expect(r.changedSegment).toBe(false)
  })

  it('moves a row into a new segment when dropped on that segment\'s zone', () => {
    const r = computeSegmentDrop(slots, 'a', 'segzone:communion')
    expect(r.destSegment).toBe('communion')
    expect(r.changedSegment).toBe(true)
    // a now lives in communion, after existing member c (appended)
    expect(r.orderedIds).toEqual(['b', 'c', 'a'])
  })

  it('inserts at the dropped row\'s position in the destination group', () => {
    const r = computeSegmentDrop(slots, 'a', 'c')
    expect(r.destSegment).toBe('communion')
    expect(r.orderedIds).toEqual(['b', 'a', 'c'])
  })

  it('returns null when the active id is unknown', () => {
    expect(computeSegmentDrop(slots, 'zzz', 'a')).toBe(null)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/setlistSegments.test.js`
Expected: FAIL — "Failed to resolve import './setlistSegments'" / functions undefined.

- [ ] **Step 3: Write the module**

Create `src/lib/setlistSegments.js`:

```js
// Fixed liturgical segments for a setlist. `key === null` is the main worship
// set (default for every existing slot). Order here drives both the editor's
// group order and the export order.
export const SETLIST_SEGMENTS = [
  { key: null, label: null, zone: 'Set' },
  { key: 'communion', label: 'Communion', zone: 'Communion' },
  { key: 'post_sermon', label: 'Post-Sermon', zone: 'Post-Sermon' },
  { key: 'prayer_meeting', label: 'Prayer Meeting', zone: 'Prayer Meeting' },
]

const SEGMENT_KEYS = SETLIST_SEGMENTS.map((s) => s.key)
const ZONE_PREFIX = 'segzone:'

// Normalize a slot's segment to a known key; unknown/missing → main (null).
export function segmentOf(slot) {
  const s = slot?.segment ?? null
  return SEGMENT_KEYS.includes(s) ? s : null
}

// Group slots into the fixed segment order, preserving each slot's input order
// (callers pass slots already sorted by position) within its group.
export function groupSlotsBySegment(slots) {
  return SETLIST_SEGMENTS.map((seg) => ({
    ...seg,
    slots: (slots || []).filter((s) => segmentOf(s) === seg.key),
  }))
}

// Flatten slots in segment order; tag the FIRST slot of each non-null segment
// with `segmentLabel` (the printed header text). All other slots get null.
export function orderSlotsForExport(slots) {
  const out = []
  for (const seg of SETLIST_SEGMENTS) {
    const group = (slots || []).filter((s) => segmentOf(s) === seg.key)
    group.forEach((s, i) => {
      out.push({ ...s, segmentLabel: i === 0 && seg.label ? seg.label : null })
    })
  }
  return out
}

// Resolve a dnd-kit drop target id to a segment key. Drop targets are either a
// zone container (`segzone:<key|main>`) or a row (a slot id).
export function resolveSegment(overId, slots) {
  if (typeof overId === 'string' && overId.startsWith(ZONE_PREFIX)) {
    const key = overId.slice(ZONE_PREFIX.length)
    return key === 'main' ? null : key
  }
  const s = (slots || []).find((x) => x.id === overId)
  return s ? segmentOf(s) : null
}

export function zoneId(segmentKey) {
  return `${ZONE_PREFIX}${segmentKey == null ? 'main' : segmentKey}`
}

// Compute the new global slot-id order and destination segment after a drop.
// Pure: callers persist the result via reorder()/updateSlot().
export function computeSegmentDrop(slots, activeId, overId) {
  const active = (slots || []).find((s) => s.id === activeId)
  if (!active) return null
  const destSegment = resolveSegment(overId, slots)

  // Build per-segment id arrays with the active row pulled out.
  const groups = new Map(SETLIST_SEGMENTS.map((s) => [s.key, []]))
  for (const s of slots) {
    if (s.id === activeId) continue
    groups.get(segmentOf(s)).push(s.id)
  }

  const destArr = groups.get(destSegment)
  let idx = destArr.indexOf(overId)
  if (idx === -1) idx = destArr.length // dropped on the zone, not a row → append
  destArr.splice(idx, 0, activeId)

  const orderedIds = SETLIST_SEGMENTS.flatMap((s) => groups.get(s.key))
  return {
    orderedIds,
    destSegment,
    changedSegment: destSegment !== segmentOf(active),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/setlistSegments.test.js`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/setlistSegments.js src/lib/setlistSegments.test.js
git commit -m "feat: pure setlist-segment ordering + drop helpers"
```

---

## Task 2: Database migration

**Files:**
- Create: `supabase/migrations/20260630000000_setlist_segments.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260630000000_setlist_segments.sql`:

```sql
-- Liturgical segment a setlist song belongs to.
-- NULL = main worship set. Otherwise: 'communion' | 'post_sermon' | 'prayer_meeting'.
alter table setlist_songs add column if not exists segment text;
```

- [ ] **Step 2: Apply to the live database**

The `setlist_songs` table predates the repo's migrations folder, so this must be
applied to the live Supabase project. Run the SQL above in the Supabase SQL editor
(or `supabase db push` if the project is linked). No code reads will break before it
is applied — `segment` simply reads as `undefined`, which `segmentOf` maps to the
main set.

> NOTE FOR EXECUTOR: this step is performed by the user. Do not block later tasks on
> it locally, but the segment-drag persistence (Task 4) cannot be verified end-to-end
> until the column exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260630000000_setlist_segments.sql
git commit -m "feat: add segment column to setlist_songs"
```

---

## Task 3: Fix the drag-reorder disappear bug

**Files:**
- Modify: `src/views/SetlistView.jsx` (the slot-list render, ~lines 619-661)

**Problem:** Each row is wrapped in a `motion.div` with animated `height` and
`style={{ overflow: "hidden" }}`. dnd-kit translates the inner node while dragging,
so it leaves the clipping box and is hidden until drop.

- [ ] **Step 1: Replace the clipping wrapper with an opacity-only fade**

In `src/views/SetlistView.jsx`, find the list render block:

```jsx
                <div className='space-y-2'>
                  <AnimatePresence initial={false}>
                    {slots.map((slot, index) => (
                      <motion.div
                        key={slot.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={ease}
                        style={{ overflow: "hidden" }}
                      >
                        <SortableSlot
                          slot={slot}
                          index={index}
                          seconds={
                            durations[slot.song_id] ??
                            getSongSeconds(slot.song_id)
                          }
                          onDurationChange={(s) =>
                            handleDurationChange(slot.song_id, s)
                          }
                          onRemove={() => removeSong(slot.id)}
                          onUpdateSlot={(updates) =>
                            updateSlot(slot.id, updates)
                          }
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
```

Replace it with (opacity-only fade, no height animation, no `overflow:hidden`):

```jsx
                <div className='space-y-2'>
                  <AnimatePresence initial={false}>
                    {slots.map((slot, index) => (
                      <motion.div
                        key={slot.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={ease}
                      >
                        <SortableSlot
                          slot={slot}
                          index={index}
                          seconds={
                            durations[slot.song_id] ??
                            getSongSeconds(slot.song_id)
                          }
                          onDurationChange={(s) =>
                            handleDurationChange(slot.song_id, s)
                          }
                          onRemove={() => removeSong(slot.id)}
                          onUpdateSlot={(updates) =>
                            updateSlot(slot.id, updates)
                          }
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
```

- [ ] **Step 2: Verify in the browser**

Start the dev server (`preview_start`), open a setlist with ≥3 songs, and drag a row.
Expected: the dragged row stays fully visible and follows the cursor the entire drag
(no disappear); on release the new order persists. Use `preview_console_logs` to
confirm no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/SetlistView.jsx
git commit -m "fix: setlist drag row no longer disappears mid-drag"
```

---

## Task 4: Segment drop zones + cross-group drag

**Files:**
- Modify: `src/views/SetlistView.jsx` (imports, `handleDragEnd`, the list render, `SortableSlot` position label)

This task makes the song list render as the main set plus three labeled drop zones,
and routes drags through the Task 1 helpers.

- [ ] **Step 1: Import the segment helpers**

In `src/views/SetlistView.jsx`, add to the imports near the other `../lib` imports:

```jsx
import {
  SETLIST_SEGMENTS,
  groupSlotsBySegment,
  computeSegmentDrop,
  zoneId,
} from "../lib/setlistSegments";
import { useDroppable } from "@dnd-kit/core";
```

- [ ] **Step 2: Rewrite `handleDragEnd` to use `computeSegmentDrop`**

Replace the existing `handleDragEnd`:

```jsx
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = slots.findIndex((s) => s.id === active.id);
    const newIndex = slots.findIndex((s) => s.id === over.id);
    const newOrder = arrayMove(slots, oldIndex, newIndex);
    await reorder(newOrder.map((s) => s.id));
  };
```

with:

```jsx
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const result = computeSegmentDrop(slots, active.id, over.id);
    if (!result) return;
    const { orderedIds, destSegment, changedSegment } = result;
    if (changedSegment) await updateSlot(active.id, { segment: destSegment });
    await reorder(orderedIds);
  };
```

(`arrayMove` may now be unused in this file — remove it from the `@dnd-kit/sortable`
import if so, to keep the lint clean.)

- [ ] **Step 3: Replace the single sortable list with grouped drop zones**

Replace the whole `slots.length === 0 ? <EmptyState .../> : <DndContext>...</DndContext>`
block with grouped rendering. The `DndContext` now wraps all groups; each group is a
`SegmentGroup` containing its own `SortableContext` and a droppable zone.

```jsx
          {slots.length === 0 ? (
            <EmptyState
              icon={Music2}
              title='No songs yet'
              description='Search and add songs from your library.'
              action={
                <Button
                  variant='secondary'
                  size='sm'
                  onClick={() => setAddPanelOpen(true)}
                >
                  <Plus size={13} /> Add song
                </Button>
              }
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <div className='space-y-4'>
                {groupSlotsBySegment(slots).map((group) => {
                  // Running 1-based number across ALL slots, in segment order,
                  // so the displayed index matches the export order.
                  return (
                    <SegmentGroup
                      key={group.zone}
                      group={group}
                      baseIndex={baseIndexFor(slots, group.key)}
                      durations={durations}
                      onDurationChange={handleDurationChange}
                      removeSong={removeSong}
                      updateSlot={updateSlot}
                    />
                  );
                })}
              </div>
            </DndContext>
          )}
```

- [ ] **Step 4: Add the `baseIndexFor` helper and `SegmentGroup` component**

Add this pure helper just above the `SetlistView` component (after `getMaxLineChars`):

```jsx
// 1-based starting number for a segment's first row, counted across all
// preceding segments in fixed order so numbering is continuous in export order.
function baseIndexFor(slots, segmentKey) {
  let n = 0;
  for (const seg of SETLIST_SEGMENTS) {
    if (seg.key === segmentKey) break;
    n += slots.filter((s) => (s.segment ?? null) === seg.key).length;
  }
  return n;
}
```

Add the `SegmentGroup` component just above `SortableSlot`:

```jsx
// ─── Segment Group (droppable zone + its sortable rows) ─────────────────────

function SegmentGroup({
  group,
  baseIndex,
  durations,
  onDurationChange,
  removeSong,
  updateSlot,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(group.key) });
  const ids = group.slots.map((s) => s.id);
  const isMain = group.key === null;

  return (
    <div>
      {group.label && (
        <div className='flex items-center gap-2 mb-1.5 mt-1'>
          <span className='text-xs font-semibold text-[var(--color-ink)] uppercase tracking-wide'>
            {group.label}
          </span>
          <span className='text-[10px] text-[var(--color-ink-muted)]'>
            {group.slots.length || ""}
          </span>
        </div>
      )}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`space-y-2 rounded-lg transition-colors ${
            isOver ? "ring-2 ring-[var(--color-accent)] ring-offset-2" : ""
          } ${
            !isMain && group.slots.length === 0
              ? "border border-dashed border-[var(--color-border)] p-3"
              : ""
          }`}
        >
          {group.slots.map((slot, index) => (
            <SortableSlot
              key={slot.id}
              slot={slot}
              index={baseIndex + index}
              seconds={durations[slot.song_id] ?? getSongSeconds(slot.song_id)}
              onDurationChange={(s) => onDurationChange(slot.song_id, s)}
              onRemove={() => removeSong(slot.id)}
              onUpdateSlot={(updates) => updateSlot(slot.id, updates)}
            />
          ))}
          {!isMain && group.slots.length === 0 && (
            <p className='text-[11px] text-[var(--color-ink-muted)] text-center py-1'>
              Drag songs here
            </p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
```

Note: the opacity-fade `motion.div` / `AnimatePresence` wrapper from Task 3 is dropped
in this grouped render — rows render directly inside each group's `SortableContext`.
(`AnimatePresence` and `motion` may become unused in this file; remove those imports if
lint flags them.)

- [ ] **Step 5: Verify in the browser**

With the dev server running and the migration applied, open a setlist with several
songs. Expected:
- A "Communion", "Post-Sermon", and "Prayer Meeting" zone appear below the main set;
  empty ones show a dashed "Drag songs here" box.
- Dragging a main-set song onto a zone moves it there; it stays after a reload
  (`preview_eval` → `window.location.reload()`), proving persistence.
- Dragging within a group reorders; dragging back to the main set works.
- `preview_console_logs` shows no errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/SetlistView.jsx
git commit -m "feat: setlist segment drop zones with cross-group drag"
```

---

## Task 5: Open a setlist song in its chosen key

**Files:**
- Modify: `src/views/SetlistView.jsx` (`SortableSlot` song `Link`)
- Modify: `src/views/SongView.jsx` (seed transpose from query params)

- [ ] **Step 1: Build a key/capo-aware link target in `SortableSlot`**

In `src/views/SetlistView.jsx`, inside `SortableSlot`, just before the `return`, add a
computed link target (uses the existing `displayKey` and `localCapo`):

```jsx
  const songHref = (() => {
    const params = new URLSearchParams();
    // Only add params when the slot overrides the song's stored key/capo.
    if (slot.chosen_key && displayKey) params.set("key", displayKey);
    if (localCapo > 0) params.set("capo", String(localCapo));
    const qs = params.toString();
    return `/songs/${slot.song_id}${qs ? `?${qs}` : ""}`;
  })();
```

Then change the song title `Link`:

```jsx
            <Link
              to={`/songs/${slot.song_id}`}
              className='text-sm font-semibold text-[var(--color-ink)] hover:underline truncate block'
            >
```

to:

```jsx
            <Link
              to={songHref}
              className='text-sm font-semibold text-[var(--color-ink)] hover:underline truncate block'
            >
```

- [ ] **Step 2: Seed transpose from query params in `SongView`**

In `src/views/SongView.jsx`:

(a) Ensure `useSearchParams` and `useRef` are imported. The file imports from
`react-router-dom` and `react`; add `useSearchParams` to the router import and
`useRef` to the react import if not already present. It already imports
`semitonesFromKeyToKey`? It imports `transposeKey`, `getCapoShapeKey`,
`transposeParsedContent`, `transposeChord` — add `semitonesFromKeyToKey` to that
`../lib/transposition` import.

(b) Near the other hooks (after `const [transpose, setTranspose] = useLocalStorage(...)`),
add:

```jsx
  const [searchParams] = useSearchParams();
  const seededKeyRef = useRef(null);
```

(c) Add an effect that runs once per (song, param) combination, after `song` is loaded.
Place it after the `songChords` `useMemo` (so `song` is in scope):

```jsx
  // When navigated from a setlist with ?key=/?capo=, open in that key/capo once.
  useEffect(() => {
    if (!song?.original_key) return;
    const keyParam = searchParams.get("key");
    const capoParam = searchParams.get("capo");
    if (!keyParam) return;
    const sig = `${id}:${keyParam}:${capoParam || 0}`;
    if (seededKeyRef.current === sig) return; // already applied for this nav
    seededKeyRef.current = sig;
    const semitones = semitonesFromKeyToKey(song.original_key, keyParam);
    setTranspose({ semitones, capo: Number(capoParam) || 0 });
  }, [song?.original_key, id, searchParams, setTranspose]);
```

- [ ] **Step 3: Verify in the browser**

With the dev server running:
- In a setlist, set a song's key to something other than its original (e.g. original
  G → choose A) and optionally a capo.
- Click that song's title.
- Expected: SongView opens showing key A (and the capo applied). `preview_snapshot`
  the SongView header to confirm the displayed key matches the slot's chosen key.
- Change the transpose manually on that page — it should not snap back.
- Open a song whose slot is at its original key with no capo — URL has no query string
  and it opens normally.

- [ ] **Step 4: Commit**

```bash
git add src/views/SetlistView.jsx src/views/SongView.jsx
git commit -m "feat: open setlist song in its chosen key/capo"
```

---

## Task 6: Segment headers in the PDF export

**Files:**
- Modify: `src/components/song/SongRenderer.jsx` (`PrintSongHeader`, `PrintableSongSheet`, `SingleSongForColumn`)
- Modify: `src/views/SetlistView.jsx` (`handleExportPDF` ordering, measurement, render props)

- [ ] **Step 1: Add a `segmentLabel` line to `PrintSongHeader`**

In `src/components/song/SongRenderer.jsx`, replace `PrintSongHeader`:

```jsx
function PrintSongHeader({ song, keyLabel, songNumber }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <span
        style={{
          fontSize: "19px",
          fontWeight: "700",
          color: "#000000",
          display: "block",
          wordBreak: "break-word",
        }}
      >
        {[
          songNumber != null ? `${songNumber}.` : null,
          cleanSongTitle(song.title),
          song.artist ? `- ${song.artist}` : null,
          keyLabel ? `(${keyLabel})` : null,
        ]
          .filter(Boolean)
          .join(" ")}
      </span>
    </div>
  );
}
```

with (adds an optional segment header line, same 19px bold size as the title):

```jsx
function PrintSongHeader({ song, keyLabel, songNumber, segmentLabel }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      {segmentLabel && (
        <span
          style={{
            fontSize: "19px",
            fontWeight: "700",
            color: "#000000",
            display: "block",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            borderBottom: "1px solid #000000",
            marginBottom: "6px",
            paddingBottom: "2px",
          }}
        >
          {segmentLabel}
        </span>
      )}
      <span
        style={{
          fontSize: "19px",
          fontWeight: "700",
          color: "#000000",
          display: "block",
          wordBreak: "break-word",
        }}
      >
        {[
          songNumber != null ? `${songNumber}.` : null,
          cleanSongTitle(song.title),
          song.artist ? `- ${song.artist}` : null,
          keyLabel ? `(${keyLabel})` : null,
        ]
          .filter(Boolean)
          .join(" ")}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Forward `segmentLabel` through `PrintableSongSheet` and `SingleSongForColumn`**

In `PrintableSongSheet`, add `segmentLabel` to the destructured props and to BOTH
`<PrintSongHeader .../>` usages (the non-columns branch and the columns branch):

```jsx
export function PrintableSongSheet({
  song,
  semitones,
  targetKey,
  keyLabel,
  songNumber,
  segmentLabel,
}) {
```

and each header becomes:

```jsx
        <PrintSongHeader
          song={song}
          keyLabel={keyLabel}
          songNumber={songNumber}
          segmentLabel={segmentLabel}
        />
```

In `SingleSongForColumn`, add `segmentLabel` to the destructured props and to its
`<PrintSongHeader .../>`:

```jsx
export function SingleSongForColumn({
  song,
  semitones,
  targetKey,
  keyLabel,
  songNumber,
  segmentLabel,
}) {
```

```jsx
      <PrintSongHeader
        song={song}
        keyLabel={keyLabel}
        songNumber={songNumber}
        segmentLabel={segmentLabel}
      />
```

(`MultiSongPage` already spreads `{...item}` into `SingleSongForColumn`, so a
`segmentLabel` field on each item flows through with no change there.)

- [ ] **Step 3: Order + tag export slots and thread `segmentLabel` in `handleExportPDF`**

In `src/views/SetlistView.jsx`, add `orderSlotsForExport` to the segment-helpers import
(added in Task 4):

```jsx
import {
  SETLIST_SEGMENTS,
  groupSlotsBySegment,
  computeSegmentDrop,
  zoneId,
  orderSlotsForExport,
} from "../lib/setlistSegments";
```

In `handleExportPDF`, change the export-slot source so it is ordered by segment and
carries `segmentLabel`. Replace:

```jsx
      const exportSlots = Array.isArray(slotsOverride) ? slotsOverride : slots;
```

with:

```jsx
      const exportSlots = orderSlotsForExport(
        Array.isArray(slotsOverride) ? slotsOverride : slots,
      );
```

In the `rawSlotData` map, carry the label through. Change the returned object to add
`segmentLabel`:

```jsx
          return {
            slot,
            shapeSemitones,
            shapeKey,
            keyLabel,
            maxChars,
            globalIdx,
            segmentLabel: slot.segmentLabel || null,
          };
```

In the measurement `flushSync` render, pass it so the header height is measured
together with its first song (keeps the header glued to that song):

```jsx
          measureRoot.render(
            <SingleSongForColumn
              song={d.slot.song}
              semitones={d.shapeSemitones}
              targetKey={d.shapeKey}
              keyLabel={d.keyLabel}
              songNumber={d.globalIdx + 1}
              segmentLabel={d.segmentLabel}
            />,
          );
```

In `makeItems`, add `segmentLabel`:

```jsx
        const makeItems = (col) =>
          col.map((d) => ({
            song: d.slot.song,
            semitones: d.shapeSemitones,
            targetKey: d.shapeKey,
            keyLabel: d.keyLabel,
            songNumber: d.globalIdx + 1,
            segmentLabel: d.segmentLabel,
          }));
```

In the two `PrintableSongSheet` render branches (`page.type === "single"` and the
single-narrow-song branch), add `segmentLabel={d.segmentLabel}`:

```jsx
            <PrintableSongSheet
              song={d.slot.song}
              semitones={d.shapeSemitones}
              targetKey={d.shapeKey}
              keyLabel={d.keyLabel}
              songNumber={d.globalIdx + 1}
              segmentLabel={d.segmentLabel}
            />
```

- [ ] **Step 4: Verify in the browser**

With several songs spread across the main set and at least one segment (e.g. two songs
in Communion), click **Export PDF**. Open the downloaded PDF. Expected:
- The first Communion song is preceded by a bold, title-size "COMMUNION" header line.
- The second Communion song has no header.
- Main-set songs have no header.
- Two-column packing still looks the same as before for the song bodies.

(If the preview environment cannot open the saved PDF, instead render the
`MultiSongPage`/`SingleSongForColumn` with a `segmentLabel` in an isolated preview page
and `preview_screenshot` it to confirm the header renders at title size.)

- [ ] **Step 5: Commit**

```bash
git add src/components/song/SongRenderer.jsx src/views/SetlistView.jsx
git commit -m "feat: print segment headers in setlist PDF export"
```

---

## Task 7: Segment headers in the Word (docx) export

**Files:**
- Modify: `src/lib/docxExport.js` (`songToParagraphs`, `exportSetlistToDocx`)
- Modify: `src/views/SetlistView.jsx` (`handleExportDocx` ordering + `getSongData`)

- [ ] **Step 1: Emit a segment header paragraph in `songToParagraphs`**

In `src/lib/docxExport.js`, change the signature and prepend a segment header run when
present. Replace the function header + the `paragraphs` initializer:

```js
function songToParagraphs(song, semitones, targetKey, keyLabel, songNumber) {
  const raw = semitones !== 0
    ? transposeParsedContent(song.parsed_content, semitones, targetKey)
    : song.parsed_content
  const content = stripBlanks(raw || [])

  const titleParts = [
    songNumber != null ? `${songNumber}.` : null,
    cleanSongTitle(song.title),
    song.artist ? `- ${song.artist}` : null,
    keyLabel ? `(${keyLabel})` : null,
  ].filter(Boolean).join(' ')

  const paragraphs = [
    new Paragraph({
      children: [new TextRun({ text: titleParts, bold: true, size: 28, font: 'Calibri' })],
      spacing: { after: 120 },
    }),
  ]
```

with:

```js
function songToParagraphs(song, semitones, targetKey, keyLabel, songNumber, segmentLabel) {
  const raw = semitones !== 0
    ? transposeParsedContent(song.parsed_content, semitones, targetKey)
    : song.parsed_content
  const content = stripBlanks(raw || [])

  const titleParts = [
    songNumber != null ? `${songNumber}.` : null,
    cleanSongTitle(song.title),
    song.artist ? `- ${song.artist}` : null,
    keyLabel ? `(${keyLabel})` : null,
  ].filter(Boolean).join(' ')

  const paragraphs = []
  if (segmentLabel) {
    // Segment header, same point-size (28 = 14pt) as the title run.
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: segmentLabel.toUpperCase(), bold: true, size: 28, font: 'Calibri' })],
      spacing: { after: 80 },
    }))
  }
  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: titleParts, bold: true, size: 28, font: 'Calibri' })],
    spacing: { after: 120 },
  }))
```

- [ ] **Step 2: Pass `segmentLabel` from `exportSetlistToDocx` into `songToParagraphs`**

In `exportSetlistToDocx`, the per-slot data comes from the caller's `getSongData`.
Read a `segmentLabel` from it and forward it. Replace:

```js
  for (let i = 0; i < slots.length; i++) {
    const { song, semitones, targetKey, keyLabel } = getSongData(slots[i])
    if (!song) continue
    if (allParagraphs.length > 0) {
      allParagraphs.push(new Paragraph({ pageBreakBefore: true, children: [] }))
    }
    allParagraphs.push(...songToParagraphs(song, semitones, targetKey, keyLabel, i + 1))
  }
```

with:

```js
  for (let i = 0; i < slots.length; i++) {
    const { song, semitones, targetKey, keyLabel, segmentLabel } = getSongData(slots[i])
    if (!song) continue
    if (allParagraphs.length > 0) {
      allParagraphs.push(new Paragraph({ pageBreakBefore: true, children: [] }))
    }
    allParagraphs.push(...songToParagraphs(song, semitones, targetKey, keyLabel, i + 1, segmentLabel))
  }
```

- [ ] **Step 3: Order + tag slots and return `segmentLabel` in `handleExportDocx`**

In `src/views/SetlistView.jsx`, in `handleExportDocx`, order the slots and surface
`segmentLabel` from `getSongData`. Replace:

```jsx
      const exportSlots = Array.isArray(slotsOverride) ? slotsOverride : slots;
      await exportSetlistToDocx(
        setlist.name,
        exportSlots.filter((s) => s.song),
        (slot) => {
```

with:

```jsx
      const exportSlots = orderSlotsForExport(
        Array.isArray(slotsOverride) ? slotsOverride : slots,
      );
      await exportSetlistToDocx(
        setlist.name,
        exportSlots.filter((s) => s.song),
        (slot) => {
```

and in that callback's returned object, add `segmentLabel`:

```jsx
          return {
            song: slot.song,
            semitones: shapeSemitones,
            targetKey: shapeKey,
            keyLabel,
            segmentLabel: slot.segmentLabel || null,
          };
```

- [ ] **Step 4: Verify in the browser**

With songs in at least one segment, click **Export Word**, open the `.docx`. Expected:
the first song of each non-empty segment has a bold, title-size segment header line
above its title; main-set songs do not. Song order follows main → Communion →
Post-Sermon → Prayer Meeting.

- [ ] **Step 5: Commit**

```bash
git add src/lib/docxExport.js src/views/SetlistView.jsx
git commit -m "feat: print segment headers in setlist Word export"
```

---

## Task 8: Full editor parity (ordering + headers)

**Files:**
- Modify: `src/components/setlist/SetlistFullEditor.jsx` (init ordering, measurement, header render)

The full editor ("Edit full setlist") renders WYSIWYG pages with the same packing and
its own Export buttons. It must order by segment and show the same segment headers so
its preview matches the PDF.

- [ ] **Step 1: Order incoming slots by segment + carry the label**

In `src/components/setlist/SetlistFullEditor.jsx`, import the helper at the top with the
other `../../lib` imports:

```jsx
import { orderSlotsForExport } from "../../lib/setlistSegments";
```

In the `useState(() => ...)` initializer for `editedSlots`, wrap the source slots with
`orderSlotsForExport` and keep the `segmentLabel` on each edited slot. Replace:

```jsx
  const [editedSlots, setEditedSlots] = useState(() =>
    slots
      .filter((s) => s.song)
      .map((slot) => {
        const { shapeSemitones, shapeKey, keyLabel, displayKey } =
          getTransposeData(slot);
        const raw = slot.song.parsed_content || [];
        const content =
          shapeSemitones !== 0
            ? transposeParsedContent(raw, shapeSemitones, shapeKey)
            : raw;
        return {
          ...slot,
          _keyLabel: keyLabel,
          _displayKey: displayKey || slot.song?.original_key || "",
          sections: parsedContentToSections(content),
        };
      }),
  );
```

with:

```jsx
  const [editedSlots, setEditedSlots] = useState(() =>
    orderSlotsForExport(slots)
      .filter((s) => s.song)
      .map((slot) => {
        const { shapeSemitones, shapeKey, keyLabel, displayKey } =
          getTransposeData(slot);
        const raw = slot.song.parsed_content || [];
        const content =
          shapeSemitones !== 0
            ? transposeParsedContent(raw, shapeSemitones, shapeKey)
            : raw;
        return {
          ...slot,
          _keyLabel: keyLabel,
          _displayKey: displayKey || slot.song?.original_key || "",
          _segmentLabel: slot.segmentLabel || null,
          sections: parsedContentToSections(content),
        };
      }),
  );
```

- [ ] **Step 2: Measure the header with its first song in `computePageLayout`**

In `computePageLayout`, pass the label into the measurement render so the header height
is included. In the `flushSync(() => { measureRoot.render(<SingleSongForColumn .../>) })`
call, add `segmentLabel={slot._segmentLabel}`:

```jsx
      measureRoot.render(
        <SingleSongForColumn
          song={{ ...slot.song, parsed_content: parsedContent }}
          semitones={0}
          targetKey={slot._displayKey}
          keyLabel={slot._keyLabel}
          songNumber={globalIdx + 1}
          segmentLabel={slot._segmentLabel}
        />,
      );
```

- [ ] **Step 3: Render the segment header in `EditableSongContent`**

In `EditableSongContent`, add the header above the song title block. Replace:

```jsx
      {/* Song header, matches PrintSongHeader exactly */}
      <div style={{ marginBottom: "8px" }}>
        <span
          style={{
            fontSize: "19px",
            fontWeight: "700",
            display: "block",
            wordBreak: "break-word",
          }}
        >
          {songNumber != null ? `${songNumber}. ` : ""}
          {cleanSongTitle(slot.song?.title || "")}
          {slot.song?.artist ? ` - ${slot.song.artist}` : ""}
          {slot._keyLabel ? ` (${slot._keyLabel})` : ""}
        </span>
      </div>
```

with:

```jsx
      {/* Song header, matches PrintSongHeader exactly */}
      <div style={{ marginBottom: "8px" }}>
        {slot._segmentLabel && (
          <span
            style={{
              fontSize: "19px",
              fontWeight: "700",
              display: "block",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              borderBottom: "1px solid #000000",
              marginBottom: "6px",
              paddingBottom: "2px",
            }}
          >
            {slot._segmentLabel}
          </span>
        )}
        <span
          style={{
            fontSize: "19px",
            fontWeight: "700",
            display: "block",
            wordBreak: "break-word",
          }}
        >
          {songNumber != null ? `${songNumber}. ` : ""}
          {cleanSongTitle(slot.song?.title || "")}
          {slot.song?.artist ? ` - ${slot.song.artist}` : ""}
          {slot._keyLabel ? ` (${slot._keyLabel})` : ""}
        </span>
      </div>
```

- [ ] **Step 4: Confirm export parity**

`buildExportSlots` already spreads `...slot`, so the editor's PDF/Word export goes
through `handleExportPDF`/`handleExportDocx`, which re-run `orderSlotsForExport` and
re-tag `segmentLabel` from the slot's `segment` field. No change needed there — verify
`segment` survives on `editedSlots` (it does, via `...slot`).

- [ ] **Step 5: Verify in the browser**

Open a setlist with songs in a segment, click **Edit full setlist**. Expected: the
on-screen pages show the same title-size segment headers above the first song of each
segment, in segment order. Export PDF from inside the editor and confirm headers match.

- [ ] **Step 6: Commit**

```bash
git add src/components/setlist/SetlistFullEditor.jsx
git commit -m "feat: segment headers + ordering in setlist full editor"
```

---

## Task 9: Final verification & lint

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`
Expected: PASS, including the new `setlistSegments.test.js`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors. Fix any unused-import warnings introduced by Tasks 3–4 (e.g.
`arrayMove`, `AnimatePresence`, `motion`, `ease` in `SetlistView.jsx` if no longer used).

- [ ] **Step 3: End-to-end smoke test in the browser**

With the migration applied and dev server running, in one setlist:
1. Drag a row — no disappear (Task 3).
2. Drag songs into Communion and Prayer Meeting — persists across reload (Task 4).
3. Set a song to a non-original key, click it — opens in that key (Task 5).
4. Export PDF — segment headers present, title-size, packing intact (Task 6).
5. Export Word — segment headers present, order correct (Task 7).
6. Edit full setlist — headers + order match (Task 8).

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint cleanup for setlist segments"
```

---

## Self-Review notes

- **Spec coverage:** Drag bug → Task 3. Open-in-key → Task 5. Segment data model →
  Tasks 1–2. Editor drop zones + cross-group drag → Tasks 1+4. PDF headers → Task 6.
  Word headers → Task 7. Full-editor parity → Task 8. Empty-segment-hidden-in-export is
  inherent to `orderSlotsForExport` (empty groups contribute no slots). All spec
  acceptance criteria map to a task.
- **Type consistency:** Helper names (`SETLIST_SEGMENTS`, `segmentOf`,
  `groupSlotsBySegment`, `orderSlotsForExport`, `resolveSegment`, `zoneId`,
  `computeSegmentDrop`) are used identically across Tasks 1, 4, 6, 7, 8. The prop name
  `segmentLabel` is consistent across `PrintSongHeader`, `SingleSongForColumn`,
  `PrintableSongSheet`, `songToParagraphs`, and the full editor's `_segmentLabel`
  field.
- **Risk:** Cross-group dnd-kit drop relies on `closestCenter` selecting an empty
  zone's `useDroppable` target; the drop math itself is pure + unit-tested
  (`computeSegmentDrop`), so integration is the only thing requiring browser
  verification (Task 4 Step 5).
```
