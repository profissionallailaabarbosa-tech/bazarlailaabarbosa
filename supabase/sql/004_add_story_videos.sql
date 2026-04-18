-- Adiciona suporte a ate 2 stories por produto.
-- Execute este script no SQL Editor do Supabase apos os scripts anteriores.

alter table public.products
  add column if not exists story_videos jsonb not null default '[]'::jsonb;

update public.products
set story_videos = case
  when coalesce(trim(video), '') = '' then '[]'::jsonb
  else jsonb_build_array(video)
end
where coalesce(jsonb_array_length(story_videos), 0) = 0;
