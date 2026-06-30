# Setlist segments, drag fix, and open-in-chosen-key — Design

Date: 2026-06-30
Status: Approved (pending spec review)

Three changes to the setlist feature:

1. Add liturgical **segments** (Communion, Post-Sermon, Prayer Meeting) that songs can be dragged into; segments surface as headers in the exported PDF (and Word) the same size as a song title.
2. Fix the **drag-reorder visual bug** where a row disappears mid-drag and reappears on release.
3. From the setlist, opening a song whose slot has a key different from the song's original key should **open the song in that chosen key**.

---

## 1. Drag-reorder visual bug (fix)

### Cause
In `src/views/SetlistView.jsx`, each sortable row is wrapped in a `motion.div` with
`initial/animate/exit` height collapse and `style={{ overflow: "hidden" }}`
(around line 630). dnd-kit applies a `translate3d(...)` transform to the inner
`SortableSlot` node while dragging. The dragged node leaves the bounds of its
`overflow:hidden` motion wrapper, so it is clipped → appears to vanish. On drop the
transform clears and the node resettles inside the wrapper → reappears.

### Fix
Remove the clipping/height-collapse wrapper as the drag conflict source. Keep a
lightweight enter/exit fade (opacity only) for add/remove — no `overflow:hidden`,
no animated `height`, so nothing clips the dragged node.

- Replace the per-row `motion.div` (with `initial={{opacity:0,height:0}}`,
  `animate={{height:"auto"}}`, `exit`, `overflow:hidden`) with either:
  - a plain wrapper / `React.Fragment`, or
  - a `motion.div` animating `opacity` only (no `height`, no `overflow`).
- Keep `AnimatePresence` if the opacity fade on removal is desired; otherwise drop it.

### Acceptance
- Dragging a row keeps it fully visible following the cursor for the whole drag.
- Reordering still persists (existing `handleDragEnd` → `reorder` unchanged).

---

## 2. Open song in the setlist's chosen key (#3)

### Behavior
When a setlist slot has a `chosen_key` (and/or `capo`) different from the song's
stored `original_key`, clicking the song title in the setlist opens `SongView`
transposed to that chosen key (and capo), instead of the original key.

### Implementation
- **Link (SetlistView `SortableSlot`)**: change the song `Link` target from
  `/songs/${slot.song_id}` to include query params when the slot overrides the key
  or capo:
  - `key` = the slot's display key (`slot.chosen_key || song.original_key`)
  - `capo` = `slot.capo` (only when > 0)
  - Omit params entirely when there is no `chosen_key` and no capo (plain link).
- **SongView**: read `key`/`capo` query params (via `useSearchParams`). On navigation,
  if `key` is present, compute `semitones = semitonesFromKeyToKey(song.original_key, key)`
  and set transpose to `{ semitones, capo: Number(capo) || 0 }`. Apply **once per
  navigation** (guard with a ref keyed on the param values) so the user can still
  freely transpose afterward without it snapping back. This overrides the stored
  `cv-transpose-${id}` for that visit.
  - Requires `song` to be loaded before computing semitones (original_key needed);
    apply inside an effect that depends on `song` + the params.
  - If `key` is absent, behavior is unchanged (use stored transpose).

### Acceptance
- Slot in a non-original key → clicking opens SongView showing that key.
- Slot with capo → SongView opens with that capo applied.
- Slot at original key / no capo → plain link, no query params, unchanged behavior.
- After opening, user can transpose normally; it does not re-snap.

---

## 3. Segments (#1)

### Data model
Add a nullable `segment` column to `setlist_songs`:

- `null` → main worship set (default; existing rows stay `null`).
- `'communion' | 'post_sermon' | 'prayer_meeting'` → the three fixed segments.

A new migration file under `supabase/migrations/`:

```sql
alter table setlist_songs add column if not exists segment text;
```

Notes:
- `getWithSongs` uses `select('*')`, so `segment` is carried automatically.
- `updateSongSlot(slotId, updates)` already passes arbitrary updates through, so
  `{ segment }` rides along — no new op needed.
