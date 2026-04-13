import { useState, useEffect, useCallback } from "react";

const TWELVE_KEY = "0bf94d558ca247f79d8d3b5e5340c631";

// ── Pair Config ───────────────────────────────────────────────
const PAIRS = {
  "EUR/USD": {
    symbol: "EUR/USD",
    twSymbol: "EUR/USD",
    pip: 0.0001,
    color: "#3b82f6",
    sessions: [
      { name: "London Open", utc: "07:00–09:00", rating: 5, note: "Strongest breakouts. Price breaks Asian range. Best entry window of the day." },
      { name: "London Session", utc: "09:00–13:00", rating: 5, note: "Peak EUR/USD volume. Trends develop cleanly. RSI and EMA signals most reliable." },
      { name: "NY Overlap", utc: "13:00–17:00", rating: 5, note: "Highest liquidity of the day. Big moves, tight spreads. Ideal for 25-40 pip targets." },
      { name: "NY Session", utc: "17:00–22:00", rating: 3, note: "Moderate activity. USD news can spike price. Watch for reversals." },
      { name: "Asian Session", utc: "22:00–07:00", rating: 1, note: "Very low volume. Wide spreads. Avoid trading EUR/USD in this window." },
    ],
    bestTime: "09:00–17:00 UTC",
    avoidTime: "22:00–07:00 UTC",
    tipColor: "#3b82f6",
  },
  "GBP/AUD": {
    symbol: "GBP/AUD",
    twSymbol: "GBP/AUD",
    pip: 0.0001,
    color: "#f59e0b",
    sessions: [
      { name: "Sydney Open", utc: "22:00–02:00", rating: 3, note: "AUD liquidity kicks in. Early moves driven by Australian economic data." },
      { name: "Tokyo Session", utc: "00:00–09:00", rating: 3, note: "Moderate AUD movement. Watch RBA news. Can see 50-80 pip swings on data releases." },
      { name: "London Open", utc: "07:00–09:00", rating: 5, note: "GBP wakes up. Explosive moves as London traders price in overnight Asia action." },
      { name: "London Session", utc: "09:00–13:00", rating: 5, note: "Best window for GBP/AUD. Both currencies active. 100-200 pip days common here." },
      { name: "NY Overlap", utc: "13:00–17:00", rating: 4, note: "GBP/AUD trends continue. USD sentiment affects AUD side. Good continuation trades." },
      { name: "NY/Late", utc: "17:00–22:00", rating: 2, note: "GBP liquidity drops. AUD holds moderate volume. Wider spreads — be cautious." },
    ],
    bestTime: "07:00–15:00 UTC",
    avoidTime: "17:00–22:00 UTC",
    tipColor: "#f59e0b",
  },
  "USD/JPY": {
    symbol: "USD/JPY",
    twSymbol: "USD/JPY",
    pip: 0.01,
    color: "#ef4444",
    sessions: [
      { name: "Tokyo Open", utc: "00:00–03:00", rating: 5, note: "Prime USD/JPY time. Japanese banks set rates. BoJ interventions happen here. Watch Tokyo Fix at 09:55 JST." },
      { name: "Tokyo Session", utc: "00:00–09:00", rating: 5, note: "Most active session for JPY pairs. Trends are strong and directional. Best setups of the day." },
      { name: "London Open", utc: "07:00–09:00", rating: 4, note: "London-Tokyo overlap. Excellent volatility. EUR/USD moves drag USD/JPY via USD correlation." },
      { name: "NY Open", utc: "13:00–17:00", rating: 5, note: "US data drives USD. NFP, CPI, FOMC can move USD/JPY 100-200 pips instantly. Massive opportunity." },
      { name: "NY Session", utc: "17:00–22:00", rating: 3, note: "Moderate USD/JPY volume. Good for swing setups targeting next Tokyo session." },
      { name: "Dead Zone", utc: "09:00–13:00", rating: 1, note: "Tokyo closed, NY not open yet. USD/JPY often flat. Very low volume — avoid this window." },
    ],
    bestTime: "00:00–03:00 & 13:00–17:00 UTC",
    avoidTime: "09:00–13:00 UTC",
    tipColor: "#ef4444",
  },
};

// ── Live Data ─────────────────────────────────────────────────
async function fetchCandles(symbol, interval = "15min", outputsize = 80) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${TWELVE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message);
  if (!data.values || !data.values.length) throw new Error("No candle data returned");
  return data.values.reverse().map((v, i, arr) => ({
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    time: new Date(v.datetime).getTime(),
  }));
}

async function fetchPrice(symbol) {
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${TWELVE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.price) throw new Error("No price");
  return parseFloat(data.price);
}

