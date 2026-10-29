// Telegram: webhook for linking chats, plus user actions (status, test, unlink) and one-time setup.
import { admin, cors, cronAuthorized, json, userFromRequest } from "../_shared/common.ts";
import { tg, send, webhookSecret, botToken } from "../_shared/telegram.ts";

const db = admin();

async function handleUpdate(update: any) {
  const msg = update?.message;
  if (!msg?.chat?.id || typeof msg.text !== "string") return;
  const chatId = msg.chat.id, text = msg.text.trim();
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1] ?? "";
    if (!/^[a-f0-9]{18}$/.test(code)) {
      await send(chatId, "Open Forex Signal → Account → Alerts and tap <b>Connect Telegram</b> to link this chat.");
      return;
    }
    const { data: row } = await db.from("alert_settings").select("user_id").eq("link_code", code).maybeSingle();
    if (!row) { await send(chatId, "That link has expired. Open Alerts on the website and tap Connect Telegram again."); return; }
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(9))).map((b) => b.toString(16).padStart(2, "0")).join("");
    await db.from("alert_settings").update({ telegram_chat_id: chatId, telegram_username: msg.from?.username ?? null, link_code: fresh }).eq("user_id", row.user_id);
    await send(chatId, "✅ Connected. You'll get signal and trade alerts here. Send /stop to disconnect.");
    return;
  }
  if (text === "/stop") {
    await db.from("alert_settings").update({ telegram_chat_id: null, telegram_username: null }).eq("telegram_chat_id", chatId);
    await send(chatId, "Disconnected. You won't get alerts here anymore.");
    return;
  }
  await send(chatId, "This bot only sends alerts. Manage them on the website under Account → Alerts.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Telegram webhook calls carry the secret header.
  const tgSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (tgSecret !== null) {
    if (!botToken() || tgSecret !== (await webhookSecret())) return new Response("forbidden", { status: 403 });
    try { await handleUpdate(await req.json()); } catch (e) { console.error("tg update", e); }
    return new Response("ok");
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* empty */ }

  // One-time setup, called from the database with the cron secret.
  if (body.action === "setup") {
    if (!(await cronAuthorized(req, db))) return json({ error: "Unauthorized" }, 401);
    if (!botToken()) return json({ error: "TELEGRAM_BOT_TOKEN is not set" }, 400);
    const me = await tg("getMe", {});
    await tg("setWebhook", {
      url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram`,
      secret_token: await webhookSecret(), allowed_updates: ["message"], drop_pending_updates: true,
    });
    return json({ ok: true, bot: me.username });
  }

  const uid = await userFromRequest(req, db);
  if (!uid) return json({ error: "Sign in first" }, 401);

  if (body.action === "status") {
    if (!botToken()) return json({ configured: false });
    const me = await tg("getMe", {});
    return json({ configured: true, bot: me.username });
  }
  if (body.action === "test") {
    const { data: a } = await db.from("alert_settings").select("telegram_chat_id").eq("user_id", uid).single();
    if (!a?.telegram_chat_id) return json({ error: "Telegram isn't connected yet" }, 400);
    const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
    await send(a.telegram_chat_id,
      `🔔 <b>TEST · Buy EUR/USD · EMA crossover · 4h</b>\n<code>In 1.08420 · SL 1.08070\nTP1 1.08770 · TP2 1.09120\n0.14 lots · risk $49</code>\nValid for about 12 hours.\n\nThis is a sample. Real signals look like this. Alerts are working (sent ${t} CT).`);
    return json({ ok: true });
  }
  if (body.action === "unlink") {
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(9))).map((b) => b.toString(16).padStart(2, "0")).join("");
    await db.from("alert_settings").update({ telegram_chat_id: null, telegram_username: null, link_code: fresh }).eq("user_id", uid);
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
});
