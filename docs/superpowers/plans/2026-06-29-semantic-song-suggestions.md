# Semantic Song Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user type a word or sentence in the Dashboard search box and see songs suggested by *meaning* (lyrics/theme), in a "Related songs" group below the existing keyword results.

**Architecture:** Each song is embedded once (on save) into a 384-dim vector with Supabase's built-in `gte-small` model, stored in a `pgvector` column. At search time the typed query is embedded and matched by cosine similarity via a Postgres RPC. Two edge functions (`embed-song`, `search-songs`) own all model calls; the client only invokes them and merges results.

**Tech Stack:** React 18 + Vite, Supabase (Postgres + pgvector + Edge Functions / `gte-small`), Vitest for unit tests, `@supabase/supabase-js` v2.

**Spec:** `docs/superpowers/specs/2026-06-29-semantic-song-suggestions-design.md`

---

## File Structure

**New files:**
- `src/lib/embedText.js` — pure functions: `extractLyrics(song)`, `buildEmbedText(song)`. No Supabase import → unit-testable.
- `src/lib/embedText.test.js` — Vitest unit tests for the above.
- `src/lib/relatedSongs.js` — pure function `selectRelatedSongs(relatedIds, allSongs, opts)` (dedup + key-filter + order). No React/Supabase import.
- `src/lib/relatedSongs.test.js` — Vitest unit tests for the above.
- `supabase/migrations/20260629000000_semantic_search.sql` — extension, column, index, `match_songs` RPC.
- `supabase/functions/embed-song/index.ts` — embeds text, writes `songs.embedding`.
- `supabase/functions/search-songs/index.ts` — embeds query, calls `match_songs`, returns ranked ids.
- `scripts/backfill-embeddings.mjs` — one-time backfill of existing songs.

**Modified files:**
- `src/lib/supabaseOps.js` — add `embedSong()` + `semanticSearch()`; call `embedSong()` at the end of `create()` and `update()`.
- `src/lib/hooks.js` — add `useSemanticSearch(query, allSongs)`; add `useRef` to the React import.
- `src/views/Dashboard.jsx` — wire `useSemanticSearch`, render the "Related songs" group.

**Why automated tests stop at the pure functions:** `Supabase.ai` only exists inside the Supabase Edge runtime (Deno), and the repo has no React-testing-library/jsdom setup (existing tests are pure-function only — see `src/lib/transposition.test.js`). Adding those would be scope creep. So Tasks 1–2 are full TDD; the edge functions, client wiring, and Dashboard render (Tasks 3–7) are verified by explicit manual steps against a running app/deployment. The dedup/threshold/merge logic that *could* hide bugs is extracted into pure functions (Tasks 1–2) precisely so it can be tested.

---

## Task 1: Embed-text builder (pure, TDD)

**Files:**
- Create: `src/lib/embedText.js`
- Test: `src/lib/embedText.test.js`

Context: `song.parsed_content` is an **array** of line objects like `{ type: 'lyric_line', text: '...' }`, `{ type: 'chord_line', tokens: [...] }`, `{ type: 'section_header', text: '...' }`. Lyrics are the `lyric_line` entries. `song.raw_content` is the original sheet text (fallback). `song.tags` is a string array (may be absent). `gte-small` caps at ~512 tokens, so we truncate to a safe char budget.

- [ ] **Step 1: Write the failing test**

