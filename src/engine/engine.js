// Forex Signal v2 engine — shared by the website and the server scanner.
// Pure JavaScript, no imports. Keep it that way: supabase/functions copy this file.

export const PAIRS = {
  // typicalSpread: conservative OANDA spreads in pips, charged on every backtest trade.
  // contract: units per standard lot (100,000 for currencies; 100 oz for gold, where a pip is $0.10).
  EUR_USD: { label: "EUR/USD", pip: 0.0001, base: "EUR", quote: "USD", digits: 5, typicalSpread: 1.4, contract: 100000 },
  GBP_USD: { label: "GBP/USD", pip: 0.0001, base: "GBP", quote: "USD", digits: 5, typicalSpread: 1.8, contract: 100000 },
  XAU_USD: { label: "Gold", pip: 0.1, base: "XAU", quote: "USD", digits: 2, typicalSpread: 4.0, contract: 100 },
  GBP_AUD: { label: "GBP/AUD", pip: 0.0001, base: "GBP", quote: "AUD", digits: 5, typicalSpread: 4.5, contract: 100000 },
  USD_JPY: { label: "USD/JPY", pip: 0.01, base: "USD", quote: "JPY", digits: 3, typicalSpread: 1.6, contract: 100000 },
  USD_CAD: { label: "USD/CAD", pip: 0.0001, base: "USD", quote: "CAD", digits: 5, typicalSpread: 2.0, contract: 100000 },
  AUD_USD: { label: "AUD/USD", pip: 0.0001, base: "AUD", quote: "USD", digits: 5, typicalSpread: 1.4, contract: 100000 },
  NZD_USD: { label: "NZD/USD", pip: 0.0001, base: "NZD", quote: "USD", digits: 5, typicalSpread: 1.8, contract: 100000 },
  USD_CHF: { label: "USD/CHF", pip: 0.0001, base: "USD", quote: "CHF", digits: 5, typicalSpread: 1.8, contract: 100000 },
  GBP_JPY: { label: "GBP/JPY", pip: 0.01, base: "GBP", quote: "JPY", digits: 3, typicalSpread: 3.0, contract: 100000 },
  EUR_JPY: { label: "EUR/JPY", pip: 0.01, base: "EUR", quote: "JPY", digits: 3, typicalSpread: 2.0, contract: 100000 },
  AUD_JPY: { label: "AUD/JPY", pip: 0.01, base: "AUD", quote: "JPY", digits: 3, typicalSpread: 2.0, contract: 100000 },
  CAD_JPY: { label: "CAD/JPY", pip: 0.01, base: "CAD", quote: "JPY", digits: 3, typicalSpread: 2.6, contract: 100000 },
};
// Prices needed to convert a cross pair's profit into USD.
const USD_LEG = { AUD: "AUD_USD", NZD: "NZD_USD", GBP: "GBP_USD", EUR: "EUR_USD", JPY: "USD_JPY", CAD: "USD_CAD", CHF: "USD_CHF" };
export function conversionPairsFor(pairs) {
  const out = new Set();
  for (const p of pairs) {
    const cfg = PAIRS[p];
    if (cfg && cfg.quote !== "USD" && cfg.base !== "USD" && USD_LEG[cfg.quote]) out.add(USD_LEG[cfg.quote]);
  }
  return [...out];
}
export const CONVERSION_PAIRS = ["AUD_USD"];
export const CANDLE_COUNT = 5000;
const TUNE_SHARE = 0.6;
const MAX_SPREAD_SHARE = 0.15; // spread may be at most 15% of the stop distance

