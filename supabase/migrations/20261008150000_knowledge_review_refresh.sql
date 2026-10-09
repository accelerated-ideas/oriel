-- Choosing pages before they're read, and refreshing on the plan's schedule.
--   * An import finds pages first (crawling a site or reading a sitemap), then
--     the owner chooses which to add. Only the assistant's own setup import
--     adds everything it finds right away (auto_add).
--   * Each import keeps its options: excluded paths, query parameters, slow mode.

alter table public.knowledge_imports
  add column mode text not null default 'crawl' check (mode in ('crawl', 'sitemap')),
  add column options jsonb not null default '{}'::jsonb,
  add column auto_add boolean not null default true;

alter table public.knowledge_imports drop constraint knowledge_imports_status_check;
alter table public.knowledge_imports add constraint knowledge_imports_status_check
  check (status in ('finding', 'found', 'reading', 'done', 'failed', 'canceled'));

-- Pages an import found, waiting to be chosen.
create table public.knowledge_found_pages (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.knowledge_imports (id) on delete cascade,
  url text not null,
  added boolean not null default false,
  unique (import_id, url)
);

alter table public.knowledge_found_pages enable row level security;

-- Queues indexing, optionally spaced out (slow mode: one page every few seconds).
drop function if exists public.queue_index_jobs(uuid[], uuid);
create or replace function public.queue_index_jobs(
  p_source_ids uuid[],
  p_import_id uuid default null,
  p_spacing_seconds integer default 0
)
returns integer
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select s.id, s.agent_id, row_number() over (order by s.created_at, s.id) - 1 as position
    from public.knowledge_sources s
    where s.id = any (p_source_ids)
      and not exists (
        select 1 from public.knowledge_jobs j
        where j.source_id = s.id and j.status in ('queued', 'running')
      )
  ),
  queued as (
    insert into public.knowledge_jobs (agent_id, kind, import_id, source_id, run_after)
    select c.agent_id, 'index', p_import_id, c.id, now() + make_interval(secs => c.position * p_spacing_seconds)
    from candidates c
    returning 1
  )
  select count(*)::integer from queued;
$$;

-- Website pages of one workspace not read for a while (automatic refresh).
drop function if exists public.queue_stale_sources(interval, integer);
create or replace function public.queue_stale_sources(p_organization_id uuid, p_older_than interval, p_limit integer)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.queue_index_jobs(array(
    select id from public.knowledge_sources
    where organization_id = p_organization_id
      and kind = 'url'
      and status in ('ready', 'error')
      and coalesce(fetched_at, created_at) < now() - p_older_than
    order by coalesce(fetched_at, created_at)
    limit p_limit
  ));
$$;

-- Workspaces that have website pages (candidates for automatic refresh).
create or replace function public.organizations_with_pages()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct organization_id from public.knowledge_sources where kind = 'url';
$$;

revoke execute on function public.queue_index_jobs(uuid[], uuid, integer) from public, anon, authenticated;
revoke execute on function public.queue_stale_sources(uuid, interval, integer) from public, anon, authenticated;
revoke execute on function public.organizations_with_pages() from public, anon, authenticated;

-- Import progress, now also counting pages waiting to be chosen.
drop function if exists public.knowledge_import_progress(uuid, integer);
create or replace function public.knowledge_import_progress(p_agent_id uuid, p_limit integer default 5)
returns table (
  id uuid, url text, mode text, status text, page_limit integer, pages_found integer, error text,
  created_at timestamptz, finished_at timestamptz, ready bigint, failed bigint, waiting bigint, unchosen bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.url, i.mode, i.status, i.page_limit, i.pages_found, i.error, i.created_at, i.finished_at,
         (select count(*) from public.knowledge_sources s where s.import_id = i.id and s.status = 'ready'),
         (select count(*) from public.knowledge_sources s where s.import_id = i.id and s.status = 'error'),
         (select count(*) from public.knowledge_sources s where s.import_id = i.id and s.status in ('pending', 'processing')),
         (select count(*) from public.knowledge_found_pages f where f.import_id = i.id and not f.added)
  from public.knowledge_imports i
  where i.agent_id = p_agent_id
  order by i.created_at desc
  limit p_limit;
$$;

revoke execute on function public.knowledge_import_progress(uuid, integer) from public, anon, authenticated;

-- Imports waiting for the owner to choose pages aren't "done" just because no jobs run.
create or replace function public.settle_knowledge_imports()
returns void
language sql
security definer
set search_path = public
as $$
  update public.knowledge_imports i
  set status = 'done', finished_at = now()
  where i.status in ('finding', 'reading')
    and not exists (
      select 1 from public.knowledge_jobs j where j.import_id = i.id and j.status in ('queued', 'running')
    );
$$;
