import { Session, User } from '@supabase/supabase-js';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { isSupabaseConfigured, supabase } from './supabase';
import { toFriendlyErrorMessage } from '@/lib/utils';

WebBrowser.maybeCompleteAuthSession();


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
            const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
            if (result.type === 'success' && result.url) {
              const parsed = Linking.parse(result.url);
              const code = parsed.queryParams?.code;
              if (typeof code === 'string') {
                const { data: sessionData, error: exchangeError } =
                  await client.auth.exchangeCodeForSession(code);
                if (exchangeError) throw exchangeError;
                if (sessionData?.session) {
                  setSession(sessionData.session);
                }
              }
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
          const { error: rpcError } = await supabase.rpc('delete_user_account');
          await supabase.auth.signOut();
          setSession(null);
          if (rpcError) {
            return {
              error: `Signed out, but server data deletion encountered an issue: ${toFriendlyErrorMessage(rpcError.message)}`,
            };
          }
          return { error: null };
        } catch (err) {
          await supabase.auth.signOut();
          setSession(null);
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
