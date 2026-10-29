import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useData } from "../lib/data";
import { go } from "../lib/router";
import { usePrices, ratesFrom } from "../lib/market";
import { tradePnlUsd, fmtR } from "../engine/engine";
import { Head, Card, Stat, Svg, Note, ErrorNote, Loading, pairLabel, dirLabel, price, money, when } from "../components/ui";

const half = (lots) => Math.floor((Number(lots) / 2) * 100) / 100;

// Profit if closed at `exit` now, counting a half closed at TP1 when that happened.
export function tradeResult(t, exit, rates) {
  const base = { pair: t.pair, direction: t.direction, entry: Number(t.entry) };
  if (t.partial_closed) {
    const h = half(t.lots);
    return tradePnlUsd({ ...base, lots: h }, Number(t.tp1), rates) + tradePnlUsd({ ...base, lots: Number(t.lots) - h }, exit, rates);
  }
  return tradePnlUsd({ ...base, lots: Number(t.lots) }, exit, rates);
}

export default function Trades({ id }) {
  const d = useData();
  if (id) return <TradeDetail id={id} />;
  const open = d.trades.filter((t) => t.status === "open");
  const closed = d.trades.filter((t) => t.status === "closed").slice(0, 10);
  return (
    <div className="page narrow">
      <Head sub="Your trades" title="Trades" />
      {open.length === 0 && <Note>No open trades. When you take a signal, tap "I took it" and it shows up here with live TP and stop tracking.</Note>}
      {open.length > 0 && <Card className="list">{open.map((t) => <TradeRow key={t.id} t={t} />)}</Card>}
      {closed.length > 0 && <><h2>Recently closed</h2><Card className="list">{closed.map((t) => <TradeRow key={t.id} t={t} />)}</Card></>}
    </div>
  );
}

function TradeRow({ t }) {
  const r = t.result_r != null ? Number(t.result_r) : null;
  return (
    <a className="row link" href={`#/trade/${t.id}`}>
      <i className={`dot ${t.status === "open" ? "open" : r > 0 ? "win" : "loss"}`} />
      <span className="grow"><span className="strong">{dirLabel(t.direction)} {pairLabel(t.pair)} · {t.strategy}</span>
        <span className="hint">{when(t.opened_at)} · {t.status === "open" ? (t.tp1_hit_at ? "TP1 hit" : "Open") : "Closed"} · {Number(t.lots).toFixed(2)} lots</span></span>
      <span className={`mono strong ${r == null ? "" : r > 0 ? "win" : "loss"}`}>{r == null ? "" : fmtR(r)}</span>
    </a>
  );
}

