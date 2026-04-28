# Titan Trader — local personal app

Offline-first dashboard for **your machine only** (defaults to `127.0.0.1`). SQLite data lives in `data/titan.db` unless you set `TITAN_DB_PATH`.

## What is automated today

- **Equities:** the built-in engine syncs your Alpaca **account, stock positions, and portfolio**; scores an **ensemble** of four rules; uses **Ollama** sentiment; obeys **daily / weekly (7d) / max drawdown** risk limits; places **stock market orders** when allowed.
- **Options:** **OCC** option **positions** are read from Alpaca, **Greeks/IV** are filled from the **options snapshot** API when available. **Multi-leg** opens use `submitMultilegOrder` (options account + entitlements required). **Wheel** and **iron condor** modules are **scaffolded** in `server/strategies/` (not a full separate auto-trader loop yet).

## Quick start

1. **Node.js 20+**
2. `npm install` — keep default install (includes dev tools). If `tsc` is missing, you probably ran install with `NODE_ENV=production`; run `npm install` again without that.
3. Copy `.env.example` to `.env` and set **`TITAN_ENCRYPTION_KEY`** (64 hex characters) if you store API keys in Settings.
4. **`npm run db:push`** — applies the database schema.
5. **`npm run dev`** → open **http://127.0.0.1:5000** (or your `PORT`).

**Production-style run:** `npm run build` then `npm start` (serves built UI + API on the same port).

## Environment

| Variable | Purpose |
|----------|---------|
| `TITAN_DB_PATH` | SQLite file path (default `data/titan.db`) |
| `TITAN_ENCRYPTION_KEY` | 64 hex chars; required for stable encryption of saved keys |
| `TITAN_ENGINE_URL` | Empty = embedded engine only. Set (e.g. `http://localhost:9090`) to proxy `/api/agent/*` health/metrics/status |
| `HOST` | Default `127.0.0.1`. Use `0.0.0.0` only if you need LAN access |
| `PORT` | Default `5000` |
| `TITAN_CYCLE_SECONDS` | Seconds between engine cycles (default **90**) |
| `TITAN_SEED_DEMO` | If `true`, startup loads **demo** portfolio/trades/strategies. Otherwise only **minimal default strategies** + optional empty config bootstrap |
| `TITAN_ALLOW_SEED` | Must be `true` to allow **`POST /api/seed`** when `NODE_ENV=production` |
| `TITAN_API_TOKEN` | If set, **`X-Titan-Token`** header must match on all **`/api`** routes (LAN hardening) |
| `TITAN_PAPER_KEY` / `TITAN_PAPER_SECRET` | Optional env Alpaca paper keys for **`npm run backtest`** without using the Settings UI |

## Legacy `data.db`

If you already have a database in the project root named `data.db`, set `TITAN_DB_PATH=data.db` and run `npm run db:push`.

## One-command install

`npm run install:titan` (or `node scripts/install.mjs`) will: ensure `data/` exists, run `npm install` with **devDependencies** even if `NODE_ENV=production` is set in your shell, try `npm rebuild better-sqlite3`, create `.env` from `.env.example` if missing, fill **TITAN_ENCRYPTION_KEY** if empty or invalid, and run `npm run db:push`.

For a **fully clean** npm tree first, delete `node_modules` (and optionally `package-lock.json`), then run `npm run install:titan`.

## Built-in engine (Alpaca + Ollama)

1. In **Settings**, add **paper** (or live) **Alpaca** API keys.
2. Run **Ollama** with a model (e.g. `ollama pull llama3.2` and `ollama serve`).
3. Set **Watchlist and Ollama** in Settings and save.
4. Click **START** in the sidebar. Each cycle:
   - Sync **account, positions, portfolio** from Alpaca into SQLite
   - Pull **15-minute IEX bars** for a rotating watchlist symbol
   - Update **strategy signals** (ensemble rules + Ollama sentiment)
   - Enforce **daily loss**, **weekly rolling equity drop**, **max drawdown**, exposure, kill switch
   - Place **equity market orders** only when ensemble + risk gates pass
   - Refresh **strategy table metrics** from **executed** equity trades (rolling proxy stats)
   - Sync **option legs** + snapshot **Greeks** when OCC symbols are present

**KILL SWITCH** cancels open Alpaca orders and stops the engine. **STOP** stops the loop without resolving the kill switch.

## Offline backtest (bars replay)

`npm run backtest [SYMBOL]` replays Alpaca history and prints recent signal labels (uses paper keys from env or Settings). Extend as needed for reports under `data/`.

## External engine (optional)

If you set **`TITAN_ENGINE_URL`**, `/api/agent/*` proxies that service. Leave it empty to use the embedded Node engine only.

## UI

Minimal surface: **Dashboard** (ensemble toggles + options note), **Risk**, **Trade log**, **Settings**. Optional demo seed only when **`TITAN_SEED_DEMO=true`**.
