import { createClient, type Session, type User } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || "";

export const supabase = url && anonKey
  ? createClient(url.replace(/\/$/, ""), anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export type AuthState = { user: User | null; session: Session | null };

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export function displayName(user: User | null) {
  return user?.user_metadata?.full_name || user?.email?.split("@")[0] || "VoicePad user";
}
