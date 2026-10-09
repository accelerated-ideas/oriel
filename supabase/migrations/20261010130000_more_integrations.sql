-- Integrations beyond Stripe: Slack, Zendesk, Salesforce, HubSpot, Cal.com
-- and Calendly (src/lib/integrations). Each connection belongs to one
-- assistant, like Stripe's.

alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('stripe', 'slack', 'zendesk', 'salesforce', 'hubspot', 'calcom', 'calendly'));

-- Settings the owner picks after connecting (a Slack channel, an event type,
-- a ticket pipeline). `metadata` stays what the provider told us (account
-- names, IDs); `secret_encrypted` holds tokens, as JSON for the new providers.
alter table public.integrations add column config jsonb not null default '{}'::jsonb;

-- What an integration lets the assistant do appears as actions of kind
-- "integration", with config { capability, provider }: one action per
-- capability (create_ticket, book_meeting…), pointing at the connected
-- service that handles it.
alter table public.actions drop constraint actions_kind_check;
alter table public.actions add constraint actions_kind_check
  check (kind in ('http', 'client', 'stripe', 'integration'));

-- The visitor's time zone (from their browser), for offering meeting times
-- and talking about dates in their terms.
alter table public.conversations add column time_zone text;
