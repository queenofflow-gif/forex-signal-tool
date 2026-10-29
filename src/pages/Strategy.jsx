import { useMemo } from "react";
import { useData } from "../lib/data";
import { useMarket, usePrices } from "../lib/market";
import { STRATEGIES, PAIRS, strategyStatus, fmtR, tfOf, strategiesFor } from "../engine/engine";
import PriceChart from "../components/PriceChart";
import { Head, Card, Verdict, EquityCurve, Loading, ErrorNote, Note, pairLabel, dirLabel, price, pct, when } from "../components/ui";

export default function Strategy({ stratKey, pairParam }) {
  const d = useData();
  const pairs = d.profile.pairs.filter((p) => PAIRS[p]);
  const pair = pairs.includes(pairParam) ? pairParam : pairs[0];
  const tf = tfOf(d.profile.timeframe);
  const m = useMarket(pair, tf.key);
  const { prices } = usePrices([pair]);
  const r = m.ev?.results.find((x) => x.key === stratKey);
  const status = useMemo(() => (m.ev ? strategyStatus(m.ev) : {}), [m.ev]);
  const markers = useMemo(() => (r ? r.allTrades.map((t) => ({ t: t.t, dir: t.dir, win: t.r > 0, label: fmtR(t.r) })) : []), [r]);
  const def = STRATEGIES.find((s) => s.key === stratKey) || STRATEGIES[0];

  const rows = r ? [
    ["Win rate", pct(r.tune.winRate), pct(r.unseen.winRate), r.trusted ? "win" : ""],
    ["Trades", r.tune.n, r.unseen.n, r.unseen.n < 20 ? "loss" : ""],
    ["Avg per trade", fmtR(r.tune.avgR), fmtR(r.unseen.avgR), r.unseen.avgR < 0 ? "loss" : ""],
    ["Profit factor", r.tune.pf.toFixed(2), r.unseen.pf.toFixed(2), r.unseen.pf < 1 ? "loss" : ""],
    ["Worst streak", `${r.tune.worstStreak} losses`, `${r.unseen.worstStreak} losses`, "loss"],
  ] : [];
  const recent = r ? [...r.allTrades].reverse().slice(0, 8) : [];

  return (
    <div className="page narrow">
      <Head back={`#/?pair=${pair}`} sub={`${def.author} · ${def.style}`} title={def.name} />
      <div className="seg wide scroll" role="tablist" aria-label="Strategy">
        {strategiesFor(tf.key).map((s) => <a key={s.key} role="tab" aria-selected={s.key === stratKey} className={s.key === stratKey ? "on" : ""} href={`#/strategy/${s.key}?pair=${pair}`}>{s.name}</a>)}
      </div>
      <div className="seg wide" role="tablist" aria-label="Pair">
        {pairs.map((p) => <a key={p} role="tab" aria-selected={p === pair} className={p === pair ? "on" : ""} href={`#/strategy/${stratKey}?pair=${p}`}>{pairLabel(p)}</a>)}
      </div>

      {m.status === "error" && <ErrorNote>{m.error}</ErrorNote>}
      {!def.timeframes.includes(tf.key) && <Note tone="warn">{def.name} only works on shorter timeframes. Switch to 1-hour in setup to use it.</Note>}
      {!r && m.status !== "error" && def.timeframes.includes(tf.key) && <Loading text="Backtesting on 5,000 candles…" />}
      {r && (
        <>
          <Verdict v={r.verdict}>{r.verdictText}</Verdict>
          <Card className="pad stack">
            <span className="eyebrow muted">RULES · BEST SETTINGS FROM TUNING DATA</span>
            <p className="small">{r.rules}</p>
            <p className="small"><b>Right now:</b> {status[r.key]}</p>
          </Card>

          <Card className="pad">
            <div className="card-head"><span className="strong">Its signals on {pairLabel(pair)} · {tf.label}</span><span className="small muted">{r.allTrades.length} signals</span></div>
            <PriceChart pair={pair} candles={m.candles} markers={markers} live={prices[pair]?.mid} height={280} bars={200} />
            <div className="legend"><span><i className="dot win" />Win</span><span><i className="dot loss" />Loss</span><span className="small muted">Data from {when(m.ev.startTime)} · unseen from {when(m.ev.splitTime)}</span></div>
          </Card>

          <Card className="table">
            <div className="trow th"><span /><span>Tuning data</span><span>Unseen data</span></div>
            {rows.map(([l, a, b, tone]) => <div key={l} className="trow"><span>{l}</span><span className="mono muted">{a}</span><span className={`mono strong ${tone}`}>{b}</span></div>)}
            <div className="trow foot-note"><span className="small muted">Spread of {PAIRS[pair].typicalSpread} pips charged on every trade. TP1 closes half and moves the stop to breakeven.</span></div>
          </Card>

          <Card className="pad stack">
            <div className="card-head"><span className="strong">Equity curve · unseen data</span><span className={`mono strong ${r.unseen.netR >= 0 ? "win" : "loss"}`}>{fmtR(r.unseen.netR)}</span></div>
            <EquityCurve values={r.unseen.equity} />
            <span className="small muted">Running total in R after each trade. Orange bars are below the last high.</span>
          </Card>

          <h2>Recent trades</h2>
          <Card className="list">
            {recent.length === 0 && <div className="row muted">No trades in the data yet.</div>}
            {recent.map((t) => (
              <div key={t.t} className="row">
                <i className={`dot ${t.r > 0 ? "win" : "loss"}`} />
                <span className="grow">{when(t.t)} · {dirLabel(t.dir)} {price(pair, t.entry)}</span>
                <span className={`mono strong ${t.r > 0 ? "win" : "loss"}`}>{fmtR(t.r)}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
