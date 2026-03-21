# User Guide

Complete guide to using the Backtest Upstox Expiry application.

## Table of Contents

1. [Dashboard Overview](#dashboard-overview)
2. [Instrument Search](#instrument-search)
3. [Expired Contracts Collection](#expired-contracts-collection)
4. [OHLC Data Jobs](#ohlc-data-jobs)
5. [Range Explorer](#range-explorer)
6. [Candlestick Charts](#candlestick-charts)
7. [Job Control](#job-control)
8. [Token Management](#token-management)

---

## Dashboard Overview

The main dashboard provides access to three core features:

### Navigation

- **Home** (`/`) - Main control panel
- **Ranges** (`/ranges`) - Browse cached candle data
- **Range Detail** (`/range`) - View specific instrument candles

### Status Indicators

- **Token Status** - Shows if Upstox authentication is valid
- **Job Status** - Active background job states
- **Storage Stats** - Parquet dataset sizes

---

## Instrument Search

### Purpose

Find F&O-capable underlyings from the Upstox instrument master.

### How to Search

1. Enter a symbol, name, or keyword in the search box
2. Results update as you type
3. Click a result to select it

### Search Tips

- **Exact match**: Type the full symbol (e.g., "NIFTY")
- **Partial match**: Use keywords (e.g., "BANK" finds BANKNIFTY)
- **Instrument key**: Search by full instrument key for exact results

### Example Searches

| Query | Results |
|-------|---------|
| `NIFTY` | NIFTY 50 index options |
| `BANK` | BANKNIFTY, BANK NIFTY |
| `FIN` | FINNIFTY, various financial stocks |
| `RELIANCE` | RELIANCE equity options |

### API Endpoint

```
GET /api/search-instruments?query=NIFTY&limit=25
```

---

## Expired Contracts Collection

### Purpose

Collect metadata for expired options and futures contracts for a specific underlying.

### When to Use

- Before running OHLC jobs for expired instruments
- To analyze historical contract availability
- For backtesting expired strategies

### Collection Process

1. **Search** for an underlying instrument
2. **Select** the instrument from results
3. **Click** "Collect Expired Contracts"
4. **Configure** (optional):
   - Max expiries to fetch (default: 6)
5. **Wait** for completion

### Output Location

Data is saved to:
```
expired_contracts/<underlying>/expired_contracts.json
```

### Snapshot Contents

```json
{
  "underlying_key": "NSE_INDEX|NIFTY",
  "underlying_name": "NIFTY",
  "expiries": ["2024-01-11", "2024-01-18", ...],
  "options": {
    "2024-01-11": [
      {
        "instrument_key": "NSE_FO|12345",
        "trading_symbol": "NIFTY24JAN11CE22000",
        "instrument_type": "CE",
        "strike_price": 22000,
        "expiry": "2024-01-11"
      }
    ]
  },
  "futures": { ... }
}
```

### Viewing Collected Data

After collection:
1. Navigate to the instrument's section
2. Click "View Expired Contracts"
3. Browse expiries and contract details

---

## OHLC Data Jobs

### Purpose

Download historical OHLC (Open, High, Low, Close) data for expired contracts.

### Job Configuration

#### Required Parameters

- **Underlying**: Select one or more underlyings
- **Interval**: Candle timeframe
  - `1minute` - 1-minute candles
  - `3minute` - 3-minute candles
  - `5minute` - 5-minute candles
  - `10minute` - 10-minute candles
  - `15minute` - 15-minute candles
  - `30minute` - 30-minute candles
  - `60minute` - 1-hour candles
  - `day` - Daily candles

- **From Date**: Start date (YYYY-MM-DD)
- **To Date**: End date (YYYY-MM-DD)

#### Optional Parameters

- **Include Spot**: Fetch underlying spot prices
- **Include Futures**: Fetch futures contract data
- **Include Options**: Fetch options contract data

### Starting a Job

1. Navigate to **OHLC Jobs** section
2. **Select underlyings** from dropdown
3. **Choose interval** (e.g., 5minute)
4. **Set date range**
5. **Select data types** to include
6. **Click** "Start Job"

### Job States

| State | Description |
|-------|-------------|
| `running` | Actively fetching data |
| `paused` | Temporarily halted by user |
| `completed` | Finished successfully |
| `error` | Failed with errors |
| `stopped` | Manually stopped by user |

### Job Progress Tracking

Monitor job progress via:

- **Progress bar** - Visual completion percentage
- **Counters**:
  - Total instruments to fetch
  - Completed instruments
  - Stored rows count
  - Failed instruments count
  - Skipped instruments count

### Output Files

#### Job-Level Output
```
data/jobs/<job_id>/candles.parquet
```

#### Master Datasets (after merge)
```
data/parquet/expired_candles_master.parquet
data/parquet/expired_candles_index.parquet
```

### Example Job Flow

```
Job ID: abc-123-def
Status: running
Progress: 45/100 instruments (45%)
Stored rows: 125,000
Failed: 2
Skipped: 3
ETA: 5 minutes
```

---

## Range Explorer

### Purpose

Browse and filter cached candle data without downloading.

### Access

Navigate to: http://127.0.0.1:8765/ranges

### Filters

#### Underlying Filter
- Filter by underlying symbol (e.g., NIFTY, BANKNIFTY)

#### Instrument Filter
- Filter by specific instrument key

#### Option Type Filter
- `CE` - Call options
- `PE` - Put options
- `FUT` - Futures
- `Spot` - Spot prices

#### Interval Filter
- Filter by candle timeframe

#### Date Range Filter
- `From Date` - Minimum date
- `To Date` - Maximum date

#### Advanced Filters
- **Strike Contains**: Filter by strike price pattern
- **Min Rows**: Only show ranges with minimum data points
- **Updated After**: Only recently updated datasets

### Pagination

- **Limit**: Rows per page (default: 50)
- **Offset**: Skip N rows
- **Total count**: Displayed at bottom

### Results Table

| Column | Description |
|--------|-------------|
| Underlying | Parent instrument |
| Instrument | Full instrument key |
| Type | CE/PE/FUT/Spot |
| Strike | Strike price (for options) |
| Interval | Candle timeframe |
| From | Start date |
| To | End date |
| Rows | Number of candles |
| Updated | Last update timestamp |

### Actions

- **View Candles**: Opens candlestick chart
- **Export**: Download as CSV/Parquet
- **Delete**: Remove from cache

---

## Candlestick Charts

### Purpose

Visualize OHLC data for analysis and validation.

### Chart Features

#### Interactive Elements

- **Zoom**: Scroll wheel or pinch gesture
- **Pan**: Click and drag
- **Crosshair**: Hover for exact values
- **Tooltip**: Shows O/H/L/C/V values

#### Timeframe Navigation

- **Fit to window**: Auto-scale to visible range
- **Zoom in**: Select region or scroll
- **Zoom out**: Reset to full range

#### Data Points

Each candlestick shows:
- **Open**: Horizontal tick on left
- **Close**: Horizontal tick on right
- **High**: Top wick
- **Low**: Bottom wick
- **Color**:
  - Green/White: Close > Open (bullish)
  - Red/Black: Close < Open (bearish)

### Chart Types

- **Candlestick**: Default OHLC visualization
- **Line**: Close price over time
- **Volume**: Trading volume bars (if available)

### Export Options

- **PNG**: Download chart image
- **CSV**: Export underlying data
- **JSON**: Export in JSON format

---

## Job Control

### Purpose

Manage running OHLC jobs without restarting.

### Control Actions

#### Pause

Temporarily halts data fetching.

- **Use case**: Reduce API load during peak hours
- **State**: Job remains in memory
- **Resume**: Can continue from checkpoint

#### Resume

Continues a paused job.

- **Starts from**: Last completed instrument
- **Preserves**: Already fetched data

#### Stop

Permanently terminates a job.

- **Use case**: Cancel unwanted jobs
- **Data**: Partial results saved
- **Restart**: Must create new job

### How to Control

1. Navigate to **Active Jobs**
2. Find your job in the list
3. Click action button:
   - ⏸️ Pause
   - ▶️ Resume
   - ⏹️ Stop

### Control API

```bash
POST /api/ohlc-job/{job_id}/control?action=pause
POST /api/ohlc-job/{job_id}/control?action=resume
POST /api/ohlc-job/{job_id}/control?action=stop
```

### Job Persistence

- **Active jobs**: Stored in memory
- **Restart survival**: Jobs lost on server restart
- **Recovery**: Check `data/jobs/<job_id>/` for partial results

---

## Token Management

### Purpose

Monitor and manage Upstox API authentication.

### Token Status

Check current token state:

**UI**: Token status indicator in header

**API**: 
```
GET /api/token-status
```

### Status Responses

#### Valid Token
```json
{
  "status": "valid",
  "message": "Token is valid",
  "last_refresh_ts": 1234567890.0
}
```

#### Expired Token
```json
{
  "status": "expired",
  "message": "Token has expired"
}
```

#### Refresh Failed
```json
{
  "status": "refresh_failed",
  "message": "Invalid credentials"
}
```

### Manual Token Refresh

The backend automatically refreshes tokens when needed. To force refresh:

1. Delete cached token:
   ```bash
   del %USERPROFILE%\.upstox_access_token.json
   ```

2. Restart the application

3. Browser-based login will trigger automatically

### Token Cache Location

```
~/.upstox_access_token.json
```

Contents:
```json
{
  "access_token": "eyJhbGc..."
}
```

### Environment Variable Override

Set `UPSTOX_ACCESS_TOKEN` in `.env` to bypass cache:

```env
UPSTOX_ACCESS_TOKEN=your_direct_token
```

---

## Best Practices

### Data Collection

1. **Start small**: Test with single underlying first
2. **Use off-peak hours**: Reduce API rate limiting
3. **Monitor logs**: Check `data/ohlc_errors.log`
4. **Regular snapshots**: Update expired contracts weekly

### Job Management

1. **One job at a time**: Avoid concurrent jobs for same underlying
2. **Reasonable ranges**: 3-6 months max per job
3. **Pause during peaks**: Control API usage
4. **Check progress**: Monitor via UI or API

### Storage Management

1. **Regular cleanup**: Remove old job folders
2. **Merge jobs**: Consolidate into master parquet
3. **Monitor size**: Parquet files can grow large
4. **Backup**: Copy `data/parquet/` for safety

### Performance Tips

1. **Use filters**: Narrow range queries before fetching
2. **Cache tokens**: Avoid repeated logins
3. **Batch underlyings**: Group related instruments
4. **Schedule jobs**: Run overnight for large datasets

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + K` | Quick search |
| `Ctrl + R` | Refresh current view |
| `Esc` | Close modal/dialog |
| `?` | Show keyboard shortcuts |

---

## Next Steps

- [API Reference](API.md) - Technical endpoint details
- [Architecture](ARCHITECTURE.md) - System internals
- [Troubleshooting](GETTING_STARTED.md#troubleshooting) - Common issues
