import { useMemo, useState } from "react";
import { useData } from "../lib/data";
import { stats, fmtR } from "../engine/engine";
import { Head, Card, Note, pairLabel, dirLabel, price, money, pct, when } from "../components/ui";
import { nameOf } from "./Signals";

function csv(rows) {
  const cols = ["opened_at", "closed_at", "pair", "direction", "strategy", "lots", "entry", "sl", "tp1", "tp2", "exit_price", "pnl_usd", "result_r", "notes"];
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export default function Journal() {
  const d = useData();
  const [filter, setFilter] = useState("all");
  const closed = d.trades.filter((t) => t.status === "closed" && t.result_r != null);
  const live = useMemo(() => stats([...closed].reverse().map((t) => ({ r: Number(t.result_r) }))), [closed]);
  const net = closed.reduce((a, t) => a + Number(t.pnl_usd || 0), 0);
  const byStrat = useMemo(() => {
    const g = {};
    for (const t of closed) (g[t.strategy] = g[t.strategy] || []).push({ r: Number(t.result_r) });
    return Object.entries(g).map(([k, v]) => ({ name: k, ...stats(v) })).sort((a, b) => b.n - a.n);
  }, [closed]);

  const skipped = d.signals.filter((s) => s.status === "skipped" || s.status === "dismissed");
  const items = [
    ...d.trades.map((t) => ({ kind: "trade", t, ts: t.opened_at })),
    ...skipped.map((s) => ({ kind: "skip", s, ts: s.created_at })),
  ].filter((x) => filter === "all" || (filter === "taken" ? x.kind === "trade" : x.kind === "skip")).sort((a, b) => new Date(b.ts) - new Date(a.ts));

  function download() {
    const blob = new Blob([csv(d.trades)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `forex-signal-journal-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="page narrow">
      <Head sub={`${money(Number(d.profile.account_size))} account`} title="Journal" />
      <Card className="pad grid2">
        <div className="stat"><span className="muted small">Live win rate</span><span className="mono big">{live.n ? pct(live.winRate) : "–"}</span></div>
        <div className="stat"><span className="muted small">Avg per trade</span><span className="mono big">{live.n ? fmtR(live.avgR) : "–"}</span></div>
        <div className="stat"><span className="muted small">Closed trades</span><span className="mono big">{live.n}</span></div>
        <div className="stat"><span className="muted small">Net P&amp;L</span><span className={`mono big ${net >= 0 ? "win" : "loss"}`}>{money(net)}</span></div>
      </Card>
      <Note>{live.n < 30 ? `${30 - live.n} more closed trades until your live results are worth comparing with the backtests on each strategy page.` : "Compare these with each strategy's unseen-data numbers on its breakdown page."}</Note>

      {byStrat.length > 0 && (
        <Card className="table">
          <div className="trow th four"><span>Strategy</span><span>Trades</span><span>Win rate</span><span>Avg</span></div>
          {byStrat.map((s) => <div key={s.name} className="trow four"><span>{s.name}</span><span className="mono">{s.n}</span><span className="mono">{pct(s.winRate)}</span><span className={`mono strong ${s.avgR >= 0 ? "win" : "loss"}`}>{fmtR(s.avgR)}</span></div>)}
        </Card>
      )}

      <div className="seg" role="tablist">
        {[["all", `All ${d.trades.length + skipped.length}`], ["taken", `Taken ${d.trades.length}`], ["skipped", `Skipped ${skipped.length}`]].map(([k, l]) =>
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <Card className="list">
        {items.length === 0 && <div className="row muted">Nothing here yet.</div>}
        {items.map((x) => x.kind === "trade" ? (
          <a key={`t${x.t.id}`} className="row link" href={`#/trade/${x.t.id}`}>
            <i className={`dot ${x.t.status === "open" ? "open" : Number(x.t.result_r) > 0 ? "win" : "loss"}`} />
            <span className="grow"><span className="strong">{dirLabel(x.t.direction)} {pairLabel(x.t.pair)} · {x.t.strategy}</span>
              <span className="hint">{when(x.t.opened_at)} · {x.t.status === "open" ? "open" : `exit ${price(x.t.pair, x.t.exit_price)}`} · {Number(x.t.lots).toFixed(2)} lots</span></span>
            <span className={`mono strong ${Number(x.t.result_r) > 0 ? "win" : "loss"}`}>{x.t.result_r != null ? fmtR(Number(x.t.result_r)) : ""}</span>
          </a>
        ) : (
          <a key={`s${x.s.id}`} className="row link" href={`#/signal/${x.s.id}`}>
            <i className="dot muted" />
            <span className="grow"><span className="strong">{dirLabel(x.s.direction)} {pairLabel(x.s.pair)} · {nameOf(null, x.s.strategy)}</span>
              <span className={`hint ${x.s.status === "skipped" ? "loss" : ""}`}>{when(x.s.created_at)} · {x.s.status === "skipped" ? `Skipped automatically: ${x.s.skip_reason}` : "Skipped by you"}</span></span>
            <span className="mono faint">—</span>
          </a>
        ))}
      </Card>
      <button className="btn ghost block" onClick={download} disabled={!d.trades.length}>Export to CSV</button>
    </div>
  );
}
