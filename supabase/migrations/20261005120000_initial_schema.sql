-- Initial schema for the voice agent platform.
-- Every table has RLS enabled with no policies: all reads/writes go through the
-- service role on the server, and authorization is enforced in application code.

create extension if not exists vector with schema extensions;

-------------------------------------------------------------------------------
-- Users & organizations
-------------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  creator_id uuid references public.users (id) on delete set null
);

create table public.users_organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create index users_organizations_user_id_idx on public.users_organizations (user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization_id uuid;
  display_name text;
begin
  insert into public.users (id, email) values (new.id, new.email);

  display_name := coalesce(split_part(new.email, '@', 1), 'My');

  insert into public.organizations (name, creator_id)
  values (display_name || '''s workspace', new.id)
  returning id into new_organization_id;

  insert into public.users_organizations (user_id, organization_id, role)
  values (new.id, new_organization_id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- Agents
-------------------------------------------------------------------------------

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  creator_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Internal label shown in the dashboard.
  name text not null,
  -- Persona: the name the assistant uses when talking.
  assistant_name text not null default 'Ava',
  -- The product/company the assistant represents.
  site_name text not null default '',
  site_url text not null default '',

  greeting text not null default 'Hey! What are you trying to do?',
  instructions text not null default '',
  language text not null default 'en',
  voice_id text not null,

  -- Appearance of the embedded bubble.
  accent_color text not null default '#FF5A36',
  launcher_label text not null default 'Ask anything',
  launcher_position text not null default 'right' check (launcher_position in ('left', 'right')),

  text_mode_enabled boolean not null default true,
  share_page_content boolean not null default true,
  feedback_interviews_enabled boolean not null default true,

  -- Built-in tool toggles: navigate, highlight, search_knowledge, capture_feedback, escalate.
  builtin_tools jsonb not null default
    '{"navigate": true, "highlight": true, "search_knowledge": true, "capture_feedback": true, "escalate": true}'::jsonb,

  handoff_email text,
  handoff_webhook_url text,

  -- Embedding security.
  allowed_origins text[] not null default '{}',
  identity_secret text not null,

  is_live boolean not null default true
);

create index agents_organization_id_idx on public.agents (organization_id);

-------------------------------------------------------------------------------
-- Knowledge
-------------------------------------------------------------------------------

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  kind text not null check (kind in ('text', 'file', 'url')),
  title text not null,
  url text,
  file_name text,
  mime_type text,

  content text not null default '',
  char_count integer not null default 0,
  chunk_count integer not null default 0,

  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'error')),
  error text
);

create index knowledge_sources_agent_id_idx on public.knowledge_sources (agent_id);

create table public.knowledge_chunks (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(768) not null
);

create index knowledge_chunks_agent_id_idx on public.knowledge_chunks (agent_id);
create index knowledge_chunks_source_id_idx on public.knowledge_chunks (source_id);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_knowledge_chunks(
  p_agent_id uuid,
  p_query_embedding extensions.vector(768),
  p_match_count integer default 6,
  p_min_similarity double precision default 0.35
)
returns table (
  chunk_id bigint,
  source_id uuid,
  source_title text,
  source_url text,
  content text,
  similarity double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.id as chunk_id,
    c.source_id,
    s.title as source_title,
    s.url as source_url,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id
  where c.agent_id = p_agent_id
    and s.status = 'ready'
    and 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-------------------------------------------------------------------------------
-- Site map: pages the assistant knows about and can navigate to
-------------------------------------------------------------------------------

create table public.site_pages (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  title text not null,
  path text not null,
  description text not null default '',
  requires_auth boolean not null default false
);

create index site_pages_agent_id_idx on public.site_pages (agent_id);

-------------------------------------------------------------------------------
-- Actions: tools exposed to the model (custom HTTP, in-page client actions, Stripe)
-------------------------------------------------------------------------------

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  kind text not null check (kind in ('http', 'client', 'stripe')),
  -- Tool name the model sees (snake_case).
  name text not null,
  title text not null default '',
  description text not null default '',
  enabled boolean not null default true,
  requires_confirmation boolean not null default false,
  requires_identity boolean not null default false,
  -- [{ name, type, description, required, enum? }]
  parameters jsonb not null default '[]'::jsonb,
  -- kind-specific config. http: { method, url, headers, body }, stripe: { operation, ... }
  config jsonb not null default '{}'::jsonb,

  unique (agent_id, name)
);

create index actions_agent_id_idx on public.actions (agent_id);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  provider text not null check (provider in ('stripe')),
  secret_encrypted text not null,
  metadata jsonb not null default '{}'::jsonb,

  unique (agent_id, provider)
);

-------------------------------------------------------------------------------
-- Conversations
-------------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  ended_at timestamptz,

  status text not null default 'active' check (status in ('active', 'ended')),
  used_voice boolean not null default false,
  used_text boolean not null default false,
  voice_seconds integer not null default 0,
  message_count integer not null default 0,

  visitor_id text not null,
  user_external_id text,
  user_email text,
  user_name text,
  user_verified boolean not null default false,
  user_attributes jsonb not null default '{}'::jsonb,
  stripe_customer_id text,

  host_origin text,
  page_url text,
  page_title text,
  page_text text,
  referrer text,
  user_agent text,
  country text,

  title text,
  summary text,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  resolved boolean
);

create index conversations_agent_id_created_at_idx on public.conversations (agent_id, created_at desc);
create index conversations_visitor_idx on public.conversations (agent_id, visitor_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),

  role text not null check (role in ('user', 'assistant', 'tool', 'event')),
  content text not null default '',
  channel text check (channel in ('voice', 'text')),

  tool_call_id text,
  tool_name text,
  tool_input jsonb,
  tool_output jsonb,
  -- Set on assistant tool calls that are executed in the browser.
  tool_target text check (tool_target in ('server', 'client')),
  -- Provider metadata on tool calls (e.g. Gemini thought signatures) replayed with history.
  provider_metadata jsonb,

  page_url text
);

create index messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);
create index messages_tool_call_id_idx on public.messages (conversation_id, tool_call_id);

create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.conversations
  set
    message_count = message_count + case when new.role in ('user', 'assistant') and new.content <> '' then 1 else 0 end,
    last_message_at = new.created_at,
    updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_bump_conversation
  after insert on public.messages
  for each row execute function public.bump_conversation_on_message();

-------------------------------------------------------------------------------
-- Insights: feedback, bugs and hand-offs captured during conversations
-------------------------------------------------------------------------------

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now(),

  type text not null check (type in ('bug', 'feature_request', 'confusion', 'complaint', 'praise', 'churn_risk', 'handoff', 'other')),
  title text not null,
  details text not null default '',
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  page_url text,
  user_email text
);

create index insights_agent_id_created_at_idx on public.insights (agent_id, created_at desc);

-------------------------------------------------------------------------------
-- Confirmations: sensitive actions must be confirmed in a later user turn
-------------------------------------------------------------------------------

create table public.action_confirmations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  action_name text not null,
  input_hash text not null,
  consumed_at timestamptz
);

create index action_confirmations_lookup_idx on public.action_confirmations (conversation_id, action_name, input_hash);

-------------------------------------------------------------------------------
-- RLS: deny by default; the service role bypasses RLS.
-------------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.users_organizations enable row level security;
alter table public.agents enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.site_pages enable row level security;
alter table public.actions enable row level security;
alter table public.integrations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.insights enable row level security;
alter table public.action_confirmations enable row level security;

grant execute on function public.match_knowledge_chunks(uuid, extensions.vector, integer, double precision) to service_role;
