-- The model that writes each assistant's replies, and the one that takes over
-- when it fails or doesn't answer in time (null: none). The app checks the
-- values against src/config/ai.ts, so new models don't need a migration.
alter table public.agents
  add column chat_model text not null default 'gemini-3.8-flash',
  add column fallback_model text default 'claude-haiku-5-5';
