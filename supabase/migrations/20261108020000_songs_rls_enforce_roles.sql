-- Enforce the ROLES.md permission model on songs.
--
-- Production had two leftover policies from an earlier setup that the ROLES.md
-- script never dropped (it drops policies by name):
--
--   auth_all        FOR ALL TO authenticated USING (true) WITH CHECK (true)
--   anon_read_songs FOR SELECT TO anon USING (true)
--
-- Permissive policies are OR'd together, so auth_all let ANY signed-in user
-- (members included) insert, update or delete ANY song through the REST API,
-- silently overriding "edit own or superuser" etc. The role model was only
-- enforced by hidden buttons. anon_read_songs (plus "songs are readable by all"
-- being granted to role `public`) exposed the whole library to logged-out
-- visitors holding the public anon key.
--
-- After this migration:
--   SELECT  signed-in users only (shared band library). Public share links are
--           unaffected: they read snapshots via get_share(), not this table.
--   INSERT  leader/superuser, as themselves           (unchanged policy)
--   UPDATE  superuser, or a leader on their own song   (unchanged policy)
--   DELETE  superuser, or a leader on their own song   (unchanged policy)
--
-- setlists / setlist_songs keep their auth_all policy: ROLES.md says setlists
-- are open to every signed-in user by design.

drop policy if exists "auth_all" on public.songs;
drop policy if exists "anon_read_songs" on public.songs;

drop policy if exists "songs are readable by all" on public.songs;
drop policy if exists "signed-in users read songs" on public.songs;
create policy "signed-in users read songs"
  on public.songs for select
  to authenticated
  using (true);

-- Belt and braces: the anon role has no business writing songs at all.
revoke insert, update, delete on public.songs from anon;