// Timeframes. OANDA's 4-hour candles close at 21, 1, 5, 9, 13, 17 New York time (8 PM, 12 AM, 4 AM, 8 AM, 12 PM, 4 PM Central).
export const TIMEFRAMES = {
  M15: { key: "M15", label: "15m", long: "15-minute", minutes: 15, holdBars: 96, trendEma: 800, trendLabel: "4-hour 50 EMA", minStopPips: 8, expiryHours: 2, asiaBars: 12, sessionFilter: true },
  H1: { key: "H1", label: "1h", long: "1-hour", minutes: 60, holdBars: 120, trendEma: 200, trendLabel: "4-hour 50 EMA", minStopPips: 12, expiryHours: 6, asiaBars: 5, sessionFilter: false },
  H4: { key: "H4", label: "4h", long: "4-hour", minutes: 240, holdBars: 60, trendEma: 300, trendLabel: "daily 50 EMA", minStopPips: 20, expiryHours: 12, asiaBars: 0, sessionFilter: false },
};
export const DEFAULT_TF = "H4";
export const tfOf = (key) => TIMEFRAMES[key] || TIMEFRAMES[DEFAULT_TF];

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
export function makeCtx(candles, tfKey) {
  const closes = candles.map((x) => x.c);
  const cache = {};
  const memo = (k, f) => (cache[k] !== undefined ? cache[k] : (cache[k] = f()));
  const makeNy = () => ctx.ny();
  const ctx = {
    c: candles, closes, n: candles.length, tf: tfOf(tfKey),
    ema: (p) => memo("ema" + p, () => ema(closes, p)),
    rsi: (p) => memo("rsi" + p, () => rsi(closes, p)),
    atr: () => memo("atr", () => atr(candles, 14)),
    adx: () => memo("adx", () => adx(candles, 14)),
    // New York wall-clock time for each candle (handles daylight saving): { date, h (fractional hour), wd }
    ny: () => memo("ny", () => {
      const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
      return candles.map((x) => {
        const o = {};
        for (const part of f.formatToParts(new Date(x.t))) o[part.type] = part.value;
        return { date: `${o.year}-${o.month}-${o.day}`, h: Number(o.hour) % 24 + Number(o.minute) / 60, wd: o.weekday };
      });
    }),
    nyRange: (from, to) => memo(`nyr${from}-${to}`, () => {
      const map = {}, ny = makeNy();
      candles.forEach((x, i) => {
        const k = ny[i];
        if (k.h < from || k.h >= to) return;
        const r = map[k.date] || (map[k.date] = { hi: -Infinity, lo: Infinity, bars: 0 });
        r.hi = Math.max(r.hi, x.h); r.lo = Math.min(r.lo, x.l); r.bars++;
      });
      return map;
    }),
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
  return ctx;
}

const nyClock = (h) => { const hh = Math.floor(h), m = Math.round((h - hh) * 60); return `${((hh + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""} ${hh < 12 ? "AM" : "PM"}`; };
const ctClock = (h) => nyClock((h + 23) % 24);
const utcToCt = (h) => { const now = new Date(); const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h)); return d.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "America/Chicago" }); };
const f1 = (v) => (isFinite(v) ? v.toFixed(0) : "–");

