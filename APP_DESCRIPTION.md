# ChordVault

### _Your entire repertoire. One device. Performance-ready._

ChordVault is an installable, offline-capable Progressive Web App for musicians who work with chord sheets. It stores every song you play in one cloud-synced library, transposes them with real music-theory awareness, renders them for dark stages, organizes them into setlists, exports band-ready handouts, and ships a full guitar-voicing study suite on the side. No app store, no download friction, open a link, add to home screen, and it behaves like a native app even with no signal at the venue.

---

## The Problem

Chord sheets live everywhere and nowhere: a binder of dog-eared printouts, screenshots buried in a camera roll, half-formatted notes apps, PDFs emailed by a bandleader three months ago. When someone calls a song, the scramble begins.

Then the singer says, _"Can we do it in B instead?"_, and now you're mentally transposing every chord in real time while playing, or scribbling a new chart on the back of the old one.

On stage it gets worse: dark lighting, small screen, tiny font, and halfway through the second verse you need to scroll, with a hand that's currently holding a chord. And when next week's setlist comes around, you're back to copy-pasting, re-printing, and re-transposing everything for every band member.

Chord sheets are the working musician's most-used asset, and most musicians manage them with the digital equivalent of a shoebox.

## The Solution

ChordVault is a single home for every song you play: a cloud-synced, offline-first chord library with a transposition engine that understands enharmonics and slash chords, a performance mode designed for real stages, smart import that turns a whole songbook DOCX/PDF into a library in one pass, and a guitar-voicing education suite built in. It's not a notes app that happens to hold chords, it's built around the actual moments musicians live in: the rehearsal, the last-minute key change, the dark stage, the practice session.

---

## Features

### A library that does the data entry for you

- **Paste anything, it figures it out.** Drop in a chord sheet in standard chords-above-lyrics format or inline `[G]bracket [Em]format`, the parser auto-detects which format you used and renders it correctly. It also cleans up bar notation (`| Em | / / / |` → `Em`) and normalizes Unicode sharps/flats and even Cyrillic lookalike letters.
- **It reads the song for you.** The ingestion pipeline extracts the title from the first line, pulls the artist from em-dash/slash notation, and normalizes section headers ("1st Verse" → "Verse 1"; recognizes Verse, Chorus, Bridge, Pre-Chorus, Intro, Outro, Tag, Hook, Interlude, Coda, Vamp, Turnaround, and more).
- **Automatic key detection.** The detector scores all 12 candidate keys by analyzing chord degrees (weighted I > V > IV > vi…), applies bonuses for matching diatonic chord qualities and tonic presence, distinguishes relative major/minor correctly (C vs Am), respects a "(Key G)" annotation in the title if present, and returns the top candidates with confidence scores, plus the correct sharp/flat spelling preference for the detected key.
- **Artist auto-lookup.** Don't know who recorded it? ChordVault queries the MusicBrainz database by song title and fills in the artist for you.
- **Uncertain-line flagging.** Lines the parser isn't sure about (mixed chord/text content) are flagged with a warning so you can confirm or fix them, no silent misparses.
- **Import a whole songbook in one shot.** Upload a DOCX (parsed via Mammoth) or PDF (parsed via pdf.js with Y-coordinate line reconstruction so chord alignment survives). ChordVault splits the document into individual songs using heading heuristics, runs each through the full parse/key-detect pipeline, then shows a review screen where you edit title, artist, tags, and key per song before saving, with a progress counter during import.
- **Duplicate detection with side-by-side comparison.** Imports are checked against your existing library; conflicts show both versions so you decide whether to skip, rename, or replace.
- **Find any song in seconds.** Real-time search across titles and artists, filter by key, and sort by title, artist, key, recently added, or recently played (play counts and last-played timestamps are tracked per song). Bulk-select songs to add to a setlist or delete in one action.

### A transposition engine that actually knows music theory

