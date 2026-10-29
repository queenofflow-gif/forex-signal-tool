import { useEffect, useMemo, useState } from "react";
import { supabase, oanda } from "../lib/supabase";
import { useData } from "../lib/data";
import { accountState, PAIRS } from "../engine/engine";
import { Head, Card, Meter, Toggle, NumField, Svg, ErrorNote, Note, money, pairLabel, when } from "../components/ui";

export default function Account() {
  const d = useData(), p = d.profile;
  const a = useMemo(() => accountState(p, d.trades), [p, d.trades]);
  const [rules, setRules] = useState({ risk_pct: p.risk_pct, max_open_trades: p.max_open_trades, block_correlated: p.block_correlated, sessions_only: p.sessions_only, max_spread: p.max_spread, pairs: p.pairs, daily_reset_hour_utc: p.daily_reset_hour_utc });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);
  const dirty = JSON.stringify(rules) !== JSON.stringify({ risk_pct: p.risk_pct, max_open_trades: p.max_open_trades, block_correlated: p.block_correlated, sessions_only: p.sessions_only, max_spread: p.max_spread, pairs: p.pairs, daily_reset_hour_utc: p.daily_reset_hour_utc });

  async function saveRules() {
    setErr(null);
    const row = { ...rules, risk_pct: parseFloat(rules.risk_pct), max_open_trades: parseInt(rules.max_open_trades, 10), daily_reset_hour_utc: parseInt(rules.daily_reset_hour_utc, 10), updated_at: new Date().toISOString() };
    if (!(row.risk_pct > 0) || !(row.max_open_trades >= 1) || !rules.pairs.length) { setErr("Risk, max trades and at least one pair are required."); return; }
    const { error } = await supabase.from("profiles").update(row).eq("user_id", d.uid);
    if (error) { setErr(error.message); return; }
    await d.loadProfile(); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  const togglePair = (k) => setRules((r) => ({ ...r, pairs: r.pairs.includes(k) ? r.pairs.filter((x) => x !== k) : [...r.pairs, k] }));
  const consistencyOver = p.consistency_pct > 0 && a.consistencyShare * 100 > p.consistency_pct;
  const allowed = a.roomToFloor > 0 && a.dailyUsed < a.dailyLimit / 2;

  return (
    <div className="page narrow">
      <Head sub={`${money(Number(p.account_size))} · ${p.max_loss_type} drawdown`} title="Account"
        right={<><a className="iconbtn" href="#/alerts" aria-label="Alerts"><Svg name="bell" /></a><a className="btn small-btn" href="#/setup">Edit setup</a></>} />
      <span className={`chip ${allowed ? "ok" : "warn"}`}>{allowed ? "Trading allowed" : "Signals paused by your rules"}</span>

      <Card className="pad stack">
        <div className="card-head"><span className="strong">{p.max_loss_type === "trailing" ? "Trailing" : "Static"} drawdown · {p.max_loss_pct}%</span><span className="mono strong">{money(a.roomToFloor)} left</span></div>
        <Meter value={a.roomToFloor} max={a.maxLoss} tone={a.roomToFloor < a.maxLoss / 3 ? "loss" : "win"} />
        <div className="grid3 small">
          <span><span className="muted">Floor</span><br /><span className="mono">{money(a.floor)}</span></span>
          <span><span className="muted">Equity</span><br /><span className="mono">{money(a.equity)}</span></span>
          <span><span className="muted">High mark</span><br /><span className="mono">{money(a.high)}</span></span>
        </div>
        <span className="small muted">From the trades you've logged. {p.max_loss_type === "trailing" ? "The floor rises with each new high." : "The floor stays at your starting balance minus max loss."}</span>
      </Card>
      <Card className="pad stack">
        <div className="card-head"><span className="strong">Daily loss · {p.daily_loss_pct}%</span><span className="mono strong">{money(a.dailyUsed)} / {money(a.dailyLimit)}</span></div>
        <Meter value={a.dailyUsed} max={a.dailyLimit} tone="loss" mark={50} />
        <span className="small muted">New signals pause at 50% of the daily limit. Trading day resets at {String(p.daily_reset_hour_utc).padStart(2, "0")}:00 UTC.</span>
      </Card>
      {p.consistency_pct > 0 && (
        <Card className="pad stack">
          <div className="card-head"><span className="strong">Consistency · {p.consistency_pct}%</span><span className={`mono strong ${consistencyOver ? "loss" : ""}`}>{a.totalProfit > 0 ? `${Math.round(a.consistencyShare * 100)}%` : "–"}</span></div>
          <Meter value={Math.min(100, a.consistencyShare * 100)} max={100} tone="loss" mark={p.consistency_pct} />
          <span className="small muted">{a.totalProfit > 0 ? `Biggest day is ${Math.round(a.consistencyShare * 100)}% of total profit. Keep today under ${money(a.consistencyCapUsd)}.` : "Shows once you're in profit."}</span>
        </Card>
      )}

      <h2>Your rules</h2>
      <Card className="list">
        <NumField label="Risk per trade" value={rules.risk_pct} onChange={(v) => setRules({ ...rules, risk_pct: v })} step={0.25} suffix="%" />
        <NumField label="Max open trades" value={rules.max_open_trades} onChange={(v) => setRules({ ...rules, max_open_trades: v })} step={1} />
        <Toggle label="Block correlated pairs" hint="Skip a signal that doubles exposure to a currency you already hold" checked={rules.block_correlated} onChange={(v) => setRules({ ...rules, block_correlated: v })} />
        <Toggle label="London and New York sessions only" hint="15-minute timeframe only: 7:00–21:00 UTC, weekdays" checked={rules.sessions_only} onChange={(v) => setRules({ ...rules, sessions_only: v })} />
        <NumField label="Trading day resets at" hint="UTC hour your firm uses (22 = 5 PM New York)" value={rules.daily_reset_hour_utc} onChange={(v) => setRules({ ...rules, daily_reset_hour_utc: v })} step={1} suffix="h" />
        {Object.keys(PAIRS).map((k) => (
          <div key={k} className="row">
            <label className="grow check-label"><input type="checkbox" checked={rules.pairs.includes(k)} onChange={() => togglePair(k)} /> Watch {pairLabel(k)}</label>
            <span className="muted small">Max spread</span>
            <input type="number" inputMode="decimal" step={0.1} value={rules.max_spread?.[k] ?? ""} onChange={(e) => setRules({ ...rules, max_spread: { ...rules.max_spread, [k]: parseFloat(e.target.value) || 0 } })} aria-label={`Max spread for ${pairLabel(k)}`} />
            <span className="muted small unit">pips</span>
          </div>
        ))}
      </Card>
      <ErrorNote>{err}</ErrorNote>
      {dirty && <button className="btn block" onClick={saveRules}>Save rules</button>}
      {saved && <Note>Saved.</Note>}

      <Security />
      <ScannerStatus />
      <Card className="list">
        <a className="row link" href="#/alerts"><Svg name="bell" /><span className="grow">Alerts</span><Svg name="chevron" /></a>
        <button className="row link" onClick={() => supabase.auth.signOut()}><span className="grow left">Sign out</span></button>
      </Card>
      <p className="small faint">Check your firm's rules for payout schedule, minimum withdrawal, withdrawable buffer, news trading and whether bots are allowed.</p>
    </div>
  );
}

