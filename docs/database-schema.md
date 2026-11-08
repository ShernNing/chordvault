# Database schema (reference)

The base tables were created by hand in the Supabase SQL editor before
`supabase/migrations/` existed, so the migrations alone can't rebuild the
database. This is a snapshot of the production `public` schema, read from the
Postgres catalog on 2026-11-08, so a fresh project can be reconstructed. For an
exact DDL dump, start Docker and run
`supabase db dump --remote --schema public -f schema.sql`.

Setup order for a fresh project: tables below → ROLES.md SQL (profiles, role
helpers, songs policies) → every file in `supabase/migrations/` in order.

## Tables

### songs
| column | type | default |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| title | text NOT NULL | |
| artist | text | |
| original_key | text | |
| raw_content | text | |
| parsed_content | jsonb | |
| tags | text[] | `'{}'` |
| play_count | integer | `0` |
| last_played_at | timestamptz | |
| created_at / updated_at | timestamptz | `now()` |
| electric_guitar_notes | jsonb | `'[]'` |
| created_by | uuid → auth.users | `auth.uid()` |
| embedding | vector(384) | (migration 20260629) |
| inline_voicings | jsonb | `'{}'` (migration 20260723) |

### setlists
`id uuid PK default gen_random_uuid()`, `name text NOT NULL`,
`created_at`, `updated_at timestamptz default now()`.

### setlist_songs
| column | type | notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| setlist_id | uuid → setlists | ON DELETE CASCADE |
| song_id | uuid → songs, nullable | ON DELETE CASCADE; NULL = segment divider (migration 20260701) |
| position | integer | `0` |
| chosen_key | text | |
| capo | integer | `0` |
| segment | text | legacy |
| label | text | divider label |
| page_break | boolean NOT NULL | `false` |

### profiles
`id uuid PK → auth.users ON DELETE CASCADE`, `role text NOT NULL default 'member'`
(check: member / leader / superuser), `email text`, `created_at`. Created by
the `handle_new_user` trigger on `auth.users` (see ROLES.md).

### song_favorites (migration 20261001)
`(user_id → auth.users, song_id → songs)` PK, both ON DELETE CASCADE.

### shares (migration 20261108)
`token text PK`, `kind text` (song / setlist), `payload jsonb`,
`created_by uuid → auth.users default auth.uid()`, `created_at`.

### voicings
User chord voicings: `id uuid PK`, `user_id → auth.users ON DELETE CASCADE`,
`root_chord`, `display_name text default 'C'`, `frets jsonb NOT NULL`,
`source_key`, `shape`, `inversion text`, `tags jsonb default '["custom"]'`,
`description text default ''`, `is_shared boolean default false`, `created_at`.

## Row-level security (all tables have RLS enabled)

| table | policy | who |
|---|---|---|
| songs | read | signed-in users |
| songs | insert / update / delete | per ROLES.md (leader on own, superuser any) |
| setlists, setlist_songs | `auth_all` (all ops) | any signed-in user, by design |
| profiles | read own; superuser reads all + updates | |
| song_favorites | select / insert / delete own | |
| shares | owner read / insert / delete own; public reads via `get_share()` | |
| voicings | read own or `is_shared`; insert / update / delete own | |

## Functions (app-defined)

| function | security | purpose |
|---|---|---|
| `is_superuser()`, `can_add_songs()` | definer | role checks used by policies |
| `is_admin()` | definer | legacy, unused (safe to drop) |
| `handle_new_user()` | definer | signup trigger → profiles row |
| `match_songs(vector, float, int)` | invoker | semantic search (RLS applies) |
| `get_share(text)` | definer | public share lookup by token |
