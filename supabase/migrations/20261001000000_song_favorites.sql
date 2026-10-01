-- Per-user song favourites. Songs are shared, so favourites live in their own
-- table keyed by (user, song) rather than a column on songs.
CREATE TABLE IF NOT EXISTS song_favorites (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id    uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);

ALTER TABLE song_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "song_favorites_select_own" ON song_favorites
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "song_favorites_insert_own" ON song_favorites
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "song_favorites_delete_own" ON song_favorites
  FOR DELETE USING (user_id = auth.uid());
