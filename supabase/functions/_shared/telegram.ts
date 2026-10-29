export function botToken(): string | null {
  return Deno.env.get("TELEGRAM_BOT_TOKEN") ?? null;
}

// Secret Telegram must echo back on every webhook call, derived from the bot token.
export async function webhookSecret(): Promise<string> {
  const t = botToken() ?? "";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t + ":forex-signal-webhook"));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

export async function tg(method: string, payload: Record<string, unknown>) {
  const t = botToken();
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw new Error(body.description || `Telegram ${method} failed`);
  return body.result;
}

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function send(chatId: number | string, html: string) {
  return tg("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true });
}
