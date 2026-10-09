-- "Powered by Oriel" in the widget. Owners can turn it off where their plan
-- allows it (src/lib/billing/limits.ts, canRemoveBranding); it shows again if
-- the plan stops allowing it.
alter table public.agents add column show_branding boolean not null default true;
