// Scheduled scanner: runs every 2 minutes from pg_cron.
// 1) Watches open trades for TP1 / TP2 / stop and alerts.
// 2) On each new 15-minute candle, evaluates strategies and records signals.
import { admin, cronAuthorized, json, SITE_URL } from "../_shared/common.ts";
import { candles, pricing, Cred, Price } from "../_shared/oanda.ts";
import { send, esc, botToken } from "../_shared/telegram.ts";
import {
  PAIRS, CANDLE_COUNT, evaluate, liveSignals, sizeTrade, accountState, preTradeChecks, fmtPrice, lastCompleteIndex,
} from "../_shared/engine.js";

const db = admin();

function inQuiet(a: any, now = new Date()) {
  if (!a.quiet_enabled) return false;
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: a.timezone || "UTC" }).format(now)) % 24;
  return a.quiet_start <= a.quiet_end ? h >= a.quiet_start && h < a.quiet_end : h >= a.quiet_start || h < a.quiet_end;
}

async function once(uid: string, kind: string, ref: string) {
  const { error } = await db.from("alert_log").insert({ user_id: uid, kind, ref });
  return !error; // unique violation = already sent
}

async function alert(uid: string, a: any, kind: string, ref: string, html: string, enabled: boolean) {
  if (!enabled || !a?.telegram_chat_id || !a.telegram_enabled || !botToken()) return;
  if (!(await once(uid, kind, ref))) return;
  if (inQuiet(a)) return;
  try { await send(a.telegram_chat_id, html); } catch (e) { console.error("telegram", uid, (e as Error).message); }
}

const L = (pair: string) => (PAIRS as any)[pair].label;
const dirWord = (d: string) => (d === "buy" ? "Buy" : "Sell");

async function watchTrades(uid: string, cred: Cred, a: any, open: any[], prices: Record<string, Price>) {
  for (const t of open) {
    const from = new Date(Math.max(new Date(t.opened_at).getTime(), Date.now() - 12 * 3600e3)).toISOString();
    let bars: any[] = [];
    try { bars = await candles(cred, t.pair, "M5", 0, from); } catch (_) { continue; }
    const p = prices[t.pair];
    if (p) bars.push({ h: p.mid, l: p.mid });
    const s = t.direction === "buy" ? 1 : -1;
    const upd: Record<string, unknown> = {};
    let tp1 = !!t.tp1_hit_at, tp2 = !!t.tp2_hit_at, sl = !!t.sl_hit_at;
    for (const b of bars) {
      if (tp2 || sl) break;
      const favor = s > 0 ? b.h : b.l, adverse = s > 0 ? b.l : b.h;
      const stop = t.be_moved ? Number(t.entry) : Number(t.sl);
      if (s * (adverse - stop) <= 0) { sl = true; upd.sl_hit_at = new Date().toISOString(); break; }
      if (!tp1 && s * (favor - Number(t.tp1)) >= 0) { tp1 = true; upd.tp1_hit_at = new Date().toISOString(); }
      if (tp1 && s * (favor - Number(t.tp2)) >= 0) { tp2 = true; upd.tp2_hit_at = new Date().toISOString(); }
    }
    if (!Object.keys(upd).length) continue;
    await db.from("trades").update(upd).eq("id", t.id);
    const link = `${SITE_URL}#/trade/${t.id}`;
    const head = `${dirWord(t.direction)} ${L(t.pair)} · ${esc(t.strategy)}`;
    if (upd.tp1_hit_at && !upd.sl_hit_at)
      await alert(uid, a, "tp1", String(t.id), `<b>TP1 hit · move stop to breakeven</b>\n${head}\nClose ${(Math.floor((t.lots / 2) * 100) / 100).toFixed(2)} lots. New stop ${fmtPrice(t.pair, t.entry)}.\n<a href="${link}">Open trade</a>`, a.on_levels);
    if (upd.tp2_hit_at)
      await alert(uid, a, "tp2", String(t.id), `<b>TP2 hit</b>\n${head}\nClose the rest at ${fmtPrice(t.pair, t.tp2)} and log the exit.\n<a href="${link}">Log exit</a>`, a.on_levels);
    if (upd.sl_hit_at)
      await alert(uid, a, "sl", String(t.id), `<b>${t.be_moved ? "Breakeven stop hit" : "Stop hit"}</b>\n${head}\nLog the exit to keep your daily limits accurate.\n<a href="${link}">Log exit</a>`, a.on_levels);
  }
}

