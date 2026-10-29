-- Forex Signal v2: schema, row-level security, encrypted token storage
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Profiles: each trader's account rules ────────────────────
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preset text not null default 'blaze',
  account_size numeric not null default 10000 check (account_size > 0),
  max_loss_pct numeric not null default 4 check (max_loss_pct > 0 and max_loss_pct <= 100),
  max_loss_type text not null default 'trailing' check (max_loss_type in ('trailing','static')),
  daily_loss_pct numeric not null default 2 check (daily_loss_pct > 0 and daily_loss_pct <= 100),
  consistency_pct numeric not null default 20 check (consistency_pct >= 0 and consistency_pct <= 100),
  risk_pct numeric not null default 0.5 check (risk_pct > 0 and risk_pct <= 10),
  max_open_trades int not null default 2 check (max_open_trades between 1 and 20),
  max_spread jsonb not null default '{"EUR_USD":1.5,"GBP_AUD":3.5,"USD_JPY":1.8}'::jsonb,
  block_correlated boolean not null default true,
  sessions_only boolean not null default true,
  pairs text[] not null default '{EUR_USD,GBP_AUD,USD_JPY}',
  daily_reset_hour_utc int not null default 22 check (daily_reset_hour_utc between 0 and 23),
  setup_done boolean not null default false,
  oanda_connected boolean not null default false,
  oanda_last4 text,
  oanda_env text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Alert settings (Telegram) ─────────────────────────────────
create table public.alert_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_chat_id bigint,
  telegram_username text,
  link_code text unique default encode(extensions.gen_random_bytes(9), 'hex'),
  telegram_enabled boolean not null default true,
  on_signal boolean not null default true,
  on_levels boolean not null default true,
  on_skip boolean not null default true,
  on_daily_warn boolean not null default true,
  only_trusted boolean not null default true,
  quiet_enabled boolean not null default false,
  quiet_start int not null default 23 check (quiet_start between 0 and 23),
  quiet_end int not null default 6 check (quiet_end between 0 and 23),
  timezone text not null default 'America/Chicago',
  updated_at timestamptz not null default now()
);

-- ── Signals produced by the scanner ───────────────────────────
create table public.signals (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pair text not null,
  granularity text not null default 'M15',
  strategy text not null,
  direction text not null check (direction in ('buy','sell')),
  entry numeric not null,
  sl numeric not null,
  tp1 numeric not null,
  tp2 numeric not null,
  stop_pips numeric not null,
  lots numeric not null,
  risk_usd numeric not null,
  spread_pips numeric,
  confluence text[] not null default '{}',
  trusted boolean not null default false,
  status text not null default 'active' check (status in ('active','skipped','taken','dismissed','expired')),
  skip_reason text,
  candle_time timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, pair, strategy, candle_time)
);
create index signals_user_created_idx on public.signals (user_id, created_at desc);

-- ── Trades the trader logged ──────────────────────────────────
create table public.trades (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id bigint references public.signals(id) on delete set null,
  pair text not null,
  strategy text not null,
  direction text not null check (direction in ('buy','sell')),
  entry numeric not null,
  sl numeric not null,
  original_sl numeric not null,
  tp1 numeric not null,
  tp2 numeric not null,
  lots numeric not null check (lots > 0),
  risk_usd numeric not null,
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  tp1_hit_at timestamptz,
  tp2_hit_at timestamptz,
  sl_hit_at timestamptz,
  be_moved boolean not null default false,
  partial_closed boolean not null default false,
  exit_price numeric,
  closed_at timestamptz,
  result_r numeric,
  pnl_usd numeric,
  notes text
);
create index trades_user_opened_idx on public.trades (user_id, opened_at desc);
create index trades_signal_idx on public.trades (signal_id);

-- ── Bookkeeping for the scanner (server only) ─────────────────
create table public.alert_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create table public.scan_cursor (
  user_id uuid not null references auth.users(id) on delete cascade,
  pair text not null,
  last_candle_time timestamptz,
  last_scan_at timestamptz,
  last_error text,
  primary key (user_id, pair)
);

-- ── Row-level security ────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.alert_settings enable row level security;
alter table public.signals enable row level security;
alter table public.trades enable row level security;
alter table public.alert_log enable row level security;
alter table public.scan_cursor enable row level security;

