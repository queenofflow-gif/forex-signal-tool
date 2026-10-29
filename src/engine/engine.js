// Forex Signal v2 engine — shared by the website and the server scanner.
// Pure JavaScript, no imports. Keep it that way: supabase/functions copy this file.

export const PAIRS = {
  EUR_USD: { label: "EUR/USD", pip: 0.0001, base: "EUR", quote: "USD", digits: 5, typicalSpread: 1.0 },
  GBP_AUD: { label: "GBP/AUD", pip: 0.0001, base: "GBP", quote: "AUD", digits: 5, typicalSpread: 2.6 },
  USD_JPY: { label: "USD/JPY", pip: 0.01, base: "USD", quote: "JPY", digits: 3, typicalSpread: 1.2 },
};
export const CONVERSION_PAIRS = ["AUD_USD"];
export const GRANULARITY = "M15";
export const CANDLE_COUNT = 5000;
const MAX_HOLD_BARS = 96; // 24 hours on M15
const TUNE_SHARE = 0.6;

// ── Indicators (all arrays aligned to candle index) ───────────
export function ema(values, p) {
  const out = new Array(values.length);
  const k = 2 / (p + 1);
  let e = values[0];
  for (let i = 0; i < values.length; i++) { e = i === 0 ? values[0] : values[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
export function atr(c, p = 14) {
  const n = c.length, out = new Array(n).fill(NaN);
  let sum = 0, prev = NaN;
  for (let i = 1; i < n; i++) {
    const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    if (i <= p) { sum += tr; if (i === p) { prev = sum / p; out[i] = prev; } }
    else { prev = (prev * (p - 1) + tr) / p; out[i] = prev; }
  }
  return out;
}
export function rsi(closes, p = 14) {
  const n = closes.length, out = new Array(n).fill(50);
  let ag = 0, al = 0;
  for (let i = 1; i < n; i++) {
    const d = closes[i] - closes[i - 1], g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    if (i <= p) { ag += g; al += l; if (i === p) { ag /= p; al /= p; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } }
    else { ag = (ag * (p - 1) + g) / p; al = (al * (p - 1) + l) / p; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
  }
  return out;
}
export function adx(c, p = 14) {
  const n = c.length, adxOut = new Array(n).fill(NaN), pdiOut = new Array(n).fill(NaN), mdiOut = new Array(n).fill(NaN);
  let trS = 0, pS = 0, mS = 0, adxV = NaN; const dxs = [];
  for (let i = 1; i < n; i++) {
    const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l;
    const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    if (i <= p) { trS += tr; pS += pdm; mS += mdm; if (i < p) continue; }
    else { trS = trS - trS / p + tr; pS = pS - pS / p + pdm; mS = mS - mS / p + mdm; }
    const pdi = trS ? (100 * pS) / trS : 0, mdi = trS ? (100 * mS) / trS : 0;
    pdiOut[i] = pdi; mdiOut[i] = mdi;
    const dx = pdi + mdi ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
    if (isNaN(adxV)) { dxs.push(dx); if (dxs.length === p) adxV = dxs.reduce((a, b) => a + b, 0) / p; }
    else adxV = (adxV * (p - 1) + dx) / p;
    adxOut[i] = adxV;
  }
  return { adx: adxOut, pdi: pdiOut, mdi: mdiOut };
}

// ── Context: candles plus cached indicators ───────────────────
export function makeCtx(candles) {
  const closes = candles.map((x) => x.c);
  const cache = {};
  const memo = (k, f) => (cache[k] !== undefined ? cache[k] : (cache[k] = f()));
  return {
    c: candles, closes, n: candles.length,
    ema: (p) => memo("ema" + p, () => ema(closes, p)),
    rsi: (p) => memo("rsi" + p, () => rsi(closes, p)),
    atr: () => memo("atr", () => atr(candles, 14)),
    adx: () => memo("adx", () => adx(candles, 14)),
    asianRange: (endHour) => memo("asia" + endHour, () => {
      const map = {};
      for (const x of candles) {
        const d = new Date(x.t), h = d.getUTCHours();
        if (h >= endHour) continue;
        const key = d.toISOString().slice(0, 10);
        const r = map[key] || (map[key] = { hi: -Infinity, lo: Infinity, bars: 0 });
        r.hi = Math.max(r.hi, x.h); r.lo = Math.min(r.lo, x.l); r.bars++;
      }
      return map;
    }),
  };
}

const f1 = (v) => (isFinite(v) ? v.toFixed(0) : "–");

// ── Strategies ────────────────────────────────────────────────
export const STRATEGIES = [
  {
    key: "grail", name: "Holy Grail", author: "Linda Raschke", style: "Trend pullback", warmup: 40,
    grid: [{ adxMin: 25 }, { adxMin: 30 }, { adxMin: 35 }],
    rules: (p) => `ADX(14) above ${p.adxMin} with the trend on the matching side. Price pulls back to the 20 EMA, then the next candle closes beyond the pullback candle's high (buy) or low (sell). Stop 1.5 × ATR. TP1 at 1R, TP2 at 2R.`,
    signal(x, i, p) {
      const { adx: a, pdi, mdi } = x.adx(), e = x.ema(20), at = x.atr(), c = x.c;
      if (!(a[i - 1] > p.adxMin) || !isFinite(at[i])) return null;
      if (pdi[i - 1] > mdi[i - 1] && c[i - 1].l <= e[i - 1] && c[i - 1].c >= e[i - 1] && c[i].c > c[i - 1].h)
        return { dir: "buy", sl: c[i].c - 1.5 * at[i] };
      if (mdi[i - 1] > pdi[i - 1] && c[i - 1].h >= e[i - 1] && c[i - 1].c <= e[i - 1] && c[i].c < c[i - 1].l)
        return { dir: "sell", sl: c[i].c + 1.5 * at[i] };
      return null;
    },
    status(x, i, p) {
      const a = x.adx().adx[i];
      return a > p.adxMin ? `ADX ${f1(a)}: trend strong, waiting for a pullback to the 20 EMA` : `ADX ${f1(a)}: trend too weak (needs ${p.adxMin})`;
    },
  },
  {
    key: "ema", name: "EMA crossover", author: "Classic trend following", style: "4H trend filter", warmup: 820,
    grid: [{ f: 9, s: 21 }, { f: 12, s: 26 }, { f: 20, s: 50 }],
    rules: (p) => `${p.f} EMA crosses the ${p.s} EMA in the same direction as the 4-hour 50 EMA trend (800 EMA on 15-minute candles). Stop 1.5 × ATR. TP1 at 1R, TP2 at 2R.`,
    signal(x, i, p) {
      const ef = x.ema(p.f), es = x.ema(p.s), et = x.ema(800), at = x.atr(), c = x.c;
      if (!isFinite(at[i])) return null;
      if (ef[i - 1] <= es[i - 1] && ef[i] > es[i] && c[i].c > et[i]) return { dir: "buy", sl: c[i].c - 1.5 * at[i] };
      if (ef[i - 1] >= es[i - 1] && ef[i] < es[i] && c[i].c < et[i]) return { dir: "sell", sl: c[i].c + 1.5 * at[i] };
      return null;
    },
    status(x, i, p) {
      const ef = x.ema(p.f)[i], es = x.ema(p.s)[i], et = x.ema(800)[i], up = x.c[i].c > et;
      return `4H trend ${up ? "up" : "down"} · ${p.f} EMA ${ef > es ? "above" : "below"} ${p.s} EMA, waiting for a cross ${up ? "up" : "down"}`;
    },
  },
  {
    key: "london", name: "London breakout", author: "Session range breakout", style: "Asian range", warmup: 40,
    grid: [{ end: 7, until: 10 }, { end: 7, until: 12 }, { end: 6, until: 10 }],
    rules: (p) => `Mark the Asian session high and low (00:00–${String(p.end).padStart(2, "0")}:00 UTC, about 7 PM–${p.end === 7 ? "2" : "1"} AM Central). Enter when a 15-minute candle closes outside that range before ${p.until}:00 UTC. Stop at the range midpoint. TP1 at 1R, TP2 at 2R.`,
    signal(x, i, p) {
      const c = x.c, d = new Date(c[i].t), h = d.getUTCHours(), wd = d.getUTCDay();
      if (wd === 0 || wd === 6 || h < p.end || h >= p.until) return null;
      const r = x.asianRange(p.end)[d.toISOString().slice(0, 10)], at = x.atr()[i];
      if (!r || r.bars < 12 || !isFinite(at)) return null;
      const mid = (r.hi + r.lo) / 2, width = r.hi - r.lo;
      if (width > 4 * at) return null;
      if (c[i].c > r.hi && c[i - 1].c <= r.hi) return { dir: "buy", sl: Math.min(mid, c[i].c - 0.5 * at) };
      if (c[i].c < r.lo && c[i - 1].c >= r.lo) return { dir: "sell", sl: Math.max(mid, c[i].c + 0.5 * at) };
      return null;
    },
    status(x, i, p) {
      const d = new Date(x.c[i].t), h = d.getUTCHours();
      if (h < p.end) return "Building the Asian range";
      if (h < p.until) return "London window open, waiting for a close outside the Asian range";
      return `Window closed for today (opens ${p.end}:00 UTC)`;
    },
  },
  {
    key: "soup", name: "Turtle Soup", author: "Linda Raschke", style: "False breakout fade", warmup: 40,
    grid: [{ lb: 20 }, { lb: 30 }],
    rules: (p) => `Price breaks the ${p.lb}-candle high or low, then closes back inside within 2 candles. Trade against the break. Stop just beyond the false break. TP1 at 1R, TP2 at 2R.`,
    signal(x, i, p) {
      const c = x.c, at = x.atr()[i];
      if (i < p.lb + 3 || !isFinite(at)) return null;
      let L = Infinity, H = -Infinity;
      for (let k = i - p.lb - 1; k <= i - 2; k++) { if (c[k].l < L) L = c[k].l; if (c[k].h > H) H = c[k].h; }
      const lo = Math.min(c[i - 1].l, c[i].l), hi = Math.max(c[i - 1].h, c[i].h);
      if (lo < L && c[i].c > L && c[i].c > c[i].o) return { dir: "buy", sl: lo - 0.2 * at };
      if (hi > H && c[i].c < H && c[i].c < c[i].o) return { dir: "sell", sl: hi + 0.2 * at };
      return null;
    },
    status(x, i, p) { return `Watching the ${p.lb}-candle high and low for a false break`; },
  },
  {
    key: "rsi", name: "RSI reversal", author: "Mean reversion", style: "Ranging markets only", warmup: 40,
    grid: [{ p: 14, lo: 30, hi: 70 }, { p: 14, lo: 25, hi: 75 }, { p: 7, lo: 20, hi: 80 }],
    rules: (p) => `RSI(${p.p}) goes below ${p.lo} or above ${p.hi}, then crosses back. Enter on the cross. Only valid when ADX is under 20 (a ranging market). Stop 1.5 × ATR. TP1 at 1R, TP2 at 2R.`,
    signal(x, i, p) {
      const r = x.rsi(p.p), a = x.adx().adx, at = x.atr(), c = x.c;
      if (!(a[i] < 20) || !isFinite(at[i])) return null;
      if (r[i - 1] < p.lo && r[i] >= p.lo) return { dir: "buy", sl: c[i].c - 1.5 * at[i] };
      if (r[i - 1] > p.hi && r[i] <= p.hi) return { dir: "sell", sl: c[i].c + 1.5 * at[i] };
      return null;
    },
    status(x, i, p) {
      const a = x.adx().adx[i], r = x.rsi(p.p)[i];
      return a < 20 ? `Ranging (ADX ${f1(a)}) · RSI ${f1(r)}, waiting for ${p.lo}/${p.hi}` : `Off: market is trending (ADX ${f1(a)})`;
    },
  },
];
export const STRATEGY_BY_KEY = Object.fromEntries(STRATEGIES.map((s) => [s.key, s]));

// ── Trade levels and simulation ───────────────────────────────
export function levels(dir, entry, sl) {
  const risk = Math.abs(entry - sl), s = dir === "buy" ? 1 : -1;
  return { entry, sl, tp1: entry + s * risk, tp2: entry + s * 2 * risk, risk };
}

// Management: hit TP1 → close half, stop to breakeven; TP2 closes the rest.
// Same-candle stop and target counts as a stop (conservative). Spread is charged per trade.
export function simulate(x, strat, params, from, to, pair, spreadPips) {
  const cfg = PAIRS[pair], c = x.c, trades = [];
  const start = Math.max(from, strat.warmup || 40, 2);
  for (let i = start; i < to; i++) {
    if (c[i].complete === false) break;
    const sig = strat.signal(x, i, params);
    if (!sig) continue;
    const L = levels(sig.dir, c[i].c, sig.sl);
    if (L.risk / cfg.pip < 3) continue;
    const s = sig.dir === "buy" ? 1 : -1;
    let tp1 = false, r = null, j = i + 1;
    for (; j < c.length && j <= i + MAX_HOLD_BARS; j++) {
      const hi = c[j].h, lo = c[j].l;
      const adverse = s > 0 ? lo : hi, favor = s > 0 ? hi : lo;
      if (!tp1) {
        if (s * (adverse - L.sl) <= 0) { r = -1; break; }
        if (s * (favor - L.tp1) >= 0) { tp1 = true; if (s * (favor - L.tp2) >= 0) { r = 1.5; break; } }
      } else {
        if (s * (adverse - L.entry) <= 0) { r = 0.5; break; }
        if (s * (favor - L.tp2) >= 0) { r = 1.5; break; }
      }
    }
    if (r === null) {
      if (j >= c.length) break; // still open at the end of data: not counted
      const move = (s * (c[j - 1].c - L.entry)) / L.risk;
      r = tp1 ? 0.5 + 0.5 * move : move;
    }
    r -= (spreadPips * cfg.pip) / L.risk;
    trades.push({ i, t: c[i].t, dir: sig.dir, ...L, r: Math.round(r * 100) / 100, exitIdx: Math.min(j, c.length - 1), exitT: c[Math.min(j, c.length - 1)].t });
    i = j;
  }
  return trades;
}

export function stats(trades) {
  const n = trades.length;
  let wins = 0, pos = 0, neg = 0, streak = 0, worst = 0, run = 0;
  const equity = [];
  for (const t of trades) {
    if (t.r > 0) { wins++; pos += t.r; streak = 0; } else { neg += -t.r; streak++; worst = Math.max(worst, streak); }
    run += t.r; equity.push(Math.round(run * 100) / 100);
  }
  return {
    n, wins, winRate: n ? wins / n : 0, avgR: n ? run / n : 0,
    pf: neg ? pos / neg : pos ? 99 : 0, worstStreak: worst, netR: run, equity,
  };
}

function score(s) { return s.n < 8 ? -1e9 + s.n : s.avgR * Math.sqrt(s.n); }

export function verdictFor(tune, unseen) {
  if (unseen.n < 20) return { key: "low", trusted: false, text: `Only ${unseen.n} trades on unseen data. Too few to trust the win rate yet.` };
  if (unseen.pf < 1 || unseen.avgR <= 0) return { key: "bad", trusted: false, text: `Loses money on unseen data (profit factor ${unseen.pf.toFixed(2)}). Hidden from alerts.` };
  if (unseen.pf < 1.1) return { key: "thin", trusted: false, text: `Barely profitable on unseen data (profit factor ${unseen.pf.toFixed(2)}). Costs could erase it.` };
  if (tune.winRate - unseen.winRate > 0.15) return { key: "overfit", trusted: false, text: `Win rate fell ${Math.round((tune.winRate - unseen.winRate) * 100)} points on unseen data. Likely overfit.` };
  const drop = Math.round((tune.winRate - unseen.winRate) * 100);
  return { key: "ok", trusted: true, text: drop > 0 ? `Holds up on unseen data. Win rate dropped only ${drop} points.` : "Holds up on unseen data. Win rate held or improved." };
}

// Walk-forward: pick settings on the first 60%, judge them on the last 40%.
export function evaluate(candles, pair, spreadPips) {
  const x = makeCtx(candles), n = candles.length, split = Math.floor(n * TUNE_SHARE);
  const sp = spreadPips ?? PAIRS[pair].typicalSpread;
  const results = STRATEGIES.map((st) => {
    let best = null;
    for (const p of st.grid) {
      const s = stats(simulate(x, st, p, 0, split, pair, sp));
      if (!best || score(s) > score(best.s)) best = { p, s };
    }
    const unseenTrades = simulate(x, st, best.p, split, n, pair, sp);
    const unseen = stats(unseenTrades);
    const v = verdictFor(best.s, unseen);
    const all = simulate(x, st, best.p, 0, n, pair, sp);
    return {
      key: st.key, name: st.name, author: st.author, style: st.style, params: best.p, rules: st.rules(best.p),
      tune: best.s, unseen, unseenTrades, allTrades: all, verdict: v.key, verdictText: v.text, trusted: v.trusted,
    };
  });
  results.sort((a, b) => (b.trusted - a.trusted) || (b.unseen.avgR * Math.sqrt(Math.max(1, b.unseen.n)) - a.unseen.avgR * Math.sqrt(Math.max(1, a.unseen.n))));
  return { ctx: x, split, splitTime: candles[split]?.t, results };
}

export function lastCompleteIndex(candles) {
  for (let i = candles.length - 1; i >= 0; i--) if (candles[i].complete !== false) return i;
  return -1;
}

// Signals firing on the last completed candle, with confluence.
export function liveSignals(evalResult, pair) {
  const { ctx: x, results } = evalResult, i = lastCompleteIndex(x.c);
  if (i < 2) return [];
  const fired = [];
  for (const r of results) {
    const st = STRATEGY_BY_KEY[r.key], sig = st.signal(x, i, r.params);
    if (!sig) continue;
    const L = levels(sig.dir, x.c[i].c, sig.sl);
    if (L.risk / PAIRS[pair].pip < 3) continue;
    fired.push({ strategy: r.key, name: r.name, trusted: r.trusted, dir: sig.dir, candleTime: x.c[i].t, ...L });
  }
  for (const f of fired) f.confluence = fired.filter((g) => g.dir === f.dir).map((g) => g.strategy);
  return fired;
}

export function strategyStatus(evalResult) {
  const { ctx: x, results } = evalResult, i = lastCompleteIndex(x.c);
  const out = {};
  for (const r of results) out[r.key] = i > 2 ? STRATEGY_BY_KEY[r.key].status(x, i, r.params) : "";
  return out;
}

export function regime(x) {
  const i = lastCompleteIndex(x.c), { adx: a, pdi, mdi } = x.adx(), e800 = x.ema(800);
  const v = a[i];
  return {
    adx: v, label: v >= 25 ? "Trending" : v < 20 ? "Ranging" : "Mixed",
    bias: pdi[i] > mdi[i] ? "up" : "down", htf: x.c[i].c > e800[i] ? "up" : "down",
  };
}

// ── Money ─────────────────────────────────────────────────────
// rates: { "AUD_USD": 0.66, ... } mid prices for conversion. Account currency USD.
export function pipValueUSD(pair, price, rates = {}) {
  const cfg = PAIRS[pair], perLot = 100000 * cfg.pip; // in quote currency
  if (cfg.quote === "USD") return perLot;
  if (cfg.base === "USD") return perLot / price;
  const direct = rates[`${cfg.quote}_USD`], inverse = rates[`USD_${cfg.quote}`];
  if (direct) return perLot * direct;
  if (inverse) return perLot / inverse;
  return null;
}

export function sizeTrade(profile, pair, entry, sl, rates, riskOverrideUsd) {
  const cfg = PAIRS[pair], stopPips = Math.abs(entry - sl) / cfg.pip;
  const riskUsd = riskOverrideUsd ?? (profile.account_size * profile.risk_pct) / 100;
  const pv = pipValueUSD(pair, entry, rates);
  if (!pv || !stopPips) return { stopPips, riskUsd, lots: 0, actualRisk: 0, pipValue: pv };
  const lots = Math.floor((riskUsd / (stopPips * pv)) * 100) / 100;
  return { stopPips, riskUsd, lots, actualRisk: lots * stopPips * pv, pipValue: pv };
}

export function tradePnlUsd(trade, exitPrice, rates) {
  const cfg = PAIRS[trade.pair], s = trade.direction === "buy" ? 1 : -1;
  const pv = pipValueUSD(trade.pair, exitPrice, rates) || 0;
  return (s * (exitPrice - trade.entry) / cfg.pip) * pv * trade.lots;
}

export function dayKey(ts, resetHourUtc = 22) {
  const shift = ((24 - resetHourUtc) % 24) * 3600e3;
  return new Date(new Date(ts).getTime() + shift).toISOString().slice(0, 10);
}

// Account state from the trader's logged trades.
export function accountState(profile, trades, now = Date.now()) {
  const size = Number(profile.account_size), maxLoss = (size * profile.max_loss_pct) / 100, dailyLimit = (size * profile.daily_loss_pct) / 100;
  const closed = trades.filter((t) => t.status === "closed" && t.pnl_usd != null).sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
  let equity = size, high = size; const byDay = {};
  for (const t of closed) {
    equity += Number(t.pnl_usd); high = Math.max(high, equity);
    const k = dayKey(t.closed_at, profile.daily_reset_hour_utc); byDay[k] = (byDay[k] || 0) + Number(t.pnl_usd);
  }
  const floor = (profile.max_loss_type === "trailing" ? high : size) - maxLoss;
  const today = dayKey(now, profile.daily_reset_hour_utc);
  const todayPnl = byDay[today] || 0;
  const dailyUsed = Math.max(0, -todayPnl);
  const totalProfit = equity - size;
  const bestDay = Math.max(0, ...Object.values(byDay));
  const consistencyShare = totalProfit > 0 ? bestDay / totalProfit : 0;
  const consistencyCapUsd = totalProfit > 0 ? Math.max(0, (profile.consistency_pct / 100) * totalProfit - Math.max(0, todayPnl)) : null;
  return {
    size, equity, high, floor, maxLoss, roomToFloor: equity - floor, dailyLimit, dailyUsed, dailyRoom: dailyLimit - dailyUsed,
    todayPnl, totalProfit, bestDay, consistencyShare, consistencyCapUsd, byDay,
  };
}

const CORE_CURRENCIES = (pair) => [PAIRS[pair].base, PAIRS[pair].quote];
function exposure(pair, dir) {
  const [b, q] = CORE_CURRENCIES(pair), s = dir === "buy" ? 1 : -1;
  return { [b]: s, [q]: -s };
}

export function inSession(ts) {
  const d = new Date(ts), h = d.getUTCHours(), wd = d.getUTCDay();
  return wd >= 1 && wd <= 5 && h >= 7 && h < 21;
}

// Pre-trade checks. Returns [{key,label,ok,detail,blocking}]
export function preTradeChecks(profile, sig, { spreadPips, openTrades = [], account, now = Date.now(), riskUsd }) {
  const out = [];
  const maxSpread = Number((profile.max_spread || {})[sig.pair] ?? PAIRS[sig.pair].typicalSpread * 1.5);
  if (spreadPips != null) out.push({ key: "spread", label: `Spread ${spreadPips.toFixed(1)} pips (max ${maxSpread})`, ok: spreadPips <= maxSpread, detail: spreadPips <= maxSpread ? "OK" : "Too wide", blocking: true });
  const halfDaily = account.dailyLimit / 2;
  out.push({ key: "daily", label: "Daily loss used", ok: account.dailyUsed < halfDaily, detail: `$${Math.round(account.dailyUsed)} / $${Math.round(account.dailyLimit)}`, blocking: true });
  out.push({ key: "floor", label: "Room to drawdown floor", ok: account.roomToFloor > riskUsd, detail: `$${Math.round(account.roomToFloor)}`, blocking: true });
  out.push({ key: "dailyRoom", label: "Fits today's loss limit", ok: account.dailyRoom > riskUsd, detail: `$${Math.round(Math.max(0, account.dailyRoom))} left`, blocking: true });
  const open = openTrades.filter((t) => t.status === "open");
  out.push({ key: "open", label: "Open trades", ok: open.length < profile.max_open_trades, detail: `${open.length} / ${profile.max_open_trades}`, blocking: true });
  if (profile.block_correlated) {
    const mine = exposure(sig.pair, sig.dir);
    const clash = open.find((t) => { const e = exposure(t.pair, t.direction); return Object.keys(mine).some((k) => e[k] && e[k] === mine[k]); });
    out.push({ key: "corr", label: "No correlated trade open", ok: !clash, detail: clash ? `${PAIRS[clash.pair].label} open` : "OK", blocking: true });
  }
  if (profile.sessions_only) out.push({ key: "session", label: "London or New York session", ok: inSession(now), detail: inSession(now) ? "Open" : "Closed", blocking: true });
  if (account.consistencyCapUsd != null) out.push({ key: "consistency", label: "Consistency: cap today's profit", ok: true, detail: `$${Math.round(account.consistencyCapUsd)}`, blocking: false });
  return out;
}

export function fmtPrice(pair, v) { return v == null || !isFinite(v) ? "–" : Number(v).toFixed(PAIRS[pair].digits); }
export function fmtR(r) { return r == null ? "–" : `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}R`; }
export function pips(pair, d) { return Math.abs(d) / PAIRS[pair].pip; }
