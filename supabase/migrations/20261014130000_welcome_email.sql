-- When someone's welcome email went out (cloud edition, src/lib/emails/welcome.ts).
-- Everyone who signed up before it existed counts as welcomed.
alter table public.users add column welcome_email_sent_at timestamptz;

update public.users set welcome_email_sent_at = now();
