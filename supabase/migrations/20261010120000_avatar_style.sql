-- How the assistant is drawn: the glossy orb, a face, or a hive of dots.
alter table public.agents
  add column avatar_style text not null default 'orb' check (avatar_style in ('orb', 'face', 'hive'));
