create table if not exists public.notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled note',
  content text not null default '',
  created_at timestamptz not null default now(),
  audio_uri text,
  source text not null default 'voice' check (source in ('voice', 'text')),
  category text not null default 'Personal' check (category in ('Lectures', 'Sermons', 'Meetings', 'Personal')),
  duration_seconds integer,
  pinned boolean not null default false,
  transcript text,
  transcription_status text check (transcription_status in ('pending', 'ready', 'failed')),
  transcription_error text
);

create index if not exists notes_user_created_idx on public.notes (user_id, created_at desc);

alter table public.notes enable row level security;

drop policy if exists "Users can read their own notes" on public.notes;
create policy "Users can read their own notes" on public.notes for select using (auth.uid() = user_id);

drop policy if exists "Users can create their own notes" on public.notes;
create policy "Users can create their own notes" on public.notes for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes" on public.notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes" on public.notes for delete using (auth.uid() = user_id);
