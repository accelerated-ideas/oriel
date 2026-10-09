-- Workspaces (organizations) as the unit of billing and membership.
--   * A workspace has a plan. New workspaces start on a 14-day trial, but each
--     person gets one trial: workspaces they create after that need a plan.
--   * People join workspaces by invitation. Accepting an invitation doesn't
--     create a workspace of their own; signing up without one does (on first
--     visit to the dashboard, see ensure_personal_organization).
-- Plans and billing only matter in the cloud edition (src/config/edition.ts).

-------------------------------------------------------------------------------
-- Billing on workspaces
-------------------------------------------------------------------------------

alter table public.organizations
  add column plan_id text not null default 'trial',
  add column billing_period text check (billing_period in ('monthly', 'annual')),
  add column trial_ends_at timestamptz,
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  -- Stripe's subscription status: active, trialing, past_due, canceled, unpaid, incomplete…
  add column subscription_status text,
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false;

update public.organizations set trial_ends_at = created_at + interval '14 days';

-- When this person used their one trial.
alter table public.users add column trial_started_at timestamptz;

update public.users u set trial_started_at = (
  select min(o.created_at) from public.organizations o where o.creator_id = u.id
);

-------------------------------------------------------------------------------
-- Invitations
-------------------------------------------------------------------------------

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  -- The secret in the invitation link. Kept so admins can copy the link again.
  token text not null unique,
  invited_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

create unique index organization_invitations_email_idx
  on public.organization_invitations (organization_id, lower(email));
create index organization_invitations_lower_email_idx on public.organization_invitations (lower(email));

alter table public.organization_invitations enable row level security;

-------------------------------------------------------------------------------
-- Creating workspaces
-------------------------------------------------------------------------------

-- Sign-up no longer creates a workspace (an invited person shouldn't get an
-- empty one). It only records the user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email) values (new.id, new.email);
  return new;
end;
$$;

-- Creates a workspace owned by the user. It gets a trial only if the user
-- hasn't had one yet.
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

  insert into public.organizations (name, creator_id, trial_ends_at)
  values (p_name, p_user_id, case when gets_trial then now() + interval '14 days' else now() end)
  returning id into new_id;

  insert into public.users_organizations (user_id, organization_id, role)
  values (p_user_id, new_id, 'owner');

  if gets_trial then
    update public.users set trial_started_at = now() where id = p_user_id;
  end if;

  return new_id;
end;
$$;

-- The user's first workspace, created on first visit if they have none.
-- Safe to call concurrently (one lock per user).
create or replace function public.ensure_personal_organization(p_user_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ensure_personal_organization:' || p_user_id::text));

  select organization_id into existing
  from public.users_organizations
  where user_id = p_user_id
  order by created_at
  limit 1;

  if existing is not null then
    return existing;
  end if;

  return public.create_organization(p_user_id, p_name);
end;
$$;

revoke execute on function public.create_organization(uuid, text) from public, anon, authenticated;
revoke execute on function public.ensure_personal_organization(uuid, text) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Plan limits
-------------------------------------------------------------------------------

-- Messages visitors sent to a workspace's assistants since a point in time.
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
    and m.created_at >= p_since;
$$;

revoke execute on function public.organization_message_count(uuid, timestamptz) from public, anon, authenticated;

create index if not exists conversations_organization_id_idx on public.conversations (organization_id);
