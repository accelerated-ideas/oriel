-- Reporting queries for the usage page (per workspace) and our cost overview.
-- Service role only.

-- Conversations, visitor messages and call time per day and assistant.
-- Pass no workspace to get every workspace.
create or replace function public.usage_counts(p_from timestamptz, p_to timestamptz, p_organization_id uuid default null)
returns table (day date, organization_id uuid, agent_id uuid, conversations bigint, messages bigint, voice_seconds bigint)
language sql
stable
security definer
set search_path = public
as $$
  with conversation_days as (
    select date(c.created_at) as day, c.organization_id, c.agent_id,
           count(*) as conversations, sum(c.voice_seconds)::bigint as voice_seconds
    from conversations c
    where c.created_at >= p_from and c.created_at < p_to and c.message_count > 1
      and (p_organization_id is null or c.organization_id = p_organization_id)
    group by 1, 2, 3
  ),
  message_days as (
    select date(m.created_at) as day, c.organization_id, c.agent_id, count(*) as messages
    from messages m
    join conversations c on c.id = m.conversation_id
    where m.role = 'user' and m.created_at >= p_from and m.created_at < p_to
      and (p_organization_id is null or c.organization_id = p_organization_id)
    group by 1, 2, 3
  )
  select coalesce(cd.day, md.day), coalesce(cd.organization_id, md.organization_id), coalesce(cd.agent_id, md.agent_id),
         coalesce(cd.conversations, 0), coalesce(md.messages, 0), coalesce(cd.voice_seconds, 0)
  from conversation_days cd
  full outer join message_days md
    on md.day = cd.day and md.organization_id = cd.organization_id and md.agent_id = cd.agent_id
  order by 1;
$$;

-- What we spent, grouped by workspace, stage, purpose and model.
create or replace function public.cost_breakdown(p_from timestamptz, p_to timestamptz)
returns table (
  organization_id uuid, stage text, purpose text, model_id text, events bigint, turns bigint, cost_usd numeric,
  input_tokens bigint, cached_input_tokens bigint, output_tokens bigint, characters bigint, audio_seconds numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select organization_id, stage, purpose, model_id, count(*), count(distinct turn_id), sum(cost_usd),
         sum(input_tokens), sum(cached_input_tokens), sum(output_tokens), sum(characters), sum(audio_seconds)
  from usage_events
  where created_at >= p_from and created_at < p_to
  group by 1, 2, 3, 4;
$$;

-- The conversations that cost us the most.
create or replace function public.costliest_conversations(p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (conversation_id uuid, organization_id uuid, agent_id uuid, cost_usd numeric, turns bigint)
language sql
stable
security definer
set search_path = public
as $$
  select conversation_id, organization_id, (array_agg(agent_id))[1], sum(cost_usd), count(distinct turn_id)
  from usage_events
  where created_at >= p_from and created_at < p_to and conversation_id is not null
  group by conversation_id, organization_id
  order by sum(cost_usd) desc
  limit p_limit;
$$;

revoke all on function public.usage_counts(timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.cost_breakdown(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.costliest_conversations(timestamptz, timestamptz, integer) from public, anon, authenticated;
