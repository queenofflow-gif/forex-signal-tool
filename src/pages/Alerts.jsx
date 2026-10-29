import { useEffect, useState } from "react";
import { supabase, telegram } from "../lib/supabase";
import { useData } from "../lib/data";
import { Head, Card, Toggle, Svg, ErrorNote, Note, Loading } from "../components/ui";

const ZONES = ["America/Chicago", "America/New_York", "America/Denver", "America/Los_Angeles", "Europe/London", "UTC"];
const hours = Array.from({ length: 24 }, (_, h) => h);
const hLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });

export default function Alerts() {
  const d = useData(), a = d.alerts, loadAlerts = d.loadAlerts;
  const [bot, setBot] = useState(undefined);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => { telegram.status().then((s) => setBot(s.configured ? s.bot : null)).catch(() => setBot(null)); }, []);
  useEffect(() => {
    if (a?.telegram_chat_id) return undefined;
    const id = setInterval(() => loadAlerts(), 4000); // pick up the link right after /start
    return () => clearInterval(id);
  }, [a?.telegram_chat_id, loadAlerts]);

  if (!a) return <div className="page narrow"><Head title="Alerts" back="#/account" /><Loading /></div>;

  async function set(k, v) {
    setErr(null);
    d.setAlerts({ ...a, [k]: v });
    const { error } = await supabase.from("alert_settings").update({ [k]: v, updated_at: new Date().toISOString() }).eq("user_id", d.uid);
    if (error) { setErr(error.message); d.loadAlerts(); }
  }
  async function test() { setErr(null); setMsg(null); try { await telegram.test(); setMsg("Test alert sent. Check Telegram."); } catch (e) { setErr(e.message); } }
  async function unlink() { await telegram.unlink(); d.loadAlerts(); }

  return (
    <div className="page narrow">
      <Head back="#/account" sub="Account" title="Alerts" />

      <h2>Telegram</h2>
      <Card className="pad stack">
        {bot === undefined && <Loading text="Checking Telegram…" />}
        {bot === null && <Note tone="warn">Telegram alerts aren't switched on for this site yet. The site owner needs to add the bot token.</Note>}
        {bot && !a.telegram_chat_id && (
          <>
            <p className="small">Alerts arrive as Telegram messages, so you'll get them at 2 AM even with this site closed.</p>
            <a className="btn" href={`https://t.me/${bot}?start=${a.link_code}`} target="_blank" rel="noreferrer">Connect Telegram</a>
            <p className="small muted">Opens @{bot}. Tap <b>Start</b> there, then come back. This page updates by itself.</p>
          </>
        )}
        {bot && a.telegram_chat_id && (
          <>
            <div className="ok-line"><Svg name="check" size={16} color="var(--win)" width={2.5} />Connected{a.telegram_username ? ` as @${a.telegram_username}` : ""}</div>
            <div className="grid2"><button className="btn ghost" onClick={test}>Send test alert</button><button className="btn ghost" onClick={unlink}>Disconnect</button></div>
          </>
        )}
        <ErrorNote>{err}</ErrorNote>
        {msg && <Note>{msg}</Note>}
      </Card>

      <h2>Alert me when</h2>
      <Card className="list">
        <Toggle label="Telegram alerts on" checked={a.telegram_enabled} onChange={(v) => set("telegram_enabled", v)} />
        <Toggle label="A new signal fires" checked={a.on_signal} onChange={(v) => set("on_signal", v)} />
        <Toggle label="TP1, TP2 or stop is hit" hint="For trades you marked as taken" checked={a.on_levels} onChange={(v) => set("on_levels", v)} />
        <Toggle label="A signal is skipped" hint="Spread too wide, daily limit, correlation or session" checked={a.on_skip} onChange={(v) => set("on_skip", v)} />
        <Toggle label="Daily loss reaches 50%" checked={a.on_daily_warn} onChange={(v) => set("on_daily_warn", v)} />
      </Card>

      <h2>Filters</h2>
      <Card className="list">
        <Toggle label="Only strategies that hold up on unseen data" hint="Recommended. Others still show on the website." checked={a.only_trusted} onChange={(v) => set("only_trusted", v)} />
        <Toggle label="Quiet hours" hint="Off means 2 AM London signals still alert" checked={a.quiet_enabled} onChange={(v) => set("quiet_enabled", v)} />
        {a.quiet_enabled && (
          <div className="row">
            <span className="grow small">From</span>
            <select value={a.quiet_start} onChange={(e) => set("quiet_start", +e.target.value)} aria-label="Quiet hours start">{hours.map((h) => <option key={h} value={h}>{hLabel(h)}</option>)}</select>
            <span className="small">to</span>
            <select value={a.quiet_end} onChange={(e) => set("quiet_end", +e.target.value)} aria-label="Quiet hours end">{hours.map((h) => <option key={h} value={h}>{hLabel(h)}</option>)}</select>
          </div>
        )}
        <div className="row"><span className="grow">Time zone</span>
          <select value={a.timezone} onChange={(e) => set("timezone", e.target.value)}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
      </Card>
      <p className="small muted">Max spread per pair is set under Account → Your rules.</p>
    </div>
  );
}
