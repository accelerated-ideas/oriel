-- Assistants are known by the name people hear (assistant_name), with the
-- product name (site_name) optional. The separate internal name is gone.
alter table public.agents drop column name;
