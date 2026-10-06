import { Session, User } from '@supabase/supabase-js';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { isSupabaseConfigured, supabase } from './supabase';
import { deleteAllCloudAudioForCurrentUser } from './storage';
import { toFriendlyErrorMessage } from '@/lib/utils';

WebBrowser.maybeCompleteAuthSession();

let pendingExchange: Promise<Session | null> | null = null;

/**
 * Completes an OAuth redirect URL (voicepad://auth/callback?code=… or #access_token=…).
 * The same URL can reach us twice on Android (browser result + deep link to
 * /auth/callback); the single in-flight promise makes the code exchange run once.
 */
/**
 * Supabase reports provider failures in the redirect URL. Turn the raw text
 * (which can include Google's one-time code) into something a person can act on.
 */
export function friendlyOAuthError(raw: string): string {
  const text = raw.trim();
  if (/unable to exchange external code/i.test(text)) {
    return 'Google sign-in is down for now (a setup issue on our side, not your account). Please use email and password below. [exchange_failed]';
  }
  if (/access[_ ]denied/i.test(text)) {
    return 'Google sign-in was blocked or cancelled. [access_denied]';
  }
  if (/redirect/i.test(text) && /not allowed|mismatch/i.test(text)) {
    return 'Google sign-in setup error (redirect not allowed). Please use email and password below. [redirect]';
  }
  // Never echo an authorization code back to the screen.
  return text.replace(/4\/[0-9A-Za-z_-]{10,}/g, '…').slice(0, 200);
}

export async function completeOAuthFromUrl(
  client: NonNullable<typeof supabase>,
  url: string
): Promise<Session | null> {
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const fragment = url.includes('#') ? url.split('#')[1] : '';
  const params = new URLSearchParams(query);
  const hash = new URLSearchParams(fragment);
  const errorText = params.get('error_description') || hash.get('error_description') || params.get('error') || hash.get('error');
  if (errorText) throw new Error(friendlyOAuthError(decodeURIComponent(errorText.replace(/\+/g, ' '))));

  const code = params.get('code');
  if (code) {
    if (!pendingExchange) {
      pendingExchange = (async () => {
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          // A second exchange of the same code fails; the first one may already have succeeded.
          const { data: current } = await client.auth.getSession();
          if (current.session) return current.session;
          throw error;
        }
        return data.session;
      })().finally(() => {
        setTimeout(() => { pendingExchange = null; }, 2000);
      });
    }
    return pendingExchange;
  }

  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
    return data.session;
  }
  const { data: current } = await client.auth.getSession();
  return current.session;
}


