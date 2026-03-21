# Backtest Upstox Expiry V2

FastAPI and React application for collecting Upstox expired derivatives data, storing OHLC history locally, and exploring the resulting cache through a browser UI.

## What This Project Does

- Searches F&O-capable underlyings from the Upstox instrument master
- Downloads expired options and futures contract metadata by expiry
- Stores OHLC history for spot, futures, and options into local Parquet datasets
- Exposes APIs for search, download, job control, token status, and cached candle queries
- Serves a React frontend for snapshot collection, OHLC jobs, and range browsing
- Includes a separate backtest engine for option strategies in `upstox_tools/backtest.py`

## Repository Layout

- `web_app.py`: main FastAPI server, job runner, storage layer, and SPA hosting
- `frontend/`: Vite + React user interface
- `upstox_tools/auth.py`: browser-driven Upstox login flow and access-token exchange
- `upstox_tools/expired_contracts.py`: expired contracts snapshot collection helpers
- `upstox_tools/backtest.py`: historical strategy backtest engine
- `upstox_tools/server.py`: legacy lightweight HTTP wrapper for running backtests
- `data/`: generated runtime data such as DuckDB, Parquet, job output, and logs
- `expired_contracts/`: cached expired-contract snapshots grouped by underlying
- `output/`: local generated artifacts
- `docs/API.md`: backend endpoint reference
- `docs/ARCHITECTURE.md`: system design and storage overview

## Requirements

- Python 3.10+
- Node.js 18+
- npm
- Internet access to Upstox APIs and instrument master

## Configuration

This repository no longer stores Upstox credentials in source control.

The login-assisted token refresh flow reads these environment variables:

- `UPSTOX_API_KEY`
- `UPSTOX_SECRET_KEY`
- `UPSTOX_TOTP_KEY`
- `UPSTOX_MOBILE_NO`
- `UPSTOX_PIN`

The backtest engine also reads:

- `UPSTOX_ACCESS_TOKEN`
- `BACKTEST_START_CAPITAL` (optional, default `1000000`)

Use [`.env.example`](/d:/backtest_upstox_expiry%20V2/.env.example) as the template for local setup.

PowerShell example:

```powershell
$env:UPSTOX_API_KEY="..."
$env:UPSTOX_SECRET_KEY="..."
$env:UPSTOX_TOTP_KEY="..."
$env:UPSTOX_MOBILE_NO="..."
$env:UPSTOX_PIN="..."
```

## Installation

Install Python dependencies from the project root:

```bash
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm ci
```

## Running The App

For production-style local use, build the frontend and run the FastAPI server:

```bash
cd frontend
npm run build
cd ..
python web_app.py --host 127.0.0.1 --port 8765
```

Open:

- `http://127.0.0.1:8765/`
- `http://127.0.0.1:8765/ranges`

For backend development with reload:

```bash
python web_app.py --reload
```

For frontend-only development:

```bash
cd frontend
npm run dev
```

Note: the backend serves files from `frontend/dist`, so the React app must be built for the integrated FastAPI UI to load.

## Main User Flows

### 1. Expired Contracts Snapshot

1. Search for an underlying from the UI or `/api/search-instruments`.
2. Trigger expired-contract collection.
3. Snapshot JSON is written under `expired_contracts/<instrument>/expired_contracts.json`.

### 2. OHLC Storage Job

1. Choose one or more underlyings in the UI.
2. Start an OHLC job for a date range and interval.
3. Backend fetches spot, futures, and/or options candles.
4. Results are appended into:
   - `data/parquet/expired_candles_master.parquet`
   - `data/parquet/expired_candles_index.parquet`
5. Job state is available through `/api/ohlc-job/{job_id}` and `/api/ohlc-log`.

### 3. Range Exploration

1. Query the index dataset from `/api/candles-index`.
2. Drill into a specific instrument/date range through `/api/candles-rows`.
3. View rows and candlestick charts in the frontend.

### 4. Backtesting

The backtest engine in `upstox_tools/backtest.py` runs option strategy simulations using a direct `UPSTOX_ACCESS_TOKEN`. The legacy `upstox_tools/server.py` exposes `/backtest_run` and `/backtest_status` on the configured port.

## Generated Data

Common generated files and directories:

- `data/expired_data.duckdb`
- `data/parquet/expired_candles_master.parquet`
- `data/parquet/expired_candles_index.parquet`
- `data/jobs/<job_id>/`
- `data/ohlc_errors.log`
- `expired_contracts/<underlying>/expired_contracts.json`
- `instruments_cache.json`

These are local runtime artifacts and should not be treated as source files.

## API Summary

Key routes:

- `GET /api/search-instruments`
- `GET /api/expired-contracts`
- `GET /api/expired-contracts/{instrument_key}`
- `GET /download/expired-ohlcv`
- `GET /api/ohlc-job/{job_id}`
- `POST /api/ohlc-job/{job_id}/control`
- `GET /api/ohlc-log`
- `GET /api/token-status`
- `GET /api/candles-index`
- `GET /api/candles-rows`

Full details: [docs/API.md](/d:/backtest_upstox_expiry%20V2/docs/API.md)

## Troubleshooting

- `Frontend not built`: run `npm run build` in `frontend/`.
- Token refresh fails: verify all `UPSTOX_*` environment variables are set and valid.
- No candle data returned: confirm the token is valid and the selected date range matches the instrument lifecycle.
- Slow or partial jobs: inspect `data/ohlc_errors.log` and `/api/ohlc-log`.
- Missing instruments: delete `instruments_cache.json` to force a refresh on next request.

## Development Notes

- The backend automatically creates required storage directories under `data/`.
- Access tokens are cached in the user home directory as `.upstox_access_token.json`.
- The app rate-limits Upstox requests internally and persists job state in memory while writing data to disk.
- Existing WAL cleanup for the DuckDB file happens during startup.

## Additional Documentation

- [API reference](/d:/backtest_upstox_expiry%20V2/docs/API.md)
- [Architecture and storage](/d:/backtest_upstox_expiry%20V2/docs/ARCHITECTURE.md)