- **One tap, any key.** Nudge by semitone (±1 buttons) or jump straight to any of the 12 keys from a dropdown. The original is never modified, reset anytime.
- **It spells chords like a musician would.** Sharp keys get sharps, flat keys get flats, no "A# major" nonsense. Slash chords transpose both the chord _and_ the bass note (`F/A` stays musically correct). Extensions, suspensions, and alterations (maj7, m7b5, add9, sus4…) all survive intact. Built on the tonal.js theory library with custom enharmonic-spelling logic, covered by unit tests.
- **Capo intelligence.** Pick a capo fret from 0–12 and see exactly what's happening: _"Play G shapes with capo 2 → sounds like A."_ Transposed shapes and sounding key, both visible at once.
- **Nashville Number System built in.** Flip one toggle and every chord becomes a scale degree, `1`, `4`, `5m7`, the notation session players use because it stays valid in every key. (Also unit-tested.)
- **It remembers your choices per song.** Transpose offset, capo position, BPM, and column layout persist per song across sessions; font size and family persist globally. Open the song next week and it's exactly how you left it.

### Built for the stage, not just the couch

- **Stage Mode.** One tap and the interface gets out of the way: pure black background with high-contrast chord colors in your pick of gold, green, cyan, white, or pink, readable from across a dark stage at a glance. Animations switch off so nothing distracts.
- **Hands-free auto-scroll.** Set the scroll speed and play, smooth requestAnimationFrame-driven scrolling moves the chart so you don't have to. Both hands stay on the instrument.
- **A real metronome, in the same screen.** Sample-accurate Web Audio scheduling (lookahead-based, not setInterval jitter), adjustable 30–300 BPM, accented downbeats with configurable beats per bar, a visual beat indicator, and **tap tempo**, tap the beat and it locks the BPM. BPM saves per song.
- **Typography you control.** Font size slider, five font choices (Arial, Courier New, Georgia, Verdana, Times New Roman), and a smart auto / 1-column / 2-column layout that balances sections across columns without ever splitting a section mid-column.
- **Themes.** Light mode plus four dark themes (slate, pure-black OLED, gray, cream), persisted across sessions.

### Setlists that work like a band actually works

- **Drag-and-drop set building.** Create named setlists, search your library from inside the editor, and reorder with drag-and-drop (mouse, touch, or keyboard, via dnd-kit).
- **Per-setlist key and capo overrides.** The killer detail: set a different key or capo for a song _within one setlist_ without touching the original. Sunday's service in G, Friday's gig in A, same song, both saved.
- **One-click handouts for the whole band.** Export the entire setlist as a single print-clean PDF, one song per page, A4, two-column layout where line lengths allow, proper pagination, or as a formatted Word document. Single songs export the same way, with the current transposition and capo applied.
- **Synced everywhere.** Setlists live in the cloud. Build on your laptop, perform from your tablet.

### A guitar voicing study suite, included

A dedicated section focused on movable shapes on the top four strings (D–G–B–E), where compact comping voicings live:

- **Voicing library.** A curated, programmatically verified catalog of movable triads (major, minor, diminished, root position, 1st and 2nd inversions, multiple neck positions) plus seventh chords, rendered as clean fretboard diagrams with root-note highlighting and an optional note-name view. Voicings show absolute chord names; pick a key and the diatonic chords are highlighted with Roman numerals for instant harmonic context. Filter by difficulty (beginner/intermediate/advanced, rated by fret span and reach), and favorite the shapes you use most.
- **Progressions with voice-leading.** Nine classic progressions (I–V–vi–IV, ii–V–I, 12-bar blues, i–VII–VI–VII, and more), resolved into real chords in any key and mode, and the app picks the smoothest next voicing in the chain (minimal fret movement from chord to chord).
- **Capo Helper.** Hate barre chords? Pick a target chord, say, F, and see every open-shape + capo combination that produces it (_"C shape, capo 5"_), frets 0–9, with diagrams.
- **Compare tool.** Put two voicings side by side and get a voice-leading score, lower means a smoother change.
- **Practice mode.** Flashcard drills: a fretboard diagram appears, you name the chord, reveal, and score yourself, with a running hit rate.
- **Build your own.** Construct any voicing on a fretboard editor, name it, tag it, and save it, custom voicings join the library alongside the catalog.
- **Hear everything.** Every voicing and progression plays back through a Web Audio synth (Tone.js, lazy-loaded so it costs nothing until first play) with strum, arpeggio, and block-chord modes, adjustable speed, sustain, and strum direction.
- **In-song voicing panel.** While viewing a song, pull up voicing suggestions for the chords in that song, theory help exactly where you need it.

### Yours everywhere, even with no signal

