-- Shares: read by token only.
--
-- The original setup (SHARING.md) used `for select using (true)`, which let
-- anyone holding the public anon key list EVERY share — all tokens, payloads
-- and owner uids — via `GET /rest/v1/shares?select=*`. The token was meant to
-- be the secret, but a table-wide SELECT made it irrelevant.
--
-- Now: no table-wide SELECT. Public reads go through get_share(token), a
-- SECURITY DEFINER function that returns at most the one matching row and
-- never exposes created_by. Owners can still read their own rows directly.

-- Idempotent table create so this migration also works on a fresh project.
create table if not exists public.shares (
  token       text primary key,
  kind        text not null check (kind in ('song','setlist')),
  payload     jsonb not null,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz default now()
);

alter table public.shares enable row level security;

drop policy if exists "shares are world readable by token" on public.shares;
drop policy if exists "owner can read own shares" on public.shares;
drop policy if exists "owner can create shares" on public.shares;
drop policy if exists "owner can delete shares" on public.shares;

create policy "owner can read own shares"
  on public.shares for select
  using (auth.uid() = created_by);

create policy "owner can create shares"
  on public.shares for insert
  with check (auth.uid() = created_by);

create policy "owner can delete shares"
  on public.shares for delete
  using (auth.uid() = created_by);

create or replace function public.get_share(p_token text)
returns table (token text, kind text, payload jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.token, s.kind, s.payload, s.created_at
  from public.shares s
  where s.token = p_token
  limit 1;
$$;

revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
