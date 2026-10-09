-- The default widget color moved from orange to iris. Assistants still on the
-- old default get the new one; anything a team picked themselves is kept.
alter table public.agents alter column accent_color set default '#6352F2';
update public.agents set accent_color = '#6352F2' where upper(accent_color) = '#FF5A36';
