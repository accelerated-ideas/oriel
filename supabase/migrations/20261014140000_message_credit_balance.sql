-- Message credits become a stored balance (cloud edition):
--   * Grants set it or add to it: the trial when a workspace starts one, every
--     paid Stripe invoice (first payment, renewal, upgrade), and an hourly
--     cron that refills yearly plans on each monthly billing date
--     (/api/billing/refill).
--   * Each visitor message takes one credit (the trigger below).
--   * Assistants answer while the balance is above zero.

alter table public.organizations
  -- What this month's grants added up to, for the Billing page.
  add column message_allowance integer not null default 0,
  -- When the next refill is due: the next monthly billing date. The cron
  -- refills when it's inside the paid period (yearly plans); otherwise the
  -- renewal invoice does.
  add column credits_renew_at timestamptz,
  drop column credits_window_start;

comment on column public.organizations.message_credits is 'Messages left this month.';

create index organizations_credits_renew_at_idx on public.organizations (credits_renew_at) where credits_renew_at is not null;

-- Grants aren't only invoices any more: the key is an invoice id, or the
-- workspace and month for a cron refill.
alter table public.billing_credit_grants rename column stripe_invoice_id to grant_key;

drop function public.grant_message_credits(uuid, text, text, integer, boolean, text, timestamptz, timestamptz, timestamptz);

-- Records the grant and applies it in one step. p_reset starts a new month
-- with p_credits; otherwise p_credits is added (or taken, for a change to a
-- smaller plan) for the rest of this one. Returns false when the key was
-- already used.
create function public.grant_message_credits(
  p_organization_id uuid,
  p_key text,
  p_reason text,
  p_credits integer,
  p_reset boolean,
  p_plan_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_renew_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.billing_credit_grants (grant_key, organization_id, reason, credits)
  values (p_key, p_organization_id, p_reason, p_credits)
  on conflict (grant_key) do nothing;
  if not found then
    return false;
  end if;

  update public.organizations
  set
    message_allowance = greatest(0, case when p_reset then p_credits else message_allowance + p_credits end),
    message_credits = greatest(0, case when p_reset then p_credits else message_credits + p_credits end),
    credits_plan_id = p_plan_id,
    credits_period_start = p_period_start,
    credits_period_end = p_period_end,
    -- A plan change never moves the next refill back, even when its webhook
    -- comes in after the month it was for.
    credits_renew_at = case when p_reset then p_renew_at else greatest(coalesce(credits_renew_at, p_renew_at), p_renew_at) end
  where id = p_organization_id;
  return true;
end;
$$;

revoke execute on function public.grant_message_credits(uuid, text, text, integer, boolean, text, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;

-- Each message a visitor sends takes one credit.
create function public.use_message_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.organizations o
  set message_credits = greatest(0, o.message_credits - 1)
  from public.conversations c
  where c.id = new.conversation_id and o.id = c.organization_id;
  return new;
end;
$$;

revoke execute on function public.use_message_credit() from public, anon, authenticated;

create trigger messages_use_credit
  after insert on public.messages
  for each row
  when (new.role = 'user')
  execute function public.use_message_credit();

-- A new workspace with a trial starts with the trial's messages (the trial
-- plan in src/config/subscription-plans.ts: 14 days, 100 messages).
create or replace function public.create_organization(p_user_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  gets_trial boolean;
begin
  select trial_started_at is null into gets_trial from public.users where id = p_user_id for update;

  insert into public.organizations (name, creator_id, trial_ends_at, message_allowance, message_credits)
  values (
    p_name,
    p_user_id,
    case when gets_trial then now() + interval '14 days' else now() end,
    case when gets_trial then 100 else 0 end,
    case when gets_trial then 100 else 0 end
  )
  returning id into new_id;

  insert into public.users_organizations (user_id, organization_id, role)
  values (p_user_id, new_id, 'owner');

  if gets_trial then
    update public.users set trial_started_at = now() where id = p_user_id;
  end if;

  return new_id;
end;
$$;

-- Existing workspaces:
--   * On a trial: its 100 messages, minus what visitors sent since it began.
--   * On a plan: refilled from the plan on the cron's next run.
update public.organizations o
set
  message_allowance = 100,
  message_credits = greatest(0, 100 - public.organization_message_count(o.id, o.trial_ends_at - interval '14 days'))
where o.stripe_subscription_id is null
  and o.plan_id = 'trial'
  and o.trial_ends_at > now();

update public.organizations
set credits_renew_at = now()
where subscription_status in ('active', 'trialing', 'past_due')
  and plan_id <> 'trial';
