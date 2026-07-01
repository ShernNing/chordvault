-- Backfill legacy `segment`-column groupings into divider rows.
--
-- Context: an earlier design stored a song's liturgical segment in a
-- `setlist_songs.segment` text column (NULL = main set; otherwise 'communion',
-- 'post_sermon' or 'prayer_meeting'). The current design instead represents a
-- segment as a *divider row* — a setlist_songs row with song_id NULL carrying a
-- `label` — with the whole setlist ordered by `position`. See the prior
-- migration 20260701000000_setlist_segments.sql, which must run before this one
-- (it drops the song_id NOT NULL constraint and adds `label` / `page_break`).
--
-- This migration materializes the old grouping as divider rows. For every
-- setlist that has no divider rows yet, it re-sequences songs into the legacy
-- display order (main, communion, post_sermon, prayer_meeting; by `position`
-- within each group) and inserts a labeled divider before the first song of each
-- non-main segment that actually contains songs.
--
-- Safe on databases that never had the legacy column (no-op) and safe to re-run
-- (skips any setlist that already contains a divider row). Unknown/empty legacy
-- segment values normalize to the main set, matching the old segmentOf() rule.

do $$
declare
  has_segment boolean;
  sl_id        setlists.id%type;
  song_id_val  setlist_songs.id%type;
  seg          record;
  pos          int;
  first_in_seg boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_name = 'setlist_songs'
      and column_name = 'segment'
  ) into has_segment;

  if not has_segment then
    return; -- fresh database: no legacy data to migrate
  end if;

  for sl_id in
    select s.id
    from setlists s
    where not exists (
      select 1 from setlist_songs ss
      where ss.setlist_id = s.id and ss.song_id is null
    )
  loop
    -- Park existing songs above the target range so the re-sequencing below
    -- can't transiently collide with an as-yet-unmoved row (defensive in case a
    -- unique(setlist_id, position) index exists).
    update setlist_songs
    set position = position + 1000000
    where setlist_id = sl_id and song_id is not null;

    pos := 0;

    for seg in
      select * from (values
        (null::text,       null::text),
        ('communion',      'Communion'),
        ('post_sermon',    'Post-Sermon'),
        ('prayer_meeting', 'Prayer Meeting')
      ) as t(seg_key, seg_label)
    loop
      first_in_seg := true;

      for song_id_val in
        select ss.id
        from setlist_songs ss
        where ss.setlist_id = sl_id
          and ss.song_id is not null
          and (case
                 when ss.segment in ('communion', 'post_sermon', 'prayer_meeting')
                 then ss.segment
                 else null
               end) is not distinct from seg.seg_key
        order by ss.position
      loop
        -- Divider before the first song of a non-main segment (only reached when
        -- that segment has at least one song).
        if first_in_seg and seg.seg_key is not null then
          insert into setlist_songs (setlist_id, song_id, label, page_break, position)
          values (sl_id, null, seg.seg_label, false, pos);
          pos := pos + 1;
        end if;
        first_in_seg := false;

        update setlist_songs set position = pos where id = song_id_val;
        pos := pos + 1;
      end loop;
    end loop;
  end loop;
end $$;
