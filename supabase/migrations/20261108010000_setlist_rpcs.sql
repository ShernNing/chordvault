-- Setlist + play-tracking RPCs.
--
-- 1. reorder_setlist_songs: the client used to fire one UPDATE per slot with
--    Promise.all and ignore errors, so a partial failure scrambled positions
--    and the optimistic rollback never ran. This does the whole reorder in a
--    single UPDATE (atomic), after verifying every id belongs to the setlist.
--    SECURITY INVOKER: it runs with the caller's own privileges/RLS.
--
-- 2. mark_song_played: play counts were a client read-modify-write UPDATE on
--    songs, which RLS rejects (silently, 0 rows) for anyone who doesn't own the
--    song, so members' plays never saved and concurrent plays raced. This
--    SECURITY DEFINER function only bumps play_count / last_played_at, for
--    authenticated callers, atomically.

create or replace function public.reorder_setlist_songs(
  p_setlist_id uuid,
  p_slot_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total int;
  v_given int;
  v_distinct int;
begin
  v_given := coalesce(array_length(p_slot_ids, 1), 0);

  select count(distinct x) into v_distinct from unnest(p_slot_ids) as x;
  if v_distinct <> v_given then
    raise exception 'reorder_setlist_songs: duplicate slot ids' using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.setlist_songs s
  where s.setlist_id = p_setlist_id;

  -- Every slot of the setlist must be listed exactly once, and nothing else.
  if v_total <> v_given or exists (
    select 1
    from unnest(p_slot_ids) as x(id)
    where not exists (
      select 1 from public.setlist_songs s
      where s.id = x.id and s.setlist_id = p_setlist_id
    )
  ) then
    raise exception 'reorder_setlist_songs: slot ids do not match setlist %', p_setlist_id
      using errcode = '22023';
  end if;

  update public.setlist_songs s
  set position = o.ord - 1
  from unnest(p_slot_ids) with ordinality as o(id, ord)
  where s.id = o.id
    and s.setlist_id = p_setlist_id;
end;
$$;

revoke all on function public.reorder_setlist_songs(uuid, uuid[]) from public;
grant execute on function public.reorder_setlist_songs(uuid, uuid[]) to authenticated;

create or replace function public.mark_song_played(p_song_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'mark_song_played: not authenticated' using errcode = '42501';
  end if;

  update public.songs
  set play_count = coalesce(play_count, 0) + 1,
      last_played_at = now()
  where id = p_song_id;
end;
$$;

revoke all on function public.mark_song_played(uuid) from public;
revoke all on function public.mark_song_played(uuid) from anon;
grant execute on function public.mark_song_played(uuid) to authenticated;
