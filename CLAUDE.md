# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server at `http://localhost:5173`
- `npm run build` — production build to `dist/`
- `npm run preview` — serve built `dist/` locally
- `npm run lint` — ESLint over `.js`/`.jsx`, `--max-warnings 0` (any warning fails)

No test runner is configured.

## Architecture

ChordVault is a **client-only PWA** (React 18 + Vite). No backend. All persistence is in the browser via IndexedDB (Dexie). Vercel serves the static `dist/` with an SPA rewrite (see [vercel.json](vercel.json)).

### Data layer ([src/lib/db.js](src/lib/db.js))

Dexie schema v1 — single source of truth for storage:

- `songs` — `++id, title, artist, original_key, created_at, updated_at, last_played_at, *tags`
- `setlists` — `++id, name, …`
- `setlist_songs` — join table with `position` (drag-reordered)
- `sync_queue` — staged ops for future Dexie Cloud sync (currently inert)
- `app_state` — keyed singleton store (theme, last-used flags)

CRUD is funneled through exported namespaces (`songOps`, `setlistOps`, …) — UI never touches `db.*` directly. Deleting a song also purges `setlist_songs` rows referencing it.

Dexie Cloud is wired but disabled. To enable cross-device sync, uncomment the cloud lines in `db.js` and set `VITE_DEXIE_CLOUD_URL`.

### Ingestion pipeline ([src/lib/ingestion.js](src/lib/ingestion.js))

Converts raw paste → canonical chord-above-lyric form. Stages:

1. `classifyLine` — `blank` | `section_header` | `chord_line` | `lyric_line`. Chord-line heuristic: ≥60% of whitespace-split tokens match `CHORD_REGEX`, no sentence punctuation.
2. `parseInlineChordFormat` — converts `[G]hello [Em]world` → two-line form by tracking lyric character position and padding the chord line.
3. Tokenization preserves column offsets (`leadingSpaces`) so the renderer can align chords above lyric characters using a monospace font.
4. Key detection uses `tonal` and emits a confidence score (shown in NewSong preview).

`CHORD_REGEX` is the canonical chord matcher — used by both ingestion and transposition. Extending chord-quality support means editing this regex.

### Transposition ([src/lib/transposition.js](src/lib/transposition.js))

Built on `tonal`. The non-obvious piece is **enharmonic respelling**: after raw semitone shift, notes are rewritten to match the target key's convention (sharps for G/D/A/E/B/F#/C#, flats for F/Bb/Eb/Ab/Db/Gb/Cb) via `normalizeNoteForKey`. Slash chords transpose both root and bass independently.

Transpose offset and capo are **per-song UI state** persisted in `localStorage`, NOT in the Dexie record — the stored song keeps the original key. Setlist slots can override both per-slot (override lives on the `setlist_songs` row).

### Routing & shell

[src/App.jsx](src/App.jsx) — `BrowserRouter` wraps `AppShell` ([src/components/layout/AppShell.jsx](src/components/layout/AppShell.jsx)) which provides nav/header/footer. Unknown routes redirect to `/`. The SPA fallback rewrite in `vercel.json` is required for deep links.

Routes: `/`, `/songs/new`, `/songs/:id`, `/setlists`, `/setlists/:id`, `/import`.

### Rendering & "Stage mode"

[SongRenderer](src/components/song/SongRenderer.jsx) uses Courier New for chord/lyric alignment. Stage mode is a toggle that swaps to a high-contrast palette (black bg, `#FFD700` chords, white lyrics) — toggled from the header, intended for live performance.

### PDF export ([src/lib/pdf.js](src/lib/pdf.js))

`jsPDF` + `html2canvas`. A4, 2-column. For setlists each song renders on its own page with the slot's key/capo override applied (not the song's persisted UI state). The DOM rendered to canvas is a stripped variant — no app chrome — so changes to the renderer that affect print output should be tested via setlist export.

### PWA

[vite-plugin-pwa](vite.config.js) with `registerType: 'autoUpdate'` + Workbox. Google Fonts (DM Sans / DM Serif Display) are `CacheFirst`. `index.html` preconnects to fonts.googleapis. Service worker is served `Cache-Control: no-cache` (see [vercel.json](vercel.json)) so updates propagate; hashed assets get one-year immutable caching.

PWA icons (`public/icons/icon-192.png`, `icon-512.png`) are referenced by the manifest but may not exist yet — install prompt still works without them, custom icon does not.

## Conventions

- Path alias `@` → `/src` (configured in [vite.config.js](vite.config.js)).
- `type: "module"` — all source is ESM.
- ESLint is configured via plugins listed in `package.json` only (no checked-in `.eslintrc`); `--max-warnings 0` means lint is effectively a gate.
- UI primitives live in [src/components/ui/index.jsx](src/components/ui/index.jsx) — re-use these before adding a new one.
- Hooks ([src/lib/hooks.js](src/lib/hooks.js)) wrap Dexie queries via `useLiveQuery`-style patterns; subscribe through hooks rather than calling `songOps` from components for reactive lists.
