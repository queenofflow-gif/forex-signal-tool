// User-facing OANDA proxy. The token never leaves the server after it is saved.
import { admin, cors, json, userFromRequest } from "../_shared/common.ts";
import { accounts, candles, pricing, ALLOWED } from "../_shared/oanda.ts";

const GRANS = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();
  const uid = await userFromRequest(req, db);
  if (!uid) return json({ error: "Sign in first" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch (_) { return json({ error: "Bad request" }, 400); }

  try {
    if (body.action === "save_token") {
      const token = String(body.token ?? "").trim();
      if (!/^[A-Za-z0-9-]{20,200}$/.test(token)) return json({ error: "That doesn't look like an OANDA token" }, 400);
      let environment = body.environment === "live" ? "live" : "practice";
      let accts: { id: string }[] = [];
      try { accts = await accounts(token, environment); }
      catch (_) {
        environment = environment === "practice" ? "live" : "practice";
        try { accts = await accounts(token, environment); }
        catch (_e) { return json({ error: "OANDA rejected this token. Check it and try again." }, 400); }
      }
      if (!accts.length) return json({ error: "No OANDA account found for this token" }, 400);
      const { error } = await db.rpc("store_oanda_token", { p_user: uid, p_token: token, p_env: environment, p_account: accts[0].id });
      if (error) throw error;
      return json({ ok: true, environment, last4: token.slice(-4) });
    }

    if (body.action === "remove_token") {
      const { error } = await db.rpc("delete_oanda_token", { p_user: uid });
      if (error) throw error;
      return json({ ok: true });
    }

    const { data: cred, error: cErr } = await db.rpc("get_oanda_token", { p_user: uid }).maybeSingle();
    if (cErr) throw cErr;
    if (!cred) return json({ error: "Connect your OANDA token in setup first", code: "no_token" }, 400);

    if (body.action === "candles") {
      const pair = String(body.pair), gran = GRANS.has(body.granularity) ? body.granularity : "M15";
      if (!ALLOWED.has(pair)) return json({ error: "Unsupported pair" }, 400);
      const list = await candles(cred as any, pair, gran, Number(body.count) || 500, body.from || undefined);
      return json({ candles: list });
    }

    if (body.action === "pricing") {
      const pairs = (Array.isArray(body.pairs) ? body.pairs : []).map(String).filter((p: string) => ALLOWED.has(p)).slice(0, 10);
      if (!pairs.length) return json({ error: "No pairs" }, 400);
      return json({ prices: await pricing(cred as any, pairs) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const status = (e as any)?.status === 401 ? 400 : 500;
    return json({ error: (e as Error).message || "Something went wrong" }, status);
  }
});
