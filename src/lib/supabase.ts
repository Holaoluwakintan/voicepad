import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const DEFAULT_SUPABASE_URL = 'https://vfwdrpvfcvwsrhxuabak.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_c7Dqa3N6mHOmrN64oPDkHw_saVtTEFK';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
// Strip any accidental /rest/v1 or trailing slashes so auth & storage endpoints resolve properly
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);


const webStorage = {
  getItem: async (key: string) => typeof window === 'undefined' ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); },
  removeItem: async (key: string) => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
