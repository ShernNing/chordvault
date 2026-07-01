-- Setlist segments: a divider row is a setlist_songs row with no song
-- (song_id NULL) carrying a segment `label`, optionally forcing a new page
-- in the exported PDF via `page_break`.

alter table setlist_songs
  alter column song_id drop not null;

alter table setlist_songs
  add column if not exists label text;

alter table setlist_songs
  add column if not exists page_break boolean not null default false;
