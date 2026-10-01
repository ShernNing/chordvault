# Song favourites — design

Date: 2026-10-01

## Goal
Let a signed-in user star songs and filter the Dashboard to their starred songs.
Favourites are per-user (songs are shared across users) and sync across devices.

## Scope
In: songs only. Star on `SongCard` and `SongView`; "Favourites" filter on Dashboard.
Out: setlists, favourites-first sort, offline queue, voicing favourites (already
exist in `src/lib/voicings/favorites.js`, localStorage — untouched).

## Data
Migration `supabase/migrations/20261001000000_song_favorites.sql`:

```sql
CREATE TABLE IF NOT EXISTS song_favorites (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id    uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);
ALTER TABLE song_favorites ENABLE ROW LEVEL SECURITY;
-- select / insert / delete allowed only where user_id = auth.uid()
```

Must be applied to cloud Supabase before the feature works.

## Lib
- `src/lib/favorites.js` — pure helpers, unit-tested (`favorites.test.js`):
  - `toggleIn(set, id)` → new Set with id added/removed (no mutation).
  - `filterFavorites(songs, set)` → songs whose id is in set.
- `useSongFavorites()` in `src/lib/hooks.js` (uses `useAuth().userId`):
  - Loads the user's favourite song ids once; returns `{ ids: Set, has(id), toggle(id), loading }`.
  - `toggle` is optimistic; on Supabase error it rolls back and shows a toast.
  - Missing-table error → toast with the `CREATE TABLE` hint (same pattern as `inline_voicings` in `SongView`).
  - Supabase calls live in `supabaseOps.js` (`supabaseFavoriteOps.list/add/remove`).

## UI
- `src/components/song/FavoriteStar.jsx`: filled/outlined star, `aria-pressed`,
  `aria-label` "Add to / Remove from favourites". `preventDefault` +
  `stopPropagation` so a click inside the `SongCard` link does not navigate.
- `SongCard`: star in card corner (props `favorite`, `onToggleFavorite`).
- `SongView`: star in header.
- `Dashboard`: "Favourites" toggle chip beside the key filter; filters `results`
  client-side via `filterFavorites`. Empty state: "No favourites yet — star a song."
  Related-songs section respects the filter via existing `excludeIds` path.

## Error handling
- Not signed in / no `userId`: stars hidden.
- Network/RLS error: rollback + toast; UI never stays in a wrong state.

## Testing
- Unit: `toggleIn`, `filterFavorites` (add, remove, no mutation, empty set).
- `npm run lint`, `npm run test:run`, `npm run build`.
- Authed views can't be browser-verified here (cloud Supabase + login).
