import { Session, User } from '@supabase/supabase-js';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { isSupabaseConfigured, supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
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
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password) => {
        if (!supabase) return { error: 'Cloud accounts are not configured yet.', needsEmailConfirmation: false };
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        return {
          error: error?.message ?? null,
          needsEmailConfirmation: Boolean(data.user && !data.session),
        };
      },
      signInWithOAuth: async (provider: 'google' | 'apple') => {
        if (!supabase) return { error: 'Cloud accounts are not configured yet.' };

        try {
          if (Platform.OS === 'web') {
            const { error } = await supabase.auth.signInWithOAuth({
              provider,
              options: {
                redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
              },
            });
            return { error: error?.message ?? null };
          }

          // Mobile OAuth flow with in-app browser
          const redirectUrl = Linking.createURL('auth/callback');
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: redirectUrl,
              skipBrowserRedirect: true,
            },
          });

          if (error) return { error: error.message };
          if (!data?.url) return { error: 'Could not generate authentication URL.' };

          const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

          if (authResult.type === 'success' && authResult.url) {
            // Extract tokens if passed in callback URL
            const urlObj = new URL(authResult.url);
            const params = new URLSearchParams(urlObj.hash.replace(/^#/, ''));
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (accessToken && refreshToken) {
              const { error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (sessionError) return { error: sessionError.message };
            }
          }

          return { error: null };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'OAuth sign in failed.' };
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

        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: redirectUrl,
        });

        return { error: error?.message ?? null };
      },
      updateProfile: async (fullName: string) => {
        if (!supabase) return { error: 'Cloud accounts are not configured yet.' };
        const { data, error } = await supabase.auth.updateUser({
          data: { full_name: fullName.trim() },
        });

        if (error) return { error: error.message };
        if (data?.user) {
          setSession((prev) => (prev ? { ...prev, user: data.user } : prev));
        }
        return { error: null };
      },
      deleteAccount: async () => {
        if (!supabase) return { error: null };
        try {
          try {
            await supabase.rpc('delete_user_account');
          } catch {}
          await supabase.auth.signOut();
          setSession(null);
          return { error: null };
        } catch (err) {
          await supabase.auth.signOut();
          setSession(null);
          return { error: null };
        }
      },
      signOut: async () => {
        if (!supabase) return { error: null };
        const { error } = await supabase.auth.signOut();
        setSession(null);
        return { error: error?.message ?? null };
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
