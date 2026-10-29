import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SITE_URL = "https://queenofflow-gif.github.io/forex-signal-tool/";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
  } catch (_) { /* fall back */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Returns the signed-in user's id, or null.
export async function userFromRequest(req: Request, db: SupabaseClient): Promise<string | null> {
  const h = req.headers.get("Authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

export async function cronAuthorized(req: Request, db: SupabaseClient): Promise<boolean> {
  const s = req.headers.get("x-cron-secret") ?? "";
  if (!s) return false;
  const { data } = await db.rpc("verify_cron_secret", { p_secret: s });
  return data === true;
}
