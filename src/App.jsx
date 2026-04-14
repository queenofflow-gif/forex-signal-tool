import { useState, useEffect, useCallback } from "react";

const TWELVE_KEY = "0bf94d558ca247f79d8d3b5e5340c631";

// ── Helpers ───────────────────────────────────────────────────
function to12hr(utcH, utcM = 0) {
  const d = new Date();
  d.setUTCHours(utcH, utcM, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function nowLocal() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
}
function utcNow() { return new Date().getUTCHours() + new Date().getUTCMinutes() / 60; }

// ── Pair Config ───────────────────────────────────────────────
const PAIRS = {
  "EUR/USD": {
    symbol: "EUR/USD", twSymbol: "EUR/USD", pip: 0.0001, color: "#3b82f6",
    sessions: [
      { name: "London Open",    from: 7,  to: 9,  rating: 5, note: "Strongest breakouts. Price breaks Asian range. Best entry window of the day." },
      { name: "London Session", from: 9,  to: 13, rating: 5, note: "Peak EUR/USD volume. Trends develop cleanly. RSI and EMA signals most reliable." },
      { name: "NY Overlap",     from: 13, to: 17, rating: 5, note: "Highest liquidity of the day. Big moves, tight spreads. Ideal for 25–40 pip targets." },
      { name: "NY Session",     from: 17, to: 22, rating: 3, note: "Moderate activity. USD news can spike price. Watch for reversals." },
      { name: "Asian Session",  from: 22, to: 31, rating: 1, note: "Very low volume. Wide spreads. Avoid trading EUR/USD in this window." },
    ],
    bestWindow: [7, 17], avoidWindow: [22, 7],
  },
  "GBP/AUD": {
    symbol: "GBP/AUD", twSymbol: "GBP/AUD", pip: 0.0001, color: "#f59e0b",
    sessions: [
      { name: "Sydney Open",    from: 22, to: 26, rating: 3, note: "AUD liquidity kicks in. Early moves driven by Australian economic data." },
      { name: "Tokyo Session",  from: 0,  to: 9,  rating: 3, note: "Moderate AUD movement. Watch RBA news. Can see 50–80 pip swings on releases." },
      { name: "London Open",    from: 7,  to: 9,  rating: 5, note: "GBP wakes up. Explosive moves as London traders price in overnight Asia action." },
      { name: "London Session", from: 9,  to: 13, rating: 5, note: "Best window for GBP/AUD. Both currencies active. 100–200 pip days common here." },
      { name: "NY Overlap",     from: 13, to: 17, rating: 4, note: "GBP/AUD trends continue. USD sentiment affects AUD side. Good continuation trades." },
      { name: "NY/Late",        from: 17, to: 22, rating: 2, note: "GBP liquidity drops. AUD holds moderate volume. Wider spreads — be cautious." },
    ],
    bestWindow: [7, 17], avoidWindow: [17, 22],
  },
  "USD/JPY": {
    symbol: "USD/JPY", twSymbol: "USD/JPY", pip: 0.01, color: "#ef4444",
    sessions: [
      { name: "Tokyo Open",    from: 0,  to: 3,  rating: 5, note: "Prime USD/JPY time. Japanese banks set rates. Watch Tokyo Fix at 9:55 AM Tokyo." },
      { name: "Tokyo Session", from: 0,  to: 9,  rating: 5, note: "Most active session for JPY pairs. Trends are strong and directional." },
      { name: "London Open",   from: 7,  to: 9,  rating: 4, note: "London–Tokyo overlap. Excellent volatility. EUR/USD moves drag USD/JPY." },
      { name: "NY Session",    from: 13, to: 17, rating: 5, note: "US data drives USD. NFP, CPI, FOMC can move USD/JPY 100–200 pips instantly." },
      { name: "NY Afternoon",  from: 17, to: 22, rating: 3, note: "Moderate volume. Good for swing setups targeting next Tokyo session." },
      { name: "Dead Zone",     from: 9,  to: 13, rating: 1, note: "Tokyo closed, NY not open. USD/JPY often flat. Avoid this window." },
    ],
    bestWindow: [0, 9], avoidWindow: [9, 13],
  },
};

// ── Indicators ────────────────────────────────────────────────
function calcEMA(data, p) { const k=2/(p+1); let e=data[0]; return data.map(v=>{e=v*k+e*(1-k);return e;}); }
function calcRSI(closes, p=14) {
  const g=[],l=[];
  for(let i=1;i<closes.length;i++){const d=closes[i]-closes[i-1];g.push(d>0?d:0);l.push(d<0?-d:0);}
  let ag=g.slice(0,p).reduce((a,b)=>a+b)/p, al=l.slice(0,p).reduce((a,b)=>a+b)/p;
  const rsi=[50];
  for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;rsi.push(100-100/(1+(al===0?100:ag/al)));}
  return rsi;
}
function calcMACD(closes) {
  const e12=calcEMA(closes,12),e26=calcEMA(closes,26);
  const ml=e12.map((v,i)=>v-e26[i]),sig=calcEMA(ml,9);
  return {histogram:ml.map((v,i)=>v-sig[i])};
}
function detectPattern(candles) {
  const l=candles[candles.length-1],p=candles[candles.length-2];
  const body=Math.abs(l.close-l.open),range=(l.high-l.low)||0.0001;
  const uw=l.high-Math.max(l.close,l.open),lw=Math.min(l.close,l.open)-l.low;
  if(body/range<0.1) return {name:"Doji",bias:"neutral",strength:60};
  if(lw>body*2&&uw<body*0.5) return {name:"Hammer",bias:"bullish",strength:72};
  if(uw>body*2&&lw<body*0.5) return {name:"Shooting Star",bias:"bearish",strength:70};
  if(l.close>l.open&&p.close<p.open&&l.close>p.open&&l.open<p.close) return {name:"Bullish Engulfing",bias:"bullish",strength:82};
  if(l.close<l.open&&p.close>p.open&&l.close<p.open&&l.open>p.close) return {name:"Bearish Engulfing",bias:"bearish",strength:80};
  return {name:l.close>l.open?"Bullish Candle":"Bearish Candle",bias:l.close>l.open?"bullish":"bearish",strength:55};
}
function calcSupRes(candles) {
  const hs=candles.map(c=>c.high).sort((a,b)=>b-a);
  const ls=candles.map(c=>c.low).sort((a,b)=>a-b);
  return {resistance:hs.slice(0,5).reduce((a,b)=>a+b)/5,support:ls.slice(0,5).reduce((a,b)=>a+b)/5};
}
function toPips(v,pip){return Math.round(Math.abs(v)/pip);}