// ── Indicators ────────────────────────────────────────────────
function calcEMA(data, p) {
  const k = 2 / (p + 1); let e = data[0];
  return data.map(v => { e = v * k + e * (1 - k); return e; });
}
function calcRSI(closes, p = 14) {
  const g = [], l = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    g.push(d > 0 ? d : 0); l.push(d < 0 ? -d : 0);
  }
  let ag = g.slice(0, p).reduce((a, b) => a + b) / p;
  let al = l.slice(0, p).reduce((a, b) => a + b) / p;
  const rsi = [50];
  for (let i = p; i < g.length; i++) {
    ag = (ag * (p - 1) + g[i]) / p; al = (al * (p - 1) + l[i]) / p;
    rsi.push(100 - 100 / (1 + (al === 0 ? 100 : ag / al)));
  }
  return rsi;
}
function calcMACD(closes) {
  const e12 = calcEMA(closes, 12), e26 = calcEMA(closes, 26);
  const ml = e12.map((v, i) => v - e26[i]), sig = calcEMA(ml, 9);
  return { histogram: ml.map((v, i) => v - sig[i]) };
}
function detectPattern(candles) {
  const l = candles[candles.length - 1], p = candles[candles.length - 2];
  const body = Math.abs(l.close - l.open), range = (l.high - l.low) || 0.0001;
  const uw = l.high - Math.max(l.close, l.open), lw = Math.min(l.close, l.open) - l.low;
  if (body / range < 0.1) return { name: "Doji", bias: "neutral", strength: 60 };
  if (lw > body * 2 && uw < body * 0.5) return { name: "Hammer", bias: "bullish", strength: 72 };
  if (uw > body * 2 && lw < body * 0.5) return { name: "Shooting Star", bias: "bearish", strength: 70 };
  if (l.close > l.open && p.close < p.open && l.close > p.open && l.open < p.close) return { name: "Bullish Engulfing", bias: "bullish", strength: 82 };
  if (l.close < l.open && p.close > p.open && l.close < p.open && l.open > p.close) return { name: "Bearish Engulfing", bias: "bearish", strength: 80 };
  return { name: l.close > l.open ? "Bullish Candle" : "Bearish Candle", bias: l.close > l.open ? "bullish" : "bearish", strength: 55 };
}
function calcSupRes(candles) {
  const hs = candles.map(c => c.high).sort((a, b) => b - a);
  const ls = candles.map(c => c.low).sort((a, b) => a - b);
  return { resistance: hs.slice(0, 5).reduce((a, b) => a + b) / 5, support: ls.slice(0, 5).reduce((a, b) => a + b) / 5 };
}
function toPips(v, pip) { return Math.round(Math.abs(v) / pip); }

function getSessionStatus(pairKey) {
  const h = new Date().getUTCHours();
  const m = new Date().getUTCMinutes();
  const dec = h + m / 60;
  if (pairKey === "EUR/USD") {
    if (dec >= 7 && dec < 9) return { name: "London Open", hot: true, color: "#f59e0b" };
    if (dec >= 9 && dec < 13) return { name: "London Session", hot: true, color: "#22c55e" };
    if (dec >= 13 && dec < 17) return { name: "London/NY Overlap", hot: true, color: "#22c55e" };
    if (dec >= 17 && dec < 22) return { name: "NY Session", hot: true, color: "#3b82f6" };
    return { name: "Asian Session", hot: false, color: "#6b7280" };
  }
  if (pairKey === "GBP/AUD") {
    if (dec >= 7 && dec < 15) return { name: "London Active", hot: true, color: "#22c55e" };
    if (dec >= 22 || dec < 7) return { name: "Sydney/Tokyo", hot: true, color: "#f59e0b" };
    return { name: "Low Volume", hot: false, color: "#6b7280" };
  }
  if (pairKey === "USD/JPY") {
    if (dec >= 0 && dec < 9) return { name: "Tokyo Session", hot: true, color: "#22c55e" };
    if (dec >= 13 && dec < 17) return { name: "NY Session", hot: true, color: "#3b82f6" };
    if (dec >= 7 && dec < 9) return { name: "London Open", hot: true, color: "#f59e0b" };
    return { name: "Low Volume", hot: false, color: "#6b7280" };
  }
  return { name: "Unknown", hot: false, color: "#6b7280" };
}