async function scanUser(uid: string) {
  const [{ data: profile }, { data: a }, { data: trades }, { data: credRow }, { data: cursors }] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", uid).single(),
    db.from("alert_settings").select("*").eq("user_id", uid).single(),
    db.from("trades").select("*").eq("user_id", uid).gte("opened_at", new Date(Date.now() - 120 * 86400e3).toISOString()),
    db.rpc("get_oanda_token", { p_user: uid }).maybeSingle(),
    db.from("scan_cursor").select("*").eq("user_id", uid),
  ]);
  if (!profile || !credRow) return;
  const cred = credRow as Cred;
  const pairs: string[] = (profile.pairs || []).filter((p: string) => (PAIRS as any)[p]);
  const prices = await pricing(cred, [...new Set([...pairs, "AUD_USD", ...(trades || []).filter((t: any) => t.status === "open").map((t: any) => t.pair)])]);
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(prices)) rates[k] = v.mid;
  const open = (trades || []).filter((t: any) => t.status === "open");

  await watchTrades(uid, cred, a, open, prices);

  const account = accountState(profile, trades || []);
  if (account.dailyUsed >= account.dailyLimit / 2) {
    await alert(uid, a, "daily", new Date().toISOString().slice(0, 10), `<b>Daily loss at ${Math.round((account.dailyUsed / account.dailyLimit) * 100)}%</b>\nNew signals are paused for the rest of the trading day.`, a?.on_daily_warn);
  }

  await db.from("signals").update({ status: "expired" }).eq("user_id", uid).eq("status", "active").lt("created_at", new Date(Date.now() - 2 * 3600e3).toISOString());

  const cur: Record<string, any> = Object.fromEntries((cursors || []).map((c: any) => [c.pair, c]));
  for (const pair of pairs) {
    try {
      const tail = await candles(cred, pair, "M15", 3);
      const li = lastCompleteIndex(tail);
      if (li < 0) continue;
      const latest = new Date(tail[li].t).toISOString();
      if (cur[pair]?.last_candle_time && new Date(cur[pair].last_candle_time).toISOString() === latest) continue;

      const full = await candles(cred, pair, "M15", CANDLE_COUNT);
      const ev = evaluate(full, pair);
      const fired = liveSignals(ev, pair);
      const spread = prices[pair]?.spreadPips ?? null;
      for (const f of fired as any[]) {
        const size = sizeTrade(profile, pair, f.entry, f.sl, rates);
        if (!size.lots) continue;
        const checks = preTradeChecks(profile, { pair, dir: f.dir }, { spreadPips: spread, openTrades: open as any, account, riskUsd: size.actualRisk });
        const failed = checks.filter((c: any) => c.blocking && !c.ok);
        const row = {
          user_id: uid, pair, granularity: "M15", strategy: f.strategy, direction: f.dir,
          entry: f.entry, sl: f.sl, tp1: f.tp1, tp2: f.tp2, stop_pips: Math.round(size.stopPips * 10) / 10,
          lots: size.lots, risk_usd: Math.round(size.actualRisk * 100) / 100, spread_pips: spread,
          confluence: f.confluence, trusted: f.trusted, candle_time: new Date(f.candleTime).toISOString(),
          status: failed.length ? "skipped" : "active", skip_reason: failed.map((c: any) => c.label).join("; ") || null,
        };
        const { data: ins } = await db.from("signals").upsert(row, { onConflict: "user_id,pair,strategy,candle_time", ignoreDuplicates: true }).select("id");
        const id = ins?.[0]?.id;
        if (!id) continue;
        const allowed = f.trusted || !a?.only_trusted;
        if (!allowed) continue;
        const link = `${SITE_URL}#/signal/${id}`;
        if (failed.length) {
          // Outside-session skips are expected every night; don't alert for those.
          if (!failed.some((c: any) => c.key !== "session")) continue;
          await alert(uid, a, "skip", String(id), `<b>Signal skipped · ${esc(failed[0].label)}</b>\n${dirWord(f.dir)} ${L(pair)} · ${esc(f.name)}\n<a href="${link}">Details</a>`, a?.on_skip);
        } else {
          const agree = f.confluence.length > 1 ? ` (+${f.confluence.length - 1} agree)` : "";
          await alert(uid, a, "signal", String(id),
            `<b>${dirWord(f.dir)} ${L(pair)} · ${esc(f.name)}${agree}</b>\n<code>In ${fmtPrice(pair, f.entry)} · SL ${fmtPrice(pair, f.sl)}\nTP1 ${fmtPrice(pair, f.tp1)} · TP2 ${fmtPrice(pair, f.tp2)}\n${size.lots.toFixed(2)} lots · risk $${Math.round(size.actualRisk)}</code>\n<a href="${link}">Open signal</a>`,
            a?.on_signal);
        }
      }
      await db.from("scan_cursor").upsert({ user_id: uid, pair, last_candle_time: latest, last_scan_at: new Date().toISOString(), last_error: null });
    } catch (e) {
      await db.from("scan_cursor").upsert({ user_id: uid, pair, last_scan_at: new Date().toISOString(), last_error: (e as Error).message.slice(0, 300) });
    }
  }
}

Deno.serve(async (req) => {
  if (!(await cronAuthorized(req, db))) return json({ error: "Unauthorized" }, 401);
  const { data: users, error } = await db.rpc("list_scan_users");
  if (error) return json({ error: error.message }, 500);
  const results: Record<string, string> = {};
  for (const u of users || []) {
    try { await scanUser(u.user_id); results[u.user_id] = "ok"; }
    catch (e) { results[u.user_id] = (e as Error).message; console.error("scan", u.user_id, e); }
  }
  return json({ scanned: (users || []).length, results });
});
