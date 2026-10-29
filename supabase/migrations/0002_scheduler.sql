-- Calls an edge function from the database with the cron secret (server only).
create or replace function public.invoke_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := p_body,
    timeout_milliseconds := 120000
  );
$$;
revoke execute on function public.invoke_function(text, jsonb) from public, anon, authenticated;

-- Scanner every 2 minutes: trade alerts each run, full strategy scan on each new 15-minute candle.
select cron.schedule('forex-scan', '*/2 * * * *', $$ select public.invoke_function('scan'); $$);

-- pg_net belongs outside the public schema.
drop extension if exists pg_net;
create extension pg_net schema extensions;
comment on table public.alert_log is 'Server-only: dedupes Telegram alerts. No client access by design.';

-- One-time Telegram webhook setup, after TELEGRAM_BOT_TOKEN is set:
--   select public.invoke_function('telegram', '{"action":"setup"}');
