// Shared live-market store: candles + strategy evaluation per pair, and polled prices.
import { useEffect, useReducer } from "react";
import { oanda } from "./supabase";
import { evaluate, lastCompleteIndex, CANDLE_COUNT, CONVERSION_PAIRS } from "../engine/engine";

const store = { pairs: {}, prices: {}, priceError: null };
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { listeners.add(force); return () => listeners.delete(force); }, []);
}

function reevaluate(s, pair) {
  const li = lastCompleteIndex(s.candles);
  const key = li >= 0 ? s.candles[li].t : 0;
  if (s.evalKey === key && s.ev) return;
  s.ev = evaluate(s.candles.slice(0, li + 1), pair);
  s.evalKey = key;
}

async function load(pair) {
  const s = (store.pairs[pair] = store.pairs[pair] || { status: "loading" });
  if (s.loading) return;
  s.loading = true;
  try {
    s.candles = await oanda.candles(pair, CANDLE_COUNT);
    reevaluate(s, pair);
    s.status = "ready"; s.error = null; s.updatedAt = Date.now();
  } catch (e) {
    s.status = s.candles ? "ready" : "error"; s.error = e.message;
  } finally { s.loading = false; emit(); }
}

async function refresh(pair) {
  const s = store.pairs[pair];
  if (!s || !s.candles || s.loading) return load(pair);
  try {
    const tail = await oanda.candles(pair, 10);
    const byT = new Map(s.candles.map((c, i) => [c.t, i]));
    for (const c of tail) { if (byT.has(c.t)) s.candles[byT.get(c.t)] = c; else s.candles.push(c); }
    if (s.candles.length > CANDLE_COUNT + 50) s.candles = s.candles.slice(-CANDLE_COUNT);
    reevaluate(s, pair);
    s.updatedAt = Date.now(); s.error = null;
  } catch (e) { s.error = e.message; }
  emit();
}

export function useMarket(pair) {
  useStore();
  useEffect(() => {
    if (!pair) return undefined;
    const s = store.pairs[pair];
    if (!s || (s.status === "error" && !s.loading)) load(pair);
    const id = setInterval(() => refresh(pair), 60000);
    return () => clearInterval(id);
  }, [pair]);
  return store.pairs[pair] || { status: "loading" };
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