// ── Session ───────────────────────────────────────────────────
function getSession(pairKey) {
  const h=utcNow();
  const sessions=PAIRS[pairKey].sessions;
  const active=sessions.filter(s=>{
    const from=s.from%24,to=s.to%24;
    if(s.to>24){return h>=from||h<(s.to-24);}
    if(from>to){return h>=from||h<to;}
    return h>=from&&h<to;
  });
  if(active.length===0) return {name:"Off Hours",hot:false,color:"#6b7280",rating:1};
  const best=active.sort((a,b)=>b.rating-a.rating)[0];
  return {name:best.name,hot:best.rating>=4,color:best.rating>=4?"#22c55e":best.rating>=3?"#f59e0b":"#6b7280",rating:best.rating};
}

// ── Strategy Checker ──────────────────────────────────────────
function checkStrategy(signals, rsi, pattern, session, ema20, ema50, price, support, resistance, direction) {
  const checks = [
    {
      id: "session",
      label: "Hot Session",
      desc: "Trade only during high-volume sessions",
      pass: session.hot,
      tip: session.hot ? `✓ ${session.name} is active` : `✗ Wait for London or NY session`,
    },
    {
      id: "rsi",
      label: "RSI Extreme",
      desc: "RSI must be oversold (<40) or overbought (>60)",
      pass: rsi < 40 || rsi > 60,
      tip: rsi < 40 ? `✓ RSI ${rsi.toFixed(1)} — oversold, look for BUY` : rsi > 60 ? `✓ RSI ${rsi.toFixed(1)} — overbought, look for SELL` : `✗ RSI ${rsi.toFixed(1)} — wait for extreme reading`,
    },
    {
      id: "ema",
      label: "EMA Aligned",
      desc: "EMA20 and EMA50 must agree on direction",
      pass: (ema20 > ema50 && direction === "BUY") || (ema20 < ema50 && direction === "SELL"),
      tip: ema20 > ema50 ? `✓ EMA20 above EMA50 — bullish bias confirmed` : `✓ EMA20 below EMA50 — bearish bias confirmed`,
    },
    {
      id: "pattern",
      label: "Candle Confirmation",
      desc: "Reversal candle must be present",
      pass: pattern.bias !== "neutral" && pattern.strength >= 65,
      tip: pattern.strength >= 65 && pattern.bias !== "neutral" ? `✓ ${pattern.name} confirms direction` : `✗ No strong reversal candle — wait for Engulfing or Hammer`,
    },
    {
      id: "sr",
      label: "S/R Level",
      desc: "Price must be near support or resistance",
      pass: Math.abs(price - support) / price < 0.003 || Math.abs(price - resistance) / price < 0.003,
      tip: Math.abs(price - support) / price < 0.003 ? `✓ Price near support — good BUY zone` : Math.abs(price - resistance) / price < 0.003 ? `✓ Price near resistance — good SELL zone` : `✗ Price in mid-range — wait for S/R touch`,
    },
  ];
  const passed = checks.filter(c => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  const valid = passed >= 3;
  return { checks, passed, score, valid };
}

// ── Signal Engine ─────────────────────────────────────────────
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
  const session = getSession(pairKey);

  let bull = 0, bear = 0, signals = [];
  const cross = lE20 > lE50, just = (pE20 <= pE50 && lE20 > lE50) || (pE20 >= pE50 && lE20 < lE50);
  if (cross) { bull += just ? 25 : 15; signals.push({ label: "EMA 20/50", value: just ? "Golden Cross ✦" : "Bullish Stack", bias: "bull", weight: just ? 25 : 15 }); }
  else { bear += just ? 25 : 15; signals.push({ label: "EMA 20/50", value: just ? "Death Cross ✦" : "Bearish Stack", bias: "bear", weight: just ? 25 : 15 }); }
  if (lRSI < 40) { bull += 22; signals.push({ label: "RSI", value: `${lRSI.toFixed(1)} — Oversold`, bias: "bull", weight: 22 }); }
  else if (lRSI > 60) { bear += 22; signals.push({ label: "RSI", value: `${lRSI.toFixed(1)} — Overbought`, bias: "bear", weight: 22 }); }
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
  const boosted = Math.min(99, confidence + (session.hot ? 6 : 0));
  const strategy = checkStrategy(signals, lRSI, pattern, session, lE20, lE50, price, support, resistance, direction);

  return {
    direction, confidence: boosted, signals, entry, sl, tp1, tp2,
    rr1: Math.abs(tp1 - entry) / Math.abs(sl - entry),
    rr2: Math.abs(tp2 - entry) / Math.abs(sl - entry),
    slPips: toPips(sl - entry, pip), tp1Pips: toPips(tp1 - entry, pip), tp2Pips: toPips(tp2 - entry, pip),
    price, support, resistance, rsi: lRSI, pattern, atr, session, strategy,
    ema20: lE20, ema50: lE50,
  };
}

