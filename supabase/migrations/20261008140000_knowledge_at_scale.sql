-- Knowledge at scale (README, "Knowledge"):
--   * Website imports run as background jobs, in batches, and resume if cut off.
--   * Pages are refreshed and skipped when unchanged (content_hash).
--   * Search combines meaning (embeddings) with exact words (full-text).
--   * A few sources can be pinned to always be in the assistant's prompt.

-------------------------------------------------------------------------------
-- Imports and jobs
-------------------------------------------------------------------------------

-- One website import: found pages become sources linked back to it.
create table public.knowledge_imports (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  url text not null,
  page_limit integer not null,
  status text not null default 'finding' check (status in ('finding', 'reading', 'done', 'failed', 'canceled')),
  pages_found integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index knowledge_imports_agent_idx on public.knowledge_imports (agent_id, created_at desc);
alter table public.knowledge_imports enable row level security;

alter table public.knowledge_sources
  add column import_id uuid references public.knowledge_imports (id) on delete set null,
  -- sha256 of the extracted text; an unchanged page isn't embedded again.
  add column content_hash text,
  add column fetched_at timestamptz,
  -- The page only had content after running its JavaScript in a browser.
  add column rendered boolean not null default false,
  -- Always in the assistant's prompt, whatever the question.
  add column always_include boolean not null default false;

create index knowledge_sources_import_idx on public.knowledge_sources (import_id);
create index knowledge_sources_agent_url_idx on public.knowledge_sources (agent_id, url) where kind = 'url';
create index knowledge_sources_refresh_idx on public.knowledge_sources (fetched_at) where kind = 'url';

-- Work for the background worker (/api/knowledge/worker).
--   find   discover an import's pages and queue them
--   index  read, chunk and embed one source
create table public.knowledge_jobs (
  id bigint generated always as identity primary key,
  agent_id uuid not null references public.agents (id) on delete cascade,
  kind text not null check (kind in ('find', 'index')),
  import_id uuid references public.knowledge_imports (id) on delete cascade,
  source_id uuid references public.knowledge_sources (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  attempts integer not null default 0,
  -- A running job whose lease ran out (the worker died) is picked up again.
  locked_until timestamptz,
  run_after timestamptz not null default now(),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index knowledge_jobs_queue_idx on public.knowledge_jobs (run_after) where status in ('queued', 'running');
create index knowledge_jobs_import_idx on public.knowledge_jobs (import_id);
create unique index knowledge_jobs_one_open_per_source on public.knowledge_jobs (source_id)
  where status in ('queued', 'running') and source_id is not null;
alter table public.knowledge_jobs enable row level security;

-- Takes up to p_limit jobs that are due, or whose worker stopped renewing them.
create or replace function public.claim_knowledge_jobs(p_limit integer, p_lease_seconds integer)
returns setof public.knowledge_jobs
language sql
security definer
set search_path = public
as $$
  update public.knowledge_jobs j
  set status = 'running',
      locked_until = now() + make_interval(secs => p_lease_seconds),
      attempts = j.attempts + 1
  where j.id in (
    select id
    from public.knowledge_jobs
    where (status = 'queued' and run_after <= now()) or (status = 'running' and locked_until < now())
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
$$;

-- Queues indexing for sources that don't already have an open job.
create or replace function public.queue_index_jobs(p_source_ids uuid[], p_import_id uuid default null)
returns integer
language sql
security definer
set search_path = public
as $$
  with queued as (
    insert into public.knowledge_jobs (agent_id, kind, import_id, source_id)
    select s.agent_id, 'index', p_import_id, s.id
    from public.knowledge_sources s
    where s.id = any (p_source_ids)
      and not exists (
        select 1 from public.knowledge_jobs j
        where j.source_id = s.id and j.status in ('queued', 'running')
      )
    returning 1
  )
  select count(*)::integer from queued;
$$;

-- Website pages not read for a while, for the daily refresh.
create or replace function public.queue_stale_sources(p_older_than interval, p_limit integer)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.queue_index_jobs(array(
    select id from public.knowledge_sources
    where kind = 'url' and status in ('ready', 'error') and coalesce(fetched_at, created_at) < now() - p_older_than
    order by coalesce(fetched_at, created_at)
    limit p_limit
  ));
$$;

revoke execute on function public.claim_knowledge_jobs(integer, integer) from public, anon, authenticated;
revoke execute on function public.queue_index_jobs(uuid[], uuid) from public, anon, authenticated;
revoke execute on function public.queue_stale_sources(interval, integer) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Search: meaning + exact words
-------------------------------------------------------------------------------

-- "simple" doesn't stem or drop stop words, so it works for every language.
alter table public.knowledge_chunks
  add column content_tsv tsvector generated always as (to_tsvector('simple', content)) stored;

create index knowledge_chunks_content_tsv_idx on public.knowledge_chunks using gin (content_tsv);

-- The closest chunks by meaning and the best keyword matches, merged with
-- weighted reciprocal rank fusion (meaning counts double).
--   * Keyword search only uses words that are rare in this assistant's
--     knowledge (in at most 2% of its chunks): common words like "account"
--     would otherwise pull in any chunk that happens to mention them.
--   * A keyword hit needs two of those words, or one containing a digit (an
--     error code, a SKU), unless the question has only one.
--   * Iterative index scans keep the vector index useful when it's filtered
--     down to one assistant among many.
create or replace function public.search_knowledge(
  p_agent_id uuid,
  p_query_embedding extensions.vector(768),
  p_keywords text,
  p_match_count integer default 6,
  p_candidates integer default 20,
  p_min_similarity double precision default 0.25
)
returns table (
  chunk_id bigint,
  source_id uuid,
  source_title text,
  source_url text,
  content text,
  score double precision
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  chunk_total bigint;
  rare text[] := '{}';
  term text;
  frequency bigint;
begin
  -- Set here rather than on the function: declaring it there needs more privileges.
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);

  if p_keywords <> '' then
    select count(*) into chunk_total from public.knowledge_chunks where agent_id = p_agent_id;
    foreach term in array string_to_array(p_keywords, ' | ') loop
      select count(*) into frequency
      from public.knowledge_chunks c
      where c.agent_id = p_agent_id and c.content_tsv @@ to_tsquery('simple', term);
      if frequency > 0 and frequency <= greatest(3, chunk_total * 0.02) then
        rare := rare || term;
      end if;
    end loop;
  end if;

  return query
  with nearest as materialized (
    select c.id, c.embedding <=> p_query_embedding as distance
    from public.knowledge_chunks c
    where c.agent_id = p_agent_id
    order by c.embedding <=> p_query_embedding
    limit p_candidates
  ),
  semantic as (
    select n.id, row_number() over (order by n.distance) as rank
    from nearest n
    where 1 - n.distance >= p_min_similarity
  ),
  matches as (
    select c.id,
           (select count(*) from unnest(rare) r (t) where c.content_tsv @@ to_tsquery('simple', r.t)) as matched,
           exists (select 1 from unnest(rare) r (t) where r.t ~ '[0-9]' and c.content_tsv @@ to_tsquery('simple', r.t)) as code,
           ts_rank_cd(c.content_tsv, to_tsquery('simple', array_to_string(rare, ' | '))) as relevance
    from public.knowledge_chunks c
    where cardinality(rare) > 0
      and c.agent_id = p_agent_id
      and c.content_tsv @@ to_tsquery('simple', array_to_string(rare, ' | '))
  ),
  keyword as (
    select m.id, row_number() over (order by m.matched desc, m.relevance desc) as rank
    from matches m
    where m.code or m.matched >= least(2, cardinality(rare))
    order by m.matched desc, m.relevance desc
    limit p_candidates
  ),
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (60 + s.rank), 0) + coalesce(0.5 / (60 + k.rank), 0) as score
    from semantic s
    full outer join keyword k on k.id = s.id
  )
  select c.id, c.source_id, src.title, src.url, c.content, f.score::double precision
  from fused f
  join public.knowledge_chunks c on c.id = f.id
  join public.knowledge_sources src on src.id = c.source_id
  where src.status = 'ready' and not src.always_include
  order by f.score desc
  limit p_match_count;
end;
$$;

drop function if exists public.match_knowledge_chunks(uuid, extensions.vector, integer, double precision);

-------------------------------------------------------------------------------
-- Cost tracking for embeddings
-------------------------------------------------------------------------------

alter table public.usage_events drop constraint usage_events_stage_check;
alter table public.usage_events add constraint usage_events_stage_check
  check (stage in ('transcription', 'llm', 'tts', 'embedding'));
alter table public.usage_events drop constraint usage_events_purpose_check;
alter table public.usage_events add constraint usage_events_purpose_check
  check (purpose in ('reply', 'summary', 'call', 'knowledge', 'search'));

-------------------------------------------------------------------------------
-- Sizes, without loading every source
-------------------------------------------------------------------------------

-- Characters of ready knowledge across a workspace (the plan limit counts this).
create or replace function public.knowledge_characters_used(p_organization_id uuid, p_excluding uuid default null)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(char_count), 0)::bigint
  from public.knowledge_sources
  where organization_id = p_organization_id and status = 'ready' and (p_excluding is null or id <> p_excluding);
$$;

-- An assistant's ready knowledge, and how much of it is pinned.
create or replace function public.knowledge_totals(p_agent_id uuid)
returns table (total_chars bigint, pinned_chars bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(char_count), 0)::bigint,
         coalesce(sum(char_count) filter (where always_include), 0)::bigint
  from public.knowledge_sources
  where agent_id = p_agent_id and status = 'ready';
$$;

revoke execute on function public.knowledge_characters_used(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.knowledge_totals(uuid) from public, anon, authenticated;

-- Recent imports with how many of their pages are ready, failed or waiting.
create or replace function public.knowledge_import_progress(p_agent_id uuid, p_limit integer default 5)
returns table (
  id uuid, url text, status text, page_limit integer, pages_found integer, error text,
  created_at timestamptz, finished_at timestamptz, ready bigint, failed bigint, waiting bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.url, i.status, i.page_limit, i.pages_found, i.error, i.created_at, i.finished_at,
         count(s.id) filter (where s.status = 'ready'),
         count(s.id) filter (where s.status = 'error'),
         count(s.id) filter (where s.status in ('pending', 'processing'))
  from (select * from public.knowledge_imports where agent_id = p_agent_id order by created_at desc limit p_limit) i
  left join public.knowledge_sources s on s.import_id = i.id
  group by i.id, i.url, i.status, i.page_limit, i.pages_found, i.error, i.created_at, i.finished_at
  order by i.created_at desc;
$$;

revoke execute on function public.knowledge_import_progress(uuid, integer) from public, anon, authenticated;

-- Imports with nothing left to do are done (e.g. their remaining pages were
-- deleted while queued).
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

revoke execute on function public.settle_knowledge_imports() from public, anon, authenticated;
