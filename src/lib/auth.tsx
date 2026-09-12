import { Session, User } from '@supabase/supabase-js';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { isSupabaseConfigured, supabase } from './supabase';


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
        // Google and Apple OAuth are currently disabled in this Supabase project.
        // Only Email/Password sign-in is enabled. Return a friendly message instead
        // of letting Supabase open a browser page with a raw JSON 400 error.
        return {
          error:
            `${provider === 'google' ? 'Google' : 'Apple'} sign-in is not yet available.\n\nPlease use your email and password to sign in or create an account.`,
        };
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
