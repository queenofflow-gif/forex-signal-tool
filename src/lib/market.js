// Shared live-market store: candles + strategy evaluation per pair, and polled prices.
import { useEffect, useReducer } from "react";
import { oanda } from "./supabase";
import { evaluate, lastCompleteIndex, CANDLE_COUNT, CONVERSION_PAIRS, DEFAULT_TF } from "../engine/engine";

const store = { pairs: {}, prices: {}, priceError: null };
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { listeners.add(force); return () => listeners.delete(force); }, []);
}

// Market data is kept per pair and timeframe ("EUR_USD|H4").
function reevaluate(s, pair, tf) {
  const li = lastCompleteIndex(s.candles);
  const key = li >= 0 ? s.candles[li].t : 0;
  if (s.evalKey === key && s.ev) return;
  s.ev = evaluate(s.candles.slice(0, li + 1), pair, tf);
  s.evalKey = key;
}

async function load(pair, tf) {
  const id = `${pair}|${tf}`;
  const s = (store.pairs[id] = store.pairs[id] || { status: "loading" });
  if (s.loading) return;
  s.loading = true;
  try {
    s.candles = await oanda.candles(pair, CANDLE_COUNT, tf);
    reevaluate(s, pair, tf);
    s.status = "ready"; s.error = null; s.updatedAt = Date.now();
  } catch (e) {
    s.status = s.candles ? "ready" : "error"; s.error = e.message;
  } finally { s.loading = false; emit(); }
}

async function refresh(pair, tf) {
  const s = store.pairs[`${pair}|${tf}`];
  if (!s || !s.candles || s.loading) return load(pair, tf);
  try {
    const tail = await oanda.candles(pair, 10, tf);
    const byT = new Map(s.candles.map((c, i) => [c.t, i]));
    for (const c of tail) { if (byT.has(c.t)) s.candles[byT.get(c.t)] = c; else s.candles.push(c); }
    if (s.candles.length > CANDLE_COUNT + 50) s.candles = s.candles.slice(-CANDLE_COUNT);
    reevaluate(s, pair, tf);
    s.updatedAt = Date.now(); s.error = null;
  } catch (e) { s.error = e.message; }
  emit();
}

export function useMarket(pair, tf = DEFAULT_TF) {
  useStore();
  useEffect(() => {
    if (!pair) return undefined;
    const s = store.pairs[`${pair}|${tf}`];
    if (!s || (s.status === "error" && !s.loading)) load(pair, tf);
    const id = setInterval(() => refresh(pair, tf), 60000);
    return () => clearInterval(id);
  }, [pair, tf]);
  return store.pairs[`${pair}|${tf}`] || { status: "loading" };
}

let pollers = 0, timer = null;
const wanted = new Map();
async function pollPrices() {
  const pairs = [...new Set([...wanted.keys(), ...CONVERSION_PAIRS])];
  if (!pairs.length) return;
  try { Object.assign(store.prices, await oanda.pricing(pairs)); store.priceError = null; }
  catch (e) { store.priceError = e.message; }
  emit();
}

export function usePrices(pairs) {
  useStore();
  const key = (pairs || []).join(",");
  useEffect(() => {
    const list = key ? key.split(",") : [];
    list.forEach((p) => wanted.set(p, (wanted.get(p) || 0) + 1));
    pollers++;
    pollPrices();
    if (!timer) timer = setInterval(pollPrices, 5000);
    return () => {
      list.forEach((p) => { const n = (wanted.get(p) || 1) - 1; if (n <= 0) wanted.delete(p); else wanted.set(p, n); });
      pollers--;
      if (!pollers && timer) { clearInterval(timer); timer = null; }
    };
  }, [key]);
  return { prices: store.prices, error: store.priceError };
}

export function ratesFrom(prices) {
  const r = {};
  for (const [k, v] of Object.entries(prices || {})) r[k] = v.mid;
  return r;
}
