# ChordVault

A responsive, PWA-enabled chord sheet manager for musicians. Built with React + Vite. Data lives in Supabase (Postgres) with a localStorage cache so previously-viewed songs stay readable offline. Runs on free tiers end to end.

---

## Stack

| Layer         | Technology                 |
| ------------- | -------------------------- |
| Framework     | React 18 + Vite            |
| Styling       | Tailwind CSS               |
| Backend / DB  | Supabase (Postgres + Auth) |
| Offline cache | localStorage               |
| Music engine  | tonal                      |
| PDF export    | jsPDF + html2canvas        |
| DOCX export   | docx + mammoth             |
| Drag and drop | @dnd-kit                   |
| PWA           | vite-plugin-pwa + Workbox  |
| Hosting       | Vercel (free)              |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Install & run locally

```bash
git clone <your-repo>
cd chordvault
npm install
npm run dev
```

Create a `.env` with your Supabase project credentials:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Open `http://localhost:5173`

### Build for production

```bash
npm run build
```

Output goes to `dist/`. Deploy this folder.

---

## Deploy to Vercel

### Option A, Vercel CLI (fastest)

```bash
npm install -g vercel
vercel
```

Follow the prompts. Framework is auto-detected as Vite.

### Option B, Vercel Dashboard

1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your repo
4. Framework: **Vite**
5. Build command: `npm run build`
6. Output directory: `dist`
7. Click Deploy

That's it. Free tier is more than enough.

---

## Development

```bash
npm run lint       # ESLint, zero warnings allowed
npm run test:run   # Vitest unit tests
npm run build      # production build
```

GitHub Actions (`.github/workflows/ci.yml`) runs all three on every push to
`main` and every pull request. Print/PDF layout changes must also pass the
`/print-lab.html` harness (see `CLAUDE.md`).

### Database

- `docs/database-schema.md`: the full schema (the base tables predate
  `supabase/migrations/`).
- `ROLES.md`: the role model and its RLS policies.
- `SHARING.md`: how public share links work.
- `supabase/migrations/`: apply with `supabase db push --remote`. Check
  `supabase migration list --remote` first: anything applied by hand in the
  SQL editor must be marked with `supabase migration repair --status applied <version>`.
- Edge functions (`supabase/functions/`): deploy with
  `supabase functions deploy embed-song search-songs`.

---

## PWA Icons

`public/pwa-192.png`, `public/pwa-512.png` (also used as the maskable icon) and
`public/apple-touch-icon.png` (180×180) are rendered from a full-bleed version
of `public/favicon.svg`, with the glyph kept inside the 80% maskable safe zone.

---

## Data Storage

Songs and setlists live in a **Supabase** (Postgres) project, so they sync across every device signed into the same account. This means:

- **Data syncs across devices**, add a song on your phone, it shows up on your laptop
- **localStorage holds a read cache**, previously-viewed songs/setlists stay readable offline; writes need a connection
- **Auth is handled by Supabase**, see `src/lib/AuthContext.jsx`

### Required environment variables

Set these locally (`.env`) and in your Vercel project settings:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The Workbox service worker caches Supabase REST GETs (NetworkFirst, 5s timeout) so offline reads fall back to the last-fetched data, see `vite.config.js`.

---

## Features

### Song Library

- Paste any chord sheet (standard chord-above-lyric or inline `[G]chord` format)
- Auto-detects key with confidence score
- Real-time parse preview while pasting
- Tags for organisation
- Search by title, artist, or tag, plus semantic "find songs like…" search
  (gte-small embeddings via the `embed-song` / `search-songs` edge functions)
- Favourites (per user, starred from the card or song view)
- Sort by title, artist, recently added, recently played
- Import from `.docx`, `.pdf`, or a photo of a chord sheet (on-device OCR via tesseract.js)
- Arrangement editor: reorder, repeat and cut sections
- Read-only public share links for a song or setlist (see `SHARING.md`)
- Roles: member / leader / superuser (see `ROLES.md`)

### Chord Rendering

- Monospace chord alignment (Courier New)
- Section headers: `[Chorus]`, `[Verse]`, etc.
- 2-column toggle for longer songs
- Uncertain line detection with manual override

### Transposition

- ±12 semitones with single-click ±1 buttons
- Jump directly to target key via dropdown
- Enharmonic spelling follows musical convention (key of E uses sharps, key of Bb uses flats)
- Transpose state persisted per song in localStorage

### Capo

- Capo 0–12 with display: "Play D with capo 2 → sounds like E"
- Per-song capo state persisted in localStorage

### Stage Mode

- Pure black background (`#000000`)
- Gold chords (`#FFD700`), white lyrics
- Toggle via the ⚡ button in the header

### Setlists

- Create named setlists
- Drag-and-drop reorder
- Per-slot key and capo override (applies only within the setlist)
- Segment dividers (e.g. "Communion"), optionally forcing a new PDF page
- Perform mode: full-screen, auto-scroll, metronome, page-turner pedal support
- Export to PDF: songs are packed onto A4 pages (half-width columns where they
  fit) and are never split across pages; also DOCX export

### PDF Export

- Single song: from song view → 📥 button
- Full setlist: from setlist view → Export PDF button
- A4 format, 2-column layout, print-clean (no UI chrome)

### PWA / Offline

- Install to home screen on iOS/Android/desktop
- Works offline after first load (PDF export and `.docx` import load on first
  use, since they aren't needed on stage)
- Offline banner when no connection detected

---

## Chord Format Support

### Standard (chord above lyric)

```
[Verse 1]
G              Em
Amazing grace how sweet the sound
C              G
That saved a wretch like me
```

### Inline chord format

```
Amazing [G]grace how [Em]sweet the sound
That [C]saved a [G]wretch like me
```

Both are parsed and stored in the same format (chord line above lyric line).

---

## File Structure

```
src/
├── lib/
│   ├── supabase.js     , Supabase client
│   ├── supabaseOps.js  , Song/setlist CRUD against Supabase
│   ├── AuthContext.jsx , Auth provider + session
│   ├── ingestion.js    , Parse pipeline (classify, tokenize, key detect)
│   ├── transposition.js, Chord/key transpose engine
│   ├── nashville.js    , Nashville number system
│   ├── hooks.js        , React hooks (useSongs, useSetlist, useTheme…)
│   ├── pdf.js / docxExport.js, PDF + DOCX export
│   └── voicings/       , Chord voicing catalog, fretboard, capo, audio
├── components/
│   ├── ui/            , Primitives (Button, Input, Badge, Modal…)
│   ├── song/          , SongRenderer, TransposeControls, SongCard
│   ├── voicings/      , Fretboard diagrams, voicing grid/editor, practice
│   ├── setlist/       , SetlistFullEditor
│   ├── auth/          , AuthModal
│   └── layout/        , AppShell (nav, header, footer)
├── views/
│   ├── Dashboard.jsx  , Song library grid
│   ├── NewSong.jsx    , Ingestion + live preview
│   ├── SongView.jsx   , Full song with controls
│   ├── Setlists.jsx   , Setlist list
│   ├── SetlistView.jsx, Setlist editor with DnD
│   ├── ImportView.jsx , Bulk import
│   └── ChordVoicings.jsx, Voicing library
├── App.jsx            , Router (lazy-loaded views)
├── main.jsx           , Entry point
└── index.css          , CSS variables + chord sheet styles
```
