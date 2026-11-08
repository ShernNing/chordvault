# Public Share Links, one-time setup

ChordVault can mint **read-only public links** to a song or a whole setlist
(`/share/:token`). Each link is a self-contained _snapshot_, the recipient sees
only the exact content you shared, never your live library.

This feature needs one table plus a `get_share(token)` function. Run
[`supabase/migrations/20261108000000_shares_get_by_token.sql`](supabase/migrations/20261108000000_shares_get_by_token.sql)
**once** in your Supabase project (Dashboard → SQL Editor → New query → paste →
Run, or `supabase db push`). It is idempotent, and safe to run over the older
setup that used a `using (true)` select policy — it drops that policy. Until you
run it, the Share buttons show a "needs setup" message instead of failing
silently.

## Security notes

- **The token is the secret.** Tokens are 32 random hex chars (`crypto.randomUUID`),
  so links are effectively unguessable. There is no table-wide `select` policy:
  the public can only read a share through `get_share(token)`, which returns the
  one matching row (never `created_by`). Owners can read their own rows directly.
- **Why not `using (true)`?** An earlier version of this setup used a
  world-readable `select` policy. Combined with the public anon key, that let
  anyone run `GET /rest/v1/shares?select=*` and list every share. Make sure that
  policy is gone (`select policyname from pg_policies where tablename = 'shares'`).
- **No library access leaks.** A share stores a _copy_ of the song/setlist content
  in `payload`. `get_share` reads only the `shares` table, never `songs` or
  `setlists`, so a link can never be walked back to the rest of your library.
- **Snapshots are frozen.** Editing the original song later does not change an
  already-created link. Re-share to publish an updated snapshot.
- **Revoking:** delete the row (`delete from public.shares where token = '…';`).
  A future "my shares" management screen could expose this in-app.

## To also share electric-guitar voicings (optional)

The snapshot currently captures `title, artist, original_key, parsed_content,
tags`. It does **not** include `electric_guitar_notes`. If you want those in
shared links too, add the field in `src/lib/shares.js` (`createSongShare`).