create policy "own profile read" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "own profile update" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own alerts read" on public.alert_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "own alerts update" on public.alert_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own signals read" on public.signals for select to authenticated using ((select auth.uid()) = user_id);
create policy "own signals update" on public.signals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own trades read" on public.trades for select to authenticated using ((select auth.uid()) = user_id);
create policy "own trades insert" on public.trades for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own trades update" on public.trades for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own trades delete" on public.trades for delete to authenticated using ((select auth.uid()) = user_id);
create policy "own scan status read" on public.scan_cursor for select to authenticated using ((select auth.uid()) = user_id);

-- Column-level limits: traders can't set server-managed fields themselves
revoke update on public.profiles from authenticated, anon;
grant update (preset, account_size, max_loss_pct, max_loss_type, daily_loss_pct, consistency_pct, risk_pct,
  max_open_trades, max_spread, block_correlated, sessions_only, pairs, daily_reset_hour_utc, setup_done, updated_at)
  on public.profiles to authenticated;
revoke update on public.alert_settings from authenticated, anon;
grant update (telegram_enabled, on_signal, on_levels, on_skip, on_daily_warn, only_trusted, quiet_enabled,
  quiet_start, quiet_end, timezone, updated_at) on public.alert_settings to authenticated;
revoke update on public.signals from authenticated, anon;
grant update (status) on public.signals to authenticated;
revoke update on public.trades from authenticated, anon;
grant update (sl, be_moved, partial_closed, exit_price, closed_at, result_r, pnl_usd, status, notes) on public.trades to authenticated;
revoke all on public.alert_log from authenticated, anon;
revoke insert, update, delete on public.scan_cursor from authenticated, anon;

-- ── New user → profile + alert settings ───────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.alert_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Encrypted OANDA tokens (private schema, server only) ──────
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.oanda_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_enc bytea not null,
  environment text not null check (environment in ('practice','live')),
  account_id text not null,
  updated_at timestamptz not null default now()
);

-- Random keys generated inside the database; nobody ever sees them
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'oanda_token_key', 'Encrypts OANDA tokens');
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'cron_secret', 'Authorizes the scheduled scanner');
select vault.create_secret('https://cshjnqkcxyubynzgkyet.supabase.co', 'project_url', 'Project API URL for cron');

create or replace function public.store_oanda_token(p_user uuid, p_token text, p_env text, p_account text)
returns void language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'oanda_token_key';
  insert into private.oanda_credentials (user_id, token_enc, environment, account_id, updated_at)
  values (p_user, extensions.pgp_sym_encrypt(p_token, k), p_env, p_account, now())
  on conflict (user_id) do update set token_enc = excluded.token_enc, environment = excluded.environment,
    account_id = excluded.account_id, updated_at = now();
  update public.profiles set oanda_connected = true, oanda_last4 = right(p_token, 4), oanda_env = p_env, updated_at = now()
  where user_id = p_user;
end $$;

create or replace function public.get_oanda_token(p_user uuid)
returns table (token text, environment text, account_id text)
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'oanda_token_key';
  return query select extensions.pgp_sym_decrypt(c.token_enc, k), c.environment, c.account_id
    from private.oanda_credentials c where c.user_id = p_user;
end $$;

create or replace function public.delete_oanda_token(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.oanda_credentials where user_id = p_user;
  update public.profiles set oanda_connected = false, oanda_last4 = null, oanda_env = null, updated_at = now()
  where user_id = p_user;
end $$;

create or replace function public.list_scan_users()
returns table (user_id uuid) language sql security definer set search_path = '' as $$
  select c.user_id from private.oanda_credentials c
  join public.profiles p on p.user_id = c.user_id where p.setup_done;
$$;

create or replace function public.verify_cron_secret(p_secret text)
returns boolean language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'cron_secret' and decrypted_secret = p_secret);
$$;

revoke execute on function public.store_oanda_token(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.get_oanda_token(uuid) from public, anon, authenticated;
revoke execute on function public.delete_oanda_token(uuid) from public, anon, authenticated;
revoke execute on function public.list_scan_users() from public, anon, authenticated;
revoke execute on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.store_oanda_token(uuid, text, text, text) to service_role;
grant execute on function public.get_oanda_token(uuid) to service_role;
grant execute on function public.delete_oanda_token(uuid) to service_role;
grant execute on function public.list_scan_users() to service_role;
grant execute on function public.verify_cron_secret(text) to service_role;