function analyzeSignals(candles, pairKey) {
  const pip = PAIRS[pairKey].pip;
  const closes = candles.map(c => c.close);
  const ema20 = calcEMA(closes, 20), ema50 = calcEMA(closes, 50);
  const rsi = calcRSI(closes), { histogram } = calcMACD(closes);
  const pattern = detectPattern(candles);
  const { support, resistance } = calcSupRes(candles);
  const price = closes[closes.length - 1];
  const lRSI = rsi[rsi.length - 1];
  const lE20 = ema20[ema20.length - 1], lE50 = ema50[ema50.length - 1];
  const pE20 = ema20[ema20.length - 2], pE50 = ema50[ema50.length - 2];
  const lH = histogram[histogram.length - 1], pH = histogram[histogram.length - 2];
  const session = getSessionStatus(pairKey);

  let bull = 0, bear = 0, signals = [];
  const cross = lE20 > lE50, justCrossed = (pE20 <= pE50 && lE20 > lE50) || (pE20 >= pE50 && lE20 < lE50);
  if (cross) { bull += justCrossed ? 25 : 15; signals.push({ label: "EMA 20/50", value: justCrossed ? "Golden Cross ✦" : "Bullish Stack", bias: "bull", weight: justCrossed ? 25 : 15 }); }
  else { bear += justCrossed ? 25 : 15; signals.push({ label: "EMA 20/50", value: justCrossed ? "Death Cross ✦" : "Bearish Stack", bias: "bear", weight: justCrossed ? 25 : 15 }); }
  if (lRSI < 35) { bull += 22; signals.push({ label: "RSI", value: `${lRSI.toFixed(1)} — Oversold`, bias: "bull", weight: 22 }); }
  else if (lRSI > 65) { bear += 22; signals.push({ label: "RSI", value: `${lRSI.toFixed(1)} — Overbought`, bias: "bear", weight: 22 }); }
  else signals.push({ label: "RSI", value: `${lRSI.toFixed(1)} — Neutral`, bias: "neutral", weight: 0 });
  if (lH > 0 && pH <= 0) { bull += 20; signals.push({ label: "MACD", value: "Histogram Cross ↑", bias: "bull", weight: 20 }); }
  else if (lH < 0 && pH >= 0) { bear += 20; signals.push({ label: "MACD", value: "Histogram Cross ↓", bias: "bear", weight: 20 }); }
  else if (lH > 0) { bull += 10; signals.push({ label: "MACD", value: "Positive Momentum", bias: "bull", weight: 10 }); }
  else { bear += 10; signals.push({ label: "MACD", value: "Negative Momentum", bias: "bear", weight: 10 }); }
  const dS = Math.abs(price - support), dR = Math.abs(price - resistance);
  if (dS < dR * 0.6) { bull += 18; signals.push({ label: "S/R Zone", value: "Near Support", bias: "bull", weight: 18 }); }
  else if (dR < dS * 0.6) { bear += 18; signals.push({ label: "S/R Zone", value: "Near Resistance", bias: "bear", weight: 18 }); }
  else signals.push({ label: "S/R Zone", value: "Mid-range", bias: "neutral", weight: 0 });
  if (pattern.bias === "bullish") { bull += pattern.strength * 0.15; signals.push({ label: "Pattern", value: pattern.name, bias: "bull", weight: Math.round(pattern.strength * 0.15) }); }
  else if (pattern.bias === "bearish") { bear += pattern.strength * 0.15; signals.push({ label: "Pattern", value: pattern.name, bias: "bear", weight: Math.round(pattern.strength * 0.15) }); }
  else signals.push({ label: "Pattern", value: pattern.name, bias: "neutral", weight: 0 });

  const total = bull + bear;
  const confidence = total > 0 ? Math.round(Math.max(bull, bear) / total * 100) : 50;
  const direction = bull > bear ? "BUY" : bear > bull ? "SELL" : "WAIT";
  const atr = candles.slice(-14).reduce((acc, c) => acc + (c.high - c.low), 0) / 14;
  const entry = price;
  const sl = direction === "BUY" ? entry - atr * 1.5 : entry + atr * 1.5;
  const tp1 = direction === "BUY" ? entry + atr * 2 : entry - atr * 2;
  const tp2 = direction === "BUY" ? entry + atr * 3.5 : entry - atr * 3.5;
  const boostedConf = Math.min(99, confidence + (session.hot ? 6 : 0));
  return {
    direction, confidence: boostedConf, signals, entry, sl, tp1, tp2,
    rr1: Math.abs(tp1 - entry) / Math.abs(sl - entry),
    rr2: Math.abs(tp2 - entry) / Math.abs(sl - entry),
    slPips: toPips(sl - entry, pip), tp1Pips: toPips(tp1 - entry, pip), tp2Pips: toPips(tp2 - entry, pip),
    price, support, resistance, rsi: lRSI, pattern, atr, session
  };
}