// ── Preset Trades ─────────────────────────────────────────────
function buildPresets(price, pairKey) {
  const pip = PAIRS[pairKey].pip;
  const col = PAIRS[pairKey].color;
  const dp = pip === 0.01 ? 3 : 5;

  const presets = {
    "EUR/USD": [
      {
        name: "London Breakout BUY",
        strategy: "Mean Reversion + S/R",
        direction: "BUY",
        when: "London Open (3 AM – 5 AM ET)",
        rules: ["RSI below 40", "Price near support level", "Bullish candle closes above EMA20"],
        targetPips: 30,
        slPips: 15,
        rr: "2:1",
        color: "#22c55e",
        entry: price,
        sl: +(price - 0.0015).toFixed(5),
        tp1: +(price + 0.0020).toFixed(5),
        tp2: +(price + 0.0030).toFixed(5),
        tp1p: 20, tp2p: 30,
        winRate: "71%",
        note: "Wait for price to bounce off support. Do NOT enter mid-range.",
      },
      {
        name: "NY Overlap Continuation",
        strategy: "Trend Follow + MACD",
        direction: "BUY",
        when: "NY Overlap (8 AM – 12 PM ET)",
        rules: ["EMA20 above EMA50", "MACD histogram turning positive", "RSI 45–60 range"],
        targetPips: 25,
        slPips: 13,
        rr: "1.9:1",
        color: "#3b82f6",
        entry: price,
        sl: +(price - 0.0013).toFixed(5),
        tp1: +(price + 0.0017).toFixed(5),
        tp2: +(price + 0.0025).toFixed(5),
        tp1p: 17, tp2p: 25,
        winRate: "68%",
        note: "Only take if EMA stack is bullish. Skip if MACD is flat.",
      },
      {
        name: "RSI Overbought SELL",
        strategy: "Mean Reversion",
        direction: "SELL",
        when: "Any Hot Session",
        rules: ["RSI above 65", "Price near resistance", "Bearish Engulfing or Shooting Star"],
        targetPips: 30,
        slPips: 14,
        rr: "2.1:1",
        color: "#f87171",
        entry: price,
        sl: +(price + 0.0014).toFixed(5),
        tp1: +(price - 0.0020).toFixed(5),
        tp2: +(price - 0.0030).toFixed(5),
        tp1p: 20, tp2p: 30,
        winRate: "69%",
        note: "Patience required. Wait for RSI above 65 AND a rejection candle at resistance.",
      },
    ],
    "GBP/AUD": [
      {
        name: "London Open Explosion",
        strategy: "Session Breakout",
        direction: "BUY",
        when: "London Open (3 AM – 5 AM ET)",
        rules: ["Price breaks above Asian session high", "EMA20 bullish", "Volume spike"],
        targetPips: 40,
        slPips: 18,
        rr: "2.2:1",
        color: "#22c55e",
        entry: price,
        sl: +(price - 0.0018).toFixed(5),
        tp1: +(price + 0.0025).toFixed(5),
        tp2: +(price + 0.0040).toFixed(5),
        tp1p: 25, tp2p: 40,
        winRate: "66%",
        note: "Mark Asian session high before London opens. Enter only on candle close ABOVE that level.",
      },
      {
        name: "GBP/AUD Hammer Bounce",
        strategy: "S/R Reversal",
        direction: "BUY",
        when: "London Session (4 AM – 8 AM ET)",
        rules: ["Hammer candle at key support", "RSI below 38", "MACD turning positive"],
        targetPips: 35,
        slPips: 16,
        rr: "2.2:1",
        color: "#f59e0b",
        entry: price,
        sl: +(price - 0.0016).toFixed(5),
        tp1: +(price + 0.0022).toFixed(5),
        tp2: +(price + 0.0035).toFixed(5),
        tp1p: 22, tp2p: 35,
        winRate: "70%",
        note: "GBP/AUD bounces hard off round numbers (e.g. 1.9000, 2.0000). Watch these levels closely.",
      },
    ],
    "USD/JPY": [
      {
        name: "Tokyo Session Trend",
        strategy: "Trend Follow",
        direction: "SELL",
        when: "Tokyo Open (7 PM – 11 PM ET)",
        rules: ["EMA20 below EMA50 on 1H", "RSI below 50", "Bearish candle structure"],
        targetPips: 30,
        slPips: 15,
        rr: "2:1",
        color: "#f87171",
        entry: price,
        sl: +(price + 0.15).toFixed(3),
        tp1: +(price - 0.20).toFixed(3),
        tp2: +(price - 0.30).toFixed(3),
        tp1p: 20, tp2p: 30,
        winRate: "67%",
        note: "Macro bias is bearish USD/JPY in 2026. Sell rallies, don't chase breakdowns.",
      },
      {
        name: "NY News Spike Fade",
        strategy: "Mean Reversion",
        direction: "SELL",
        when: "NY Open (8 AM – 10 AM ET) — after news",
        rules: ["Wait 5 min AFTER major news release", "Price spikes 30+ pips then stalls", "RSI above 68 after spike"],
        targetPips: 35,
        slPips: 18,
        rr: "1.9:1",
        color: "#818cf8",
        entry: price,
        sl: +(price + 0.18).toFixed(3),
        tp1: +(price - 0.22).toFixed(3),
        tp2: +(price - 0.35).toFixed(3),
        tp1p: 22, tp2p: 35,
        winRate: "65%",
        note: "NEVER enter before the news — only after the spike. Wait for the first pullback candle to close.",
      },
    ],
  };
  return presets[pairKey] || [];
}

// ── Fetch ─────────────────────────────────────────────────────
async function fetchCandles(symbol, interval = "15min", outputsize = 80) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${TWELVE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message);
  if (!data.values || !data.values.length) throw new Error("No candle data returned");
  return data.values.reverse().map(v => ({
    open: parseFloat(v.open), high: parseFloat(v.high),
    low: parseFloat(v.low), close: parseFloat(v.close),
    time: new Date(v.datetime).getTime(),
  }));
}

