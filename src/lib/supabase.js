import { createClient } from "@supabase/supabase-js";

// Public values: safe in the browser. Row-level security protects every table.
export const SUPABASE_URL = "https://cshjnqkcxyubynzgkyet.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_QSI-sZtyZvMQTwgrLmDtqg_VKLgRT8V";
export const SITE_URL = "https://queenofflow-gif.github.io/forex-signal-tool/";

export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function fn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch (_) { /* keep message */ }
    throw new Error(msg);
  }
  return data;
}

export const oanda = {
  saveToken: (token, environment) => fn("oanda", { action: "save_token", token, environment }),
  removeToken: () => fn("oanda", { action: "remove_token" }),
  candles: (pair, count = 5000, granularity = "M15") => fn("oanda", { action: "candles", pair, count, granularity }).then((d) => d.candles),
  pricing: (pairs) => fn("oanda", { action: "pricing", pairs }).then((d) => d.prices),
};

export const telegram = {
  status: () => fn("telegram", { action: "status" }),
  test: () => fn("telegram", { action: "test" }),
  unlink: () => fn("telegram", { action: "unlink" }),
};
