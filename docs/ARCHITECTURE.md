# Architecture

## Overview

The project is split into three main layers:

1. FastAPI backend in `web_app.py`
2. React/Vite frontend in `frontend/`
3. Upstox integration helpers in `upstox_tools/`

The backend owns request handling, authentication refresh, snapshot collection, OHLC job execution, Parquet persistence, and serving the built frontend.

## Backend Responsibilities

`web_app.py` handles:

- FastAPI route registration
- serving `frontend/dist`
- token validation and refresh
- rate-limited Upstox HTTP access
- expired contracts snapshot loading and persistence
- OHLC background job orchestration
- Parquet master/index maintenance
- candle index filtering and row retrieval

OHLC jobs are tracked in an in-memory `OHLC_JOBS` dictionary and protected with locks. Each job also writes artifacts to `data/jobs/<job_id>/`.

## Authentication Model

There are two token paths:

- Interactive refresh path:
  `upstox_tools/auth.py` uses Playwright to complete the Upstox login flow and exchange the returned code for an access token.
- Direct token path:
  `upstox_tools/backtest.py` reads `UPSTOX_ACCESS_TOKEN` directly from the environment for backtest runs.

The interactive backend stores the refreshed token in:

- `~/.upstox_access_token.json`

## Storage Model

Primary runtime storage lives under `data/`.

Important files:

- `data/expired_data.duckdb`
- `data/parquet/expired_candles_master.parquet`
- `data/parquet/expired_candles_index.parquet`
- `data/ohlc_errors.log`

Snapshot cache lives under:

- `expired_contracts/<underlying>/expired_contracts.json`

Instrument master cache lives at:

- `instruments_cache.json`

## Data Flow

### Snapshot Collection

1. UI selects an underlying.
2. Backend resolves or refreshes a valid Upstox token.
3. `collect_expired_contracts(...)` fetches expiries, expired options, and expired futures.
4. Snapshot JSON is persisted under `expired_contracts/`.

### OHLC Collection

1. UI starts an OHLC job for one or more targets.
2. Backend discovers contracts from the snapshot cache.
3. Spot, futures, and option candles are fetched concurrently with internal pacing.
4. Job-level Parquet is written under `data/jobs/<job_id>/`.
5. Completed rows are merged into the master Parquet datasets.
6. Index rows are appended so the frontend can browse stored ranges without scanning the full candle table.

### Range Browsing

1. Frontend queries `/api/candles-index`.
2. User filters by underlying, option type, interval, or date range.
3. Frontend requests `/api/candles-rows` for a specific segment.
4. Rows are rendered as tables and candlestick charts.

## Frontend Responsibilities

The frontend provides:

- underlying search
- expired snapshot orchestration
- OHLC batch controls
- progress and terminal-style job logs
- cached range discovery
- candlestick visualization

The backend serves the built assets from `frontend/dist/assets` and falls back to `index.html` for SPA routes.

## Concurrency Notes

- Token refresh is guarded by a lock.
- Upstox request pacing is enforced for both sync and async paths.
- OHLC discovery and fetch work use bounded concurrency.
- Writes to the master store are serialized to reduce corruption risk.
- Existing DuckDB WAL files are cleaned on startup after unclean shutdowns.

## Operational Caveats

- Job state is in memory, so restarting the process clears active job tracking.
- Parquet datasets are append/merge oriented and designed for local use.
- The application assumes a single local operator rather than a multi-tenant deployment.
- Frontend pages require a built `frontend/dist` when served through FastAPI.