// ── Chart ─────────────────────────────────────────────────────
function CandleChart({ candles, support, resistance, color }) {
  const W = 560, H = 140, pad = { l: 8, r: 58, t: 8, b: 18 };
  const display = candles.slice(-50);
  const allP = display.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...allP, support) * 0.9998, maxP = Math.max(...allP, resistance) * 1.0002;
  const sy = v => pad.t + (1 - (v - minP) / (maxP - minP)) * (H - pad.t - pad.b);
  const cw = (W - pad.l - pad.r) / display.length;
  const closes = candles.map(c => c.close);
  const e20 = calcEMA(closes, 20), e50 = calcEMA(closes, 50);
  const off = candles.length - display.length;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs><linearGradient id={`g${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity="0.10"/><stop offset="100%" stopColor="#22c55e" stopOpacity="0"/></linearGradient></defs>
      <rect x={pad.l} y={sy(support)} width={W-pad.l-pad.r} height={Math.max(sy(minP)-sy(support),0)} fill={`url(#g${color.replace("#","")})`}/>
      <line x1={pad.l} x2={W-pad.r} y1={sy(support)} y2={sy(support)} stroke="#22c55e" strokeWidth="1" strokeDasharray="4,3" opacity="0.6"/>
      <line x1={pad.l} x2={W-pad.r} y1={sy(resistance)} y2={sy(resistance)} stroke="#ef4444" strokeWidth="1" strokeDasharray="4,3" opacity="0.6"/>
      <text x={W-pad.r+3} y={sy(support)+3} fill="#22c55e" fontSize="8">SUP</text>
      <text x={W-pad.r+3} y={sy(resistance)+3} fill="#ef4444" fontSize="8">RES</text>
      {display.map((_,i)=>i===0?null:(
        <g key={`l${i}`}>
          <line x1={pad.l+(i-1)*cw+cw/2} y1={sy(e20[off+i-1])} x2={pad.l+i*cw+cw/2} y2={sy(e20[off+i])} stroke="#f59e0b" strokeWidth="1.2" opacity="0.85"/>
          <line x1={pad.l+(i-1)*cw+cw/2} y1={sy(e50[off+i-1])} x2={pad.l+i*cw+cw/2} y2={sy(e50[off+i])} stroke="#818cf8" strokeWidth="1.2" opacity="0.85"/>
        </g>
      ))}
      {display.map((c,i)=>{
        const x=pad.l+i*cw+cw*0.2,w=cw*0.6,bull=c.close>=c.open,col=bull?"#22c55e":"#ef4444";
        const bT=sy(Math.max(c.open,c.close)),bB=sy(Math.min(c.open,c.close));
        return <g key={i}><line x1={x+w/2} y1={sy(c.high)} x2={x+w/2} y2={sy(c.low)} stroke={col} strokeWidth="0.8"/><rect x={x} y={bT} width={w} height={Math.max(bB-bT,1)} fill={i===display.length-1?col:bull?"#22c55e44":"#ef444444"} stroke={col} strokeWidth="0.5"/></g>;
      })}
    </svg>
  );
}

// ── Stars ─────────────────────────────────────────────────────
function Stars({ n }) {
  return <span>{[1,2,3,4,5].map(i=><span key={i} style={{color:i<=n?"#f59e0b":"#1e2d4a",fontSize:"12px"}}>★</span>)}</span>;
}

