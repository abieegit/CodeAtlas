-- ===========================================================================
-- CodeAtlas — Build 07
-- Asynchronous analysis: a durable PostgreSQL job queue.
--
-- Additive only: this file adds ONE table (analysis_jobs), ONE column
-- (repositories.source_object_key) and two SECURITY DEFINER functions. It
-- does not recreate, drop or rename anything from Build 06.
--
-- The backend/worker connect with the Supabase secret key, which BYPASSES
-- row level security, so RLS here protects direct client access only; the
-- application additionally scopes every statement by the verified user id.
--
-- Safe to re-run (idempotent).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- analysis_jobs — the job queue (PostgreSQL only; no Redis/BullMQ)
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_jobs (
    id uuid primary key default gen_random_uuid(),
    repository_id uuid not null references public.repositories(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'completed', 'failed')),
    progress integer not null default 0
        check (progress between 0 and 100),
    stage text not null default 'queued',
    error_message text,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    max_attempts integer not null default 3 check (max_attempts >= 1),
    locked_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.analysis_jobs is
    'Durable analysis job queue. Claimed atomically with FOR UPDATE SKIP LOCKED.';

create index if not exists analysis_jobs_status_created_idx
    on public.analysis_jobs (status, created_at);

create index if not exists analysis_jobs_user_created_idx
    on public.analysis_jobs (user_id, created_at desc);

create index if not exists analysis_jobs_repository_idx
    on public.analysis_jobs (repository_id);

drop trigger if exists analysis_jobs_set_updated_at on public.analysis_jobs;
create trigger analysis_jobs_set_updated_at
    before update on public.analysis_jobs
    for each row execute function public.set_updated_at();  -- reused from Build 06

-- ---------------------------------------------------------------------------
-- repositories — store the private R2 object key for the source ZIP
-- ---------------------------------------------------------------------------
alter table public.repositories
    add column if not exists source_object_key text;

comment on column public.repositories.source_object_key is
    'Private R2 object key of the source ZIP (repositories/{userId}/{repoId}/source.zip). Never a public URL.';

-- ---------------------------------------------------------------------------
-- Row Level Security — a user reads only their own jobs.
-- No client insert/update/delete policies: jobs are written only by the
-- backend/worker (secret key). Clients can never set status, attempt_count,
-- locked_at or any internal field.
-- ---------------------------------------------------------------------------
alter table public.analysis_jobs enable row level security;

drop policy if exists analysis_jobs_select_own on public.analysis_jobs;
create policy analysis_jobs_select_own on public.analysis_jobs
    for select to authenticated
    using (auth.uid() = user_id);

grant select on public.analysis_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic claim + stale recovery.
-- Runs in a single transaction: it first re-queues (or fails) jobs whose
-- worker died, then atomically claims one pending job. FOR UPDATE SKIP LOCKED
-- guarantees two workers can never claim the same row.
-- SECURITY DEFINER, executable only by the backend's service role.
-- ---------------------------------------------------------------------------
create or replace function public.claim_analysis_job(p_stale_seconds integer default 900)
returns setof public.analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Recover jobs stuck in 'processing' (worker died mid-flight).
    update public.analysis_jobs
       set status = case when attempt_count >= max_attempts then 'failed' else 'pending' end,
           error_message = case
               when attempt_count >= max_attempts
                   then coalesce(error_message, 'Analysis stalled.')
               else error_message
           end,
           locked_at = null,
           updated_at = now()
     where status = 'processing'
       and locked_at is not null
       and locked_at < now() - make_interval(secs => greatest(p_stale_seconds, 1));

    -- Claim exactly one eligible pending job, atomically.
    return query
        with claimed as (
            update public.analysis_jobs
               set status = 'processing',
                   attempt_count = attempt_count + 1,
                   locked_at = now(),
                   started_at = coalesce(started_at, now()),
                   stage = 'queued',
                   updated_at = now()
             where id = (
                 select id
                   from public.analysis_jobs
                  where status = 'pending'
                    and attempt_count < max_attempts
                  order by created_at
                  for update skip locked
                  limit 1
             )
            returning *
        )
        select * from claimed;
end;
$$;

revoke all on function public.claim_analysis_job(integer)
    from public, anon, authenticated;
grant execute on function public.claim_analysis_job(integer) to service_role;
