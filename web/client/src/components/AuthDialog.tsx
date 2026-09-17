import { useState, type FormEvent } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type Props = { onClose: () => void; onAuthed: () => void };

export default function AuthDialog({ onClose, onAuthed }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    if (!supabase) { setError("Cloud accounts are not configured yet."); setBusy(false); return; }
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    if (mode === "signup" && !result.data.session) { setMessage("Check your inbox to confirm your email, then sign in."); return; }
    onAuthed();
  };

  return <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-title"><div className="auth-dialog"><button className="auth-close" onClick={onClose} aria-label="Close"><X size={17} /></button><div className="auth-kicker"><span><Check size={13} /></span> Save your thinking</div><h2 id="auth-title">Keep your notes<br /><em>close at hand.</em></h2><p className="auth-intro">Create a free account to save transcripts, organize your history, and return to your best thoughts anywhere.</p><div className="auth-switch"><button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button></div><form onSubmit={submit}>{mode === "signup" && <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Alex Morgan" autoComplete="name" /></label>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} required /></label>{error && <div className="auth-error">{error}</div>}{message && <div className="auth-message">{message}</div>}<button className="button button-coral auth-submit" disabled={busy}>{busy ? "Working..." : mode === "signin" ? "Sign in" : "Create free account"}<ArrowRight size={15} /></button></form><small className="auth-footnote">Your private notes are protected by Supabase Row Level Security.</small></div></div>;
}
