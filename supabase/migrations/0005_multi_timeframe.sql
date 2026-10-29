-- Scan several timeframes at once (e.g. 1-hour + 4-hour).
alter table public.profiles add column timeframes text[] not null default '{H4}'
  check (timeframes <@ '{M15,H1,H4}'::text[] and cardinality(timeframes) between 1 and 3);
grant update (timeframes) on public.profiles to authenticated;
update public.profiles set timeframes = array[timeframe];

-- Scanner progress is tracked per pair *and* timeframe.
alter table public.scan_cursor add column granularity text not null default 'H4';
update public.scan_cursor c set granularity = p.timeframe from public.profiles p where p.user_id = c.user_id;
alter table public.scan_cursor drop constraint scan_cursor_pkey;
alter table public.scan_cursor add primary key (user_id, pair, granularity);
alter table public.scan_cursor alter column granularity drop default;

-- The same strategy can fire on 1-hour and 4-hour candles that open at the same time.
alter table public.signals drop constraint signals_user_id_pair_strategy_candle_time_key;
alter table public.signals add constraint signals_user_pair_tf_strategy_candle_key unique (user_id, pair, granularity, strategy, candle_time);
