# Forex Signal

Backtested strategy signals for **EUR/USD**, **GBP/AUD** and **USD/JPY**, sized to each trader's prop firm rules.

Live site: https://queenofflow-gif.github.io/forex-signal-tool/

## What it does

- **Accounts.** Email and password sign-in with optional two-step verification. Each trader keeps their own rules, OANDA token, trades and alerts.
- **Live prices.** Each trader connects their own OANDA practice token. It's validated with OANDA, encrypted in the database (pgcrypto, key held in Supabase Vault), and never sent back to the browser.
- **Five strategies.** Holy Grail and Turtle Soup (Linda Raschke), EMA crossover with a 4-hour trend filter, London breakout and RSI reversal.
- **Timeframes.** 4-hour candles by default (about 3 years of history per backtest), with 1-hour and 15-minute options in setup.
- **Honest backtests.** Each strategy picks its settings on the first 60% of 5,000 candles, then is scored on the last 40% it never saw. Stops are widened to a per-timeframe minimum, and signals are skipped when the spread is over 15% of the stop. Spread is charged on every trade. TP1 closes half and moves the stop to breakeven; TP2 closes the rest. Strategies with too few trades, a thin edge, or losses are flagged and left out of alerts.
- **Signals.** Entry, stop (ATR or structure based), TP1 at 1R, TP2 at 2R, and lot size from the trader's risk per trade.
- **Pre-trade checks.** Spread, daily loss, room to the drawdown floor, max open trades, correlated exposure and trading session.
- **Trade management.** "I took it" logs the trade; the scanner watches it and alerts on TP1 (move stop to breakeven), TP2 and stop.
- **Journal.** Live results by strategy, skipped signals with reasons, CSV export.
- **Telegram alerts.** New signals, skipped signals, TP/stop hits and daily-loss warnings, with quiet hours.

It never places trades. Educational tool, not financial advice.

## How it's built

| Part | Where |
| --- | --- |
| Website (React) | `src/`, deployed to GitHub Pages by `.github/workflows/deploy.yml` |
| Strategy engine | `src/engine/engine.js` (shared; copied to `supabase/functions/_shared/engine.js` by `scripts/sync-engine.sh`) |
| Database, security | `supabase/migrations/` |
| Server functions | `supabase/functions/oanda` (token + price proxy), `scan` (every 2 minutes via pg_cron), `telegram` (bot webhook) |

Supabase project ref: `cshjnqkcxyubynzgkyet`.

## Local development

```bash
npm install
npm start
```

After editing `src/engine/engine.js`, run `./scripts/sync-engine.sh` and redeploy the `scan` function.

## One-time setup

1. **Supabase Auth URLs.** In Supabase → Authentication → URL Configuration, set the Site URL to `https://queenofflow-gif.github.io/forex-signal-tool/` and add it to Redirect URLs.
2. **Telegram bot.** Create a bot with @BotFather, add its token as the `TELEGRAM_BOT_TOKEN` edge function secret, then run in the SQL editor:
   `select public.invoke_function('telegram', '{"action":"setup"}');`
3. **Email.** Supabase's built-in email sender is rate limited. Add your own SMTP under Authentication → Emails before inviting many users.