type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updateProfile: (fullName: string) => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      configured: isSupabaseConfigured,
      signIn: async (email, password) => {
        if (!supabase) return { error: 'Cloud accounts are not configured yet.' };
        try {
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          return { error: error ? toFriendlyErrorMessage(error.message) : null };
        } catch (err) {
          return { error: toFriendlyErrorMessage(err) };
        }
      },
      signUp: async (email, password) => {
        if (!supabase) return { error: 'Cloud accounts are not configured yet.', needsEmailConfirmation: false };
        const cleanEmail = email.trim();
        try {
          const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
          if (error) {
            return { error: toFriendlyErrorMessage(error.message), needsEmailConfirmation: false };
          }
          if (data.user && !data.session) {
            // Attempt immediate sign in in case project auto-confirms
            const autoSign = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
            if (!autoSign.error && autoSign.data.session) {
              return { error: null, needsEmailConfirmation: false };
            }
          }
          return {
            error: null,
            needsEmailConfirmation: Boolean(data.user && !data.session),
          };
        } catch (err) {
          return { error: toFriendlyErrorMessage(err), needsEmailConfirmation: false };
        }
      },
      resendConfirmation: async (email: string) => {
        if (!supabase) return { error: 'Cloud accounts are not configured yet.' };
        const cleanEmail = email.trim();
        if (!cleanEmail) return { error: 'Enter your email address.' };
        try {
          const { error } = await supabase.auth.resend({
            type: 'signup',
            email: cleanEmail,
          });
          return { error: error ? toFriendlyErrorMessage(error.message) : null };
        } catch (err) {
          return { error: toFriendlyErrorMessage(err) };
        }
      },
      signInWithOAuth: async (provider: 'google' | 'apple') => {
        if (!supabase) return { error: 'Cloud accounts are not configured yet.' };
        const client = supabase;

        const runOAuth = async () => {
          const redirectUrl =
            Platform.OS === 'web'
              ? (typeof window !== 'undefined' ? window.location.origin : undefined)
              : Linking.createURL('auth/callback');

          const { data, error } = await client.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: redirectUrl,
              skipBrowserRedirect: Platform.OS !== 'web',
            },
          });

          if (error) throw error;

          if (Platform.OS !== 'web' && data?.url) {
            const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
              showInRecents: true,
            });
            if (result.type === 'success' && result.url) {
              const session = await completeOAuthFromUrl(client, result.url);
              if (session) setSession(session);
              else throw new Error('Google did not return a sign-in session. Please try again.');
            } else if (result.type === 'cancel' || result.type === 'dismiss') {
              // The deep link may still have reached /auth/callback (some Android
              // browsers close the custom tab before returning). Check once.
              const { data: current } = await client.auth.getSession();
              if (current.session) setSession(current.session);
              else return { error: 'Sign-in was cancelled.' };
            }
          }
          return { error: null };
        };

        try {
          return await runOAuth();
        } catch (firstErr) {
          // Automatic 1x retry on transient network/DNS hiccup before giving up
          const raw = String(firstErr);
          if (raw.includes('UnknownHostException') || raw.includes('Network request failed') || raw.includes('Failed to fetch')) {
            await new Promise((r) => setTimeout(r, 1200));
            try {
              return await runOAuth();
            } catch (secondErr) {
              return { error: toFriendlyErrorMessage(secondErr) };
            }
          }
          return { error: toFriendlyErrorMessage(firstErr) };
        }
      },
      resetPassword: async (email: string) => {
        if (!supabase) return { error: 'Cloud accounts are not configured yet.' };
        const cleanEmail = email.trim();
        if (!cleanEmail) return { error: 'Please enter your email address.' };

        const redirectUrl =
          Platform.OS === 'web'
            ? (typeof window !== 'undefined' ? window.location.origin : undefined)
            : Linking.createURL('auth/reset-password');

        try {
          const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
            redirectTo: redirectUrl,
          });
          return { error: error ? toFriendlyErrorMessage(error.message) : null };
        } catch (err) {
          return { error: toFriendlyErrorMessage(err) };
        }
      },
      updateProfile: async (fullName: string) => {
        if (!supabase) return { error: 'Cloud accounts are not configured yet.' };
        try {
          const { data, error } = await supabase.auth.updateUser({
            data: { full_name: fullName.trim() },
          });

          if (error) return { error: toFriendlyErrorMessage(error.message) };
          if (data?.user) {
            setSession((prev) => (prev ? { ...prev, user: data.user } : prev));
          }
          return { error: null };
        } catch (err) {
          return { error: toFriendlyErrorMessage(err) };
        }
      },
      deleteAccount: async () => {
        if (!supabase) return { error: null };
        try {
          // Remove any recordings that versions before 1.1.3 backed up to cloud storage.
          // Postgres can no longer delete storage files directly, so this goes through the
          // Storage API while the user is still signed in (best effort; never blocks deletion).
          await deleteAllCloudAudioForCurrentUser();
          const { error: rpcError } = await supabase.rpc('delete_user_account');
          if (rpcError) {
            return {
              error: `Server data deletion failed. You remain signed in so you can retry safely: ${toFriendlyErrorMessage(rpcError.message)}`,
            };
          }
          await supabase.auth.signOut();
          setSession(null);
          return { error: null };
        } catch (err) {
          return { error: toFriendlyErrorMessage(err, 'Could not delete account. Please try again.') };
        }
      },
      signOut: async () => {
        if (!supabase) return { error: null };
        try {
          const { error } = await supabase.auth.signOut();
          setSession(null);
          return { error: error ? toFriendlyErrorMessage(error.message) : null };
        } catch (err) {
          setSession(null);
          return { error: toFriendlyErrorMessage(err) };
        }
      },
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
