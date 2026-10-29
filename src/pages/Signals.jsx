import { useMemo, useState } from "react";
import { useData } from "../lib/data";
import { useMarket, usePrices } from "../lib/market";
import { regime, strategyStatus, inSession, PAIRS, fmtR, tfOf, timeframesOf } from "../engine/engine";
import PriceChart from "../components/PriceChart";
import { Head, Card, Svg, VerdictChip, Loading, ErrorNote, Note, pairLabel, dirLabel, price, pct, when } from "../components/ui";

export default function Signals({ pairParam, tfParam }) {
  const d = useData();
  const pairs = d.profile.pairs.filter((p) => PAIRS[p]);
  const pair = pairs.includes(pairParam) ? pairParam : pairs[0];
  const tfs = timeframesOf(d.profile);
  const tf = tfOf(tfs.includes(tfParam) ? tfParam : tfs[0]);
  const q = (p, k) => `#/?pair=${p}&tf=${k}`;
  const m = useMarket(pair, tf.key);
  const { prices, error: priceErr } = usePrices(pairs);
  const [markKey, setMarkKey] = useState(null);
  const ev = m.ev;
  const live = prices[pair];

  const reg = useMemo(() => (ev ? regime(ev.ctx) : null), [ev]);
  const status = useMemo(() => (ev ? strategyStatus(ev) : {}), [ev]);
  const shown = ev ? ev.results.find((r) => r.key === markKey) || ev.results[0] : null;
  const markers = useMemo(() => (shown ? shown.allTrades.map((t) => ({ t: t.t, dir: t.dir, win: t.r > 0, label: t.r > 0 ? "W" : "L" })) : []), [shown]);

  const recent = d.signals.filter((s) => s.pair === pair && (s.granularity || tfs[0]) === tf.key).slice(0, 6);
  const active = recent.find((s) => s.status === "active" && Date.now() - new Date(s.created_at) < tfOf(s.granularity).expiryHours * 3600e3);
  const lines = active ? [
    { price: active.tp2, color: "#1E3A8A", title: "TP2" }, { price: active.tp1, color: "#2563EB", title: "TP1" },
    { price: active.entry, color: "#3D4652", title: "Entry" }, { price: active.sl, color: "#B45309", title: "SL" },
  ] : [];
  const cursor = d.cursors.find((c) => c.pair === pair && c.granularity === tf.key);

  return (
    <div className="page">
      <Head sub="Forex Signal" title="Signals" />
      <div className="seg wide" role="tablist" aria-label="Currency pair">
        {pairs.map((p) => <a key={p} role="tab" aria-selected={p === pair} className={p === pair ? "on" : ""} href={q(p, tf.key)}>{pairLabel(p)}</a>)}
      </div>
      {tfs.length > 1 && (
        <div className="seg" role="tablist" aria-label="Timeframe">
          {tfs.map((k) => <a key={k} role="tab" aria-selected={k === tf.key} className={k === tf.key ? "on" : ""} href={q(pair, k)}>{tfOf(k).long}</a>)}
        </div>
      )}
      <div className="badges">
        {reg && <span className="badge">{reg.label} · ADX {Math.round(reg.adx)}</span>}
        {reg && <span className="badge">Trend ({reg.htfLabel}): {reg.htf === "up" ? "Up" : "Down"}</span>}
        {tf.sessionFilter && <span className="badge">{inSession(Date.now()) ? "London / New York session" : "Outside main sessions"}</span>}
        {live && <span className="badge">Spread {live.spreadPips?.toFixed(1)} pips</span>}
        <span className="badge live">{priceErr ? "Prices paused" : "Live · OANDA"}</span>
      </div>

      <div className="split">
        <div className="col">
          <Card className="pad">
            <div className="card-head">
              <span className="strong">{pairLabel(pair)} · {tf.label}</span>
              <span className="mono strong win">{live ? price(pair, live.mid) : "…"}</span>
            </div>
            {m.status === "loading" && <Loading text="Loading 5,000 candles…" />}
            {m.status === "error" && <ErrorNote>{m.error}</ErrorNote>}
            {m.candles && <PriceChart pair={pair} candles={m.candles} markers={markers} lines={lines} live={live?.mid} />}
            {ev && (
              <div className="legend">
                <label className="small">Past signals from{" "}
                  <select value={shown?.key} onChange={(e) => setMarkKey(e.target.value)}>
                    {ev.results.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                  </select>
                </label>
                <span><i className="dot win" />Win</span><span><i className="dot loss" />Loss</span>
              </div>
            )}
          </Card>

          {active ? (
            <a className="card live-card" href={`#/signal/${active.id}`}>
              <span className="stack-tight">
                <span className="eyebrow">LIVE SIGNAL{active.confluence.length > 1 ? ` · ${active.confluence.length} STRATEGIES AGREE` : ""}</span>
                <span className="title">{dirLabel(active.direction)} {pairLabel(pair)} @ {price(pair, active.entry)}</span>
                <span className="small muted">{nameOf(ev, active.strategy)} · {Number(active.lots).toFixed(2)} lots · {when(active.created_at)}</span>
              </span>
              <Svg name="chevron" color="var(--win-ink)" />
            </a>
          ) : (
            <Note>No live signal on {pairLabel(pair)} right now.{cursor?.last_scan_at ? ` Last scan ${when(cursor.last_scan_at)}.` : ` The scanner checks every new ${tf.long} candle.`}{cursor?.last_error ? ` Scanner error: ${cursor.last_error}` : ""}</Note>
          )}

          {recent.length > 0 && (
            <>
              <h2>Recent signals</h2>
              <Card className="list">
                {recent.map((s) => (
                  <a key={s.id} className="row link" href={`#/signal/${s.id}`}>
                    <i className={`dot ${s.status === "skipped" || s.status === "dismissed" || s.status === "expired" ? "muted" : "win"}`} />
                    <span className="grow"><span className="strong">{dirLabel(s.direction)} · {nameOf(ev, s.strategy)}</span>
                      <span className="hint">{when(s.created_at)} · {s.status === "skipped" ? `Skipped: ${s.skip_reason}` : s.status}</span></span>
                    <span className="mono small">{price(pair, s.entry)}</span>
                  </a>
                ))}
              </Card>
            </>
          )}
        </div>

        <div className="col">
          <div className="h2row"><h2>Strategy ranking</h2><span className="small muted">Unseen data · tap for proof</span></div>
          {!ev && m.status !== "error" && <Loading text="Backtesting strategies…" />}
          {ev && (
            <Card className="list">
              {ev.results.map((r, i) => (
                <a key={r.key} className="row link rank" href={`#/strategy/${r.key}?pair=${pair}&tf=${tf.key}`}>
                  <span className="rank-top">
                    <span className="mono faint">{i + 1}</span>
                    <span className="strong grow">{r.name}</span>
                    <span className={`mono big ${r.trusted ? "win" : "muted"}`}>{r.unseen.n ? pct(r.unseen.winRate) : "–"}</span>
                  </span>
                  <span className="meter"><span className={`meter-fill ${r.trusted ? "win" : "grey"}`} style={{ width: `${Math.round(r.unseen.winRate * 100)}%` }} /></span>
                  <span className="rank-meta">
                    <span>{r.unseen.n} trades</span><span>Avg {fmtR(r.unseen.avgR)}</span><VerdictChip v={r.verdict} />
                  </span>
                  <span className="hint">{status[r.key]}</span>
                </a>
              ))}
            </Card>
          )}
          <p className="small faint">Win rates come from backtests on recent data the strategy wasn't tuned on, after spread costs. They are not predictions.</p>
        </div>
      </div>
    </div>
  );
}

export function nameOf(ev, key) {
  return ev?.results.find((r) => r.key === key)?.name || { grail: "Holy Grail", ema: "EMA crossover", london: "London breakout", soup: "Turtle Soup", rsi: "RSI reversal" }[key] || key;
}
