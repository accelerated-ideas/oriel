-- Voice calls can be turned off per assistant (Behavior page), leaving a
-- text-only chat. Visitors always need one way to talk, so typing can't be
-- off at the same time.
alter table public.agents
  add column voice_enabled boolean not null default true,
  add constraint agents_voice_or_text check (voice_enabled or text_mode_enabled);
