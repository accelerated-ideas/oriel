-- Bigger site maps (bulk imports, up to 10,000 pages depending on the plan).
-- Small ones go into the prompt whole; larger ones are searched by meaning and
-- by words each turn, the same way knowledge is (src/lib/site-map/search.ts).

alter table public.site_pages
  add column embedding extensions.vector(768),
  add column search_tsv tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      title || ' ' || regexp_replace(path, '[^[:alnum:]]+', ' ', 'g') || ' ' || description
    )
  ) stored;

create index site_pages_search_tsv_idx on public.site_pages using gin (search_tsv);
create index site_pages_agent_path_idx on public.site_pages (agent_id, path);

-- A changed name, path or description needs a new embedding.
create or replace function public.site_pages_reset_embedding()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title
    or new.path is distinct from old.path
    or new.description is distinct from old.description then
    new.embedding := null;
  end if;
  return new;
end;
$$;

create trigger site_pages_reset_embedding
  before update on public.site_pages
  for each row execute function public.site_pages_reset_embedding();

-- How big the site map is, without loading it.
create or replace function public.site_map_totals(p_agent_id uuid)
returns table (pages bigint, chars bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint,
         coalesce(sum(length(title) + length(path) + length(description) + 8), 0)::bigint
  from public.site_pages
  where agent_id = p_agent_id;
$$;

-- Which of these paths are already in an assistant's site map (for imports).
create or replace function public.existing_site_paths(p_agent_id uuid, p_paths text[])
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct path from public.site_pages where agent_id = p_agent_id and path = any(p_paths);
$$;

-- Saves embeddings for many pages at once: [{ "id": uuid, "embedding": "[...]" }].
create or replace function public.set_site_page_embeddings(p_rows jsonb)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.site_pages p
  set embedding = (r.value ->> 'embedding')::extensions.vector
  from jsonb_array_elements(p_rows) r
  where p.id = (r.value ->> 'id')::uuid;
$$;

-- The pages closest in meaning, merged with those sharing words with the
-- question (reciprocal rank fusion). Pages that aren't embedded yet are still
-- found by their words. A site map is at most 10,000 rows per assistant, so
-- this scans them rather than using a vector index.
create or replace function public.search_site_pages(
  p_agent_id uuid,
  p_query_embedding extensions.vector(768),
  p_keywords text,
  p_match_count integer default 12
)
returns table (id uuid, title text, path text, description text, requires_auth boolean, score double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with semantic as (
    select p.id, row_number() over (order by p.embedding <=> p_query_embedding) as rank
    from public.site_pages p
    where p.agent_id = p_agent_id and p.embedding is not null and p_query_embedding is not null
    order by p.embedding <=> p_query_embedding
    limit 30
  ),
  keyword as (
    select p.id,
           row_number() over (order by ts_rank_cd(p.search_tsv, to_tsquery('simple', p_keywords)) desc) as rank
    from public.site_pages p
    where p_keywords <> '' and p.agent_id = p_agent_id and p.search_tsv @@ to_tsquery('simple', p_keywords)
    order by ts_rank_cd(p.search_tsv, to_tsquery('simple', p_keywords)) desc
    limit 30
  ),
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + k.rank), 0) as score
    from semantic s
    full outer join keyword k on k.id = s.id
  )
  select p.id, p.title, p.path, p.description, p.requires_auth, f.score::double precision
  from fused f
  join public.site_pages p on p.id = f.id
  order by f.score desc
  limit p_match_count;
$$;

revoke execute on function public.site_map_totals(uuid) from public, anon, authenticated;
revoke execute on function public.existing_site_paths(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.set_site_page_embeddings(jsonb) from public, anon, authenticated;
revoke execute on function public.search_site_pages(uuid, extensions.vector, text, integer) from public, anon, authenticated;
