import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useData } from "../lib/data";
import { go } from "../lib/router";
import { useMarket, usePrices, ratesFrom } from "../lib/market";
import { accountState, preTradeChecks, sizeTrade, STRATEGY_BY_KEY, pipValueUSD, tfOf } from "../engine/engine";
import PriceChart from "../components/PriceChart";
import { Head, Card, Stat, Svg, Note, ErrorNote, Loading, pairLabel, dirLabel, price, money, when } from "../components/ui";
import { nameOf } from "./Signals";

export default function SignalDetail({ id }) {
  const d = useData();
  const s = d.signals.find((x) => String(x.id) === String(id));
  const tf = tfOf(s?.granularity);
  const m = useMarket(s?.pair, tf.key);
  const { prices } = usePrices(s ? [s.pair] : []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);

  const live = s ? prices[s.pair] : null;
  const rates = ratesFrom(prices);
  const account = useMemo(() => accountState(d.profile, d.trades), [d.profile, d.trades]);
  if (!s) return <div className="page narrow"><Head title="Signal" back="#/" />{d.signals.length ? <Note>That signal isn't in the last 30 days.</Note> : <Loading />}</div>;

  const pair = s.pair, res = m.ev?.results.find((r) => r.key === s.strategy);
  const st = STRATEGY_BY_KEY[s.strategy];
  const rules = res ? res.rules : st?.rules(st.grid[0], tf);
  const size = sizeTrade(d.profile, pair, Number(s.entry), Number(s.sl), rates);
  const lots = size.lots || Number(s.lots), risk = size.lots ? size.actualRisk : Number(s.risk_usd);
  const pv = pipValueUSD(pair, Number(s.entry), rates) || 0;
  const reward2 = Math.floor((lots / 2) * 100) / 100 * Number(s.stop_pips) * pv + (lots - Math.floor((lots / 2) * 100) / 100) * Number(s.stop_pips) * 2 * pv;
  const open = d.trades.filter((t) => t.status === "open");
  const checks = preTradeChecks(d.profile, { pair, dir: s.direction, granularity: s.granularity }, { spreadPips: live?.spreadPips ?? (s.spread_pips == null ? null : Number(s.spread_pips)), stopPips: Number(s.stop_pips), openTrades: open, account, riskUsd: risk });
  const blocked = checks.filter((c) => c.blocking && !c.ok);
  const fresh = s.status === "active" && Date.now() - new Date(s.created_at) < tf.expiryHours * 3600e3;
  const levelsText = `${dirLabel(s.direction)} ${pairLabel(pair)} ${lots.toFixed(2)} lots\nEntry ${price(pair, s.entry)}\nSL ${price(pair, s.sl)}\nTP1 ${price(pair, s.tp1)}\nTP2 ${price(pair, s.tp2)}`;

  async function take() {
    setErr(null); setBusy(true);
    const entry = live ? (s.direction === "buy" ? live.ask : live.bid) : Number(s.entry);
    const { data, error } = await supabase.from("trades").insert({
      user_id: d.uid, signal_id: s.id, pair, strategy: nameOf(m.ev, s.strategy), direction: s.direction,
      entry, sl: s.sl, original_sl: s.sl, tp1: s.tp1, tp2: s.tp2, lots, risk_usd: Math.round(risk * 100) / 100,
    }).select("id").single();
    if (!error) await supabase.from("signals").update({ status: "taken" }).eq("id", s.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await Promise.all([d.loadTrades(), d.loadSignals()]);
    go(`/trade/${data.id}`);
  }
  async function skip() {
    await supabase.from("signals").update({ status: "dismissed" }).eq("id", s.id);
    await d.loadSignals(); go("/");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(levelsText); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (_) { setErr("Couldn't copy. Select the levels and copy them manually."); }
  }

  const lines = [
    { price: s.tp2, color: "#1E3A8A", title: "TP2" }, { price: s.tp1, color: "#2563EB", title: "TP1" },
    { price: s.entry, color: "#3D4652", title: "Entry" }, { price: s.sl, color: "#B45309", title: "SL" },
  ];

  return (
    <div className="page narrow">
      <Head back="#/" sub={`Signal ${when(s.created_at)} · ${tf.label} · valid about ${tf.expiryHours}h`} title={`${dirLabel(s.direction)} ${pairLabel(pair)}`} />
      {s.status === "skipped" && <Note tone="warn">Skipped automatically: {s.skip_reason}</Note>}
      {s.status === "taken" && <Note>You took this signal. See it under Trades.</Note>}
      {s.status === "expired" && <Note tone="warn">This signal is more than {tf.expiryHours} hours old and has expired.</Note>}

      <Card className="pad accent stack">
        <span className="eyebrow">{s.confluence.length > 1 ? `CONFLUENCE: ${s.confluence.length} STRATEGIES AGREE` : "ONE STRATEGY"}{s.trusted ? "" : " · NOT YET TRUSTED"}</span>
        <div className="chips">{s.confluence.map((k) => <a key={k} className="chip ok" href={`#/strategy/${k}?pair=${pair}`}>{nameOf(m.ev, k)}</a>)}</div>
        <p className="small">{rules}</p>
      </Card>

      {m.candles && <Card className="pad"><PriceChart pair={pair} candles={m.candles} lines={lines} live={live?.mid} height={240} bars={90} /></Card>}

      <Card className="list">
        <div className="row"><span className="grow"><span className="muted small">Entry</span><span className="hint">Now {live ? price(pair, s.direction === "buy" ? live.ask : live.bid) : "…"}</span></span><span className="mono xl">{price(pair, s.entry)}</span></div>
        <div className="row"><span className="grow"><span className="loss small strong">Stop loss</span><span className="hint">−{Number(s.stop_pips).toFixed(1)} pips</span></span><span className="mono xl loss">{price(pair, s.sl)}</span></div>
        <div className="row"><span className="grow"><span className="win small strong">Take profit 1 · 1R</span><span className="hint">Close half, move stop to breakeven</span></span><span className="mono xl win">{price(pair, s.tp1)}</span></div>
        <div className="row"><span className="grow"><span className="ink small strong">Take profit 2 · 2R</span><span className="hint">Close the rest</span></span><span className="mono xl ink">{price(pair, s.tp2)}</span></div>
      </Card>

      <Card className="pad grid3">
        <Stat label="Lot size" value={lots.toFixed(2)} />
        <Stat label="Risk" value={money(risk)} />
        <Stat label="At TP2" value={`+${money(reward2)}`} tone="win" />
        <p className="small muted span3">Sized from your setup: {d.profile.risk_pct}% of {money(d.profile.account_size)} with a {Number(s.stop_pips).toFixed(1)}-pip stop.</p>
      </Card>

      <h2>Pre-trade checks</h2>
      <Card className="list">
        {checks.map((c) => (
          <div key={c.key} className="row">
            <Svg name={c.ok ? "check" : "warn"} size={18} color={c.ok ? "var(--win)" : "var(--loss)"} width={2.5} />
            <span className="grow">{c.label}</span>
            <span className={`mono small ${c.ok ? "" : "loss"}`}>{c.detail}</span>
          </div>
        ))}
      </Card>
      {blocked.length > 0 && <Note tone="warn">Your rules say skip this one: {blocked.map((b) => b.label).join("; ")}.</Note>}

      <ErrorNote>{err}</ErrorNote>
      <div className="stack">
        <button className="btn block" onClick={copy}>{copied ? "Copied" : "Copy levels"}</button>
        {(fresh || s.status === "skipped") && (
          <div className="grid2">
            <button className="btn ghost" disabled={busy} onClick={take}>{busy ? "Saving…" : "I took it"}</button>
            <button className="btn ghost" onClick={skip}>Skip</button>
          </div>
        )}
      </div>
    </div>
  );
}
