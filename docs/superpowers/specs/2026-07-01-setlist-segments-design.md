# Setlist Segments (Divider Rows)

**Date:** 2026-07-01
**Depends on:** `2026-07-01-pdf-export-packing-redesign-design.md` (the `packPages`
band model this extends).

## Goal

Let a setlist be divided into **segments** (e.g. Communion, Post Sermon, Prayer
Meeting). In the exported PDF each segment prints a heading and **restarts song
numbering at 1**. By default songs keep flowing under the heading on the same
page; a divider may optionally **force a new page** (the Prayer Meeting case).

## Data model

A segment divider is a normal `setlist_songs` row with **no song**:

| column       | song row        | divider row            |
|--------------|-----------------|------------------------|
| `song_id`    | uuid            | **NULL**               |
| `label`      | NULL            | segment name (text)    |
| `page_break` | false           | true → segment starts a new page |
| `position`   | order index     | order index            |

Dividers participate in `position`/reorder/drag exactly like song rows.

### Migration (`supabase/migrations/<ts>_setlist_segments.sql`)

```sql
alter table setlist_songs
  alter column song_id drop not null;

alter table setlist_songs
  add column if not exists label text;

alter table setlist_songs
  add column if not exists page_break boolean not null default false;
```

Applied by the user against cloud Supabase (agent cannot run migrations here).
`song_id`'s FK to `songs` still holds for non-null values; NULL skips the FK.

## Ops (`src/lib/supabaseOps.js`)

- `getWithSongs`: only fetch a song when `slot.song_id` is set; divider rows
  return `{ ...slot, song: null }` (currently it fetches for every row and would
  error on NULL).
- New `addDivider(setlistId, label, pageBreak = false)`: insert
  `{ setlist_id, song_id: null, label, page_break: pageBreak, position: count }`.
- Reuse `updateSongSlot(slotId, { label })` / `{ page_break }` for rename / toggle,
  `removeSong(slotId)` for delete, `reorderSongs` for drag — all already generic.
- `addSong` position count already counts all rows (dividers included) — unchanged.

## Hook (`src/lib/hooks.js` `useSetlist`)

Add `addDivider(label, pageBreak)` → `supabaseSetlistOps.addDivider` + refresh.
The duration-seed effect already guards `if (s.song)`, so dividers are skipped.
Optimistic reorder maps by slot id and is divider-safe.

## Numbering (pure) — `src/lib/setlistSegments.js`

```
numberSlots(slots) -> Entry[]
  Entry = { kind: 'song', slot, songNumber }   // songNumber resets to 1 per segment
        | { kind: 'divider', slot, label, pageBreak }
```

Walk in order; a counter increments per song and **resets to 0 at every divider**.
Rows with a `song_id` but a failed `song` load are dropped; dividers are kept.
Unit-tested (reset behavior, leading segment, order preserved, no dividers).

## Packer extension (`src/lib/pdfPacking.js`)

`packPages` gains a third band type and a divider input item:

- Input divider item: `{ isDivider: true, label, pageBreak, height }`.
- New band: `{ type: 'heading', label }`.

Handling a divider item:
1. Close the open cols band.
2. If `pageBreak` **and** the current page already has bands → start a new page.
   Else if `!pageBreak`, `height > remaining()`, and the page has bands → start a
   new page.
3. Push `{ type: 'heading', label }`; add its height to `usedAbove`.
4. The next narrow song opens a fresh cols band below the heading.

Existing song items (`fitsHalf` present, no `isDivider`) are unchanged, so the
current packer tests keep passing. New tests: heading flows inline; page-break
divider starts a new page; leading divider doesn't emit a blank page; numbering
already handled upstream so packer ignores numbers.

## Rendering (`src/components/song/SongRenderer.jsx`)

- New `SegmentHeading({ label })`: big bold uppercase (20px) with a thick 4px
  rule under the TEXT only, not full page width (restyled 2026-07-07 by user
  choice — the original full-width underline read as a stray line). `8px`
  `paddingBottom` sets the gap between text and rule; `-16px` `marginBottom`
  pulls the heading's own song up so the heading→song gap (~12px) is tighter
  than the full 28px `PRINT_SONG_GAP` between songs (a heading belongs WITH its
  segment's first song). The negative margin only shrinks rendered height vs
  the packer estimate — the safe direction, so parity holds. Structure: block div root
  wrapping an inline-block span that carries the border — the root must stay a
  block div because flex items blockify an inline-block root, which would
  stretch the rule back across the page. DOCX mirror
  (`segmentHeadingParagraph`) uses a THICK text underline, not a paragraph
  border, for the same reason. NOTE: Word's text underline hugs the text and
  has no gap control, so the DOCX rule sits tighter than the PDF's 8px gap; the
  only way to add a DOCX gap is a full-width paragraph bottom border (rejected
  style).
- `PrintPage`: render `heading` bands via `SegmentHeading`.
- Measurement in `SetlistView.handleExportPDF`: measure divider heading height at
  full width (746px) via `SegmentHeading`, songs as before.

## Export flow (`src/views/SetlistView.handleExportPDF`)

1. `entries = numberSlots(exportSlots)`.
2. Build packer items: songs → measured render items carrying `songNumber`;
   dividers → `{ isDivider, label, pageBreak, height }`.
3. `packPages(items)` → render `PrintPage` per page (now may contain heading
   bands).

## Editor UI (`src/views/SetlistView.jsx` slot list)

- Divider rows render as a labeled bar (distinct from song rows): editable label,
  a "new page" toggle (📄), delete, and a drag handle. Default `page_break`
  suggested `true` when the label contains "prayer" — user can toggle.
- An **"Add segment"** action near "Add song" inserts a divider at the end
  (draggable into place).
- Multi-select checkboxes stay song-only; dividers are drag-reorderable but not
  multi-selectable.

## Full editor preview (`src/components/setlist/SetlistFullEditor.jsx`)

`computePageLayout` currently duplicates the *old* packing and would crash on
divider rows (no `slot.sections`/`slot.song`). Refactor it to reuse `packPages` +
`numberSlots` so the on-screen preview matches the exported PDF (including
headings and per-segment numbering) and is divider-safe. If full band/heading
rendering parity proves too risky to land without browser verification, the
minimum bar is: no crash, dividers shown as headings, numbering reset — with full
visual parity tracked as follow-up.

## Testing

Pure modules unit-tested with vitest: `numberSlots` and the extended `packPages`
(divider/heading cases). Browser verification of the editor + PDF is blocked
(cloud Supabase auth), so UI relies on `npm run test:run`, eslint, and `npm run
build`. The user applies the migration and spot-checks an export.

## Out of scope

- DOCX export segment support (separate follow-up).
- Nested/collapsible segments; per-segment key summaries.
