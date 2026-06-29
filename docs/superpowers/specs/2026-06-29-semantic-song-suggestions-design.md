# Semantic Song Suggestions — Design

**Date:** 2026-06-29
**Status:** Approved (design), pending implementation plan

## Goal

Let a user type a word or sentence into the Dashboard search box and get songs
suggested by *meaning*, not just substring match. Example: typing "gratitude"
surfaces songs whose lyrics are about thankfulness/praise, even when the word
"gratitude" never appears.

## Approach

Vector similarity search using Supabase's built-in `gte-small` embedding model
(runs in Edge Functions, no external API key, no per-token cost) plus the
`pgvector` Postgres extension. Each song is embedded once on save; the typed
query is embedded at search time and matched by cosine similarity.

### Why this approach

- No external LLM/API key, no per-call cost — runs entirely on the Supabase
  stack already in use.
- `gte-small` outputs 384-dim vectors; small enough that even a full table scan
  is fast at current corpus size (~hundreds of songs).
- Keyword search stays untouched and instant; semantic results are additive.

## Decisions (locked during brainstorming)

1. **Entry point:** augment the existing Dashboard search box. Keyword
   (substring) results render as today; semantic matches render in a separate
   "Related songs" group below them.
2. **Embed source:** `title + artist + tags + lyrics`.
3. **Result trigger:** always run on any word/phrase query; show top N semantic
   matches above a similarity threshold; hide the group when none clear the bar.
4. **Embedding sync:** client calls an `embed-song` edge function on save
   (create/update); existing songs handled by a one-time backfill script.

## Architecture

### Database

- Enable the `pgvector` extension.
- Add column `songs.embedding vector(384)` (gte-small dimensionality).
- Add an HNSW index on `embedding` (`vector_cosine_ops`). Not strictly needed at
  current scale — a sequential scan is fast for hundreds of rows — but cheap to
  add now and avoids a later migration as the library grows.
- Add RPC `match_songs(query_embedding vector(384), match_threshold float,
  match_count int)` returning `{ id, similarity }` ordered by
  `1 - (embedding <=> query_embedding)` descending, filtered to
  `similarity >= match_threshold`, limited to `match_count`. Rows with a null
  embedding are excluded.

### Edge functions

- **`embed-song`** — input `{ songId, text }`. Runs
  `new Supabase.ai.Session('gte-small')` to embed `text`, writes the resulting
  384-vector to `songs.embedding` for `songId` using the service-role key.
  Returns `{ ok: true }`. **JWT-gated**: rejects unauthenticated callers to
  prevent abuse of the write path.
- **`search-songs`** — input `{ query }`. Embeds `query` with `gte-small`, calls
  `match_songs(embedding, threshold, count)`, returns ranked
  `[{ id, similarity }]`. Threshold and count passed from config (defaults:
  threshold `0.7`, count `8`).

### Client

- `src/lib/supabaseOps.js`
  - `buildEmbedText(song)` helper (see below).
  - After a successful `create`/`update`, call `embed-song` with `{ songId,
    text: buildEmbedText(song) }`.
  - `semanticSearch(query)` → calls `search-songs`, returns ranked ids.
- `src/lib/hooks.js` — extend search behavior: debounce 400ms, min query length
  3, abort the prior in-flight `search-songs` request when a new keystroke
  fires, and cache `query → ids` in an in-memory `Map` for the session.
- `src/views/Dashboard.jsx` — render a "Related songs" group below keyword
  results. Map returned ids to the in-memory song list; dedup against ids
  already shown in keyword results.

## Data flow

### Write path

1. User saves a song. `supabaseSongOps.create`/`update` writes the row.
2. Client calls `embed-song` with `{ songId, text: buildEmbedText(song) }`.
3. Edge function embeds the text and writes `songs.embedding`.

### Query path

1. User types in the Dashboard search box.
2. Keyword substring filter runs instantly (current behavior, unchanged).
3. After 400ms debounce and min length 3, `search-songs` fires with the query.
4. Edge function returns ranked `{ id, similarity }`.
5. Client maps ids to in-memory songs, drops any id already in keyword results,
   keeps matches with `similarity >= 0.7` (max 8), renders the "Related songs"
   group.

## Embed text construction

```
buildEmbedText(song) =
  `${title}\n${artist ?? ''}\n${(tags ?? []).join(' ')}\n${lyrics}`
```

- `lyrics` comes from `parsed_content` lyric lines; falls back to `raw_content`
  if `parsed_content` is unavailable.
- Truncate the assembled string to roughly the `gte-small` 512-token limit
  (~2000 chars as a safe approximation). Long songs lose their tail but keep
  enough for a thematic match.
- Missing `artist`/`tags` are tolerated (empty segments).

## Error handling

- **Embed-on-save failure:** the song is still saved; `embedding` stays null.
  The song is simply absent from semantic results until it is re-saved or
  picked up by a backfill run. Failure is logged, non-blocking — it never
  fails the save.
- **`search-songs` failure/timeout:** keyword results are unaffected; the
  "Related songs" group is silently omitted for that query.
- **Empty/short query (< 3 chars):** skip the semantic call entirely.
- **Repeat queries:** served from the session `Map` cache, no edge call.

## Security / RLS

- `embed-song` holds the service-role key server-side only and is JWT-gated, so
  only authenticated users can trigger embedding writes.
- `search-songs` returns ids only. The client maps those ids against its own
  RLS-filtered in-memory song list, so any id the user is not permitted to see
  is naturally dropped (it won't be found in memory). No data leak via the RPC.

## Backfill

One-time `scripts/backfill-embeddings.mjs` using the service-role key: query all
songs with a null `embedding`, build embed text, embed, write the vector. Run
once after the migration lands.

## Files touched

- DB migration: enable `pgvector`, add `embedding` column, add HNSW index, add
  `match_songs` RPC.
- `supabase/functions/embed-song/` (new)
- `supabase/functions/search-songs/` (new)
- `src/lib/supabaseOps.js`: `buildEmbedText`, embed-on-save in create/update,
  `semanticSearch`.
- `src/lib/hooks.js`: debounce / abort / cache / merge for semantic search.
- `src/views/Dashboard.jsx`: "Related songs" group rendering.
- `scripts/backfill-embeddings.mjs` (new, one-time).

## Testing

- **Unit:** `buildEmbedText` — text assembly, truncation, missing
  `artist`/`tags`, `parsed_content` vs `raw_content` fallback.
- **Edge function:** `embed-song` returns/writes a 384-dim vector;
  `search-songs` returns ids ranked by similarity.
- **Integration:** seed a few songs with distinct themes, embed them, query a
  thematic word, assert the expected song ranks first.
- **Client:** merge/dedup of semantic vs keyword results, threshold filtering,
  debounce and in-flight abort behavior.

## Out of scope (YAGNI)

- Re-ranking or hybrid scoring that blends keyword and semantic scores into one
  list — the two groups stay separate.
- Per-user personalization of suggestions.
- Multilingual embedding tuning beyond what `gte-small` provides out of the box.
