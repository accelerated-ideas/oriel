-- A visitor message the assistant answers by closing the conversation (the
-- end_call or end_chat tool, after a goodbye) isn't billed. It's still stored
-- and shown; it just doesn't count toward usage.

alter table public.messages add column billable boolean not null default true;

-- Conversations, billable visitor messages and call time per day and assistant.
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
    where m.role = 'user' and m.billable and m.created_at >= p_from and m.created_at < p_to
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

-- Billable visitor messages to a workspace's assistants since a point in time.
create or replace function public.organization_message_count(p_organization_id uuid, p_since timestamptz)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where c.organization_id = p_organization_id
    and m.role = 'user'
    and m.billable
    and m.created_at >= p_since;
$$;

revoke execute on function public.usage_counts(timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.organization_message_count(uuid, timestamptz) from public, anon, authenticated;