// ── Chart ─────────────────────────────────────────────────────
function CandleChart({ candles, support, resistance, color }) {
  const W = 560, H = 140, pad = { l: 8, r: 58, t: 8, b: 18 };
  const display = candles.slice(-50);
  const allP = display.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...allP, support) * 0.9998;
  const maxP = Math.max(...allP, resistance) * 1.0002;
  const sy = v => pad.t + (1 - (v - minP) / (maxP - minP)) * (H - pad.t - pad.b);
  const cw = (W - pad.l - pad.r) / display.length;
  const closes = candles.map(c => c.close);
  const e20 = calcEMA(closes, 20), e50 = calcEMA(closes, 50);
  const off = candles.length - display.length;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={pad.l} y={sy(support)} width={W - pad.l - pad.r} height={Math.max(sy(minP) - sy(support), 0)} fill={`url(#sg${color.replace("#","")})`} />
      <line x1={pad.l} x2={W - pad.r} y1={sy(support)} y2={sy(support)} stroke="#22c55e" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
      <line x1={pad.l} x2={W - pad.r} y1={sy(resistance)} y2={sy(resistance)} stroke="#ef4444" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
      <text x={W - pad.r + 3} y={sy(support) + 3} fill="#22c55e" fontSize="8">SUP</text>
      <text x={W - pad.r + 3} y={sy(resistance) + 3} fill="#ef4444" fontSize="8">RES</text>
      {display.map((_, i) => i === 0 ? null : (
        <g key={`l${i}`}>
          <line x1={pad.l + (i - 1) * cw + cw / 2} y1={sy(e20[off + i - 1])} x2={pad.l + i * cw + cw / 2} y2={sy(e20[off + i])} stroke="#f59e0b" strokeWidth="1.2" opacity="0.85" />
          <line x1={pad.l + (i - 1) * cw + cw / 2} y1={sy(e50[off + i - 1])} x2={pad.l + i * cw + cw / 2} y2={sy(e50[off + i])} stroke="#818cf8" strokeWidth="1.2" opacity="0.85" />
        </g>
      ))}
      {display.map((c, i) => {
        const x = pad.l + i * cw + cw * 0.2, w = cw * 0.6;
        const bull = c.close >= c.open, col = bull ? "#22c55e" : "#ef4444";
        const bT = sy(Math.max(c.open, c.close)), bB = sy(Math.min(c.open, c.close));
        return (
          <g key={i}>
            <line x1={x + w / 2} y1={sy(c.high)} x2={x + w / 2} y2={sy(c.low)} stroke={col} strokeWidth="0.8" />
            <rect x={x} y={bT} width={w} height={Math.max(bB - bT, 1)} fill={i === display.length - 1 ? col : bull ? "#22c55e44" : "#ef444444"} stroke={col} strokeWidth="0.5" />
          </g>
        );
      })}
    </svg>
  );
}

// ── Star Rating ───────────────────────────────────────────────
function Stars({ rating }) {
  return (
    <span style={{ letterSpacing: "1px" }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ color: i <= rating ? "#f59e0b" : "#1e2d4a", fontSize: "12px" }}>★</span>
      ))}
    </span>
  );
}

