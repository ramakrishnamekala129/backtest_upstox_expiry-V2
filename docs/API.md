# API Reference

This document summarizes the primary HTTP routes exposed by `web_app.py`.

## UI Routes

- `GET /`
  Serves the built React application.

- `GET /ranges`
- `GET /range`
- `GET /{full_path:path}`
  SPA fallback routes. Any non-API path resolves to the built frontend when `frontend/dist` exists.

## Instrument Discovery

### `GET /api/search-instruments`

Searches F&O-capable underlyings from the instrument master.

Common query parameters:

- `query`: partial symbol, name, trading symbol, or instrument key
- `limit`: optional result cap

Returns a list of matching equities or indices that are valid underlyings for F&O workflows.

### `GET /api/instruments-cache`

Returns the locally cached Upstox instrument master subset used by the UI.

## Expired Contract Snapshots

### `GET /api/expired-contracts`

Triggers expired-contract snapshot collection for an underlying.

Typical query parameters:

- `instrument_key`: required underlying key
- `max_expiries`: optional, number of expiries to fetch

Writes snapshot data into `expired_contracts/<instrument>/expired_contracts.json`.

### `GET /api/expired-contracts/{instrument_key}`

Reads the stored snapshot for an underlying from disk.

## OHLC Download And Job Control

### `GET /download/expired-ohlcv`

Starts an asynchronous OHLC collection job.

Typical query parameters:

- `underlying_key`
- `interval`
- `from_date`
- `to_date`
- `include_spot`
- `include_futures`
- `include_options`

Returns a job id immediately.

### `GET /api/ohlc-job/{job_id}`

Returns job progress and storage counters.

Notable fields:

- `status`: `running`, `paused`, `completed`, `error`, or `stopped`
- `control_state`
- `total`
- `completed`
- `stored_rows`
- `failed_instruments`
- `skipped_instruments`
- `job_parquet_path`

### `POST /api/ohlc-job/{job_id}/control`

Controls a running job.

Query parameter:

- `action`: `pause`, `resume`, or `stop`

### `GET /api/ohlc-log`

Returns the tail of the OHLC log file.

Query parameter:

- `limit`: number of lines to return

## Token Management

### `GET /api/token-status`

Reports whether the cached Upstox access token is present and valid. The backend can refresh the token by running the Playwright-based login flow when configured credentials are available.

## Parquet And Cache Maintenance

### `POST /api/export-parquet`

Exports cached records into Parquet output.

### `POST /api/merge-job`

Merges a job-level Parquet result into the master store.

## Candle Index Queries

### `GET /api/candles-index`

Queries the master candle index with filters and pagination.

Supported filters include:

- `underlying_key`
- `instrument_key`
- `option_type`
- `underlying_filter`
- `instrument_filter`
- `strike_contains`
- `interval`
- `from_date_min`
- `to_date_max`
- `updated_after`
- `min_rows`
- `limit`
- `offset`

Returns index rows describing stored segments, row counts, inferred option type, and update timestamp.

### `GET /api/candles-rows`

Returns raw candle rows for a single indexed range.

Required parameters:

- `instrument_key`
- `interval`
- `from_date`
- `to_date`

Optional parameters:

- `limit`
- `offset`

## Legacy Backtest Server

The older `upstox_tools/server.py` module is separate from FastAPI and exposes:

- `GET /backtest_run`
- `GET /backtest_status`

That server uses Python's standard-library HTTP server and writes results to the configured output JSON files.
