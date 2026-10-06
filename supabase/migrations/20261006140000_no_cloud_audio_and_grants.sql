-- VoicePad 1.1.5 audit, 2026-10-06. Applied to the live project the same day.
--
-- delete_user_account: Supabase now blocks SQL deletes on storage.objects
-- (trigger storage.protect_delete), so the function no longer touches storage.
-- The app deletes the user's legacy audio files through the Storage API first
-- (src/lib/storage.ts deleteAllCloudAudioForCurrentUser), then calls this RPC.
CREATE OR REPLACE FUNCTION public.delete_user_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'storage'
AS $function$
declare
  deleting_user uuid := auth.uid();
begin
  if deleting_user is null then
    raise exception 'Authentication required';
  end if;

  delete from public.voicepad_processing_jobs
    where user_id = deleting_user;

  delete from public.voicepad_usage
    where user_id = deleting_user;

  delete from public.voicepad_sync_conflicts
    where user_id = deleting_user;

  delete from public.voicepad_notes
    where user_id = deleting_user;

  delete from auth.users
    where id = deleting_user;
end;
$function$;

-- VoicePad 1.1.5 audit (2026-10-06): storage + function grants
-- 1) No audio is stored in the cloud (since 1.1.3): stop new uploads at the server.
drop policy if exists "Users can upload their own audio" on storage.objects;
drop policy if exists "Users can update their own audio" on storage.objects;
-- 2) Let a signed-in user delete files in their OWN folder, so note delete and
--    account delete can remove legacy (pre-1.1.3) recordings via the Storage API.
--    (Postgres can no longer delete storage.objects rows directly: storage.protect_delete.)
drop policy if exists "Users can delete their own audio" on storage.objects;
create policy "Users can delete their own audio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'voicepad-audio' and auth.uid()::text = (storage.foldername(name))[1]);
-- 3) Signed-out callers have no use for these functions.
revoke execute on function public.delete_user_account() from anon, public;
revoke execute on function public.consume_voicepad_usage(text, integer) from anon, public;
revoke execute on function public.create_voicepad_processing_job(text, text, text) from anon, public;
grant execute on function public.delete_user_account() to authenticated;
grant execute on function public.consume_voicepad_usage(text, integer) to authenticated;
grant execute on function public.create_voicepad_processing_job(text, text, text) to authenticated;