function Security() {
  const d = useData(), p = d.profile;
  const [factors, setFactors] = useState(null);
  const [enroll, setEnroll] = useState(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => supabase.auth.mfa.listFactors().then(({ data }) => setFactors(data?.totp || []));
  useEffect(() => { load(); }, []);
  const verified = (factors || []).find((f) => f.status === "verified");

  async function start() {
    setErr(null);
    for (const f of factors || []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Forex Signal ${Date.now()}` });
    if (error) setErr(error.message); else setEnroll(data);
  }
  async function confirm() {
    setErr(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    if (error) { setErr(error.message); return; }
    setEnroll(null); setCode(""); setMsg("Two-step verification is on."); load();
  }
  async function off() {
    if (!window.confirm("Turn off two-step verification?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
    if (error) setErr(error.message); else { setMsg("Two-step verification is off."); load(); }
  }
  async function removeToken() {
    if (!window.confirm("Remove your OANDA token? Signals and live prices stop until you add one again.")) return;
    try { await oanda.removeToken(); await d.loadProfile(); } catch (e) { setErr(e.message); }
  }
  async function changePw() {
    setErr(null);
    if (pw.length < 10) { setErr("Use at least 10 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setErr(error.message); else { setPw(""); setMsg("Password updated."); }
  }

  return (
    <>
      <h2>Security</h2>
      <Card className="list">
        <div className="row"><span className="grow">Signed in as {d.email}</span><span className="small muted">{verified ? "Two-step on" : "Two-step off"}</span></div>
        <div className="row">
          <span className="grow"><span>Two-step verification</span><span className="hint">A code from an authenticator app at sign-in</span></span>
          {verified ? <button className="btn ghost small-btn" onClick={off}>Turn off</button> : <button className="btn small-btn" onClick={start} disabled={!factors}>Turn on</button>}
        </div>
        {enroll && (
          <div className="row col-row">
            <span className="small">Scan this with Google Authenticator, 1Password or similar, then enter the 6-digit code.</span>
            <img className="qr" src={enroll.totp.qr_code} alt="Authenticator QR code" width="180" height="180" />
            <span className="small muted mono break">Or enter: {enroll.totp.secret}</span>
            <div className="row-inline"><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} aria-label="6-digit code" /><button className="btn" onClick={confirm}>Verify</button></div>
          </div>
        )}
        <div className="row">
          <span className="grow"><span>{p.oanda_connected ? `OANDA token ending …${p.oanda_last4}` : "No OANDA token"}</span><span className="hint">{p.oanda_connected ? `${p.oanda_env} · encrypted · read-only use · never shown again` : "Add one in setup"}</span></span>
          <a className="btn ghost small-btn" href="#/setup">Replace</a>
          {p.oanda_connected && <button className="btn ghost small-btn" onClick={removeToken}>Remove</button>}
        </div>
        <div className="row">
          <input type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" className="grow-input" />
          <button className="btn ghost small-btn" onClick={changePw} disabled={!pw}>Change password</button>
        </div>
      </Card>
      <ErrorNote>{err}</ErrorNote>
      {msg && <Note>{msg}</Note>}
    </>
  );
}

function ScannerStatus() {
  const d = useData();
  if (!d.cursors.length) return <Note>The signal scanner starts within a few minutes of finishing setup. It checks every new candle on your timeframe.</Note>;
  return (
    <>
      <h2>Scanner</h2>
      <Card className="list">
        {d.cursors.map((c) => (
          <div key={c.pair} className="row"><span className="grow">{pairLabel(c.pair)}</span>
            <span className={`small ${c.last_error ? "loss" : "muted"}`}>{c.last_error ? `Error: ${c.last_error}` : `Checked ${when(c.last_scan_at)}`}</span></div>
        ))}
      </Card>
    </>
  );
}