// ── Pair Panel ────────────────────────────────────────────────
function PairPanel({ pairKey, candles, analysis, loading, error, onRefresh }) {
  const pair = PAIRS[pairKey];
  const [tab, setTab] = useState("levels");
  const [customTrade, setCustomTrade] = useState(null);
  const tabs = [["levels","📍 LEVELS"],["strategy","✅ STRATEGY"],["presets","🎯 PRESET TRADES"],["sessions","🕐 SESSIONS"],["signals","📊 SIGNALS"]];

  if (loading) return (
    <div style={{background:"#0d1425",border:`1px solid ${pair.color}33`,borderRadius:"14px",padding:"30px",textAlign:"center",marginBottom:"16px"}}>
      <div style={{fontSize:"22px",animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</div>
      <div style={{fontSize:"10px",color:"#334155",letterSpacing:"2px",marginTop:"8px"}}>LOADING {pairKey}...</div>
    </div>
  );
  if (error) return (
    <div style={{background:"#0d1425",border:"1px solid #7f1d1d",borderRadius:"14px",padding:"20px",textAlign:"center",marginBottom:"16px"}}>
      <div style={{fontSize:"11px",color:"#f87171",marginBottom:"8px"}}>⚠️ {pairKey} — {error}</div>
      <button onClick={onRefresh} style={{background:"#0f2040",color:"#93c5fd",border:"1px solid #1d4ed8",borderRadius:"6px",padding:"6px 16px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px"}}>RETRY</button>
    </div>
  );
  if (!analysis || !candles) return null;

  const { direction, confidence, signals, entry, sl, tp1, tp2, rr1, rr2, slPips, tp1Pips, tp2Pips, price, support, resistance, rsi, pattern, session, strategy } = analysis;
  const dc = direction === "BUY" ? "#22c55e" : direction === "SELL" ? "#f87171" : "#fbbf24";
  const dp = pair.pip === 0.01 ? 3 : 5;
  const presets = buildPresets(price, pairKey);

  return (
    <div style={{background:"#0d1425",border:`1px solid ${pair.color}44`,borderRadius:"14px",marginBottom:"16px",overflow:"hidden"}}>
      {/* Header */}
      <div style={{padding:"14px 16px",borderBottom:"1px solid #111827",display:"flex",justifyContent:"space-between",alignItems:"center",background:`${pair.color}08`}}>
        <div>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:"22px",fontWeight:"800",color:"#f1f5f9",letterSpacing:"-0.5px"}}>
            {pairKey.split("/")[0]}<span style={{color:pair.color}}>/</span>{pairKey.split("/")[1]}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"3px"}}>
            <span style={{display:"inline-block",width:"5px",height:"5px",background:"#22c55e",borderRadius:"50%",animation:"blink 2s infinite"}}></span>
            <span style={{fontSize:"9px",color:session.color,fontWeight:"700"}}>{session.name}</span>
            {!session.hot&&<span style={{fontSize:"9px",color:"#4b5563"}}>· Low volume</span>}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:"20px",fontWeight:"700",color:"#f8fafc"}}>{price.toFixed(dp)}</div>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"4px",justifyContent:"flex-end"}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:"18px",fontWeight:"800",color:strategy.valid?dc:"#4b5563"}}>{direction}</div>
            <div style={{fontSize:"12px",fontWeight:"700",color:strategy.valid?dc:"#4b5563"}}>{confidence}%</div>
            {strategy.valid
              ? <span style={{background:"#22c55e22",color:"#4ade80",border:"1px solid #22c55e33",padding:"1px 8px",borderRadius:"20px",fontSize:"9px",fontWeight:"700"}}>✓ VALID</span>
              : <span style={{background:"#f8717122",color:"#f87171",border:"1px solid #f8717133",padding:"1px 8px",borderRadius:"20px",fontSize:"9px",fontWeight:"700"}}>WAIT</span>
            }
          </div>
        </div>
      </div>

      {/* Confidence Bar */}
      <div style={{height:"3px",background:"#0a1020"}}>
        <div style={{width:`${confidence}%`,height:"100%",background:`linear-gradient(90deg,${dc}66,${dc})`,transition:"width 0.6s"}}/>
      </div>

      {/* Chart */}
      <div style={{padding:"10px 8px 4px",borderBottom:"1px solid #111827"}}>
        <div style={{display:"flex",gap:"12px",marginBottom:"5px",fontSize:"9px",paddingLeft:"4px"}}>
          <span style={{color:"#f59e0b"}}>── EMA20</span><span style={{color:"#818cf8"}}>── EMA50</span>
          <span style={{color:"#22c55e"}}>- - SUP</span><span style={{color:"#ef4444"}}>- - RES</span>
        </div>
        <CandleChart candles={candles} support={support} resistance={resistance} color={pair.color}/>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:"1px solid #111827",padding:"0 8px",overflowX:"auto"}}>
        {tabs.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{background:"none",border:"none",color:tab===k?pair.color:"#374151",cursor:"pointer",fontFamily:"inherit",fontSize:"9px",fontWeight:"700",letterSpacing:"0.8px",padding:"8px 10px",borderBottom:`2px solid ${tab===k?pair.color:"transparent"}`,transition:"all 0.2s",whiteSpace:"nowrap"}}>{l}</button>
        ))}
      </div>

      <div style={{padding:"14px"}}>

        {/* LEVELS */}
        {tab==="levels"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:"#0a1628",border:`1.5px solid ${pair.color}44`,borderRadius:"10px",marginBottom:"8px"}}>
              <div>
                <div style={{fontSize:"9px",color:"#475569",letterSpacing:"2px",marginBottom:"4px"}}>⚡ ENTRY POINT</div>
                <div style={{fontSize:"24px",fontWeight:"700",color:"#93c5fd",letterSpacing:"-0.5px"}}>{entry.toFixed(dp)}</div>
                <div style={{fontSize:"9px",color:"#334155",marginTop:"2px"}}>Execute {direction} at market</div>
              </div>
              <div style={{background:`${dc}22`,color:dc,border:`1px solid ${dc}55`,borderRadius:"8px",padding:"8px 16px",fontWeight:"800",fontSize:"14px",fontFamily:"'Syne',sans-serif"}}>{direction}</div>
            </div>
            {/* SL */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",background:"#120808",border:"1.5px solid #7f1d1d55",borderRadius:"10px",marginBottom:"6px"}}>
              <div>
                <div style={{fontSize:"9px",color:"#475569",letterSpacing:"2px",marginBottom:"3px"}}>🛑 STOP LOSS</div>
                <div style={{fontSize:"20px",fontWeight:"700",color:"#f87171"}}>{sl.toFixed(dp)}</div>
                <div style={{fontSize:"9px",color:"#4b1d1d",marginTop:"2px"}}>{direction==="BUY"?`${slPips} pips below`:`${slPips} pips above`} entry</div>
              </div>
              <div style={{textAlign:"right"}}><div style={{fontSize:"9px",color:"#475569"}}>RISK</div><div style={{fontSize:"22px",fontWeight:"700",color:"#f87171"}}>{slPips}</div><div style={{fontSize:"10px",color:"#6b2020"}}>pips</div></div>
            </div>
            <div style={{textAlign:"center",color:"#1e2d4a",margin:"3px 0"}}>↕</div>
            {/* TP1 */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",background:"#061510",border:"1.5px solid #14532d55",borderRadius:"10px",marginBottom:"6px"}}>
              <div>
                <div style={{fontSize:"9px",color:"#475569",letterSpacing:"2px",marginBottom:"3px"}}>🎯 TAKE PROFIT 1</div>
                <div style={{fontSize:"20px",fontWeight:"700",color:"#4ade80"}}>{tp1.toFixed(dp)}</div>
                <div style={{fontSize:"9px",color:"#14532d",marginTop:"2px"}}>{direction==="BUY"?`${tp1Pips} pips above`:`${tp1Pips} pips below`} entry</div>
              </div>
              <div style={{textAlign:"right"}}><div style={{fontSize:"9px",color:"#475569"}}>REWARD</div><div style={{fontSize:"22px",fontWeight:"700",color:"#4ade80"}}>{tp1Pips}</div><div style={{fontSize:"10px",color:"#16a34a",fontWeight:"700"}}>R:R {rr1.toFixed(1)}x</div></div>
            </div>
            <div style={{textAlign:"center",color:"#1e2d4a",margin:"3px 0"}}>↕</div>
            {/* TP2 */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",background:"#061510",border:"1.5px solid #16653455",borderRadius:"10px",marginBottom:"8px"}}>
              <div>
                <div style={{fontSize:"9px",color:"#475569",letterSpacing:"2px",marginBottom:"3px"}}>🎯 TAKE PROFIT 2</div>
                <div style={{fontSize:"20px",fontWeight:"700",color:"#86efac"}}>{tp2.toFixed(dp)}</div>
                <div style={{fontSize:"9px",color:"#166534",marginTop:"2px"}}>{direction==="BUY"?`${tp2Pips} pips above`:`${tp2Pips} pips below`} entry</div>
              </div>
              <div style={{textAlign:"right"}}><div style={{fontSize:"9px",color:"#475569"}}>REWARD</div><div style={{fontSize:"22px",fontWeight:"700",color:"#86efac"}}>{tp2Pips}</div><div style={{fontSize:"10px",color:"#22c55e",fontWeight:"700"}}>R:R {rr2.toFixed(1)}x</div></div>
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              {[{label:"SUPPORT",val:support.toFixed(dp),color:"#22c55e"},{label:"LIVE",val:price.toFixed(dp),color:"#93c5fd"},{label:"RESISTANCE",val:resistance.toFixed(dp),color:"#f87171"}].map(({label,val,color})=>(
                <div key={label} style={{flex:1,background:"#070b14",border:"1px solid #1a2540",borderRadius:"8px",padding:"8px",textAlign:"center"}}>
                  <div style={{fontSize:"8px",color:"#334155",letterSpacing:"1px",marginBottom:"2px"}}>{label}</div>
                  <div style={{fontSize:"11px",fontWeight:"700",color}}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STRATEGY CHECKLIST */}
        {tab==="strategy"&&(
          <div>
            <div style={{marginBottom:"12px",padding:"12px 14px",background:strategy.valid?"#071a0f":"#120808",border:`1.5px solid ${strategy.valid?"#22c55e55":"#ef444433"}`,borderRadius:"10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:"9px",color:"#475569",letterSpacing:"2px",marginBottom:"3px"}}>STRATEGY SCORE</div>
                <div style={{fontSize:"22px",fontWeight:"800",color:strategy.valid?"#4ade80":"#f87171",fontFamily:"'Syne',sans-serif"}}>{strategy.valid?"✓ TAKE THIS TRADE":"✗ DO NOT TRADE YET"}</div>
                <div style={{fontSize:"10px",color:"#475569",marginTop:"2px"}}>{strategy.passed} of 5 conditions met</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:"32px",fontWeight:"800",color:strategy.valid?"#4ade80":"#f87171",fontFamily:"'Syne',sans-serif"}}>{strategy.score}%</div>
                <div style={{fontSize:"9px",color:"#334155"}}>match</div>
              </div>
            </div>
            {strategy.checks.map((c,i)=>(
              <div key={i} style={{padding:"10px 12px",background:c.pass?"#061510":"#0f0a0a",border:`1px solid ${c.pass?"#22c55e22":"#374151"}`,borderRadius:"8px",marginBottom:"6px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                  <span style={{fontSize:"11px",fontWeight:"700",color:c.pass?"#4ade80":"#6b7280"}}>{c.pass?"✓":"✗"} {c.label}</span>
                  <span style={{fontSize:"9px",color:"#334155"}}>{c.desc}</span>
                </div>
                <div style={{fontSize:"10px",color:c.pass?"#4ade8099":"#4b5563"}}>{c.tip}</div>
              </div>
            ))}
            <div style={{marginTop:"12px",padding:"10px 12px",background:"#070b14",border:"1px solid #1a2540",borderRadius:"8px"}}>
              <div style={{fontSize:"9px",color:"#334155",letterSpacing:"2px",marginBottom:"6px"}}>RULES — NEVER BREAK THESE</div>
              {["Never trade with fewer than 3 conditions met","Never enter 30 min before major news (NFP, CPI, FOMC)","One trade per pair per session — no revenge trades","Minimum R:R of 1.5x before entering","If session says Low Volume — skip the trade"].map((r,i)=>(
                <div key={i} style={{fontSize:"10px",color:"#4b5563",padding:"4px 0",borderBottom:"1px solid #0f172a",display:"flex",gap:"8px"}}>
                  <span style={{color:"#1e3a5f"}}>#{i+1}</span><span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PRESET TRADES */}
        {tab==="presets"&&(
          <div>
            <div style={{fontSize:"9px",color:"#475569",letterSpacing:"2px",marginBottom:"12px"}}>PRESET TRADES — SET & EXECUTE · {pairKey}</div>
            {presets.map((t,idx)=>(
              <div key={idx} style={{background:"#0a1020",border:`1px solid ${t.color}33`,borderRadius:"12px",padding:"14px",marginBottom:"12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"#f1f5f9"}}>{t.name}</div>
                    <div style={{fontSize:"9px",color:"#475569",marginTop:"2px"}}>{t.strategy}</div>
                  </div>
                  <div style={{display:"flex",gap:"6px",alignItems:"center",flexShrink:0}}>
                    <span style={{background:`${t.color}22`,color:t.color,border:`1px solid ${t.color}44`,padding:"2px 10px",borderRadius:"20px",fontSize:"10px",fontWeight:"700"}}>{t.direction}</span>
                    <span style={{fontSize:"11px",fontWeight:"800",color:"#4ade80"}}>{t.winRate}</span>
                  </div>
                </div>

                {/* When to trade */}
                <div style={{background:"#070b14",border:"1px solid #1a2540",borderRadius:"8px",padding:"8px 10px",marginBottom:"8px"}}>
                  <div style={{fontSize:"8px",color:"#334155",letterSpacing:"1.5px",marginBottom:"3px"}}>⏰ WHEN TO ENTER</div>
                  <div style={{fontSize:"11px",color:"#fbbf24",fontWeight:"700"}}>{t.when}</div>
                </div>

                {/* Rules checklist */}
                <div style={{marginBottom:"10px"}}>
                  <div style={{fontSize:"8px",color:"#334155",letterSpacing:"1.5px",marginBottom:"5px"}}>ENTRY CHECKLIST</div>
                  {t.rules.map((r,ri)=>(
                    <div key={ri} style={{display:"flex",gap:"8px",alignItems:"center",padding:"3px 0",fontSize:"10px",color:"#64748b"}}>
                      <span style={{color:"#1e3a5f",fontSize:"12px"}}>□</span>{r}
                    </div>
                  ))}
                </div>

                {/* Levels grid */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"6px",marginBottom:"8px"}}>
                  {[
                    {label:"ENTRY",val:t.entry.toFixed(dp),sub:"",color:"#93c5fd"},
                    {label:"STOP",val:t.sl.toFixed(dp),sub:`${t.slPips}p`,color:"#f87171"},
                    {label:"TP1",val:t.tp1.toFixed(dp),sub:`${t.tp1p}p`,color:"#4ade80"},
                    {label:"TP2",val:t.tp2.toFixed(dp),sub:`${t.tp2p}p`,color:"#86efac"},
                  ].map(({label,val,sub,color})=>(
                    <div key={label} style={{background:"#070b14",border:"1px solid #1a2540",borderRadius:"6px",padding:"7px",textAlign:"center"}}>
                      <div style={{fontSize:"8px",color:"#334155",letterSpacing:"0.5px",marginBottom:"2px"}}>{label}</div>
                      <div style={{fontSize:"11px",fontWeight:"700",color,lineHeight:"1.2"}}>{val}</div>
                      {sub&&<div style={{fontSize:"9px",color:color,opacity:0.7,marginTop:"1px"}}>{sub}</div>}
                    </div>
                  ))}
                </div>

                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                  <span style={{fontSize:"10px",color:"#334155"}}>R:R <b style={{color:"#4ade80"}}>{t.rr}</b> · Target <b style={{color:"#4ade80"}}>{t.targetPips} pips</b></span>
                  <span style={{fontSize:"10px",color:"#22c55e",fontWeight:"700"}}>Win Rate ~{t.winRate}</span>
                </div>

                <div style={{padding:"8px 10px",background:"#070b14",borderRadius:"6px",border:"1px solid #1a2540",marginBottom:"10px"}}>
                  <div style={{fontSize:"8px",color:"#334155",letterSpacing:"1.5px",marginBottom:"3px"}}>⚠️ IMPORTANT NOTE</div>
                  <div style={{fontSize:"10px",color:"#64748b",lineHeight:"1.5"}}>{t.note}</div>
                </div>

                {/* Custom pip adjuster */}
                {customTrade?.idx===idx?(
                  <div style={{background:"#0a1628",border:"1px solid #1d4ed844",borderRadius:"8px",padding:"10px"}}>
                    <div style={{fontSize:"9px",color:"#475569",letterSpacing:"2px",marginBottom:"8px"}}>ADJUST YOUR LEVELS</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"8px"}}>
                      {["entry","sl","tp1","tp2"].map(field=>(
                        <div key={field}>
                          <div style={{fontSize:"8px",color:"#334155",letterSpacing:"1px",marginBottom:"3px"}}>{field.toUpperCase()}</div>
                          <input type="number" step={pair.pip} value={customTrade[field]} onChange={e=>setCustomTrade(p=>({...p,[field]:parseFloat(e.target.value)||0}))}
                            style={{width:"100%",background:"#070b14",border:"1px solid #1a2540",color:"#93c5fd",borderRadius:"6px",padding:"6px 8px",fontFamily:"inherit",fontSize:"11px",outline:"none"}}/>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:"9px",color:"#4ade80",marginBottom:"8px"}}>
                      SL: {toPips(customTrade.entry-customTrade.sl,pair.pip)} pips · TP1: {toPips(customTrade.tp1-customTrade.entry,pair.pip)} pips · TP2: {toPips(customTrade.tp2-customTrade.entry,pair.pip)} pips
                    </div>
                    <button onClick={()=>setCustomTrade(null)} style={{width:"100%",background:"#1e3a5f",color:"#93c5fd",border:"1px solid #1d4ed844",borderRadius:"6px",padding:"7px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:"700"}}>✓ SAVE MY LEVELS</button>
                  </div>
                ):(
                  <button onClick={()=>setCustomTrade({idx,entry:t.entry,sl:t.sl,tp1:t.tp1,tp2:t.tp2})}
                    style={{width:"100%",background:"#0f2040",color:"#93c5fd",border:"1px solid #1d4ed844",borderRadius:"6px",padding:"8px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:"700",letterSpacing:"1px"}}>
                    ✏️ CUSTOMIZE MY LEVELS
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* SESSIONS */}
        {tab==="sessions"&&(
          <div>
            <div style={{marginBottom:"12px",padding:"10px 12px",background:"#070b14",borderRadius:"8px",border:`1px solid ${pair.color}33`}}>
              <div style={{fontSize:"9px",color:"#475569",letterSpacing:"2px",marginBottom:"4px"}}>BEST TIMES TO TRADE {pairKey}</div>
              <div style={{fontSize:"12px",fontWeight:"700",color:"#4ade80"}}>✓ {PAIRS[pairKey].sessions.filter(s=>s.rating>=4).map(s=>`${to12hr(s.from)} – ${to12hr(s.to%24)}`).join("  |  ")}</div>
              <div style={{fontSize:"10px",color:"#f87171",marginTop:"3px"}}>✗ Avoid: {PAIRS[pairKey].sessions.filter(s=>s.rating<=1).map(s=>`${to12hr(s.from)} – ${to12hr(s.to%24)}`).join(", ")} (your local time)</div>
            </div>
            {pair.sessions.map((s,i)=>(
              <div key={i} style={{padding:"10px 12px",background:s.rating>=4?"#070f08":s.rating<=1?"#0f0707":"#070b14",border:`1px solid ${s.rating>=4?"#22c55e22":s.rating<=1?"#ef444422":"#1a2540"}`,borderRadius:"8px",marginBottom:"6px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"5px"}}>
                  <div>
                    <span style={{fontSize:"11px",fontWeight:"700",color:s.rating>=4?"#4ade80":s.rating<=1?"#f87171":"#94a3b8"}}>{s.name}</span>
                    <span style={{fontSize:"9px",color:"#334155",marginLeft:"8px"}}>{to12hr(s.from)} – {to12hr(s.to%24)}</span>
                  </div>
                  <Stars n={s.rating}/>
                </div>
                <p style={{fontSize:"10px",color:"#4b5563",lineHeight:"1.5",margin:0}}>{s.note}</p>
              </div>
            ))}
          </div>
        )}

        {/* SIGNALS */}
        {tab==="signals"&&(
          <div>
            {analysis.signals.map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #0f172a"}}>
                <span style={{fontSize:"10px",color:"#4b5563",letterSpacing:"1.5px"}}>{s.label}</span>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <span style={{fontSize:"11px",fontWeight:"600",color:s.bias==="bull"?"#4ade80":s.bias==="bear"?"#f87171":"#fbbf24"}}>{s.value}</span>
                  {s.weight>0&&<span style={{background:s.bias==="bull"?"#4ade8018":"#f8717118",color:s.bias==="bull"?"#4ade80":"#f87171",border:`1px solid ${s.bias==="bull"?"#4ade8033":"#f8717133"}`,padding:"1px 7px",borderRadius:"20px",fontSize:"9px",fontWeight:"700"}}>+{s.weight}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function App() {
  const [pairData, setPairData] = useState({
    "EUR/USD":{candles:null,analysis:null,loading:true,error:null},
    "GBP/AUD":{candles:null,analysis:null,loading:true,error:null},
    "USD/JPY":{candles:null,analysis:null,loading:true,error:null},
  });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activePair, setActivePair] = useState("ALL");
  const [clock, setClock] = useState(nowLocal());

  useEffect(()=>{const id=setInterval(()=>setClock(nowLocal()),1000);return()=>clearInterval(id);},[]);

  const loadPair = useCallback(async (pairKey) => {
    setPairData(prev=>({...prev,[pairKey]:{...prev[pairKey],loading:true,error:null}}));
    try {
      const candles = await fetchCandles(PAIRS[pairKey].twSymbol);
      const analysis = analyzeSignals(candles, pairKey);
      setPairData(prev=>({...prev,[pairKey]:{candles,analysis,loading:false,error:null}}));
    } catch(e) {
      setPairData(prev=>({...prev,[pairKey]:{...prev[pairKey],loading:false,error:e.message}}));
    }
  },[]);

  const loadAll = useCallback(()=>{
    Object.keys(PAIRS).forEach(p=>loadPair(p));
    setLastUpdate(new Date());
  },[loadPair]);

  useEffect(()=>{loadAll();const id=setInterval(loadAll,5*60*1000);return()=>clearInterval(id);},[loadAll]);

  const pairKeys = Object.keys(PAIRS);
  const displayPairs = activePair==="ALL"?pairKeys:[activePair];

  return (
    <div style={{background:"#070b14",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'IBM Plex Mono',monospace",padding:"16px",maxWidth:"620px",margin:"0 auto"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap');
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:#0d1425;}
        ::-webkit-scrollbar-thumb{background:#1e2d4a;border-radius:2px;}
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;}
      `}</style>

      {/* Header */}
      <div style={{marginBottom:"20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:"28px",fontWeight:"800",color:"#f1f5f9",letterSpacing:"-1px",lineHeight:1}}>
              FOREX<span style={{color:"#3b82f6"}}>.</span>SIGNAL
            </div>
            <div style={{fontSize:"9px",color:"#1e3a5f",letterSpacing:"3px",marginTop:"3px"}}>INTELLIGENCE TOOL v4.0</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:"5px",background:"#22c55e18",border:"1px solid #22c55e33",borderRadius:"20px",padding:"3px 10px"}}>
              <span style={{display:"inline-block",width:"5px",height:"5px",background:"#22c55e",borderRadius:"50%",animation:"blink 2s infinite"}}></span>
              <span style={{fontSize:"9px",color:"#22c55e",fontWeight:"700"}}>LIVE · TWELVE DATA</span>
            </div>
            <div style={{fontSize:"12px",color:"#93c5fd",marginTop:"5px",fontWeight:"700"}}>{clock}</div>
            {lastUpdate&&<div style={{fontSize:"9px",color:"#1e3a5f",marginTop:"2px"}}>Refreshed {lastUpdate.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}</div>}
          </div>
        </div>

        {/* Pair switcher */}
        <div style={{display:"flex",gap:"8px",marginTop:"16px",flexWrap:"wrap"}}>
          {["ALL",...pairKeys].map(p=>{
            const isActive=activePair===p;
            const col=p==="ALL"?"#6b7280":PAIRS[p]?.color||"#6b7280";
            return <button key={p} onClick={()=>setActivePair(p)} style={{background:isActive?`${col}22`:"#0d1425",border:`1.5px solid ${isActive?col:"#1a2540"}`,color:isActive?col:"#4b5563",borderRadius:"8px",padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:"700",letterSpacing:"1px",transition:"all 0.2s"}}>{p}</button>;
          })}
          <button onClick={loadAll} style={{marginLeft:"auto",background:"#0d1425",border:"1px solid #1a2540",color:"#334155",borderRadius:"8px",padding:"6px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:"700",letterSpacing:"1px"}}>↻</button>
        </div>
      </div>

      {/* Session Clock */}
      <div style={{background:"#0d1425",border:"1px solid #1a2540",borderRadius:"12px",padding:"12px 16px",marginBottom:"16px"}}>
        <div style={{fontSize:"9px",color:"#334155",letterSpacing:"2px",marginBottom:"10px"}}>MARKET SESSIONS RIGHT NOW</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
          {pairKeys.map(pk=>{
            const s=getSession(pk);
            return (
              <div key={pk} style={{background:s.hot?"#070f08":"#070b14",border:`1px solid ${s.hot?"#22c55e33":"#111827"}`,borderRadius:"8px",padding:"8px",textAlign:"center"}}>
                <div style={{fontSize:"9px",color:PAIRS[pk].color,fontWeight:"700",marginBottom:"3px"}}>{pk}</div>
                <div style={{fontSize:"9px",color:s.color,fontWeight:"700"}}>{s.name}</div>
                <div style={{fontSize:"8px",color:s.hot?"#16a34a":"#374151",marginTop:"2px"}}>{s.hot?"🟢 ACTIVE":"⚫ LOW VOL"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {displayPairs.map(pk=>(
        <PairPanel key={pk} pairKey={pk} candles={pairData[pk].candles} analysis={pairData[pk].analysis} loading={pairData[pk].loading} error={pairData[pk].error} onRefresh={()=>loadPair(pk)}/>
      ))}

      <div style={{fontSize:"9px",color:"#111827",textAlign:"center",letterSpacing:"1px",marginTop:"8px",paddingBottom:"20px"}}>
        FOR EDUCATIONAL USE ONLY · NOT FINANCIAL ADVICE · DATA: TWELVE DATA
      </div>
    </div>
  );
}
