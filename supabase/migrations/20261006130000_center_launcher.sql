-- The launcher can also sit at the bottom center of the page.
alter table public.agents drop constraint if exists agents_launcher_position_check;
alter table public.agents
  add constraint agents_launcher_position_check check (launcher_position in ('left', 'center', 'right'));
