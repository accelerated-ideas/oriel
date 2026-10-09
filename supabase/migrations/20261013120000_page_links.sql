-- Where the links on the visitor's current page go, next to its text, so the
-- assistant can open an item listed there. Only kept when the assistant reads
-- the page (agents.share_page_content), like page_text.
alter table public.conversations add column page_links jsonb;
