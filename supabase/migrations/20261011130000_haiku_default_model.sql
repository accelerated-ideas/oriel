-- Claude Haiku 5.5 answers by default, with Gemini 3.8 Flash as the fallback.
-- Assistants still on the previous defaults move over; any other choice stays.
alter table public.agents
  alter column chat_model set default 'claude-haiku-5-5',
  alter column fallback_model set default 'gemini-3.8-flash';

update public.agents
set chat_model = 'claude-haiku-5-5', fallback_model = 'gemini-3.8-flash'
where chat_model = 'gemini-3.8-flash' and fallback_model = 'claude-haiku-5-5';
