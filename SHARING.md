# Public Share Links — one-time setup

ChordVault can mint **read-only public links** to a song or a whole setlist
(`/share/:token`). Each link is a self-contained *snapshot* — the recipient sees
only the exact content you shared, never your live library.

This feature needs one table. Run the SQL below **once** in your Supabase project
(Dashboard → SQL Editor → New query → paste → Run). Until you do, the Share
buttons show a "needs setup" message instead of failing silently.

```sql
create table public.shares (
  token       text primary key,
  kind        text not null check (kind in ('song','setlist')),
  payload     jsonb not null,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz default now()
);

alter table public.shares enable row level security;

-- Anyone with the link can read it. The token is a random 32-char id and is
-- the only thing protecting the link (the classic "unlisted link" model).
create policy "shares are world readable by token"
  on public.shares for select
  using (true);

-- Only the signed-in owner can create their own shares…
create policy "owner can create shares"
  on public.shares for insert
  with check (auth.uid() = created_by);

-- …and delete them.
create policy "owner can delete shares"
  on public.shares for delete
  using (auth.uid() = created_by);
```

## Security notes

- **The token is the secret.** Tokens are 32 random hex chars (`crypto.randomUUID`),
  so links are effectively unguessable. There is no listing endpoint — you can
  only read a share if you already have its token.
- **No library access leaks.** A share stores a *copy* of the song/setlist content
  in `payload`. The public `select` policy exposes only the `shares` table, never
  `songs` or `setlists`, so a link can never be walked back to the rest of your
  library.
- **Snapshots are frozen.** Editing the original song later does not change an
  already-created link. Re-share to publish an updated snapshot.
- **Revoking:** delete the row (`delete from public.shares where token = '…';`).
  A future "my shares" management screen could expose this in-app.

## To also share electric-guitar voicings (optional)

The snapshot currently captures `title, artist, original_key, parsed_content,
tags`. It does **not** include `electric_guitar_notes`. If you want those in
shared links too, add the field in `src/lib/shares.js` (`createSongShare`).
