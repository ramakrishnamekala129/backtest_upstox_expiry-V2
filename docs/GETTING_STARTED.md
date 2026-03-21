# Getting Started Guide

This guide walks you through setting up and running the Backtest Upstox Expiry application locally.

## Prerequisites

Ensure you have the following installed:

- **Python 3.10+** - [Download Python](https://www.python.org/downloads/)
- **Node.js 18+** - [Download Node.js](https://nodejs.org/)
- **npm** - Comes with Node.js
- **Internet access** - Required for Upstox APIs and instrument master

## Step 1: Clone and Navigate

```bash
cd "d:\backtest_upstox_expiry V3"
```

## Step 2: Configure Environment Variables

Create a `.env` file in the project root by copying the example:

```bash
copy .env.example .env
```

Edit `.env` and add your Upstox credentials:

```env
UPSTOX_API_KEY=your_api_key
UPSTOX_SECRET_KEY=your_secret_key
UPSTOX_TOTP_KEY=your_totp_secret
UPSTOX_MOBILE_NO=your_mobile_number
UPSTOX_PIN=your_pin
UPSTOX_ACCESS_TOKEN=  # Optional - will be auto-generated
SUPABASE_URL=  # Optional - for authentication
SUPABASE_ANON_KEY=  # Optional - for authentication
SITE_URL=http://127.0.0.1:8765
```

### How to Get Upstox Credentials

1. **API Key & Secret**: Register at [Upstox API](https://upstox.com/api/)
2. **TOTP Key**: Configure TOTP in your Upstox account settings
3. **Mobile No**: Your registered mobile number with Upstox
4. **PIN**: Your Upstox login PIN

## Step 3: Install Python Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- FastAPI & Uvicorn (web server)
- Playwright (browser automation for auth)
- DuckDB (embedded analytics database)
- PyArrow & PyArrow (Parquet file handling)
- HTTPX & Requests (HTTP client)

### Install Playwright Browsers

```bash
python -m playwright install chromium
```

## Step 4: Install Frontend Dependencies

```bash
cd frontend
npm ci
cd ..
```

## Step 5: Build the Frontend

```bash
cd frontend
npm run build
cd ..
```

This creates the production build in `frontend/dist/`.

## Step 6: Run the Application

### Production Mode (Recommended)

```bash
python web_app.py --host 127.0.0.1 --port 8765
```

### Development Mode (Auto-reload)

```bash
python web_app.py --reload
```

### Access the Application

Open your browser and navigate to:

- **Main UI**: http://127.0.0.1:8765/
- **Range Explorer**: http://127.0.0.1:8765/ranges

## Step 7: First-Time Authentication

On first run, the application will:

1. Launch a browser window via Playwright
2. Automatically log in to Upstox using your credentials
3. Exchange the authorization code for an access token
4. Cache the token in `~/.upstox_access_token.json`

**Note**: Keep your credentials secure. The token is cached for reuse.

## Verifying Installation

### Check Token Status

Visit: http://127.0.0.1:8765/api/token-status

Expected response:
```json
{
  "status": "valid",
  "message": "Token is valid"
}
```

### Search for Instruments

Visit: http://127.0.0.1:8765/api/search-instruments?query=NIFTY

Expected: List of F&O-capable instruments matching "NIFTY".

## Common First Steps

### 1. Collect Expired Contracts

From the UI:
1. Search for an underlying (e.g., "NIFTY")
2. Click "Collect Expired Contracts"
3. Wait for the snapshot to be saved

### 2. Start an OHLC Job

From the UI:
1. Navigate to the OHLC Jobs section
2. Select underlyings
3. Choose date range and interval
4. Select data types (Spot, Futures, Options)
5. Click "Start Job"

### 3. Explore Cached Data

From the UI:
1. Go to `/ranges`
2. Filter by underlying, interval, or date range
3. Click on a row to view candlestick charts

## Directory Structure After Setup

```
backtest_upstox_expiry V3/
├── .env                    # Your credentials (created)
├── data/                   # Runtime data (auto-created)
│   ├── parquet/           # Parquet datasets
│   ├── jobs/              # Job-specific artifacts
│   └── expired_data.duckdb
├── expired_contracts/      # Contract snapshots (auto-created)
├── frontend/
│   ├── dist/              # Built React app (after build)
│   └── src/               # React source code
├── upstox_tools/          # Upstox integration helpers
├── docs/                  # Documentation
└── web_app.py             # Main FastAPI server
```

## Troubleshooting

### Frontend Not Loading

**Error**: "Frontend not built"

**Solution**:
```bash
cd frontend
npm run build
cd ..
```

### Token Refresh Fails

**Error**: Authentication errors or invalid token

**Solution**:
1. Verify all `UPSTOX_*` environment variables are correct
2. Delete the cached token: `del %USERPROFILE%\.upstox_access_token.json`
3. Restart the application to trigger re-authentication

### No Candle Data Returned

**Possible causes**:
- Invalid or expired token
- Date range doesn't match instrument lifecycle
- Instrument hasn't expired yet

**Solution**:
1. Check `/api/token-status`
2. Verify the instrument's expiry date
3. Try a different date range

### Playwright Browser Issues

**Error**: Browser fails to launch

**Solution**:
```bash
python -m playwright install --with-deps chromium
```

### Port Already in Use

**Error**: Address already in use

**Solution**: Use a different port:
```bash
python web_app.py --host 127.0.0.1 --port 8766
```

### Slow or Partial Jobs

**Solution**:
1. Check `data/ohlc_errors.log` for details
2. Review `/api/ohlc-log` endpoint
3. Reduce concurrency or date range

## Next Steps

- [API Reference](API.md) - Complete endpoint documentation
- [Architecture](ARCHITECTURE.md) - System design overview
- [User Guide](USER_GUIDE.md) - Detailed feature walkthrough

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review logs in `data/ohlc_errors.log`
3. Inspect API responses via browser dev tools
