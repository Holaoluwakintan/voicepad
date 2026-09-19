-- VoicePad production hardening: durable processing, quotas, conflicts, and deletion.

alter table public.voicepad_notes add column if not exists revision bigint not null default 1;
alter table public.voicepad_notes add column if not exists updated_by_device text;

-- Local device URIs are not portable. Keep the legacy column for compatibility,
-- but prevent new writes from treating it as cloud metadata in the client.
comment on column public.voicepad_notes.audio_uri is 'Deprecated legacy field; must remain NULL for new writes. Use audio_path.';

create table if not exists public.voicepad_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text not null references public.voicepad_notes(id) on delete cascade,
  local_payload jsonb not null,
  remote_payload jsonb not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists voicepad_sync_conflicts_user_idx on public.voicepad_sync_conflicts(user_id, status, created_at desc);
alter table public.voicepad_sync_conflicts enable row level security;
create policy "Users can manage their own sync conflicts" on public.voicepad_sync_conflicts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.voicepad_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text references public.voicepad_notes(id) on delete cascade,
  operation text not null check (operation in ('transcription', 'ocr', 'summary')),
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed', 'cancelled')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  provider text,
  provider_request_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz,
  unique(user_id, idempotency_key)
);
create index if not exists voicepad_processing_jobs_status_idx on public.voicepad_processing_jobs(status, next_retry_at);
create index if not exists voicepad_processing_jobs_user_idx on public.voicepad_processing_jobs(user_id, created_at desc);
alter table public.voicepad_processing_jobs enable row level security;
create policy "Users can read their own processing jobs" on public.voicepad_processing_jobs
  for select using (auth.uid() = user_id);
create policy "Users can create their own processing jobs" on public.voicepad_processing_jobs
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own processing jobs" on public.voicepad_processing_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.voicepad_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  transcription_count integer not null default 0,
  ocr_count integer not null default 0,
  summary_count integer not null default 0,
  audio_seconds bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);
alter table public.voicepad_usage enable row level security;
create policy "Users can read their own usage" on public.voicepad_usage
  for select using (auth.uid() = user_id);

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  deleting_user uuid := auth.uid();
begin
  if deleting_user is null then
    raise exception 'Authentication required';
  end if;

  delete from storage.objects
    where bucket_id = 'voicepad-audio'
      and name like deleting_user::text || '/%';
  delete from public.voicepad_processing_jobs where user_id = deleting_user;
  delete from public.voicepad_usage where user_id = deleting_user;
  delete from public.voicepad_sync_conflicts where user_id = deleting_user;
  delete from public.voicepad_notes where user_id = deleting_user;
  delete from auth.users where id = deleting_user;
end;
$$;
revoke all on function public.delete_user_account() from public;
grant execute on function public.delete_user_account() to authenticated;
