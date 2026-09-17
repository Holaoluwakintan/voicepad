import { supabase } from "./supabase";

export const CATEGORIES = ["Personal", "Meetings", "Lectures", "Sermons"] as const;
export type Category = (typeof CATEGORIES)[number];
export type VoiceNote = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  category: Category;
  pinned: boolean;
  transcript: string | null;
  summary: string | null;
  transcription_status: "pending" | "ready" | "failed" | null;
  transcription_error: string | null;
};

export async function listNotes(userId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.from("voicepad_notes").select("*").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as VoiceNote[];
}

export async function insertTranscript(userId: string, transcript: string, title: string, category: Category) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const id = `voice-${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const { data, error } = await supabase.from("voicepad_notes").insert({
    id, user_id: userId, title, content: transcript, transcript, category,
    source: "voice", transcription_status: "ready", pinned: false,
  }).select().single();
  if (error) throw error;
  return data as VoiceNote;
}

export async function updateNote(id: string, patch: Partial<Pick<VoiceNote, "title" | "category" | "pinned" | "summary" | "content" | "transcript">>) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.from("voicepad_notes").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as VoiceNote;
}
