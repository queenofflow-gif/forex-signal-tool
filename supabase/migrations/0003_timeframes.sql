-- Timeframe per trader (4-hour default), realistic spread limits, trade watermark, strategy stats.
alter table public.profiles add column timeframe text not null default 'H4' check (timeframe in ('M15','H1','H4'));
grant update (timeframe) on public.profiles to authenticated;
update public.profiles set timeframe = 'H4';

alter table public.profiles alter column max_spread set default '{"EUR_USD":2.0,"GBP_AUD":6.0,"USD_JPY":2.5}'::jsonb;
update public.profiles set max_spread = '{"EUR_USD":2.0,"GBP_AUD":6.0,"USD_JPY":2.5}'::jsonb
where max_spread = '{"EUR_USD":1.5,"GBP_AUD":3.5,"USD_JPY":1.8}'::jsonb;

-- Scanner only checks price action after this time, so a breakeven stop
-- is never tested against candles from before TP1.
alter table public.trades add column watched_until timestamptz;
update public.trades set watched_until = coalesce(closed_at, now());

-- Latest backtest results per strategy, written by the scanner on each new candle.
create table public.strategy_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  pair text not null,
  granularity text not null,
  strategy text not null,
  verdict text not null,
  trusted boolean not null,
  params jsonb,
  unseen_n int not null,
  unseen_win_rate numeric,
  unseen_avg_r numeric,
  unseen_pf numeric,
  data_from timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, pair, granularity, strategy)
);
alter table public.strategy_stats enable row level security;
create policy "own stats read" on public.strategy_stats for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.strategy_stats from authenticated, anon;

-- Retire 15-minute signals and re-scan everything on the new timeframe.
update public.signals set status = 'expired' where status = 'active';
delete from public.scan_cursor;