// ── Pair Panel ────────────────────────────────────────────────
function PairPanel({ pairKey, candles, analysis, loading, error, onRefresh }) {
  const pair = PAIRS[pairKey];
  const [tab, setTab] = useState("levels");
  const tabs = [["levels", "📍 LEVELS"], ["signals", "📊 SIGNALS"], ["sessions", "🕐 SESSIONS"], ["setups", "🎯 SETUPS"]];

  if (loading) return (
    <div style={{ background: "#0d1425", border: `1px solid ${pair.color}33`, borderRadius: "14px", padding: "30px", textAlign: "center", marginBottom: "16px" }}>
      <div style={{ fontSize: "22px", animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</div>
      <div style={{ fontSize: "10px", color: "#334155", letterSpacing: "2px", marginTop: "8px" }}>LOADING {pairKey}...</div>
    </div>
  );

  if (error) return (
    <div style={{ background: "#0d1425", border: "1px solid #7f1d1d", borderRadius: "14px", padding: "20px", textAlign: "center", marginBottom: "16px" }}>
      <div style={{ fontSize: "11px", color: "#f87171", marginBottom: "8px" }}>⚠️ {pairKey} — {error}</div>
      <button onClick={onRefresh} style={{ background: "#0f2040", color: "#93c5fd", border: "1px solid #1d4ed8", borderRadius: "6px", padding: "6px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: "10px" }}>RETRY</button>
    </div>
  );

  if (!analysis || !candles) return null;

  const { direction, confidence, signals, entry, sl, tp1, tp2, rr1, rr2, slPips, tp1Pips, tp2Pips, price, support, resistance, rsi, pattern, session } = analysis;
  const dc = direction === "BUY" ? "#22c55e" : direction === "SELL" ? "#f87171" : "#fbbf24";
  const dp = pair.pip === 0.01 ? 3 : 5;

  // Setups for this pair
  const setups = [
    {
      name: "Breakout Setup",
      direction: direction === "WAIT" ? "BUY" : direction,
      tp1Pips: Math.round(toPips(analysis.atr * 2, pair.pip)),
      tp2Pips: Math.round(toPips(analysis.atr * 3.5, pair.pip)),
      slPips: Math.round(toPips(analysis.atr * 1.5, pair.pip)),
      entry: entry.toFixed(dp),
      sl: sl.toFixed(dp),
      tp1: tp1.toFixed(dp),
      tp2: tp2.toFixed(dp),
      rr1: rr1.toFixed(1),
      rr2: rr2.toFixed(1),
      note: `Enter on ${session.name} candle close. ATR-based levels.`,
    },
    {
      name: "RSI Bounce",
      direction: rsi < 50 ? "BUY" : "SELL",
      tp1Pips: Math.round(toPips(analysis.atr * 1.8, pair.pip)),
      tp2Pips: Math.round(toPips(analysis.atr * 3, pair.pip)),
      slPips: Math.round(toPips(analysis.atr * 1.2, pair.pip)),
      entry: entry.toFixed(dp),
      sl: (rsi < 50 ? entry - analysis.atr * 1.2 : entry + analysis.atr * 1.2).toFixed(dp),
      tp1: (rsi < 50 ? entry + analysis.atr * 1.8 : entry - analysis.atr * 1.8).toFixed(dp),
      tp2: (rsi < 50 ? entry + analysis.atr * 3 : entry - analysis.atr * 3).toFixed(dp),
      rr1: "1.5",
      rr2: "2.5",
      note: `RSI ${rsi.toFixed(0)} — ${rsi < 35 ? "oversold, look for bounce" : rsi > 65 ? "overbought, look for reversal" : "neutral zone"}`,
    },
  ];

  return (
    <div style={{ background: "#0d1425", border: `1px solid ${pair.color}44`, borderRadius: "14px", marginBottom: "16px", overflow: "hidden" }}>
      {/* Pair Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #111827", display: "flex", justifyContent: "space-between", alignItems: "center", background: `${pair.color}08` }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: "800", color: "#f1f5f9", letterSpacing: "-0.5px" }}>
            {pairKey.split("/")[0]}<span style={{ color: pair.color }}>/</span>{pairKey.split("/")[1]}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
            <span style={{ display: "inline-block", width: "5px", height: "5px", background: "#22c55e", borderRadius: "50%", animation: "blink 2s infinite" }}></span>
            <span style={{ fontSize: "9px", color: session.color, fontWeight: "700" }}>{session.name}</span>
            {!session.hot && <span style={{ fontSize: "9px", color: "#4b5563" }}>· Low volume</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "#f8fafc", letterSpacing: "-0.5px" }}>{price.toFixed(dp)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", justifyContent: "flex-end" }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "18px", fontWeight: "800", color: dc }}>{direction}</div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: dc }}>{confidence}%</div>
          </div>
        </div>
      </div>

      {/* Confidence Bar */}
      <div style={{ height: "3px", background: "#0a1020" }}>
        <div style={{ width: `${confidence}%`, height: "100%", background: `linear-gradient(90deg, ${dc}66, ${dc})`, transition: "width 0.6s" }} />
      </div>

      {/* Chart */}
      <div style={{ padding: "10px 8px 4px", borderBottom: "1px solid #111827" }}>
        <div style={{ display: "flex", gap: "12px", marginBottom: "5px", fontSize: "9px", paddingLeft: "4px" }}>
          <span style={{ color: "#f59e0b" }}>── EMA20</span>
          <span style={{ color: "#818cf8" }}>── EMA50</span>
          <span style={{ color: "#22c55e" }}>- - SUP</span>
          <span style={{ color: "#ef4444" }}>- - RES</span>
        </div>
        <CandleChart candles={candles} support={support} resistance={resistance} color={pair.color} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #111827", padding: "0 8px", overflowX: "auto" }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ background: "none", border: "none", color: tab === k ? pair.color : "#374151", cursor: "pointer", fontFamily: "inherit", fontSize: "9px", fontWeight: "700", letterSpacing: "0.8px", padding: "8px 10px", borderBottom: `2px solid ${tab === k ? pair.color : "transparent"}`, transition: "all 0.2s", whiteSpace: "nowrap" }}>{l}</button>
        ))}
      </div>

      <div style={{ padding: "14px" }}>

        {/* LEVELS */}
        {tab === "levels" && (
          <div>
            {/* Entry */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#0a1628", border: `1.5px solid ${pair.color}44`, borderRadius: "10px", marginBottom: "8px" }}>
              <div>
                <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "2px", marginBottom: "4px" }}>⚡ ENTRY POINT</div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#93c5fd", letterSpacing: "-0.5px" }}>{entry.toFixed(dp)}</div>
                <div style={{ fontSize: "9px", color: "#334155", marginTop: "2px" }}>Execute {direction} at market price</div>
              </div>
              <div style={{ background: `${dc}22`, color: dc, border: `1px solid ${dc}55`, borderRadius: "8px", padding: "8px 16px", fontWeight: "800", fontSize: "14px", fontFamily: "'Syne',sans-serif" }}>{direction}</div>
            </div>
            {/* SL */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: "#120808", border: "1.5px solid #7f1d1d55", borderRadius: "10px", marginBottom: "6px" }}>
              <div>
                <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "2px", marginBottom: "3px" }}>🛑 STOP LOSS</div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#f87171" }}>{sl.toFixed(dp)}</div>
                <div style={{ fontSize: "9px", color: "#4b1d1d", marginTop: "2px" }}>{direction === "BUY" ? `${slPips} pips below` : `${slPips} pips above`} entry</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", color: "#475569" }}>RISK</div>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "#f87171" }}>{slPips}</div>
                <div style={{ fontSize: "10px", color: "#6b2020" }}>pips</div>
              </div>
            </div>
            <div style={{ textAlign: "center", color: "#1e2d4a", margin: "3px 0" }}>↕</div>
            {/* TP1 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: "#061510", border: "1.5px solid #14532d55", borderRadius: "10px", marginBottom: "6px" }}>
              <div>
                <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "2px", marginBottom: "3px" }}>🎯 TAKE PROFIT 1</div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#4ade80" }}>{tp1.toFixed(dp)}</div>
                <div style={{ fontSize: "9px", color: "#14532d", marginTop: "2px" }}>{direction === "BUY" ? `${tp1Pips} pips above` : `${tp1Pips} pips below`} entry</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", color: "#475569" }}>REWARD</div>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "#4ade80" }}>{tp1Pips}</div>
                <div style={{ fontSize: "10px", color: "#16a34a", fontWeight: "700" }}>R:R {rr1.toFixed(1)}x</div>
              </div>
            </div>
            <div style={{ textAlign: "center", color: "#1e2d4a", margin: "3px 0" }}>↕</div>
            {/* TP2 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: "#061510", border: "1.5px solid #16653455", borderRadius: "10px", marginBottom: "8px" }}>
              <div>
                <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "2px", marginBottom: "3px" }}>🎯 TAKE PROFIT 2</div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#86efac" }}>{tp2.toFixed(dp)}</div>
                <div style={{ fontSize: "9px", color: "#166534", marginTop: "2px" }}>{direction === "BUY" ? `${tp2Pips} pips above` : `${tp2Pips} pips below`} entry</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", color: "#475569" }}>REWARD</div>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "#86efac" }}>{tp2Pips}</div>
                <div style={{ fontSize: "10px", color: "#22c55e", fontWeight: "700" }}>R:R {rr2.toFixed(1)}x</div>
              </div>
            </div>
            {/* S/R */}
            <div style={{ display: "flex", gap: "8px" }}>
              {[{ label: "SUPPORT", val: support.toFixed(dp), color: "#22c55e" }, { label: "LIVE PRICE", val: price.toFixed(dp), color: "#93c5fd" }, { label: "RESISTANCE", val: resistance.toFixed(dp), color: "#f87171" }].map(({ label, val, color }) => (
                <div key={label} style={{ flex: 1, background: "#070b14", border: "1px solid #1a2540", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: "8px", color: "#334155", letterSpacing: "1px", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontSize: "11px", fontWeight: "700", color }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SIGNALS */}
        {tab === "signals" && (
          <div>
            {signals.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #0f172a" }}>
                <span style={{ fontSize: "10px", color: "#4b5563", letterSpacing: "1.5px" }}>{s.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: s.bias === "bull" ? "#4ade80" : s.bias === "bear" ? "#f87171" : "#fbbf24" }}>{s.value}</span>
                  {s.weight > 0 && <span style={{ background: s.bias === "bull" ? "#4ade8018" : "#f8717118", color: s.bias === "bull" ? "#4ade80" : "#f87171", border: `1px solid ${s.bias === "bull" ? "#4ade8033" : "#f8717133"}`, padding: "1px 7px", borderRadius: "20px", fontSize: "9px", fontWeight: "700" }}>+{s.weight}</span>}
                </div>
              </div>
            ))}
            <div style={{ marginTop: "12px", padding: "10px", background: "#070b14", borderRadius: "8px", border: "1px solid #1a2540", display: "flex", justifyContent: "space-between" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "8px", color: "#334155", letterSpacing: "1px" }}>PATTERN</div>
                <div style={{ fontSize: "11px", color: "#f1f5f9", marginTop: "2px", fontWeight: "600" }}>{pattern.name}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "8px", color: "#334155", letterSpacing: "1px" }}>RSI</div>
                <div style={{ fontSize: "11px", color: rsi < 35 ? "#4ade80" : rsi > 65 ? "#f87171" : "#fbbf24", marginTop: "2px", fontWeight: "700" }}>{rsi.toFixed(1)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "8px", color: "#334155", letterSpacing: "1px" }}>SIGNAL</div>
                <div style={{ fontSize: "11px", color: dc, marginTop: "2px", fontWeight: "800" }}>{direction}</div>
              </div>
            </div>
          </div>
        )}

        {/* SESSIONS */}
        {tab === "sessions" && (
          <div>
            <div style={{ marginBottom: "12px", padding: "10px 12px", background: "#070b14", borderRadius: "8px", border: `1px solid ${pair.color}33` }}>
              <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "2px", marginBottom: "4px" }}>BEST TIMES TO TRADE {pairKey}</div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#4ade80" }}>✓ {pair.bestTime}</div>
              <div style={{ fontSize: "11px", color: "#f87171", marginTop: "3px" }}>✗ Avoid: {pair.avoidTime}</div>
            </div>
            {pair.sessions.map((s, i) => (
              <div key={i} style={{ padding: "10px 12px", background: s.rating >= 4 ? "#070f08" : s.rating <= 1 ? "#0f0707" : "#070b14", border: `1px solid ${s.rating >= 4 ? "#22c55e22" : s.rating <= 1 ? "#ef444422" : "#1a2540"}`, borderRadius: "8px", marginBottom: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                  <div>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: s.rating >= 4 ? "#4ade80" : s.rating <= 1 ? "#f87171" : "#94a3b8" }}>{s.name}</span>
                    <span style={{ fontSize: "9px", color: "#334155", marginLeft: "8px" }}>{s.utc} UTC</span>
                  </div>
                  <Stars rating={s.rating} />
                </div>
                <p style={{ fontSize: "10px", color: "#4b5563", lineHeight: "1.5", margin: 0 }}>{s.note}</p>
              </div>
            ))}
          </div>
        )}

        {/* SETUPS */}
        {tab === "setups" && (
          <div>
            <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "2px", marginBottom: "12px" }}>LIVE SETUPS BASED ON REAL PRICE</div>
            {setups.map((s, idx) => (
              <div key={idx} style={{ background: "#0a1020", border: "1px solid #1a2540", borderRadius: "10px", padding: "14px", marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#f1f5f9" }}>{s.name}</div>
                  <span style={{ background: s.direction === "BUY" ? "#22c55e22" : "#f8717122", color: s.direction === "BUY" ? "#4ade80" : "#f87171", border: `1px solid ${s.direction === "BUY" ? "#22c55e33" : "#f8717133"}`, padding: "2px 10px", borderRadius: "20px", fontSize: "10px", fontWeight: "700" }}>{s.direction}</span>
                </div>
                <p style={{ fontSize: "10px", color: "#64748b", lineHeight: "1.5", marginBottom: "10px" }}>{s.note}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px" }}>
                  {[
                    { label: "ENTRY", val: s.entry, color: "#93c5fd" },
                    { label: `STOP\n${s.slPips}p`, val: s.sl, color: "#f87171" },
                    { label: `TP1\n${s.tp1Pips}p`, val: s.tp1, color: "#4ade80" },
                    { label: `TP2\n${s.tp2Pips}p`, val: s.tp2, color: "#86efac" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ background: "#070b14", borderRadius: "6px", padding: "6px", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: "#334155", letterSpacing: "0.5px", marginBottom: "2px", whiteSpace: "pre-line", lineHeight: "1.2" }}>{label}</div>
                      <div style={{ fontSize: "10px", fontWeight: "700", color }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px", fontSize: "10px", color: "#334155" }}>
                  <span>R:R TP1 <b style={{ color: "#4ade80" }}>{s.rr1}x</b></span>
                  <span>R:R TP2 <b style={{ color: "#86efac" }}>{s.rr2}x</b></span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [pairData, setPairData] = useState({
    "EUR/USD": { candles: null, analysis: null, loading: true, error: null },
    "GBP/AUD": { candles: null, analysis: null, loading: true, error: null },
    "USD/JPY": { candles: null, analysis: null, loading: true, error: null },
  });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activePair, setActivePair] = useState("ALL");

  const loadPair = useCallback(async (pairKey) => {
    setPairData(prev => ({ ...prev, [pairKey]: { ...prev[pairKey], loading: true, error: null } }));
    try {
      const candles = await fetchCandles(PAIRS[pairKey].twSymbol);
      const analysis = analyzeSignals(candles, pairKey);
      setPairData(prev => ({ ...prev, [pairKey]: { candles, analysis, loading: false, error: null } }));
    } catch (e) {
      setPairData(prev => ({ ...prev, [pairKey]: { ...prev[pairKey], loading: false, error: e.message } }));
    }
  }, []);

  const loadAll = useCallback(() => {
    Object.keys(PAIRS).forEach(p => loadPair(p));
    setLastUpdate(new Date());
  }, [loadPair]);

  useEffect(() => {
    loadAll();
    // Refresh every 5 minutes to stay within free tier limits
    const id = setInterval(() => {
      loadAll();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadAll]);

  const pairKeys = Object.keys(PAIRS);
  const displayPairs = activePair === "ALL" ? pairKeys : [activePair];

  return (
    <div style={{ background: "#070b14", minHeight: "100vh", color: "#e2e8f0", fontFamily: "'IBM Plex Mono', monospace", padding: "16px", maxWidth: "620px", margin: "0 auto" }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0d1425; }
        ::-webkit-scrollbar-thumb { background: #1e2d4a; border-radius: 2px; }
      `}</style>

      {/* App Header */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "28px", fontWeight: "800", color: "#f1f5f9", letterSpacing: "-1px", lineHeight: 1 }}>
              FOREX<span style={{ color: "#3b82f6" }}>.</span>SIGNAL
            </div>
            <div style={{ fontSize: "9px", color: "#1e3a5f", letterSpacing: "3px", marginTop: "3px" }}>INTELLIGENCE TOOL v3.0</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "#22c55e18", border: "1px solid #22c55e33", borderRadius: "20px", padding: "3px 10px" }}>
              <span style={{ display: "inline-block", width: "5px", height: "5px", background: "#22c55e", borderRadius: "50%", animation: "blink 2s infinite" }}></span>
              <span style={{ fontSize: "9px", color: "#22c55e", fontWeight: "700" }}>LIVE · TWELVE DATA</span>
            </div>
            {lastUpdate && <div style={{ fontSize: "9px", color: "#1e3a5f", marginTop: "4px" }}>Updated {lastUpdate.toLocaleTimeString()}</div>}
          </div>
        </div>

        {/* Pair Switcher */}
        <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
          {["ALL", ...pairKeys].map(p => {
            const isActive = activePair === p;
            const col = p === "ALL" ? "#6b7280" : PAIRS[p]?.color || "#6b7280";
            return (
              <button key={p} onClick={() => setActivePair(p)} style={{ background: isActive ? `${col}22` : "#0d1425", border: `1.5px solid ${isActive ? col : "#1a2540"}`, color: isActive ? col : "#4b5563", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: "10px", fontWeight: "700", letterSpacing: "1px", transition: "all 0.2s" }}>
                {p}
              </button>
            );
          })}
          <button onClick={loadAll} style={{ marginLeft: "auto", background: "#0d1425", border: "1px solid #1a2540", color: "#334155", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: "10px", fontWeight: "700", letterSpacing: "1px" }}>
            ↻ REFRESH
          </button>
        </div>
      </div>

      {/* Session Clock */}
      <div style={{ background: "#0d1425", border: "1px solid #1a2540", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "9px", color: "#334155", letterSpacing: "2px", marginBottom: "10px" }}>CURRENT MARKET SESSIONS · {new Date().toUTCString().slice(17, 22)} UTC</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          {[
            { name: "EUR/USD", session: getSessionStatus("EUR/USD"), color: "#3b82f6" },
            { name: "GBP/AUD", session: getSessionStatus("GBP/AUD"), color: "#f59e0b" },
            { name: "USD/JPY", session: getSessionStatus("USD/JPY"), color: "#ef4444" },
          ].map(({ name, session, color }) => (
            <div key={name} style={{ background: session.hot ? "#070f08" : "#070b14", border: `1px solid ${session.hot ? "#22c55e33" : "#111827"}`, borderRadius: "8px", padding: "8px", textAlign: "center" }}>
              <div style={{ fontSize: "9px", color, fontWeight: "700", marginBottom: "3px" }}>{name}</div>
              <div style={{ fontSize: "9px", color: session.color, fontWeight: "700" }}>{session.name}</div>
              <div style={{ fontSize: "8px", color: session.hot ? "#16a34a" : "#374151", marginTop: "2px" }}>{session.hot ? "🟢 ACTIVE" : "⚫ LOW VOL"}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pair Panels */}
      {displayPairs.map(pairKey => (
        <PairPanel
          key={pairKey}
          pairKey={pairKey}
          candles={pairData[pairKey].candles}
          analysis={pairData[pairKey].analysis}
          loading={pairData[pairKey].loading}
          error={pairData[pairKey].error}
          onRefresh={() => loadPair(pairKey)}
        />
      ))}

      <div style={{ fontSize: "9px", color: "#111827", textAlign: "center", letterSpacing: "1px", marginTop: "8px", paddingBottom: "20px" }}>
        FOR EDUCATIONAL USE ONLY · NOT FINANCIAL ADVICE · DATA: TWELVE DATA API
      </div>
    </div>
  );
}
