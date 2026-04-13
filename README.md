# 📈 Forex Signal Tool

Live signal intelligence for **EUR/USD**, **GBP/AUD**, and **USD/JPY** — powered by Twelve Data and React.

## Features
- Live OHLC candle data from Twelve Data API
- RSI, EMA 20/50 crossovers, MACD, Support/Resistance, Candlestick patterns
- Entry point, Stop Loss, TP1, TP2 with pip counts and R:R ratios
- Best session timing guide for each pair
- Live setups based on real price
- Auto-refreshes every 5 minutes

---

## Deploy to GitHub Pages (Free) — 10 Minutes

### Step 1 — Create GitHub Account
Go to https://github.com and sign up (free).

### Step 2 — Create a New Repository
1. Click the **+** icon → **New repository**
2. Name it: `forex-signal-tool`
3. Set to **Public**
4. Click **Create repository**

### Step 3 — Upload Files
1. Click **uploading an existing file** on the repo page
2. Drag and drop ALL files from this folder:
   - `package.json`
   - `public/index.html`
   - `src/index.js`
   - `src/App.jsx`
3. Click **Commit changes**

### Step 4 — Enable GitHub Pages via GitHub Actions
1. Go to your repo → **Settings** → **Pages**
2. Under "Source" select **GitHub Actions**
3. Create file `.github/workflows/deploy.yml` with this content:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./build
```

4. Push to main — it will auto-build and deploy.
5. Your live URL: `https://YOUR-USERNAME.github.io/forex-signal-tool`

---

## Deploy to Vercel (Even Easier)

1. Go to https://vercel.com → Sign up with GitHub
2. Click **New Project** → Import your GitHub repo
3. Vercel auto-detects React — click **Deploy**
4. Live URL in 2 minutes: `https://forex-signal-tool.vercel.app`

---

## API Key
Your Twelve Data key is already embedded in `src/App.jsx`.
To update it, edit line 3: `const TWELVE_KEY = "your-key-here";`

⚠️ Regenerate your key at twelvedata.com if you've shared it publicly.

---

## Local Development
```bash
npm install
npm start
```
Opens at http://localhost:3000
