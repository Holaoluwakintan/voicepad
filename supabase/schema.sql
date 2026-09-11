-- ==============================================================================
-- VoicePad: PostgreSQL Database Schema & Cloud Storage Setup
-- ==============================================================================

-- 1. Notes Table
create table if not exists public.voicepad_notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled note',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz default null,
  audio_uri text,
  audio_path text,
  source text not null default 'voice' check (source in ('voice', 'text')),
  category text not null default 'Personal' check (category in ('Lectures', 'Sermons', 'Meetings', 'Personal')),
  duration_seconds integer,
  pinned boolean not null default false,
  transcript text,
  summary text,
  transcription_status text check (transcription_status in ('pending', 'ready', 'failed')),
  transcription_error text
);

-- Migration support if the table already existed previously
alter table public.voicepad_notes add column if not exists updated_at timestamptz not null default now();
alter table public.voicepad_notes add column if not exists deleted_at timestamptz default null;
alter table public.voicepad_notes add column if not exists audio_path text;
alter table public.voicepad_notes add column if not exists summary text;

-- Indexes for performance
create index if not exists voicepad_notes_user_created_idx on public.voicepad_notes (user_id, created_at desc);
create index if not exists voicepad_notes_user_updated_idx on public.voicepad_notes (user_id, updated_at desc);
create index if not exists voicepad_notes_user_deleted_idx on public.voicepad_notes (user_id, deleted_at);

-- Row Level Security (RLS)
alter table public.voicepad_notes enable row level security;

drop policy if exists "VoicePad users can read their own notes" on public.voicepad_notes;
create policy "VoicePad users can read their own notes" on public.voicepad_notes
  for select using (auth.uid() = user_id);

drop policy if exists "VoicePad users can create their own notes" on public.voicepad_notes;
create policy "VoicePad users can create their own notes" on public.voicepad_notes
  for insert with check (auth.uid() = user_id);

drop policy if exists "VoicePad users can update their own notes" on public.voicepad_notes;
create policy "VoicePad users can update their own notes" on public.voicepad_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "VoicePad users can delete their own notes" on public.voicepad_notes;
create policy "VoicePad users can delete their own notes" on public.voicepad_notes
  for delete using (auth.uid() = user_id);

-- Automatic updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_voicepad_notes_updated_at on public.voicepad_notes;
create trigger set_voicepad_notes_updated_at
before update on public.voicepad_notes
for each row execute function public.set_updated_at();

-- ==============================================================================
-- 2. Supabase Storage: 'voicepad-audio' Bucket
-- Execute the following in your Supabase SQL Editor to enable audio file uploads:
-- ==============================================================================

-- Create private bucket for voice recordings (if not already created in dashboard)
insert into storage.buckets (id, name, public)
values ('voicepad-audio', 'voicepad-audio', false)
on conflict (id) do nothing;

-- Storage RLS: Users can only upload, read, and delete within their own folder: ${auth.uid()}/*
drop policy if exists "Users can upload their own audio" on storage.objects;
create policy "Users can upload their own audio" on storage.objects
  for insert with check (
    bucket_id = 'voicepad-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can read their own audio" on storage.objects;
create policy "Users can read their own audio" on storage.objects
  for select using (
    bucket_id = 'voicepad-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own audio" on storage.objects;
create policy "Users can update their own audio" on storage.objects
  for update using (
    bucket_id = 'voicepad-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own audio" on storage.objects;
create policy "Users can delete their own audio" on storage.objects
  for delete using (
    bucket_id = 'voicepad-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
