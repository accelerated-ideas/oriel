-- What each conversation cost us: one row per model call (transcription, LLM
-- or text-to-speech). Internal only; customers see message counts instead.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  -- Groups the calls behind one reply (the LLM steps plus its speech).
  turn_id uuid,
  stage text not null check (stage in ('transcription', 'llm', 'tts')),
  purpose text not null default 'reply' check (purpose in ('reply', 'summary', 'call')),
  provider text not null,
  model_id text not null,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  characters integer,
  audio_seconds numeric(10, 2),
  cost_usd numeric(12, 6) not null default 0,
  pricing_version text not null,
  created_at timestamptz not null default now()
);

create index usage_events_organization_created_idx on public.usage_events (organization_id, created_at desc);
create index usage_events_created_idx on public.usage_events (created_at desc);
create index usage_events_conversation_idx on public.usage_events (conversation_id);

alter table public.usage_events enable row level security;
