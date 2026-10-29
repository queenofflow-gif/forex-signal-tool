-- Add GBP/USD and gold; USD/JPY is still supported but no longer watched by default.
alter table public.profiles alter column pairs set default '{EUR_USD,GBP_USD,XAU_USD,GBP_AUD}';
alter table public.profiles alter column max_spread set default '{"EUR_USD":2.0,"GBP_USD":2.5,"XAU_USD":7.0,"GBP_AUD":6.0,"USD_JPY":2.5}'::jsonb;

update public.profiles
set pairs = (select array_agg(p order by array_position('{EUR_USD,GBP_USD,XAU_USD,GBP_AUD,USD_JPY}'::text[], p))
             from (select distinct unnest(array_remove(pairs, 'USD_JPY') || '{GBP_USD,XAU_USD}'::text[]) p) x),
    max_spread = max_spread || '{"GBP_USD":2.5,"XAU_USD":7.0}'::jsonb,
    updated_at = now();

-- Retire open USD/JPY signals so they stop showing as live.
update public.signals set status = 'expired' where status = 'active' and pair = 'USD_JPY';