// ── Strategies ────────────────────────────────────────────────
// timeframes: where a strategy makes sense. warmup(tf): candles needed before the first signal.
export const STRATEGIES = [
  {
    key: "grail", name: "Holy Grail", author: "Linda Raschke", style: "Trend pullback",
    timeframes: ["M15", "H1", "H4"], warmup: () => 40,
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
    key: "ema", name: "EMA crossover", author: "Classic trend following", style: "Higher-timeframe trend filter",
    timeframes: ["M15", "H1", "H4"], warmup: (tf) => tf.trendEma + 20,
    grid: [{ f: 9, s: 21 }, { f: 12, s: 26 }, { f: 20, s: 50 }],
    rules: (p, tf) => `${p.f} EMA crosses the ${p.s} EMA in the same direction as the ${tf.trendLabel} trend (${tf.trendEma} EMA on ${tf.long} candles). Stop 1.5 × ATR. TP1 at 1R, TP2 at 2R.`,
    signal(x, i, p) {
      const ef = x.ema(p.f), es = x.ema(p.s), et = x.ema(x.tf.trendEma), at = x.atr(), c = x.c;
      if (!isFinite(at[i])) return null;
      if (ef[i - 1] <= es[i - 1] && ef[i] > es[i] && c[i].c > et[i]) return { dir: "buy", sl: c[i].c - 1.5 * at[i] };
      if (ef[i - 1] >= es[i - 1] && ef[i] < es[i] && c[i].c < et[i]) return { dir: "sell", sl: c[i].c + 1.5 * at[i] };
      return null;
    },
    status(x, i, p) {
      const ef = x.ema(p.f)[i], es = x.ema(p.s)[i], et = x.ema(x.tf.trendEma)[i], up = x.c[i].c > et;
      return `Trend ${up ? "up" : "down"} · ${p.f} EMA ${ef > es ? "above" : "below"} ${p.s} EMA, waiting for a cross ${up ? "up" : "down"}`;
    },
  },
  {
    key: "london", name: "London breakout", author: "Session range breakout", style: "Asian range",
    timeframes: ["M15", "H1"], warmup: () => 40,
    grid: [{ end: 7, until: 10 }, { end: 7, until: 12 }, { end: 6, until: 10 }],
    rules: (p, tf) => `Mark the Asian session high and low (00:00–${String(p.end).padStart(2, "0")}:00 UTC, about 7 PM–${p.end === 7 ? "2" : "1"} AM Central). Enter when a ${tf.long} candle closes outside that range before ${p.until}:00 UTC. Stop at the range midpoint. TP1 at 1R, TP2 at 2R.`,
    signal(x, i, p) {
      const c = x.c, d = new Date(c[i].t), endT = new Date(c[i].t + x.tf.minutes * 60e3), h = endT.getUTCHours(), wd = d.getUTCDay();
      if (wd === 0 || wd === 6 || h < p.end || h >= p.until) return null;
      const r = x.asianRange(p.end)[d.toISOString().slice(0, 10)], at = x.atr()[i];
      if (!r || r.bars < x.tf.asiaBars || !isFinite(at)) return null;
      const mid = (r.hi + r.lo) / 2, width = r.hi - r.lo;
      if (width > 4 * at) return null;
      if (c[i].c > r.hi && c[i - 1].c <= r.hi) return { dir: "buy", sl: Math.min(mid, c[i].c - 0.5 * at) };
      if (c[i].c < r.lo && c[i - 1].c >= r.lo) return { dir: "sell", sl: Math.max(mid, c[i].c + 0.5 * at) };
      return null;
    },
    status(x, i, p) {
      const h = new Date(x.c[i].t + x.tf.minutes * 60e3).getUTCHours();
      if (h < p.end) return "Building the Asian range";
      if (h < p.until) return "London window open, waiting for a close outside the Asian range";
      return `Window closed for today (opens ${p.end}:00 UTC)`;
    },
  },
  {
    key: "soup", name: "Turtle Soup", author: "Linda Raschke", style: "False breakout fade",
    timeframes: ["M15", "H1", "H4"], warmup: () => 40,
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
    key: "rsi", name: "RSI reversal", author: "Mean reversion", style: "Ranging markets only",
    timeframes: ["M15", "H1", "H4"], warmup: () => 40,
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
  {
    key: "nybreak", name: "New York breakout", author: "Session range breakout", style: "London-morning range, traded in New York",
    timeframes: ["M15", "H1"], warmup: () => 40, experimental: true, // no edge found on OANDA H1 data (Oct 2026)
    // Hours are New York time. Range from..to, entries on candles closing after `to` and by `until`.
    grid: [{ from: 3, to: 9, until: 13 }, { from: 3, to: 9, until: 12 }, { from: 7, to: 9, until: 13 }],
    rules: (p, tf) => `Mark the high and low from ${nyClock(p.from)} to ${nyClock(p.to)} New York time (${ctClock(p.from)}–${ctClock(p.to)} Central). Enter when a ${tf.long} candle closes outside that range between ${ctClock(p.to)} and ${ctClock(p.until)} Central. Stop at the range midpoint (at least half an ATR). TP1 at 1R, TP2 at 2R.`,
    signal(x, i, p) {
      const k = x.ny()[i], c = x.c;
      if (k.wd === "Sat" || k.wd === "Sun") return null;
      const closeH = k.h + x.tf.minutes / 60;
      if (closeH <= p.to || closeH > p.until) return null;
      const r = x.nyRange(p.from, p.to)[k.date], at = x.atr()[i];
      if (!r || r.bars < ((p.to - p.from) * 60 / x.tf.minutes) * 0.8 || !isFinite(at)) return null;
      const mid = (r.hi + r.lo) / 2;
      if (r.hi - r.lo > 4 * at) return null;
      if (c[i].c > r.hi && c[i - 1].c <= r.hi) return { dir: "buy", sl: Math.min(mid, c[i].c - 0.5 * at) };
      if (c[i].c < r.lo && c[i - 1].c >= r.lo) return { dir: "sell", sl: Math.max(mid, c[i].c + 0.5 * at) };
      return null;
    },
    status(x, i, p) {
      const h = x.ny()[i].h + x.tf.minutes / 60;
      if (h <= p.to && h > p.from) return `Building the range until ${ctClock(p.to)} Central`;
      if (h > p.to && h <= p.until) return `New York window open until ${ctClock(p.until)} Central, waiting for a close outside the range`;
      return `Next window ${ctClock(p.to)}–${ctClock(p.until)} Central`;
    },
  },
  {
    key: "overnight", name: "Overnight stop orders", author: "London breakout, set before bed", style: "Pending orders",
    timeframes: ["H1"], warmup: () => 40, pending: true, experimental: true, // no edge found on OANDA H1 data (Oct 2026)
    // Hours are UTC. Range 00:00..`to`; the two stop orders are sent at `to` and expire at `until`.
    grid: [{ to: 5, until: 10 }, { to: 5, until: 12 }, { to: 4, until: 10 }],
    rules: (p) => `At ${utcToCt(p.to)} Central the bot sends two pending orders around the overnight range (00:00–${String(p.to).padStart(2, "0")}:00 UTC): a buy stop just above the high and a sell stop just below the low. Whichever triggers first is the trade; cancel the other. Orders expire at ${utcToCt(p.until)} Central. Stop at the range midpoint (at least the timeframe minimum). TP1 at 1R, TP2 at 2R.`,
    orders(x, i, p) {
      const c = x.c, start = new Date(c[i].t), closeH = start.getUTCHours() + x.tf.minutes / 60, wd = start.getUTCDay();
      if (closeH !== p.to || wd === 0 || wd === 6) return null;
      const day = start.toISOString().slice(0, 10);
      let hi = -Infinity, lo = Infinity, bars = 0;
      for (let k = i; k >= 0 && new Date(c[k].t).toISOString().slice(0, 10) === day; k--) { hi = Math.max(hi, c[k].h); lo = Math.min(lo, c[k].l); bars++; }
      const at = x.atr()[i];
      if (bars < (p.to * 60 / x.tf.minutes) * 0.8 || !isFinite(at) || hi - lo > 4 * at) return null;
      const buf = 0.1 * at, mid = (hi + lo) / 2;
      return {
        buy: { entry: hi + buf, sl: mid }, sell: { entry: lo - buf, sl: mid },
        validBars: Math.round(((p.until - p.to) * 60) / x.tf.minutes),
      };
    },
    signal() { return null; },
    status(x, i, p) {
      const h = new Date(x.c[i].t).getUTCHours() + x.tf.minutes / 60;
      if (h < p.to) return `Building the overnight range; orders go out at ${utcToCt(p.to)} Central`;
      if (h < p.until) return `Tonight's orders are live until ${utcToCt(p.until)} Central`;
      return `Next orders at ${utcToCt(p.to)} Central`;
    },
  },
];
export const STRATEGY_BY_KEY = Object.fromEntries(STRATEGIES.map((s) => [s.key, s]));
// Experimental strategies are only run by the screening tool, never shown or alerted.
export const strategiesFor = (tfKey, opts = {}) => STRATEGIES.filter((s) => s.timeframes.includes(tfOf(tfKey).key) && (opts.experimental || !s.experimental));

// ── Trade levels and simulation ───────────────────────────────
export function levels(dir, entry, sl) {
  const risk = Math.abs(entry - sl), s = dir === "buy" ? 1 : -1;
  return { entry, sl, tp1: entry + s * risk, tp2: entry + s * 2 * risk, risk };
}

// Widen a stop that's too tight for the timeframe (noise) or for the spread.
export function applyMinStop(sig, entry, pair, tf) {
  const cfg = PAIRS[pair];
  const minDist = Math.max(tf.minStopPips, cfg.typicalSpread / MAX_SPREAD_SHARE) * cfg.pip;
  if (Math.abs(entry - sig.sl) >= minDist) return sig;
  return { ...sig, sl: sig.dir === "buy" ? entry - minDist : entry + minDist };
}

// Management: hit TP1 → close half, stop to breakeven; TP2 closes the rest.
// Same-candle stop and target counts as a stop (conservative). Spread is charged per trade.
export function simulate(x, strat, params, from, to, pair, spreadPips) {
  const cfg = PAIRS[pair], c = x.c, tf = x.tf, trades = [];
  const start = Math.max(from, strat.warmup(tf), 2);
  for (let i = start; i < to; i++) {
    if (c[i].complete === false) break;
    let sig = strat.signal(x, i, params);
    if (!sig) continue;
    sig = applyMinStop(sig, c[i].c, pair, tf);
    const L = levels(sig.dir, c[i].c, sig.sl);
    const s = sig.dir === "buy" ? 1 : -1;
    let tp1 = false, r = null, j = i + 1;
    for (; j < c.length && j <= i + tf.holdBars; j++) {
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

// Pending orders: two stop orders around a range; the first to trigger becomes the trade.
// If both trigger in the same candle, or the stop is touched in the entry candle, it counts as a loss.
export function simulatePending(x, strat, params, from, to, pair, spreadPips) {
  const cfg = PAIRS[pair], c = x.c, tf = x.tf, trades = [];
  const start = Math.max(from, strat.warmup(tf), 2);
  for (let i = start; i < to; i++) {
    if (c[i].complete === false) break;
    const o = strat.orders(x, i, params);
    if (!o) continue;
    for (const side of ["buy", "sell"]) o[side] = applyMinStopPending(o[side], side, pair, tf);
    let fill = null, j = i + 1;
    for (; j < c.length && j <= i + o.validBars; j++) {
      const b = c[j], hb = b.h >= o.buy.entry, hs = b.l <= o.sell.entry;
      if (!hb && !hs) continue;
      const dir = hb && hs ? (Math.abs(b.o - o.buy.entry) < Math.abs(b.o - o.sell.entry) ? "buy" : "sell") : hb ? "buy" : "sell";
      const ord = o[dir], entry = dir === "buy" ? Math.max(b.o, ord.entry) : Math.min(b.o, ord.entry);
      fill = { dir, entry, sl: ord.sl, j, both: hb && hs };
      break;
    }
    if (!fill) { if (j >= c.length) break; i = j - 1; continue; }
    const L = levels(fill.dir, fill.entry, fill.sl), s = fill.dir === "buy" ? 1 : -1;
    let r = null, tp1 = false, k = fill.j;
    const first = c[k];
    if (fill.both || s * ((s > 0 ? first.l : first.h) - L.sl) <= 0) r = -1;
    for (k = fill.j + 1; r === null && k < c.length && k <= fill.j + tf.holdBars; k++) {
      const adverse = s > 0 ? c[k].l : c[k].h, favor = s > 0 ? c[k].h : c[k].l;
      if (!tp1) {
        if (s * (adverse - L.sl) <= 0) { r = -1; break; }
        if (s * (favor - L.tp1) >= 0) { tp1 = true; if (s * (favor - L.tp2) >= 0) { r = 1.5; break; } }
      } else {
        if (s * (adverse - L.entry) <= 0) { r = 0.5; break; }
        if (s * (favor - L.tp2) >= 0) { r = 1.5; break; }
      }
    }
    if (r === null) {
      if (k >= c.length) break;
      const move = (s * (c[k - 1].c - L.entry)) / L.risk;
      r = tp1 ? 0.5 + 0.5 * move : move;
    }
    r -= (spreadPips * cfg.pip) / L.risk;
    const exitIdx = Math.min(k, c.length - 1);
    trades.push({ i: fill.j, t: c[fill.j].t, dir: fill.dir, ...L, r: Math.round(r * 100) / 100, exitIdx, exitT: c[exitIdx].t });
    i = exitIdx;
  }
  return trades;
}

function applyMinStopPending(ord, dir, pair, tf) {
  const cfg = PAIRS[pair], minDist = Math.max(tf.minStopPips, cfg.typicalSpread / MAX_SPREAD_SHARE) * cfg.pip;
  if (Math.abs(ord.entry - ord.sl) >= minDist) return ord;
  return { ...ord, sl: dir === "buy" ? ord.entry - minDist : ord.entry + minDist };
}

const runSim = (x, st, p, from, to, pair, sp) => (st.pending ? simulatePending : simulate)(x, st, p, from, to, pair, sp);

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
export function evaluate(candles, pair, tfKey = DEFAULT_TF, spreadPips, opts = {}) {
  const x = makeCtx(candles, tfKey), n = candles.length, split = Math.floor(n * TUNE_SHARE);
  const sp = spreadPips ?? PAIRS[pair].typicalSpread;
  const results = strategiesFor(tfKey, opts).map((st) => {
    let best = null;
    for (const p of st.grid) {
      const s = stats(runSim(x, st, p, 0, split, pair, sp));
      if (!best || score(s) > score(best.s)) best = { p, s };
    }
    const unseenTrades = runSim(x, st, best.p, split, n, pair, sp);
    const unseen = stats(unseenTrades);
    const v = verdictFor(best.s, unseen);
    const all = runSim(x, st, best.p, 0, n, pair, sp);
    return {
      key: st.key, name: st.name, author: st.author, style: st.style, params: best.p, rules: st.rules(best.p, x.tf),
      tune: best.s, unseen, unseenTrades, allTrades: all, verdict: v.key, verdictText: v.text, trusted: v.trusted, pending: !!st.pending,
    };
  });
  results.sort((a, b) => (b.trusted - a.trusted) || (b.unseen.avgR * Math.sqrt(Math.max(1, b.unseen.n)) - a.unseen.avgR * Math.sqrt(Math.max(1, a.unseen.n))));
  return { ctx: x, tf: x.tf, split, splitTime: candles[split]?.t, startTime: candles[0]?.t, results };
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
    const st = STRATEGY_BY_KEY[r.key];
    if (st.pending) {
      const o = st.orders(x, i, r.params);
      if (!o) continue;
      const validUntil = x.c[i].t + (o.validBars + 1) * x.tf.minutes * 60e3;
      for (const dir of ["buy", "sell"]) {
        const ord = applyMinStopPending(o[dir], dir, pair, x.tf);
        fired.push({ strategy: r.key, name: r.name, trusted: r.trusted, dir, candleTime: x.c[i].t, orderType: "stop", validUntil, ...levels(dir, ord.entry, ord.sl) });
      }
      continue;
    }
    let sig = st.signal(x, i, r.params);
    if (!sig) continue;
    sig = applyMinStop(sig, x.c[i].c, pair, x.tf);
    const L = levels(sig.dir, x.c[i].c, sig.sl);
    fired.push({ strategy: r.key, name: r.name, trusted: r.trusted, dir: sig.dir, candleTime: x.c[i].t, orderType: "market", ...L });
  }
  for (const f of fired) f.confluence = fired.filter((g) => g.dir === f.dir && g.orderType === f.orderType).map((g) => g.strategy);
  return fired;
}

export function strategyStatus(evalResult) {
  const { ctx: x, results } = evalResult, i = lastCompleteIndex(x.c);
  const out = {};
  for (const r of results) out[r.key] = i > 2 ? STRATEGY_BY_KEY[r.key].status(x, i, r.params) : "";
  return out;
}

export function regime(x) {
  const i = lastCompleteIndex(x.c), { adx: a, pdi, mdi } = x.adx(), et = x.ema(x.tf.trendEma);
  const v = a[i];
  return {
    adx: v, label: v >= 25 ? "Trending" : v < 20 ? "Ranging" : "Mixed",
    bias: pdi[i] > mdi[i] ? "up" : "down", htf: x.c[i].c > et[i] ? "up" : "down", htfLabel: x.tf.trendLabel,
  };
}

// ── Money ─────────────────────────────────────────────────────
// rates: { "AUD_USD": 0.66, ... } mid prices for conversion. Account currency USD.
export function pipValueUSD(pair, price, rates = {}) {
  const cfg = PAIRS[pair], perLot = (cfg.contract || 100000) * cfg.pip; // in quote currency
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
export function preTradeChecks(profile, sig, { spreadPips, stopPips, openTrades = [], account, now = Date.now(), riskUsd }) {
  const out = [], tf = tfOf(profile.timeframe);
  const maxSpread = Number((profile.max_spread || {})[sig.pair] ?? PAIRS[sig.pair].typicalSpread * 1.5);
  if (spreadPips != null) {
    out.push({ key: "spread", label: `Spread ${spreadPips.toFixed(1)} pips (max ${maxSpread})`, ok: spreadPips <= maxSpread, detail: spreadPips <= maxSpread ? "OK" : "Too wide", blocking: true });
    if (stopPips) {
      const share = spreadPips / stopPips;
      out.push({ key: "spreadStop", label: `Spread is ${Math.round(share * 100)}% of the stop (max ${MAX_SPREAD_SHARE * 100}%)`, ok: share <= MAX_SPREAD_SHARE, detail: share <= MAX_SPREAD_SHARE ? "OK" : "Too costly", blocking: true });
    }
  }
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
  if (profile.sessions_only && tf.sessionFilter) out.push({ key: "session", label: "London or New York session", ok: inSession(now), detail: inSession(now) ? "Open" : "Closed", blocking: true });
  if (account.consistencyCapUsd != null) out.push({ key: "consistency", label: "Consistency: cap today's profit", ok: true, detail: `$${Math.round(account.consistencyCapUsd)}`, blocking: false });
  return out;
}

export function fmtPrice(pair, v) { return v == null || !isFinite(v) ? "–" : Number(v).toFixed(PAIRS[pair].digits); }
export function fmtR(r) { return r == null ? "–" : `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}R`; }
export function pips(pair, d) { return Math.abs(d) / PAIRS[pair].pip; }