- **Cloud sync with real accounts.** Email sign-in via Supabase Auth with per-user row-level security. Phone, tablet, laptop, one library.
- **Offline-first by design.** A Workbox service worker caches your Supabase data with a NetworkFirst strategy (5-second timeout, up to 200 entries, 30-day retention): Wi-Fi dies at the venue and every cached song stays fully readable. An online/offline indicator keeps you informed. All display preferences live in localStorage and work regardless of connection.
- **Installable PWA.** Home-screen icon, standalone full-screen mode, on iOS, Android, and desktop.
- **Polished throughout.** Framer Motion page transitions that respect `prefers-reduced-motion`, toast notifications for every action, skeleton loaders, touch-friendly targets, and print stylesheets that strip every pixel of UI chrome.

---

## Who it's for

Worship leaders running weekly setlists in shifting keys. Gigging guitarists who need a 200-song repertoire in their pocket. Students learning harmony, voicings, and the Nashville system. Anyone who has ever lost a chord chart five minutes before downbeat.

---

## What it's built from

| Layer         | Technology                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend      | React 18 + Vite, JavaScript (JSX), React Router 6 (lazy-loaded routes)                                                               |
| Styling       | Tailwind CSS 3 + CSS custom properties for theming (light/dark/stage modes)                                                          |
| Animation     | Framer Motion (reduced-motion aware)                                                                                                 |
| Music theory  | tonal.js (chord parsing, intervals, transposition) + custom enharmonic, key-detection, and Nashville logic                           |
| Audio         | Tone.js (voicing playback, lazy-loaded) + raw Web Audio API (sample-accurate metronome)                                              |
| Backend       | Supabase, PostgreSQL, email auth, row-level security; no custom server code                                                          |
| Drag & drop   | dnd-kit (pointer, touch, and keyboard support)                                                                                       |
| Import        | mammoth (DOCX text extraction), pdf.js (PDF with positional line reconstruction), MusicBrainz API (artist lookup)                    |
| Export        | jsPDF + html2canvas (PDF), docx (Word documents)                                                                                     |
| Offline / PWA | vite-plugin-pwa + Workbox (NetworkFirst API caching, CacheFirst fonts), localStorage preferences                                     |
| Testing       | Vitest unit tests for the transposition and Nashville engines; a standalone script pitch-class-verifies every voicing in the catalog |
| Deployment    | Vercel (SPA rewrites, immutable asset caching, no-cache service worker), runs entirely on free tiers                                 |

## Architecture notes

- **Fully client-side SPA.** All data operations go straight from the browser to Supabase through the official SDK; row-level security enforces per-user isolation. There are no custom API routes to maintain.
- **Data model.** Songs store their parsed structure as JSON (typed lines: chord, lyric, section header) along with title, artist, original key, tags, and play stats. Setlists relate to songs through a join table that carries position, chosen key, and capo per slot, which is what makes per-setlist overrides possible without duplicating songs.
- **Two-tier persistence.** Authoritative data (songs, setlists) lives in Postgres and syncs across devices; ephemeral per-device preferences (transpose state, capo, BPM, fonts, themes, voicing favorites, custom voicings) live in localStorage for instant, offline-safe access.
- **Performance-minded.** Routes are lazy-loaded, Tone.js loads only on first audio playback, and static assets ship with one-year immutable cache headers.

## App structure

| Route           | Page                                                                                  |
| --------------- | ------------------------------------------------------------------------------------- |
| `/`             | Dashboard, song library with search, sort, filter, bulk actions                       |
| `/songs/new`    | New song, paste, parse, live preview, key detection, artist lookup                    |
| `/songs/:id`    | Song view, transposition, capo, Nashville, stage mode, auto-scroll, metronome, export |
| `/setlists`     | Setlist list, create, rename, delete                                                  |
| `/setlists/:id` | Setlist editor, drag-and-drop, per-song key/capo, PDF/DOCX export                     |
| `/import`       | Bulk import, DOCX/PDF songbook splitting, review, conflict resolution                 |
| `/voicings`     | Voicing suite, library, progressions, capo helper, compare, practice, custom editor   |

~13,000 lines of source across ~63 files: a `lib/` core (parsing, transposition, theory, export, hooks, and a 14-module voicings engine), a `components/` layer (UI primitives, song renderer, setlist editor, fretboard diagrams), and seven view pages.
