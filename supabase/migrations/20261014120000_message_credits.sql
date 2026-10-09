-- Message credits for paid plans (cloud edition), granted by Stripe invoices.
--   * Each paid subscription invoice grants messages: a new billing period
--     (first payment, renewal) resets them to the plan's monthly messages; an
--     upgrade adds the prorated difference for the rest of the month.
--   * Downgrades wait for the next billing date as a Stripe subscription
--     schedule; the scheduled_* columns show it on the Billing page.
-- 20261014140000_message_credit_balance.sql turns this into a stored balance
-- that each visitor message draws from, with a monthly refill for yearly plans.

alter table public.organizations
  -- Messages for the month that starts at credits_window_start.
  add column message_credits integer not null default 0,
  -- The plan those messages were granted for.
  add column credits_plan_id text,
  -- The paid billing period, from the last paid invoice.
  add column credits_period_start timestamptz,
  add column credits_period_end timestamptz,
  add column credits_window_start timestamptz,
  add column scheduled_plan_id text,
  add column scheduled_billing_period text check (scheduled_billing_period in ('monthly', 'annual')),
  add column scheduled_change_at timestamptz;

-- One row per invoice that granted messages, so a webhook delivered twice
-- grants once.
create table public.billing_credit_grants (
  stripe_invoice_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Stripe's billing_reason: subscription_create, subscription_cycle or subscription_update.
  reason text not null,
  -- The new total for a new period, or what was added (or taken) for a plan change.
  credits integer not null,
  created_at timestamptz not null default now()
);

alter table public.billing_credit_grants enable row level security;

create index billing_credit_grants_organization_id_idx on public.billing_credit_grants (organization_id);

-- Records the grant and applies it in one step. p_reset sets the credits to
-- p_credits for a new month; otherwise p_credits is added to the current ones.
-- Returns false when this invoice already granted messages.
create or replace function public.grant_message_credits(
  p_organization_id uuid,
  p_invoice_id text,
  p_reason text,
  p_credits integer,
  p_reset boolean,
  p_plan_id text,
  p_window_start timestamptz,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.billing_credit_grants (stripe_invoice_id, organization_id, reason, credits)
  values (p_invoice_id, p_organization_id, p_reason, p_credits)
  on conflict (stripe_invoice_id) do nothing;
  if not found then
    return false;
  end if;

  update public.organizations
  set
    message_credits = greatest(0, case when p_reset then p_credits else message_credits + p_credits end),
    credits_plan_id = p_plan_id,
    credits_window_start = p_window_start,
    credits_period_start = p_period_start,
    credits_period_end = p_period_end
  where id = p_organization_id;
  return true;
end;
$$;

revoke execute on function public.grant_message_credits(uuid, text, text, integer, boolean, text, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
