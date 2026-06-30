-- Liturgical segment a setlist song belongs to.
-- NULL = main worship set. Otherwise: 'communion' | 'post_sermon' | 'prayer_meeting'.
alter table setlist_songs add column if not exists segment text;