function TradeDetail({ id }) {
  const d = useData();
  const t = d.trades.find((x) => String(x.id) === String(id));
  const { prices } = usePrices(t ? [t.pair] : []);
  const [exit, setExit] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!t) return <div className="page narrow"><Head title="Trade" back="#/trades" />{d.trades.length ? <Note>Trade not found.</Note> : <Loading />}</div>;

  const pair = t.pair, p = prices[pair], rates = ratesFrom(prices), s = t.direction === "buy" ? 1 : -1;
  const now = p ? (s > 0 ? p.bid : p.ask) : null;
  const pnl = now != null ? tradeResult(t, now, rates) : null;
  const r = pnl != null ? pnl / Number(t.risk_usd) : null;
  const banked = t.partial_closed ? tradePnlUsd({ pair, direction: t.direction, entry: Number(t.entry), lots: half(t.lots) }, Number(t.tp1), rates) : 0;
  const atTp2 = tradeResult(t, Number(t.tp2), rates);
  const sl0 = Number(t.original_sl), tp2 = Number(t.tp2);
  const pos = now != null ? Math.max(0, Math.min(1, (now - sl0) / (tp2 - sl0))) : null;
  const curStop = t.be_moved ? Number(t.entry) : Number(t.sl);
  const riskNow = Math.max(0, -tradeResult({ ...t, partial_closed: false, lots: t.partial_closed ? Number(t.lots) - half(t.lots) : t.lots }, curStop, rates));

  async function update(row) {
    setErr(null); setBusy(true);
    const { error } = await supabase.from("trades").update(row).eq("id", t.id);
    setBusy(false);
    if (error) setErr(error.message); else await d.loadTrades();
  }
  async function close() {
    const x = parseFloat(exit || now);
    if (!isFinite(x)) { setErr("Enter your exit price."); return; }
    const pl = tradeResult(t, x, rates);
    await update({ status: "closed", exit_price: x, closed_at: new Date().toISOString(), pnl_usd: Math.round(pl * 100) / 100, result_r: Math.round((pl / Number(t.risk_usd)) * 100) / 100, notes: notes || t.notes });
  }
  async function remove() {
    if (!window.confirm("Delete this trade from your journal? This can't be undone.")) return;
    await supabase.from("trades").delete().eq("id", t.id);
    await d.loadTrades(); go("/trades");
  }

  return (
    <div className="page narrow">
      <Head back="#/trades" sub={`${t.status === "open" ? "Open trade" : "Closed trade"} · ${t.strategy} · ${Number(t.lots).toFixed(2)} lots`} title={`${dirLabel(t.direction)} ${pairLabel(pair)}`} />

      {t.status === "open" && (
        <Card className="pad stack">
          <div className="card-head">
            <Stat label="Unrealized" value={r == null ? "…" : fmtR(r)} tone={r >= 0 ? "win" : "loss"} />
            <div className="right"><span className="muted small">Price now</span><span className="mono xl">{now != null ? price(pair, now) : "…"}</span><span className={`mono small ${pnl >= 0 ? "win" : "loss"}`}>{pnl != null ? `${pnl >= 0 ? "+" : ""}${money(pnl)}` : ""}</span></div>
          </div>
          <div className="progress" aria-label="Price between stop and TP2">
            <span className="track" />
            {pos != null && <span className="fill" style={{ left: "33.3%", width: `${Math.max(0, (pos - 1 / 3) * 100)}%` }} />}
            {pos != null && <span className="cursor" style={{ left: `${pos * 100}%` }} />}
            <span className="tick loss" style={{ left: 0 }}>{t.be_moved ? "SL→BE" : "SL"}</span>
            <span className="tick" style={{ left: "33.3%" }}>IN</span>
            <span className="tick win" style={{ left: "66.6%" }}>TP1{t.tp1_hit_at ? " ✓" : ""}</span>
            <span className="tick ink" style={{ left: "100%" }}>TP2</span>
          </div>
        </Card>
      )}

      {t.status === "open" && t.tp1_hit_at && !t.be_moved && !t.sl_hit_at && (
        <div className="callout">
          <div className="callout-text"><Svg name="bell" color="var(--win)" />
            <span><b>TP1 hit at {price(pair, t.tp1)}</b><br />Close half ({half(t.lots).toFixed(2)} lots) and move your stop to breakeven at {price(pair, t.entry)}. The rest rides to TP2 with no risk.</span></div>
          <button className="btn" disabled={busy} onClick={() => update({ be_moved: true, partial_closed: true, sl: t.entry })}>Done, stop moved</button>
        </div>
      )}
      {t.status === "open" && t.tp2_hit_at && <Note>TP2 reached. Close the rest at {price(pair, t.tp2)} and log the exit below.</Note>}
      {t.status === "open" && t.sl_hit_at && <Note tone="warn">{t.be_moved ? "Breakeven stop" : "Stop"} reached. Log the exit below so your daily limits stay accurate.</Note>}

      <Card className="pad grid3">
        <Stat label="Risk now" value={money(riskNow)} />
        <Stat label="Banked" value={t.partial_closed ? `+${money(banked)}` : "$0"} tone={t.partial_closed ? "win" : ""} />
        <Stat label={t.status === "open" ? "At TP2" : "Result"} value={t.status === "open" ? `+${money(atTp2)}` : `${money(Number(t.pnl_usd))} · ${fmtR(Number(t.result_r))}`} />
      </Card>

      <Card className="list">
        <div className="row"><span className="grow muted">Entry</span><span className="mono">{price(pair, t.entry)}</span></div>
        <div className="row"><span className="grow muted">Stop {t.be_moved ? "(moved to breakeven)" : ""}</span><span className="mono loss">{price(pair, curStop)}</span></div>
        <div className="row"><span className="grow muted">TP1 · TP2</span><span className="mono win">{price(pair, t.tp1)} · {price(pair, t.tp2)}</span></div>
      </Card>

      <h2>Timeline</h2>
      <Card className="list">
        <div className="row"><span className="mono small muted w-time">{when(t.opened_at)}</span><span>Entered {Number(t.lots).toFixed(2)} lots at {price(pair, t.entry)}</span></div>
        {t.tp1_hit_at && <div className="row"><span className="mono small muted w-time">{when(t.tp1_hit_at)}</span><span className="win strong">TP1 hit</span></div>}
        {t.be_moved && <div className="row"><span className="mono small muted w-time">—</span><span>Half closed, stop at breakeven</span></div>}
        {t.tp2_hit_at && <div className="row"><span className="mono small muted w-time">{when(t.tp2_hit_at)}</span><span className="win strong">TP2 hit</span></div>}
        {t.sl_hit_at && <div className="row"><span className="mono small muted w-time">{when(t.sl_hit_at)}</span><span className="loss strong">Stop hit</span></div>}
        {t.closed_at && <div className="row"><span className="mono small muted w-time">{when(t.closed_at)}</span><span>Closed at {price(pair, t.exit_price)}</span></div>}
      </Card>

      {t.status === "open" && (
        <>
          <h2>Close and log exit</h2>
          <Card className="pad stack">
            <label className="field-col">Exit price for the {t.partial_closed ? "remaining" : "whole"} position
              <input type="number" inputMode="decimal" step="any" value={exit} placeholder={now != null ? price(pair, now) : ""} onChange={(e) => setExit(e.target.value)} />
            </label>
            <label className="field-col">Notes (optional)
              <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </label>
            <ErrorNote>{err}</ErrorNote>
            <button className="btn" disabled={busy} onClick={close}>{busy ? "Saving…" : "Close trade and log exit"}</button>
          </Card>
        </>
      )}
      {t.notes && t.status === "closed" && <Note>{t.notes}</Note>}
      <button className="linkbtn danger" onClick={remove}>Delete this trade</button>
    </div>
  );
}
