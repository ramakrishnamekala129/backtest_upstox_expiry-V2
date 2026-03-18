# Upstox Expired Instruments

FastAPI app for collecting expired Upstox OHLC data, storing it in DuckDB/Parquet, and browsing the cached ranges in a React frontend.

## What’s included

- Backend API and job runner in `web_app.py`
- Shared Upstox helpers in `upstox_tools/`
- React + Vite frontend in `frontend/`
- Range detail view with table and candlestick chart

## Prerequisites

- Python 3.10+
- Node.js 18+

## Setup

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm ci
```

Build the frontend:

```bash
npm run build
```

## Run

Start the backend from the project root:

```bash
python web_app.py
```

Open:

- `http://127.0.0.1:8765/`
- `http://127.0.0.1:8765/ranges`

## Notes

- `data/`, `expired_contracts/`, `output/`, `frontend/node_modules/`, and `frontend/dist/` are generated locally and ignored by Git.
- `instruments_cache.json` is fetched automatically when needed, so it is not stored in the repository.
- The backend serves the built frontend from `frontend/dist/`.
