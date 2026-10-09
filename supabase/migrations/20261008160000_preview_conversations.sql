-- Conversations from the dashboard's "Try it" preview: a team member testing
-- the assistant, not a visitor. The assistant is told so (it shouldn't treat
-- them as logged out), and the dashboard can tell them apart.
alter table public.conversations add column is_preview boolean not null default false;
