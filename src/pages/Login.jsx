import { useState } from "react";
import { supabase, SITE_URL } from "../lib/supabase";
import { Svg, ErrorNote, Note } from "../components/ui";

export default function Login({ mfa, onMfaDone }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault(); setErr(null); setMsg(null); setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        if (password.length < 10) throw new Error("Use at least 10 characters for your password.");
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL } });
        if (error) throw error;
        if (!data.session) setMsg("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL + "#/account" });
        if (error) throw error;
        setMsg("If that email has an account, a reset link is on its way.");
      }
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  async function verify(e) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const { data: f } = await supabase.auth.mfa.listFactors();
      const factor = f?.totp?.find((x) => x.status === "verified");
      if (!factor) throw new Error("No verified authenticator found.");
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (error) throw error;
      onMfaDone();
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  return (
    <div className="login">
      <div className="login-brand">
        <span className="logo big"><Svg name="signals" size={26} color="#fff" /></span>
        <h1>Forex Signal</h1>
        <p>Backtested signals, sized to your prop firm rules.</p>
      </div>

      {mfa ? (
        <form className="stack" onSubmit={verify}>
          <label className="field-col">Code from your authenticator app
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required />
          </label>
          <ErrorNote>{err}</ErrorNote>
          <button className="btn" disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
          <button type="button" className="btn ghost" onClick={() => supabase.auth.signOut()}>Use a different account</button>
        </form>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "on" : ""} onClick={() => setMode("signin")}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>Create account</button>
          </div>
          <label className="field-col">Email
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {mode !== "reset" && (
            <label className="field-col">Password
              <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "signup" ? 10 : undefined} />
            </label>
          )}
          <ErrorNote>{err}</ErrorNote>
          {msg && <Note>{msg}</Note>}
          <button className="btn" disabled={busy}>{busy ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
          {mode === "signin" && <button type="button" className="linkbtn" onClick={() => setMode("reset")}>Forgot password?</button>}
          {mode === "reset" && <button type="button" className="linkbtn" onClick={() => setMode("signin")}>Back to sign in</button>}
        </form>
      )}
      <p className="small muted center"><Svg name="account" size={14} /> Two-step verification available · OANDA tokens encrypted at rest</p>
      <p className="small faint center">Educational tool. Not financial advice.</p>
    </div>
  );
}
