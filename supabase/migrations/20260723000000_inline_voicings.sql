-- Persist per-song manual inline chord-voicing picks.
-- Shape: { "<preset>:<semitones>": { "<lineIndex>:<tokenIndex>": <voicing> } }
-- Each transposition/preset combo keeps its own saved voicings. Screen-only
-- feature (SongRenderer inline voicings); NULL/'{}' means "use auto voice-leading".
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS inline_voicings jsonb DEFAULT '{}'::jsonb;
