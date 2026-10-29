import { useState } from "react";
import { supabase, oanda } from "../lib/supabase";
import { useData } from "../lib/data";
import { go } from "../lib/router";
import { Head, Card, NumField, Stat, ErrorNote, Note, Svg, money } from "../components/ui";

const PRESETS = {
  blaze: { label: "Blaze $10K", v: { account_size: 10000, max_loss_pct: 4, max_loss_type: "trailing", daily_loss_pct: 2, consistency_pct: 20, risk_pct: 0.5 } },
  big: { label: "$50K 2-step", v: { account_size: 50000, max_loss_pct: 10, max_loss_type: "static", daily_loss_pct: 5, consistency_pct: 30, risk_pct: 0.5 } },
  custom: { label: "Custom", v: null },
};
const FIELDS = [
  ["account_size", "Account size", "Starting balance", "$", "", 1000],
  ["max_loss_pct", "Max loss", "Total drawdown allowed", "", "%", 0.5],
  ["daily_loss_pct", "Daily loss", "Resets each trading day", "", "%", 0.5],
  ["consistency_pct", "Consistency rule", "Max share of profit in one day (0 = none)", "", "%", 5],
  ["risk_pct", "Risk per trade", "Your choice, not the firm's", "", "%", 0.25],
];

export default function Setup() {
  const d = useData(), p = d.profile;
  const [f, setF] = useState({
    preset: p.preset, account_size: p.account_size, max_loss_pct: p.max_loss_pct, max_loss_type: p.max_loss_type,
    daily_loss_pct: p.daily_loss_pct, consistency_pct: p.consistency_pct, risk_pct: p.risk_pct,
  });
  const [token, setToken] = useState("");
  const [env, setEnv] = useState("practice");
  const [tokBusy, setTokBusy] = useState(false);
  const [tokErr, setTokErr] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v, preset: "custom" }));
  const pick = (k) => setF((o) => ({ ...o, preset: k, ...(PRESETS[k].v || {}) }));
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const acct = num(f.account_size), maxL = (acct * num(f.max_loss_pct)) / 100, dly = (acct * num(f.daily_loss_pct)) / 100, rsk = (acct * num(f.risk_pct)) / 100;
  const toBreach = rsk > 0 ? Math.floor(maxL / rsk) : 0, stopN = rsk > 0 ? Math.max(1, Math.floor(dly / 2 / rsk)) : 0;
  const lots = rsk > 0 ? Math.floor((rsk / 200) * 100) / 100 : 0;

  async function connect() {
    setTokErr(null); setTokBusy(true);
    try { await oanda.saveToken(token, env); setToken(""); await d.loadProfile(); }
    catch (e) { setTokErr(e.message); }
    setTokBusy(false);
  }

  async function save() {
    setErr(null);
    if (acct <= 0 || num(f.max_loss_pct) <= 0 || num(f.daily_loss_pct) <= 0 || num(f.risk_pct) <= 0) { setErr("Fill in every number above zero."); return; }
    if (!d.profile.oanda_connected) { setErr("Connect your OANDA token first so signals can use live prices."); return; }
    setBusy(true);
    const row = {
      preset: f.preset, account_size: acct, max_loss_pct: num(f.max_loss_pct), max_loss_type: f.max_loss_type,
      daily_loss_pct: num(f.daily_loss_pct), consistency_pct: num(f.consistency_pct), risk_pct: num(f.risk_pct),
      setup_done: true, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("profiles").update(row).eq("user_id", d.uid);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await d.loadProfile();
    go("/");
  }

  return (
    <div className="page narrow">
      <Head sub="Forex Signal" title={p.setup_done ? "Edit your setup" : "Set up your account"} back={p.setup_done ? "#/account" : undefined} />
      <p className="lead">Enter your firm's rules once. Every signal is sized to them.</p>

      <div className="seg wide" role="group" aria-label="Presets">
        {Object.entries(PRESETS).map(([k, x]) => <button key={k} type="button" className={f.preset === k ? "on" : ""} onClick={() => pick(k)}>{x.label}</button>)}
      </div>

      <Card className="list">
        {FIELDS.map(([k, label, hint, prefix, suffix, step]) => (
          <NumField key={k} label={label} hint={hint} value={f[k]} onChange={set(k)} prefix={prefix} suffix={suffix} step={step} min={0} />
        ))}
        <div className="row">
          <span className="grow">Max loss type</span>
          <div className="seg small">
            {["trailing", "static"].map((t) => <button key={t} type="button" className={f.max_loss_type === t ? "on" : ""} onClick={() => set("max_loss_type")(t)}>{t === "trailing" ? "Trailing" : "Static"}</button>)}
          </div>
        </div>
      </Card>

      <h2>Connect live prices</h2>
      <Card className="pad stack">
        {p.oanda_connected ? (
          <div className="ok-line"><Svg name="check" size={16} color="var(--win)" width={2.5} />Connected to OANDA {p.oanda_env} · token ending …{p.oanda_last4}</div>
        ) : <p className="small muted">Paste your OANDA personal access token. It's checked with OANDA, encrypted, and stored with your account. It's never shown again and only pulls your own prices.</p>}
        <label className="field-col">{p.oanda_connected ? "Replace token" : "OANDA token"}
          <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste token" />
        </label>
        <div className="row-inline">
          <select value={env} onChange={(e) => setEnv(e.target.value)} aria-label="OANDA account type">
            <option value="practice">Practice (demo) account</option>
            <option value="live">Live account</option>
          </select>
          <button type="button" className="btn" disabled={!token || tokBusy} onClick={connect}>{tokBusy ? "Checking…" : "Connect"}</button>
        </div>
        <ErrorNote>{tokErr}</ErrorNote>
        <p className="small muted">Free: open a practice account at OANDA, then generate a token under <b>Manage API Access</b>. The app only reads prices; it never places trades.</p>
      </Card>

      <h2>What this means for you</h2>
      <Card className="pad grid2">
        <Stat label={`Max loss (${f.max_loss_type})`} value={money(maxL)} />
        <Stat label="Daily loss limit" value={money(dly)} />
        <Stat label="Risk per trade" value={money(rsk)} tone="win" />
        <Stat label="Losses until breach" value={`${toBreach} losses`} />
        <Stat label="Daily stop after" value={`${stopN} ${stopN === 1 ? "loss" : "losses"}`} />
        <Stat label="Lots · 20-pip EUR/USD stop" value={lots.toFixed(2)} />
        <p className="small muted span2">{num(f.consistency_pct) > 0 ? `Consistency: keep any one day under ${num(f.consistency_pct)}% of total profit.` : "No consistency rule."}</p>
      </Card>
      {rsk > 0 && toBreach < 6 && <Note tone="warn">Risk per trade is high for this drawdown: fewer than 6 losses in a row would end the account. Try 0.5% or less.</Note>}

      <ErrorNote>{err}</ErrorNote>
      <button className="btn block" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save and see signals"}</button>
      <p className="small muted center">Saved to your account. Each trader keeps their own settings and token.</p>
    </div>
  );
}