Create `src/lib/embedText.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { extractLyrics, buildEmbedText, MAX_EMBED_CHARS } from './embedText'

describe('extractLyrics', () => {
  it('joins lyric_line text from parsed_content', () => {
    const song = {
      parsed_content: [
        { type: 'section_header', text: 'Verse 1' },
        { type: 'chord_line', tokens: [{ chord: 'G' }] },
        { type: 'lyric_line', text: 'Amazing grace how sweet' },
        { type: 'lyric_line', text: 'the sound that saved' },
      ],
    }
    expect(extractLyrics(song)).toBe('Amazing grace how sweet\nthe sound that saved')
  })

  it('falls back to raw_content when parsed_content has no lyrics', () => {
    const song = { parsed_content: [{ type: 'chord_line', tokens: [] }], raw_content: 'RAW SHEET' }
    expect(extractLyrics(song)).toBe('RAW SHEET')
  })

  it('falls back to raw_content when parsed_content is missing', () => {
    expect(extractLyrics({ raw_content: 'RAW' })).toBe('RAW')
  })

  it('returns empty string when nothing is available', () => {
    expect(extractLyrics({})).toBe('')
  })
})

describe('buildEmbedText', () => {
  it('combines title, artist, tags, and lyrics', () => {
    const song = {
      title: 'Amazing Grace',
      artist: 'John Newton',
      tags: ['hymn', 'grace'],
      parsed_content: [{ type: 'lyric_line', text: 'how sweet the sound' }],
    }
    expect(buildEmbedText(song)).toBe('Amazing Grace\nJohn Newton\nhymn grace\nhow sweet the sound')
  })

  it('tolerates missing artist and tags', () => {
    const song = { title: 'X', raw_content: 'words' }
    expect(buildEmbedText(song)).toBe('X\n\n\nwords')
  })

  it('truncates to MAX_EMBED_CHARS', () => {
    const song = { title: 'T', raw_content: 'x'.repeat(MAX_EMBED_CHARS * 2) }
    expect(buildEmbedText(song).length).toBe(MAX_EMBED_CHARS)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/embedText.test.js`
Expected: FAIL — `Failed to resolve import "./embedText"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/embedText.js`:

```js
// Builds the text that represents a song for semantic embedding.
// Pure (no Supabase/React imports) so it is unit-testable and reusable by the
// backfill script.

// gte-small caps at ~512 tokens; ~2000 chars is a safe under-budget cutoff.
export const MAX_EMBED_CHARS = 2000

// Lyrics for embedding: the lyric_line entries of parsed_content, falling back
// to the original raw sheet when no parsed lyrics exist.
export function extractLyrics(song) {
  const lines = Array.isArray(song?.parsed_content) ? song.parsed_content : null
  if (lines) {
    const lyrics = lines
      .filter(l => l.type === 'lyric_line' && l.text)
      .map(l => l.text)
      .join('\n')
    if (lyrics.trim()) return lyrics
  }
  return song?.raw_content ?? ''
}

// Title + artist + tags + lyrics, newline-joined and length-capped.
export function buildEmbedText(song) {
  const parts = [
    song?.title ?? '',
    song?.artist ?? '',
    (song?.tags ?? []).join(' '),
    extractLyrics(song),
  ]
  return parts.join('\n').slice(0, MAX_EMBED_CHARS)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/embedText.test.js`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/embedText.js src/lib/embedText.test.js
git commit -m "feat: add buildEmbedText for song embedding input"
```

---

## Task 2: Related-songs selector (pure, TDD)

**Files:**
- Create: `src/lib/relatedSongs.js`
- Test: `src/lib/relatedSongs.test.js`

Context: `search-songs` returns ranked ids (most-similar first). The UI must map those ids to the in-memory song objects, drop ids already shown in the keyword results, drop songs not matching an active key filter, and preserve rank order. Ids the user can't see simply won't be in `allSongs`, so they drop naturally.

- [ ] **Step 1: Write the failing test**

Create `src/lib/relatedSongs.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { selectRelatedSongs } from './relatedSongs'

const songs = [
  { id: 'a', title: 'A', original_key: 'G' },
  { id: 'b', title: 'B', original_key: 'C' },
  { id: 'c', title: 'C', original_key: 'G' },
]

