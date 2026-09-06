create table if not exists public.voicepad_notes (
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

create index if not exists voicepad_notes_user_created_idx on public.voicepad_notes (user_id, created_at desc);

alter table public.voicepad_notes enable row level security;

drop policy if exists "VoicePad users can read their own notes" on public.voicepad_notes;
create policy "VoicePad users can read their own notes" on public.voicepad_notes for select using (auth.uid() = user_id);

drop policy if exists "VoicePad users can create their own notes" on public.voicepad_notes;
create policy "VoicePad users can create their own notes" on public.voicepad_notes for insert with check (auth.uid() = user_id);

drop policy if exists "VoicePad users can update their own notes" on public.voicepad_notes;
create policy "VoicePad users can update their own notes" on public.voicepad_notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "VoicePad users can delete their own notes" on public.voicepad_notes;
create policy "VoicePad users can delete their own notes" on public.voicepad_notes for delete using (auth.uid() = user_id);
