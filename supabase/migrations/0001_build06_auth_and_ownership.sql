-- ===========================================================================
-- CodeAtlas — Build 06
-- Authentication, PostgreSQL foundation & multi-tenant repository ownership.
--
-- Auth users live in Supabase's `auth.users` schema. This migration adds the
-- application tables (profiles, repositories), the profile bootstrap trigger,
-- and row level security.
--
-- IMPORTANT: the backend connects with the service-role key, which BYPASSES
-- row level security. RLS here protects direct client (anon/authenticated)
-- access. The backend additionally scopes every statement by the verified
-- user id, so RLS is defence-in-depth, not the only control.
-- ===========================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user; id mirrors auth.users.id
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.profiles is
    'One row per auth user; id mirrors auth.users.id.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- repositories — one row per uploaded/analysed repository, one owner each
-- ---------------------------------------------------------------------------
create table if not exists public.repositories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    source_type text not null default 'zip',
    status text not null default 'analyzing'
        check (status in ('analyzing', 'completed', 'failed')),
    graph_persisted boolean not null default false,
    node_count integer not null default 0 check (node_count >= 0),
    relationship_count integer not null default 0 check (relationship_count >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.repositories is
    'One row per analysed repository. The id is the stable, globally unique '
    'repository identifier used as the graph/cache scoping key.';

create index if not exists repositories_user_id_idx
    on public.repositories (user_id);

create index if not exists repositories_user_created_idx
    on public.repositories (user_id, created_at desc);

drop trigger if exists repositories_set_updated_at on public.repositories;
create trigger repositories_set_updated_at
    before update on public.repositories
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile bootstrap — create a profile whenever an auth user is created.
-- SECURITY DEFINER so it can insert despite RLS; search_path pinned; the
-- on-conflict guard keeps it idempotent (no duplicate profiles).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name)
    values (new.id, new.raw_user_meta_data ->> 'full_name')
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.repositories enable row level security;

-- profiles: a user reads/updates only their own row. Inserts happen only via
-- the trigger (no client insert policy). Update is restricted to the
-- permitted columns below.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
    for select to authenticated
    using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
    for update to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- repositories: owner-only read/insert/update/delete. The with-check clauses
-- stop a user creating a repository owned by someone else, and stop an update
-- from changing ownership.
drop policy if exists repositories_select_own on public.repositories;
create policy repositories_select_own on public.repositories
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists repositories_insert_own on public.repositories;
create policy repositories_insert_own on public.repositories
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists repositories_update_own on public.repositories;
create policy repositories_update_own on public.repositories
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists repositories_delete_own on public.repositories;
create policy repositories_delete_own on public.repositories
    for delete to authenticated
    using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants — enable the policies above for signed-in clients, and restrict
-- profile updates to the permitted columns (full_name, avatar_url).
-- The anonymous role gets no access.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.repositories to authenticated;

grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
