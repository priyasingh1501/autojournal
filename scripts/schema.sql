-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/hgodsuwrdpmaqcdetjjn/sql)

create table if not exists wisdom_shorts (
  id                  text primary key,
  title               text not null,
  short               text not null,
  pullquote           text not null,
  source_author       text not null,
  source_url          text default '',
  source_type         text not null default 'talk',
  themes              text[] default '{}',
  emotional_states    text[] default '{}',
  cognitive_patterns  text[] default '{}',
  values              text[] default '{}',
  enneagram_resonance int[] default '{}',
  cognitive_style     text[] default '{}',
  depth               text not null default 'mid',
  image_url           text,
  image_prompt        text,
  created_at          timestamptz default now()
);

-- Allow anyone to read (public app)
alter table wisdom_shorts enable row level security;

create policy "Public read"
  on wisdom_shorts for select
  using (true);
