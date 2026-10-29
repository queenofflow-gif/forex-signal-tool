// Maintenance tool: backtests candidate pairs on a trader's own OANDA data without
// adding them to their watch list. Server-only (cron secret).
// select public.invoke_function('screen', '{"timeframe":"H1","pairs":["USD_CAD","AUD_USD"]}');
import { admin, cronAuthorized, json } from "../_shared/common.ts";
import { candles, pricing, Cred } from "../_shared/oanda.ts";
import { PAIRS, CANDLE_COUNT, evaluate, tfOf } from "../_shared/engine.js";

Deno.serve(async (req) => {
  const db = admin();
  if (!(await cronAuthorized(req, db))) return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const tf = tfOf(body.timeframe);
  const uid = body.user_id ?? (await db.rpc("list_scan_users")).data?.[0]?.user_id;
  const { data: cred } = await db.rpc("get_oanda_token", { p_user: uid }).maybeSingle();
  if (!cred) return json({ error: "No OANDA token" }, 400);
  const pairs: string[] = (body.pairs || []).filter((p: string) => (PAIRS as any)[p]).slice(0, 20);
  const prices = await pricing(cred as Cred, pairs);
  const out = [];
  for (const pair of pairs) {
    try {
      const c = await candles(cred as Cred, pair, tf.key, CANDLE_COUNT);
      const now = prices[pair]?.spreadPips ?? null;
      const cost = Math.max((PAIRS as any)[pair].typicalSpread, now ?? 0);
      const ev = evaluate(c, pair, tf.key, cost);
      out.push({
        pair, spreadNow: now && +now.toFixed(1), cost: +cost.toFixed(1), from: new Date(ev.startTime).toISOString().slice(0, 10),
        results: ev.results.map((r: any) => ({
          s: r.key, v: r.verdict, n: r.unseen.n, wr: Math.round(r.unseen.winRate * 100), avg: +r.unseen.avgR.toFixed(2),
          pf: +Math.min(r.unseen.pf, 99).toFixed(2), streak: r.unseen.worstStreak, p: r.params,
        })),
      });
    } catch (e) { out.push({ pair, error: (e as Error).message }); }
  }
  return json({ timeframe: tf.key, out });
});
