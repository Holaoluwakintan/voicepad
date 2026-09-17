import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDownRight, ArrowRight, AudioLines, Check, ChevronDown, CircleHelp,
  Command, FileText, Lightbulb, Menu, Mic, MoreHorizontal, Pause, Play,
  Search, Sparkles, Star, Tags, Upload, WandSparkles, X, Zap,
} from "lucide-react";
import AuthDialog from "../components/AuthDialog";
import { CATEGORIES, insertTranscript, listNotes, type Category, type VoiceNote, updateNote } from "../lib/notes";
import { displayName, getAuthHeaders, supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

const API_URL = (import.meta.env.VITE_TRANSCRIPTION_API_URL?.trim() || "https://voicepad-transcription.onrender.com").replace(/\/$/, "");
const notes = [
  { title: "Q4 launch notes", tag: "Work", time: "Today, 10:42 AM", color: "coral" },
  { title: "Ideas for the studio", tag: "Personal", time: "Yesterday", color: "violet" },
  { title: "Grocery list", tag: "Life admin", time: "Sep 14", color: "yellow" },
];
const faqs = [
  ["Does VoicePad work on my phone?", "Yes. VoicePad is designed to move with you across the devices you already use. Capture on mobile, then pick up your organized notes on the web."],
  ["What happens to my audio?", "Your recording is sent securely to VoicePad’s transcription service when you choose to transcribe it. We do not expose provider keys in the browser."],
  ["Can I upload an existing recording?", "Yes. Upload MP3, M4A, WAV, OGG, WEBM, AAC, or FLAC files up to 25MB and VoicePad will turn them into text."],
  ["Is VoicePad free right now?", "Yes. Voice transcription is currently free while we are in beta. Paid plans will be introduced later with higher limits and advanced AI features."],
];

function Logo({ inverted = false }: { inverted?: boolean }) {
  return <a href="#top" className={`brand ${inverted ? "brand-inverted" : ""}`} aria-label="VoicePad home"><span className="brand-mark"><span /><span /><span /></span><span>voicepad</span></a>;
}
function Wave({ compact = false }: { compact?: boolean }) {
  const bars = [18,35,25,49,30,60,38,74,43,28,55,32,68,42,22,52,34,46,25,64,33,55,26,42,30,70,38,54,24,44,20,37];
  return <div className={`wave ${compact ? "wave-compact" : ""}`} aria-hidden="true">{bars.map((height, index) => <i key={index} style={{ height: `${compact ? height * .62 : height}%`, animationDelay: `${index * 24}ms` }} />)}</div>;
}
function formatTime(value: number) { return `00:${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|network/i.test(message)) return "We couldn't reach the transcription service. Check your connection and try again.";
  if (/timed out|abort/i.test(message)) return "The service took too long to respond. It may be waking up — please retry in a moment.";
  return message || "Something went wrong. Please try again.";
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing" | "ready" | "error">("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [workspaceTab, setWorkspaceTab] = useState<"recent" | "starred">("recent");
  const [isPlaying, setIsPlaying] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [savedNotes, setSavedNotes] = useState<VoiceNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"All" | Category>("All");
  const [category, setCategory] = useState<Category>("Personal");
  const [summary, setSummary] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioUrl = useRef<string | null>(null);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [recording]);
  useEffect(() => () => { if (audioUrl.current) URL.revokeObjectURL(audioUrl.current); }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      if (data.session?.user) void refreshNotes(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void refreshNotes(session.user.id);
      else { setSavedNotes([]); setSelectedNote(null); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const scrollTo = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); setMenuOpen(false); };

  const refreshNotes = async (userId = user?.id) => {
    if (!userId) return;
    try { setSavedNotes(await listNotes(userId)); } catch { notify("We couldn't load your saved notes. Please refresh and try again."); }
  };
  const titleFromText = (text: string) => {
    const firstSentence = text.split(/[.!?\n]/)[0]?.trim() || "Untitled voice note";
    return firstSentence.slice(0, 52) + (firstSentence.length > 52 ? "…" : "");
  };
  const saveTranscript = async (text = transcript) => {
    if (!text.trim()) return;
    if (!user) { setAuthOpen(true); return; }
    try {
      const note = await insertTranscript(user.id, text.trim(), titleFromText(text), category);
      setSavedNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
      setSelectedNote(note); notify("Saved to your VoicePad history.");
    } catch { notify("Transcript is ready, but we couldn't save it. Please sign in again."); }
  };
  const summarizeTranscript = async (text = transcript) => {
    if (!text.trim()) return;
    setSummaryBusy(true); setError("");
    try {
      const response = await fetch(`${API_URL}/summarize`, { method: "POST", headers: { "Content-Type": "application/json", ...await getAuthHeaders() }, body: JSON.stringify({ text }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "AI summary could not be generated.");
      const nextSummary = payload?.summary?.trim();
      if (!nextSummary) throw new Error("AI summary came back empty.");
      setSummary(nextSummary);
      if (selectedNote) {
        const updated = await updateNote(selectedNote.id, { summary: nextSummary });
        setSelectedNote(updated); setSavedNotes((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      notify("Summary and action items are ready.");
    } catch (requestError) { setError(friendlyError(requestError)); }
    finally { setSummaryBusy(false); }
  };
  const chooseNote = (note: VoiceNote) => { setSelectedNote(note); setTranscript(note.transcript || note.content || ""); setSummary(note.summary || ""); setCategory(note.category || "Personal"); setStatus("ready"); };
  const filteredNotes = savedNotes.filter((note) => {
    const matchesSearch = !searchQuery.trim() || `${note.title} ${note.transcript || note.content} ${note.summary || ""}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const matchesCategory = categoryFilter === "All" || note.category === categoryFilter;
    const matchesTab = workspaceTab === "recent" || note.pinned;
    return matchesSearch && matchesCategory && matchesTab;
  });
  const signOut = async () => { await supabase?.auth.signOut(); notify("You’re signed out."); };

  const transcribe = async (blob: Blob, filename: string) => {
    setStatus("transcribing"); setError(""); setTranscript("");
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("mode", "english");
    try {
      const response = await fetch(`${API_URL}/transcribe`, { method: "POST", headers: await getAuthHeaders(), body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Transcription failed (${response.status})`);
      if (!payload?.text) throw new Error("The service returned an empty transcript.");
      const cleanText = payload.text.trim();
      setTranscript(cleanText); setStatus("ready"); notify("Transcript ready — your words are now searchable.");
      if (user) await saveTranscript(cleanText);
    } catch (requestError) { setStatus("error"); setError(friendlyError(requestError)); }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setRecording(false); setStatus("transcribing");
  };
  const startRecording = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) { setError("Your browser does not support microphone recording. Upload an audio file instead."); setStatus("error"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType || "audio/webm" });
        if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
        audioUrl.current = URL.createObjectURL(blob);
        if (audioPlayer.current) audioPlayer.current.src = audioUrl.current;
        void transcribe(blob, `voicepad-${Date.now()}.webm`);
      };
      recorder.start(); mediaRecorder.current = recorder; setRecording(true); setStatus("recording"); setSeconds(0); notify("Listening. Speak naturally — VoicePad will handle the rest.");
    } catch { setStatus("error"); setError("Microphone access is needed to record. You can allow it in your browser settings or upload a file instead."); }
  };
  const toggleRecording = () => recording ? stopRecording() : void startRecording();
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setStatus("error"); setError("That file is larger than 25MB. Choose a shorter recording and try again."); return; }
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = URL.createObjectURL(file);
    if (audioPlayer.current) audioPlayer.current.src = audioUrl.current;
    void transcribe(file, file.name);
    event.target.value = "";
  };
  const togglePlayback = () => {
    if (!audioPlayer.current) return;
    if (isPlaying) { audioPlayer.current.pause(); setIsPlaying(false); } else { void audioPlayer.current.play(); setIsPlaying(true); }
  };
  const copyTranscript = async () => { if (!transcript) return; await navigator.clipboard?.writeText(transcript); notify("Transcript copied to clipboard."); };

  return <div className="site-shell" id="top">
    {toast && <div className="toast"><span className="toast-dot" />{toast}</div>}
    <section className="hero-section">
      <div className="hero-glow hero-glow-one" /><div className="hero-glow hero-glow-two" />
      <header className="site-nav container"><Logo inverted /><nav className={`nav-links ${menuOpen ? "nav-links-open" : ""}`}><button onClick={() => scrollTo("how-it-works")}>How it works</button><button onClick={() => scrollTo("use-cases")}>For your life</button><button onClick={() => scrollTo("pricing")}>Pricing</button><button onClick={() => scrollTo("faq")}>FAQ</button><div className="mobile-nav-actions"><button className="nav-signin" onClick={() => user ? void signOut() : setAuthOpen(true)}>{user ? "Sign out" : "Sign in"}</button><button className="button button-small button-light" onClick={() => scrollTo("demo")}>Try VoicePad <ArrowRight size={15} /></button></div></nav><div className="nav-actions"><button className="nav-signin" onClick={() => user ? void signOut() : setAuthOpen(true)}>{user ? displayName(user) : "Sign in"}</button><button className="button button-small button-light" onClick={() => scrollTo("demo")}>Try VoicePad <ArrowRight size={15} /></button></div><button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu">{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></header>
      <div className="hero-content container"><div className="hero-copy"><div className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Your thoughts, in their best shape</div><h1>Say it once.<br /><em>Keep it forever.</em></h1><p className="hero-lede">VoicePad turns the things you say out loud into clear, useful notes — so the good ideas don’t disappear between one thought and the next.</p><div className="hero-buttons"><button className="button button-coral" onClick={() => scrollTo("demo")}>Transcribe for free <ArrowDownRight size={17} /></button><button className="text-button text-button-light" onClick={() => scrollTo("how-it-works")}>See how it works <ArrowRight size={16} /></button></div><div className="hero-proof"><div className="avatar-stack"><span>AN</span><span>JM</span><span>KS</span><span>+</span></div><p><strong>Free during beta.</strong><br />No account or credit card required.</p></div></div>
        <div className="hero-product" id="demo"><div className="product-window"><div className="window-topbar"><div className="window-dots"><i /><i /><i /></div><div className="window-title">voicepad / transcription studio</div><button className="window-menu"><MoreHorizontal size={17} /></button></div><div className="workspace-layout"><aside className="workspace-sidebar"><div className="workspace-profile"><div className="profile-avatar">VP</div><div><strong>VoicePad beta</strong><span>Free transcription</span></div><ChevronDown size={13} /></div><button className="new-note-button" onClick={toggleRecording}><span><Mic size={15} fill="currentColor" /></span>{recording ? "Stop recording" : "New thought"}<kbd>⌘ N</kbd></button><button className="upload-button" onClick={() => fileInput.current?.click()}><Upload size={14} /> Upload audio</button><input ref={fileInput} type="file" accept="audio/*,video/mp4" hidden onChange={handleUpload} /><div className="workspace-nav"><button className="workspace-nav-active"><FileText size={15} /> All notes <b>24</b></button><button><Star size={15} /> Starred <b>6</b></button><button><Tags size={15} /> Tags</button></div><div className="workspace-bottom"><button><CircleHelp size={15} /> Help center</button><button><Command size={15} /> Shortcuts</button></div></aside>
          <main className="workspace-main"><div className="workspace-heading"><div><span className="mini-label">LIVE TRANSCRIPTION STUDIO</span><h3>{status === "ready" ? "Your transcript is ready." : status === "transcribing" ? "Finding the shape of it..." : "Say what’s on your mind."}</h3></div><button className="icon-button"><Search size={17} /></button></div><div className="workspace-controls"><div className="workspace-tabs"><button className={workspaceTab === "recent" ? "active" : ""} onClick={() => setWorkspaceTab("recent")}>Recent</button><button className={workspaceTab === "starred" ? "active" : ""} onClick={() => setWorkspaceTab("starred")}>Starred</button></div><div className="workspace-filters"><input aria-label="Search saved notes" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search notes" /><select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as "All" | Category)}><option value="All">All tags</option>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div>
            {transcript ? <><div className="transcript-result"><div className="transcript-result-header"><span><span className="live-dot" /> TRANSCRIPT {selectedNote && <span className="saved-label">· SAVED</span>}</span><button onClick={copyTranscript}><FileText size={13} /> Copy</button></div><p>{transcript}</p><div className="transcript-result-footer"><span>{transcript.trim().split(/\s+/).length} words</span><div className="result-actions">{!selectedNote && <><select aria-label="Choose note category" value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select><button onClick={() => void saveTranscript()}><Star size={13} /> Save note</button></>}{selectedNote && <button onClick={() => void summarizeTranscript()} disabled={summaryBusy}><Sparkles size={13} /> {summaryBusy ? "Thinking..." : summary ? "Refresh AI insight" : "Summarize"}</button>}</div></div></div>{summary && <div className="ai-summary"><div className="ai-summary-head"><span><Sparkles size={14} /> AI INSIGHT</span><small>Summary + action items</small></div><div className="ai-summary-body">{summary.split(/\n+/).map((line, index) => line.trim() && <p key={`${line}-${index}`} className={/^[-*]|\[ \]/.test(line.trim()) ? "ai-action-line" : line.startsWith("###") ? "ai-heading-line" : ""}>{line.replace(/^###\s*/, "")}</p>)}</div></div>}</> : <div className={`record-card record-card-large ${recording ? "record-card-live" : ""} ${status === "transcribing" ? "record-card-loading" : ""}`}><div className="record-card-top"><span className="record-card-icon">{status === "transcribing" ? <WandSparkles size={17} /> : <Mic size={17} fill="currentColor" />}</span><div><strong>{status === "transcribing" ? "Transcribing your voice..." : recording ? "Listening..." : "Capture the thought"}</strong><small>{recording ? formatTime(seconds) : status === "transcribing" ? "Usually takes less than a minute" : "Start recording or upload a file"}</small></div><button className="record-trigger" onClick={toggleRecording} disabled={status === "transcribing"}>{recording ? <span className="stop-square" /> : status === "transcribing" ? <span className="spinner" /> : <Play size={16} fill="currentColor" />}</button></div><Wave compact /></div>}
            {error && <div className="inline-error"><span>!</span><p>{error}</p><button onClick={() => { setError(""); setStatus("idle"); }}>Dismiss</button></div>}
            {user && <div className="history-panel"><div className="history-heading"><span><FileText size={13} /> YOUR SAVED NOTES</span><small>{filteredNotes.length} {filteredNotes.length === 1 ? "note" : "notes"}</small></div>{filteredNotes.length ? filteredNotes.slice(0, 3).map((note) => <button className={`history-row ${selectedNote?.id === note.id ? "history-row-active" : ""}`} key={note.id} onClick={() => chooseNote(note)}><span className={`history-note-dot history-note-dot-${note.category.toLowerCase()}`} /><span><strong>{note.title}</strong><small>{note.category} · {new Date(note.created_at).toLocaleDateString()}</small></span><ArrowRight size={13} /></button>) : <p className="history-empty">Your saved transcripts will appear here.</p>}</div>}
            <div className="studio-hint"><span><Zap size={13} /></span><p><strong>{user ? `Signed in as ${displayName(user)}` : "Free during beta"}</strong> · {user ? "Your transcripts are saved to your private history." : "Sign in to keep your transcripts."}</p></div>
            <audio ref={audioPlayer} onEnded={() => setIsPlaying(false)} hidden /></main></div></div><div className="floating-insight"><span className="insight-spark"><Sparkles size={15} /></span><div><small>VoicePad beta</small><strong>{status === "ready" ? summary ? "AI insight ready" : "Transcript ready" : user ? "Your notes, saved" : "Free to try today"}</strong></div><ArrowRight size={16} /></div></div></div><div className="scroll-cue"><span>Scroll to explore</span><span className="scroll-line" /></div>
    </section>
    <section className="logo-strip"><div className="container logo-strip-inner"><span>Made for the moments between</span><div className="logo-word">FIELD NOTES</div><div className="logo-word logo-word-serif">northstar</div><div className="logo-word logo-word-spaced">GOOD<span>WORK</span></div><div className="logo-word">HUMAN / KIND</div></div></section>
    <section className="section section-intro" id="how-it-works"><div className="container intro-grid"><div><div className="eyebrow"><span className="eyebrow-dot" /> The simple version</div><h2>Your brain is for making connections.<br /><em>Not holding onto every word.</em></h2></div><div className="intro-aside"><p>VoicePad gives your passing thoughts a place to land. Speak naturally, and get back a note you can actually use.</p><button className="circle-link" onClick={() => scrollTo("features")}><ArrowDownRight size={20} /></button></div></div><div className="container process-grid"><div className="process-card process-card-coral"><div className="process-number">01</div><div className="process-visual process-visual-wave"><Wave /><span className="visual-caption">Your raw voice</span></div><h3>Talk like you think</h3><p>Record a meeting thought, a midnight idea, or a grocery list. No format, no friction.</p></div><div className="process-card process-card-lilac"><div className="process-number">02</div><div className="process-visual transcript-visual"><div className="transcript-line width-long" /><div className="transcript-line width-mid" /><div className="transcript-line width-short" /><span className="visual-caption">Your clean transcript</span></div><h3>Get the shape of it</h3><p>VoicePad transcribes what you said and gently clears away the noise.</p></div><div className="process-card process-card-yellow"><div className="process-number">03</div><div className="process-visual insight-visual"><span><Lightbulb size={20} /></span><span><Check size={18} /></span><span><Zap size={18} /></span><span className="visual-caption">Your useful next move</span></div><h3>Make it actionable</h3><p>Find the ideas, decisions, and next steps hiding inside the recording.</p></div></div></section>
    <section className="section feature-section" id="features"><div className="container feature-grid"><div className="feature-copy"><div className="eyebrow"><span className="eyebrow-dot" /> Less organizing, more doing</div><h2>From scattered thoughts to <em>solid ground.</em></h2><p>VoicePad brings a little editorial care to the messiest part of thinking: the moment before an idea becomes a plan.</p><div className="feature-list"><div><span className="feature-check"><Check size={14} /></span><p><strong>Transcription you can trust</strong><br />Fast, accurate text that keeps your voice intact.</p></div><div><span className="feature-check"><Check size={14} /></span><p><strong>Works with your existing recordings</strong><br />Upload audio or record right here in the browser.</p></div><div><span className="feature-check"><Check size={14} /></span><p><strong>Free while we build</strong><br />Try the core experience before paid plans arrive.</p></div></div><button className="text-button" onClick={() => scrollTo("demo")}>Transcribe something now <ArrowRight size={16} /></button></div><div className="transcript-panel"><div className="panel-header"><span><span className="live-dot" /> VoicePad transcript</span><span>Just now</span></div><div className="speaker-line"><span className="speaker-avatar">VP</span><p><strong>Your voice</strong><br /><span>“The best ideas rarely arrive fully formed. They arrive as a sentence you almost forget...”</span></p></div><div className="highlight-line"><span className="highlight-icon"><Sparkles size={15} /></span><div><small>VoicePad found a thread</small><strong>Keep the thought. Find the next move.</strong></div></div><div className="panel-actions"><button onClick={() => scrollTo("demo")}><Mic size={14} /> Try the recorder</button><button onClick={() => notify("AI summaries will be available in the next beta update.")}><WandSparkles size={14} /> Summarize</button><button><MoreHorizontal size={15} /></button></div></div></div></section>
    <section className="dark-section" id="use-cases"><div className="container use-case-heading"><div><div className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> A place for all of it</div><h2>Big ideas. Tiny errands.<br /><em>Everything in between.</em></h2></div><p>One calm home for the thoughts that make up your work, your life, and the person you’re becoming.</p></div><div className="container use-case-grid"><button className="use-case-card use-case-card-active" onClick={() => scrollTo("demo")}><span className="use-case-icon"><Zap size={19} /></span><small>FOR YOUR WORK</small><h3>Meetings that<br /><em>move forward.</em></h3><span className="use-case-link">Transcribe a meeting <ArrowRight size={15} /></span></button><button className="use-case-card use-case-card-lilac" onClick={() => scrollTo("demo")}><span className="use-case-icon"><Lightbulb size={19} /></span><small>FOR YOUR LIFE</small><h3>Thoughts worth<br /><em>coming back to.</em></h3><span className="use-case-link">Capture a life note <ArrowRight size={15} /></span></button><button className="use-case-card use-case-card-yellow" onClick={() => scrollTo("demo")}><span className="use-case-icon"><Sparkles size={19} /></span><small>FOR YOUR IDEAS</small><h3>Catch the spark<br /><em>before it fades.</em></h3><span className="use-case-link">Save an idea <ArrowRight size={15} /></span></button></div></section>
    <section className="section pricing-section" id="pricing"><div className="container pricing-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> Start with what matters</div><h2>Room to think.<br /><em>No pressure to pay.</em></h2></div><p>Transcription is free while VoicePad is in beta. We’ll introduce paid plans later for people who want more storage, more AI, and more ways to work with their notes.</p></div><div className="container pricing-grid"><div className="price-card price-card-featured"><span className="price-badge">AVAILABLE NOW</span><span className="price-label">BETA</span><h3>For the everyday thinker.</h3><p>Try the essential VoicePad experience while we build the next layer with you.</p><div className="price"><strong>Free</strong><span>during beta</span></div><button className="button button-coral" onClick={() => scrollTo("demo")}>Transcribe free <ArrowRight size={15} /></button><ul><li><Check size={14} /> Browser recording</li><li><Check size={14} /> Audio file uploads</li><li><Check size={14} /> Fast English transcripts</li></ul></div><div className="price-card"><span className="price-label">FOCUS</span><h3>For your best work.</h3><p>Higher limits, AI summaries, and a searchable home for everything you’ve said.</p><div className="price"><strong>Coming soon</strong></div><button className="button button-dark" onClick={() => notify("Focus plan waitlist is coming soon.")}>Join the waitlist <ArrowRight size={15} /></button><ul><li><Check size={14} /> Unlimited voice notes</li><li><Check size={14} /> AI summaries & action items</li><li><Check size={14} /> Custom tags and exports</li></ul></div><div className="price-card"><span className="price-label">TEAM</span><h3>For thinking together.</h3><p>Shared spaces for teams who want to capture context and keep momentum.</p><div className="price"><strong>Coming soon</strong></div><button className="button button-outline-dark" onClick={() => notify("Team plan conversations are coming soon.")}>Talk to us <ArrowRight size={15} /></button><ul><li><Check size={14} /> Shared team spaces</li><li><Check size={14} /> Admin controls</li><li><Check size={14} /> Priority support</li></ul></div></div></section>
    <section className="section faq-section" id="faq"><div className="container faq-grid"><div><div className="eyebrow"><span className="eyebrow-dot" /> Questions, answered</div><h2>Good to know.<br /><em>Before you begin.</em></h2><p>Still curious? <button onClick={() => notify("Email support is coming soon.")}>Say hello to our team <ArrowRight size={14} /></button></p></div><div className="faq-list">{faqs.map(([question, answer], index) => <div className={`faq-item ${activeFaq === index ? "faq-open" : ""}`} key={question}><button className="faq-question" onClick={() => setActiveFaq(activeFaq === index ? null : index)}><span>{question}</span><span className="faq-icon">{activeFaq === index ? <X size={15} /> : <span className="plus-icon">+</span>}</span></button>{activeFaq === index && <p className="faq-answer">{answer}</p>}</div>)}</div></div></section>
    <footer className="site-footer"><div className="container footer-top"><div><Logo /><p>A softer place for your<br />loudest thoughts.</p></div><div className="footer-links"><div><span>Explore</span><button onClick={() => scrollTo("how-it-works")}>How it works</button><button onClick={() => scrollTo("pricing")}>Pricing</button><button onClick={() => scrollTo("faq")}>FAQ</button></div><div><span>Follow along</span><button onClick={() => notify("Instagram link coming soon.")}>Instagram</button><button onClick={() => notify("X link coming soon.")}>X / Twitter</button><button onClick={() => notify("Email link coming soon.")}>Contact</button></div></div></div><div className="container footer-bottom"><span>© 2026 VoicePad, Inc.</span><span>Free transcription during beta.</span><span>Privacy · Terms</span></div></footer>
    {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onAuthed={() => { setAuthOpen(false); notify("Welcome to VoicePad. Your future transcripts will be saved."); }} />}
  </div>;
}
