// Minimal OANDA v20 REST client. Each call uses the trader's own token.
// Kept free of engine imports so small functions deploy without it.
const PIP: Record<string, number> = {
  EUR_USD: 0.0001, GBP_USD: 0.0001, XAU_USD: 0.1, GBP_AUD: 0.0001, USD_JPY: 0.01, AUD_USD: 0.0001, USD_CAD: 0.0001,
  NZD_USD: 0.0001, USD_CHF: 0.0001, GBP_JPY: 0.01, EUR_JPY: 0.01, AUD_JPY: 0.01, CAD_JPY: 0.01,
};

export const HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};
export const ALLOWED = new Set(Object.keys(PIP));

export type Cred = { token: string; environment: string; account_id: string };

async function call(cred: { token: string; environment: string }, path: string) {
  const res = await fetch(HOSTS[cred.environment] + path, {
    headers: { Authorization: `Bearer ${cred.token}`, "Accept-Datetime-Format": "RFC3339" },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch (_) { body = { errorMessage: text.slice(0, 200) }; }
  if (!res.ok) {
    const err = new Error(body?.errorMessage || `OANDA error ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function accounts(token: string, environment: string) {
  const b = await call({ token, environment }, "/v3/accounts");
  return (b.accounts ?? []) as { id: string }[];
}

export type Candle = { t: number; o: number; h: number; l: number; c: number; complete: boolean };

export async function candles(cred: Cred, pair: string, granularity = "M15", count = 5000, from?: string): Promise<Candle[]> {
  if (!ALLOWED.has(pair)) throw new Error("Unsupported pair");
  const q = new URLSearchParams({ granularity, price: "M" });
  if (from) q.set("from", from); else q.set("count", String(Math.min(5000, Math.max(1, count))));
  const b = await call(cred, `/v3/instruments/${pair}/candles?${q}`);
  return (b.candles ?? []).map((x: any) => ({
    t: Date.parse(x.time), o: +x.mid.o, h: +x.mid.h, l: +x.mid.l, c: +x.mid.c, complete: !!x.complete,
  }));
}

export type Price = { bid: number; ask: number; mid: number; spreadPips: number | null; time: string; tradeable: boolean };

export async function pricing(cred: Cred, pairs: string[]): Promise<Record<string, Price>> {
  const list = pairs.filter((p) => ALLOWED.has(p));
  const b = await call(cred, `/v3/accounts/${cred.account_id}/pricing?instruments=${list.join(",")}`);
  const out: Record<string, Price> = {};
  for (const p of b.prices ?? []) {
    const bid = +(p.bids?.[0]?.price ?? p.closeoutBid), ask = +(p.asks?.[0]?.price ?? p.closeoutAsk);
    const pip = PIP[p.instrument];
    out[p.instrument] = {
      bid, ask, mid: (bid + ask) / 2, spreadPips: pip ? (ask - bid) / pip : null, time: p.time, tradeable: !!p.tradeable,
    };
  }
  return out;
}