- `addSong` continues to insert with `segment` implicitly `null` (main set).
- Migration must be applied to the live Supabase DB (the table predates the repo's
  migrations folder). The SQL file is provided; the user applies it.

### Segment definition (shared constant)
A single ordered list drives editor grouping and export order:

```js
export const SETLIST_SEGMENTS = [
  { key: null,             label: null,             zone: 'Set' },
  { key: 'communion',      label: 'Communion' },
  { key: 'post_sermon',    label: 'Post-Sermon' },
  { key: 'prayer_meeting', label: 'Prayer Meeting' },
];
```

Order of slots everywhere = segment order above, then `position` within each group.
`label` is the export header text; `null` (main set) emits no header. `zone` is the
editor's heading for the main group.

### Editor (SetlistView)
- Group `slots` by `segment`. Render the main (null) group first, then the three
  labeled groups in fixed order. Each labeled group is always visible as a titled
  drop zone, even when empty (shows a subtle "Drop songs here" placeholder).
- Drag & drop with cross-group support, one `DndContext`:
  - A `SortableContext` per group; an empty group still needs a droppable target id.
  - `onDragEnd` (and `onDragOver` if needed for live cross-container feedback)
    determines the destination group from the drop target. If the destination group
    differs from the source, update the dragged slot's `segment`; reorder positions
    within the affected group(s).
  - Reuse `updateSlot` for the segment change and `reorder` for positions.
- Position number shown per row resets within each group display.
- The existing key/capo/length controls per row are unchanged.

### Export order + segment headers
Applies to PDF (`handleExportPDF`), Word (`handleExportDocx`), and the full editor.

- Build the export slot list by flattening groups in `SETLIST_SEGMENTS` order
  (null group first), `position`-sorted within each group. `songNumber` is the
  global running index over this flattened order.
- The **first slot of each non-null segment** is tagged with `segmentLabel`
  (e.g. `'Communion'`). All other slots have no label.
- Rendering the header:
  - **PDF** — `PrintSongHeader` (`src/components/song/SongRenderer.jsx:564`) gains a
    `segmentLabel` prop. When present, it renders a header line **the same size as the
    song title (19px, bold)** directly above the song-title line. Forward `segmentLabel`
    through `SingleSongForColumn`, `PrintableSongSheet`, and the `MultiSongPage` column
    items (`makeItems`).
  - **Word** — `songToParagraphs` (`src/lib/docxExport.js:24`) gains a `segmentLabel`
    param; when present, prepend a bold `size: 28` paragraph (same size as the title
    run) before the title paragraph.
- **Packing**: the segment header bundles with its segment's first song as a single
  measured unit in the bin-packer (`SingleSongForColumn` measurement already includes
  whatever the header renders, since the prop is passed at measure time). This keeps
  the header glued to its first song (no orphaned header at a column bottom) while songs
  otherwise continue packing exactly as today — "inline header, keep packing".
- Empty segments contribute no slots and therefore no header.

### Full editor (SetlistFullEditor) parity
- Receives slots already ordered by segment (or orders them the same way internally).
- Passes `segmentLabel` into its measurement (`computePageLayout`) and into
  `EditableSongContent`'s header so the on-screen WYSIWYG pages match the PDF.

### Acceptance
- Editor shows main set + three labeled drop zones; songs drag between them and persist.
- Empty segments show as drop zones but never appear in any export.
- PDF: each non-empty segment's first song is preceded by a title-size bold header
  naming the segment; songs keep their two-column packing flow.
- Word export shows the same segment headers.
- Song order in exports follows: main set, Communion, Post-Sermon, Prayer Meeting,
  each in its own internal order.

---

## Scope / non-goals
- Segments are **fixed** — no add/rename/reorder of segments, no custom segments.
- A song belongs to exactly **one** segment (or the main set).
- No change to share-link rendering of segments (out of scope unless trivial).
- Duration total stays a simple sum across all slots (no per-segment subtotal).