describe('selectRelatedSongs', () => {
  it('maps ids to songs preserving rank order', () => {
    const out = selectRelatedSongs(['c', 'a'], songs, {})
    expect(out.map(s => s.id)).toEqual(['c', 'a'])
  })

  it('drops ids already in the keyword results', () => {
    const out = selectRelatedSongs(['a', 'b', 'c'], songs, { excludeIds: new Set(['b']) })
    expect(out.map(s => s.id)).toEqual(['a', 'c'])
  })

  it('drops ids not present in allSongs (not visible to user)', () => {
    const out = selectRelatedSongs(['a', 'zzz'], songs, {})
    expect(out.map(s => s.id)).toEqual(['a'])
  })

  it('applies the key filter when set', () => {
    const out = selectRelatedSongs(['a', 'b', 'c'], songs, { keyFilter: 'G' })
    expect(out.map(s => s.id)).toEqual(['a', 'c'])
  })

  it('returns empty for empty ids', () => {
    expect(selectRelatedSongs([], songs, {})).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/relatedSongs.test.js`
Expected: FAIL — `Failed to resolve import "./relatedSongs"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/relatedSongs.js`:

```js
// Maps ranked semantic-match ids to in-memory song objects for the
// "Related songs" group. Pure (no React/Supabase imports).
//
// - preserves the rank order of `relatedIds`
// - drops ids not in `allSongs` (e.g. songs the user's RLS doesn't expose)
// - drops ids in `excludeIds` (already shown in the keyword results)
// - drops songs whose original_key != keyFilter when a key filter is active
export function selectRelatedSongs(relatedIds, allSongs, { excludeIds, keyFilter } = {}) {
  const byId = new Map(allSongs.map(s => [s.id, s]))
  const exclude = excludeIds ?? new Set()
  const out = []
  for (const id of relatedIds) {
    if (exclude.has(id)) continue
    const song = byId.get(id)
    if (!song) continue
    if (keyFilter && song.original_key !== keyFilter) continue
    out.push(song)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/relatedSongs.test.js`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/relatedSongs.js src/lib/relatedSongs.test.js
git commit -m "feat: add selectRelatedSongs result merger"
```

---

## Task 3: Database migration (pgvector + match_songs RPC)

**Files:**
- Create: `supabase/migrations/20260629000000_semantic_search.sql`

This task has no automated test (it is DDL against the hosted DB). Apply it via the Supabase SQL editor (or `supabase db push` if the Supabase CLI is configured), then verify with the SQL queries below.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260629000000_semantic_search.sql`:

```sql
-- Semantic search: pgvector column + cosine-similarity match RPC.
-- gte-small produces 384-dimensional, normalized embeddings.

create extension if not exists vector;

alter table songs add column if not exists embedding vector(384);

-- HNSW index for cosine distance. Not required at current scale (a sequential
-- scan over a few hundred rows is fast), but cheap to add now and avoids a
-- later migration as the library grows.
create index if not exists songs_embedding_idx
  on songs using hnsw (embedding vector_cosine_ops);

-- Returns the songs most similar to query_embedding, above match_threshold,
-- ordered most-similar first, capped at match_count. Returns id + similarity
-- only (no song content) so it leaks nothing past RLS; the client maps the ids
-- back onto its own RLS-filtered song list.
create or replace function match_songs(
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (id uuid, similarity float)
language sql
stable
as $$
  select s.id, 1 - (s.embedding <=> query_embedding) as similarity
  from songs s
  where s.embedding is not null
    and 1 - (s.embedding <=> query_embedding) >= match_threshold
  order by s.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 2: Apply the migration**

Open the Supabase project → SQL Editor → paste the file contents → Run.
(Alternative, if the Supabase CLI is linked to this project: `supabase db push`.)
Expected: no errors; statements report success.

- [ ] **Step 3: Verify the schema**

Run in the SQL editor:

```sql
select column_name, udt_name from information_schema.columns
  where table_name = 'songs' and column_name = 'embedding';
select proname from pg_proc where proname = 'match_songs';
```

Expected: one row `embedding | vector`; one row `match_songs`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260629000000_semantic_search.sql
git commit -m "feat: add pgvector embedding column and match_songs RPC"
```

---

## Task 4: `embed-song` edge function

**Files:**
- Create: `supabase/functions/embed-song/index.ts`

Runs in the Supabase Edge (Deno) runtime. JWT-gated by default (`verify_jwt` is on unless disabled), so only authenticated callers reach it. Uses the service-role key (auto-injected secret) to write the embedding.

- [ ] **Step 1: Write the function**

Create `supabase/functions/embed-song/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// gte-small embedding model, provided by the Edge runtime.
const model = new Supabase.ai.Session('gte-small')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { songId, text } = await req.json()
    if (!songId || typeof text !== 'string') {
      return json({ error: 'songId and text are required' }, 400)
    }

    // 384-dim, mean-pooled, normalized embedding (matches the vector(384) column
    // and lets us use cosine distance directly).
    const embedding = await model.run(text, { mean_pool: true, normalize: true })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { error } = await supabase.from('songs').update({ embedding }).eq('id', songId)
    if (error) throw error

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
```

- [ ] **Step 2: Deploy**

Run: `supabase functions deploy embed-song`
Expected: "Deployed Function embed-song". (Requires the Supabase CLI linked to the project.)

- [ ] **Step 3: Manually verify**

From the app (logged in) open the browser console on the running dev server and run:

```js
const { data, error } = await window.__sb__?.functions?.invoke?.('embed-song', { body: { songId: '<a real song id>', text: 'amazing grace how sweet the sound' } })
console.log(data, error)
```

If `window.__sb__` is not exposed, instead verify via Step 3 of Task 7 (the backfill run) which calls this function for every song. Either way, confirm in the SQL editor:

```sql
select id, title, (embedding is not null) as has_embedding from songs where id = '<that song id>';
```

Expected: `has_embedding = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/embed-song/index.ts
git commit -m "feat: add embed-song edge function (gte-small)"
```

---

## Task 5: `search-songs` edge function

**Files:**
- Create: `supabase/functions/search-songs/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/search-songs/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const model = new Supabase.ai.Session('gte-small')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { query, threshold = 0.7, count = 8 } = await req.json()
    if (typeof query !== 'string' || !query.trim()) return json({ results: [] })

    const embedding = await model.run(query, { mean_pool: true, normalize: true })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data, error } = await supabase.rpc('match_songs', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: count,
    })
    if (error) throw error

    // [{ id, similarity }] ranked most-similar first.
    return json({ results: data ?? [] })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
```

- [ ] **Step 2: Deploy**

Run: `supabase functions deploy search-songs`
Expected: "Deployed Function search-songs".

- [ ] **Step 3: Manually verify** (after at least a few songs are embedded — do this after Task 7's backfill)

In the SQL editor confirm the RPC works end-to-end is covered by Task 6's UI check. For a direct check, from the logged-in app console:

```js
const { data } = await window.__sb__.functions.invoke('search-songs', { body: { query: 'thankfulness and praise' } })
console.log(data.results) // expect an array of { id, similarity }, similarity descending
```

Expected: array ordered by descending `similarity`, each `>= 0.7`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/search-songs/index.ts
git commit -m "feat: add search-songs edge function"
```

---

## Task 6: Client wiring (supabaseOps + hook + Dashboard)

**Files:**
- Modify: `src/lib/supabaseOps.js`
- Modify: `src/lib/hooks.js`
- Modify: `src/views/Dashboard.jsx`

Verified manually in the dev server (no testing-library in repo). The risky merge logic is already unit-tested via `selectRelatedSongs` (Task 2).

- [ ] **Step 1: Add `embedSong` + `semanticSearch` to `supabaseOps.js`, and call `embedSong` on save**

In `src/lib/supabaseOps.js`, change the top import line:

```js
import { supabase } from './supabase'
```

to:

```js
import { supabase } from './supabase'
import { buildEmbedText } from './embedText'
```

Inside the `supabaseSongOps` object, replace the existing `create` and `update` methods (lines 24–44) with:

```js
  async create(songData) {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('songs')
      .insert({ ...songData, created_at: now, updated_at: now, last_played_at: null, play_count: 0 })
      .select()
      .single()
    if (error) throw error
    await this.embedSong(data.id, data)
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('songs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    await this.embedSong(data.id, data)
    return data
  },
```

Then add these two methods to `supabaseSongOps` (e.g. directly after `search`, before the closing `}` of the object):

```js
  // Fire the embedding for a song. Non-blocking by contract: a failure is logged
  // and swallowed so the save itself never fails — the song just won't appear in
  // semantic results until it is re-saved or picked up by the backfill script.
  async embedSong(songId, song) {
    if (!supabase) return
    try {
      const { error } = await supabase.functions.invoke('embed-song', {
        body: { songId, text: buildEmbedText(song) },
      })
      if (error) throw error
    } catch (e) {
      console.warn('embed-song failed; song saved without embedding:', e)
    }
  },

  // Semantic search: returns [{ id, similarity }] ranked most-similar first.
  async semanticSearch(query, { threshold = 0.7, count = 8 } = {}) {
    if (!supabase || !query?.trim()) return []
    const { data, error } = await supabase.functions.invoke('search-songs', {
      body: { query, threshold, count },
    })
    if (error) throw error
    return data?.results ?? []
  },
```

- [ ] **Step 2: Add the `useSemanticSearch` hook to `hooks.js`**

In `src/lib/hooks.js`, add `useRef` to the React import on line 1:

```js
import { useState, useEffect, useCallback, useMemo, useSyncExternalStore, useRef } from 'react'
```

Add this hook immediately after `useSearch` (after its closing `}` near line 496):

```js
// ─── Semantic search ─────────────────────────────────────────────────────────
// Calls the search-songs edge function for the typed query and returns the
// ranked matching song ids. Debounced (400ms), min length 3, per-session cache,
// and stale responses are ignored (acts as an abort).
export function useSemanticSearch(query) {
  const debounced = useDebounce(query, 400)
  const [relatedIds, setRelatedIds] = useState([])
  const cacheRef = useRef(new Map())

  useEffect(() => {
    const q = debounced.trim()
    if (q.length < 3) { setRelatedIds([]); return }
    if (cacheRef.current.has(q)) { setRelatedIds(cacheRef.current.get(q)); return }

    let cancelled = false
    supabaseSongOps.semanticSearch(q)
      .then(results => {
        if (cancelled) return
        const ids = results.map(r => r.id)
        cacheRef.current.set(q, ids)
        setRelatedIds(ids)
      })
      .catch(() => { if (!cancelled) setRelatedIds([]) })

    return () => { cancelled = true }
  }, [debounced])

  return { relatedIds }
}
```

- [ ] **Step 3: Wire the "Related songs" group into `Dashboard.jsx`**

In `src/views/Dashboard.jsx`:

(a) Update the hooks import on line 4:

```js
import { useSongs, useSearch, useSetlists, useSemanticSearch } from '../lib/hooks'
```

(b) Add the related-songs imports near the other lib imports (after line 6):

```js
import { selectRelatedSongs } from '../lib/relatedSongs'
```

(c) After the existing `const { query, setQuery, results } = useSearch(songs)` (line 24), add:

```js
  const { relatedIds } = useSemanticSearch(query)
```

(d) After `filteredResults` is computed (after line 37), add:

```js
  const relatedToShow = React.useMemo(
    () => selectRelatedSongs(relatedIds, songs, {
      excludeIds: new Set(filteredResults.map(s => s.id)),
      keyFilter,
    }),
    [relatedIds, songs, filteredResults, keyFilter],
  )
```

(e) Insert the "Related songs" block immediately after the closing `)}` of the `{/* ── Content ── */}` conditional (after line 258, before the delete modal `{/* ── Delete confirmation modal ── */}`):

```jsx
      {/* ── Related songs (semantic) ─────────────────────────────── */}
      {query && relatedToShow.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Related songs
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {relatedToShow.map((song, i) => (
              <Reveal key={song.id} delay={Math.min(i, 20) * 0.03}>
                <SongCard
                  song={song}
                  selected={selectedIds.has(song.id)}
                  onSelect={toggleSelect}
                  onDelete={(s) => setDeleteTarget({ type: 'single', song: s })}
                  canDelete={canDeleteSong(song)}
                />
              </Reveal>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors (max-warnings 0).

- [ ] **Step 5: Manually verify in the dev server**

Run: `npm run dev`, log in, open the Dashboard. (Requires Tasks 3–5 deployed and at least a few songs embedded — run Task 7 first if the library predates this feature.)
- Type a thematic word that is NOT a literal substring of any title/tag (e.g. "gratitude" when songs say "thankful/praise").
- Confirm keyword results behave exactly as before, and a "Related songs" group appears below with sensible matches.
- Confirm no song appears in both groups (dedup), and the key filter also narrows the related group.
- Confirm typing <3 chars or clearing the box hides the related group.
- Check the console/network tab: a single `search-songs` call fires per settled query (debounced), repeats are served from cache.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabaseOps.js src/lib/hooks.js src/views/Dashboard.jsx
git commit -m "feat: show semantic Related songs group on Dashboard"
```

---

## Task 7: One-time backfill script

**Files:**
- Create: `scripts/backfill-embeddings.mjs`

Embeds every existing song that has a null embedding by calling the `embed-song` edge function. Run once after Tasks 3–4 are deployed.

- [ ] **Step 1: Write the script**

Create `scripts/backfill-embeddings.mjs`:

```js
// One-time backfill: embed every song that has no embedding yet.
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-embeddings.mjs
//
// Calls the deployed embed-song edge function (which runs gte-small and writes
// songs.embedding). Safe to re-run: only null-embedding songs are processed.
import { createClient } from '@supabase/supabase-js'
import { buildEmbedText } from '../src/lib/embedText.js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(url, key)

const { data: songs, error } = await supabase
  .from('songs')
  .select('*')
  .is('embedding', null)
if (error) throw error

console.log(`Embedding ${songs.length} song(s)…`)
let ok = 0
for (const song of songs) {
  const text = buildEmbedText(song)
  const { error: e } = await supabase.functions.invoke('embed-song', {
    body: { songId: song.id, text },
  })
  if (e) {
    console.warn(`  ✗ ${song.title}: ${e.message ?? e}`)
    continue
  }
  ok++
  console.log(`  ✓ ${song.title}`)
}
console.log(`Done: ${ok}/${songs.length} embedded.`)
```

- [ ] **Step 2: Run it**

Run (substitute real values; the service-role key is in Supabase → Project Settings → API):

```bash
SUPABASE_URL='https://<project>.supabase.co' SUPABASE_SERVICE_ROLE_KEY='<service-role-key>' node scripts/backfill-embeddings.mjs
```

Expected: a `✓` line per song and `Done: N/N embedded.`

- [ ] **Step 3: Verify**

In the SQL editor:

```sql
select count(*) filter (where embedding is not null) as embedded, count(*) as total from songs;
```

Expected: `embedded == total` (or all rows that existed before the feature).

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-embeddings.mjs
git commit -m "feat: add one-time embedding backfill script"
```

---

## Self-Review

**Spec coverage:**
- Entry point (augment search box, group below) → Task 6 (e).
- Embed source (title+artist+tags+lyrics) → Task 1.
- Always-on, top-N, threshold → Tasks 5 (defaults 0.7/8) + 6 (hook + render).
- Embed-on-save → Task 6 (1); backfill → Task 7.
- DB column/index/RPC → Task 3.
- Edge functions (`embed-song` JWT-gated, `search-songs`) → Tasks 4, 5.
- buildEmbedText assembly/truncation/fallback → Task 1.
- Debounce(400)/min-3/cache/abort → Task 6 (2).
- Error handling (save still succeeds; search failure hides group) → Task 6 (1, embedSong swallows; hook `.catch` clears).
- RLS/no-leak (ids only, mapped to in-memory list) → Task 3 RPC + Task 2 `selectRelatedSongs`.
- Testing (buildEmbedText, merge logic, edge fn manual, integration manual, client manual) → Tasks 1, 2, and manual steps in 4–7.

**Type/name consistency:** `buildEmbedText(song)` (Task 1) used identically in Tasks 6 + 7. `selectRelatedSongs(relatedIds, allSongs, { excludeIds, keyFilter })` (Task 2) called with that exact shape in Task 6 (d). `semanticSearch` returns `[{ id, similarity }]` (Task 5 `results`, Task 6 `semanticSearch`); hook maps `r.id`. `useSemanticSearch(query)` returns `{ relatedIds }`, consumed in Task 6 (c). Edge function bodies (`{ songId, text }`, `{ query, threshold, count }`) match caller bodies in Task 6 (1) and Task 7.

**Placeholder scan:** none — every code/SQL/command step is concrete. `<a real song id>`, `<project>`, `<service-role-key>` are intentional runtime substitutions, not unwritten code.
