# Roles & permissions

ChordVault has **three roles**. Everyone can read the whole shared song library;
the role only controls **writes** (add / edit / delete songs) and **who can change
other people's roles**.

| Capability                         | Member | Leader | Superuser |
| ---------------------------------- | :----: | :----: | :-------: |
| View every song                    |   ✅   |   ✅   |    ✅     |
| Transpose / change key for viewing |   ✅   |   ✅   |    ✅     |
| Build & edit setlists              |   ✅   |   ✅   |    ✅     |
| Add songs                          |   ❌   |   ✅   |    ✅     |
| Edit songs **they added**          |   ❌   |   ✅   |    ✅     |
| Edit **anyone's** songs            |   ❌   |   ❌   |    ✅     |
| Delete songs **they added**        |   ❌   |   ✅   |    ✅     |
| Delete **anyone's** songs          |   ❌   |   ❌   |    ✅     |
| Promote / demote users             |   ❌   |   ❌   |    ✅     |

### Member (default for every new sign-up)

- **Can:** view every song, transpose/change key for their own viewing (never
  saved), and create/edit/delete setlists.
- **Cannot:** add, edit, or delete any song; change anyone's role. The "Add Song"
  and "Import" nav links are hidden for members.

### Leader

- **Can:** everything a member can, **plus** add songs and edit/delete the songs
  they added (including "Save key" on their own songs).
- **Cannot:** edit or delete songs _someone else_ added, or change anyone's role.

### Superuser (you)

- **Can:** everything, no restriction — add, edit, and delete **any** song, and
  promote/demote any user from **Profile → Admin · User management**.
- There is no "cannot". The first superuser is set by hand in SQL (step 7 below);
  after that you create more from the app.

**New users** who sign up or sign in are always **members**. A superuser promotes
them to leader or superuser afterwards.

> **Security note:** the app hides buttons you're not allowed to use, but that is
> only cosmetic. The real enforcement is the Row Level Security (RLS) policies
> below — Postgres rejects a forbidden write even if someone calls the API
> directly with the anon key. Never rely on the hidden buttons alone.

---

## What to run in the Supabase SQL editor

Dashboard → SQL Editor → New query → paste the whole block → **Run**. It is safe to
run on a fresh project **or** on top of the original 2-role (`member`/`admin`)
setup — it migrates old `admin` rows to `superuser` automatically.

**Before running:** edit step 7 to use **your** email (or user id).

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- ChordVault roles — member / leader / superuser
-- ════════════════════════════════════════════════════════════════════════════

-- 1. profiles: one row per auth user, holds their role + email.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'member',
  email      text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles add column if not exists email text;

-- 2. Move to the 3-role model. Drop the old constraint FIRST, then migrate old
--    'admin' rows to 'superuser', then add the new constraint.
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'superuser' where role = 'admin';
alter table public.profiles
  add constraint profiles_role_check check (role in ('member','leader','superuser'));

-- 3. Signup trigger: every new user is a 'member'; capture their email too.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill rows + emails for users who already exist.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email;

-- 4. Role helpers. SECURITY DEFINER so they read profiles regardless of RLS (and
--    so the policies that call them don't recurse into profiles' own policies).
create or replace function public.is_superuser()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superuser');
$$;

create or replace function public.can_add_songs()  -- true for leader or superuser
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('leader','superuser'));
$$;

-- 5. profiles policies: read own; superuser reads all + changes roles.
drop policy if exists "read own profile"             on public.profiles;
drop policy if exists "admins read all profiles"     on public.profiles;
drop policy if exists "admins update roles"          on public.profiles;
drop policy if exists "superuser reads all profiles" on public.profiles;
drop policy if exists "superuser updates profiles"   on public.profiles;

create policy "read own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "superuser reads all profiles"
  on public.profiles for select using (public.is_superuser());
create policy "superuser updates profiles"
  on public.profiles for update using (public.is_superuser()) with check (public.is_superuser());

-- 6. songs: ownership + role-based writes.
alter table public.songs
  add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table public.songs enable row level security;

drop policy if exists "songs are readable by all"       on public.songs;
drop policy if exists "members can add songs"            on public.songs;
drop policy if exists "leaders and superusers add songs" on public.songs;
drop policy if exists "owner or admin can edit songs"    on public.songs;
drop policy if exists "edit own or superuser"            on public.songs;
drop policy if exists "owner or admin can delete songs"  on public.songs;
drop policy if exists "only superuser deletes"           on public.songs;
drop policy if exists "delete own or superuser"          on public.songs;

-- READ: everyone (shared band library), members included.
create policy "songs are readable by all"
  on public.songs for select using (true);

-- ADD: leader or superuser, only as themselves.
create policy "leaders and superusers add songs"
  on public.songs for insert
  with check (auth.uid() = created_by and public.can_add_songs());

-- EDIT: superuser edits any; a leader edits only songs they created.
create policy "edit own or superuser"
  on public.songs for update
  using (public.is_superuser() or (auth.uid() = created_by and public.can_add_songs()))
  with check (public.is_superuser() or (auth.uid() = created_by and public.can_add_songs()));

-- DELETE: superuser deletes any; a leader deletes only songs they created.
create policy "delete own or superuser"
  on public.songs for delete
  using (public.is_superuser() or (auth.uid() = created_by and public.can_add_songs()));

-- 7. ►► MAKE YOURSELF THE SUPERUSER ◄◄ (edit the email, then this is the bootstrap)
update public.profiles set role = 'superuser' where email = 'sherningtan@gmail.com';
--   or by id:  update public.profiles set role = 'superuser' where id = '<your-uuid>';

-- 8. Optional: give legacy songs (created_by null) an owner so a leader can edit
--    theirs. Until assigned, only the superuser can edit/delete them.
-- update public.songs set created_by = '<your-uuid>' where created_by is null;
```

### After running

1. **Reload the app.** Your account chip (top-right) should show **Superuser** and
   the **Admin · User management** panel appears on your Profile page.
2. **Promote people** from that panel — pick Member / Leader / Superuser per user.
   Changes take effect on their next page load.
3. **Find a user id** if you need it: Authentication → Users, or
   `select id, email, role from public.profiles order by created_at;`.

## Notes

- **Setlists** are open to every signed-in user (members included) and are _not_
  covered by these policies. If you ever enable RLS on `setlists` /
  `setlist_songs`, you must add policies or the app will break — ask and I'll add
  permissive ones.
- **Changing the key for viewing** (transpose) never touches the database, so
  everyone can do it. **"Save key"** rewrites the song, so it follows the edit
  rule (superuser, or a leader on their own song).
- **Any superuser can promote/demote anyone**, including demoting you. The in-app
  "are you sure" when you demote yourself is cosmetic — Postgres still allows it.
  Don't leave yourself without a superuser; only grant it to people you trust.
- The old `is_admin()` function from the 2-role setup is left in place but unused;
  you can `drop function if exists public.is_admin();` once nothing references it.
