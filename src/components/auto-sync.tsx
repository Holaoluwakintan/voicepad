/**
 * Keeps signed-in users' notes synced automatically (text only, never audio):
 * right after sign-in, a few seconds after any note is created, edited or deleted,
 * and when the app comes back to the foreground. Guests are never synced.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { onNotesChanged } from '@/lib/notes';
import { syncNotes } from '@/lib/sync';

const EDIT_DEBOUNCE_MS = 2500;
const FOREGROUND_MIN_GAP_MS = 30_000;

export function AutoSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const lastSyncAt = useRef(0);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      lastSyncAt.current = Date.now();
      syncNotes(userId).catch(() => {});
    };

    run(); // sign-in, app start while signed in, or account switch

    const unsubscribeNotes = onNotesChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, EDIT_DEBOUNCE_MS);
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastSyncAt.current > FOREGROUND_MIN_GAP_MS) run();
      // Flush a pending edit right away when the app goes to the background.
      if (state === 'background' && timer) {
        clearTimeout(timer);
        timer = null;
        run();
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribeNotes();
      appStateSub.remove();
    };
  }, [userId]);

  return null;
}
