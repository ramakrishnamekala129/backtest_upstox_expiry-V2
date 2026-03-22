# Documentation Quick Reference

A one-page reference for common tasks and information.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..

# 2. Configure credentials
copy .env.example .env
# Edit .env with your Upstox credentials

# 3. Run the application
python web_app.py --host 127.0.0.1 --port 8765
```

**Access**: http://127.0.0.1:8765/

---

## 📚 Documentation Links

| Document | Purpose |
|----------|---------|
| [Getting Started](GETTING_STARTED.md) | Setup & installation |
| [User Guide](USER_GUIDE.md) | Feature usage |
| [API Reference](API.md) | API endpoints |
| [Architecture](ARCHITECTURE.md) | System design |
| [Deployment](DEPLOYMENT.md) | Production setup |
| [Developer Guide](DEVELOPER_GUIDE.md) | Development & contributing |
| [INDEX.md](INDEX.md) | Documentation index |

---

## 🔑 Environment Variables

```env
UPSTOX_API_KEY=your_api_key
UPSTOX_SECRET_KEY=your_secret_key
UPSTOX_TOTP_KEY=your_totp_secret
UPSTOX_MOBILE_NO=your_mobile_number
UPSTOX_PIN=your_pin
UPSTOX_ACCESS_TOKEN=  # Optional - auto-generated
```

---

## 📡 Key API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/search-instruments?query=NIFTY` | Search instruments |
| `GET /api/expired-contracts?instrument_key=...` | Collect expired contracts |
| `GET /download/expired-ohlcv?underlying_key=...` | Start OHLC job |
| `GET /api/ohlc-job/{job_id}` | Get job status |
| `GET /api/candles-index` | Query candle data |
| `GET /api/token-status` | Check token status |

---

## 🎯 Common Tasks

### Search Instruments
```bash
curl "http://localhost:8765/api/search-instruments?query=NIFTY"
```

### Start OHLC Job
```bash
curl "http://localhost:8765/download/expired-ohlcv?underlying_key=NSE_INDEX|NIFTY&interval=5minute&from_date=2024-01-01&to_date=2024-03-31"
```

### Check Job Status
```bash
curl "http://localhost:8765/api/ohlc-job/{job_id}"
```

### Check Token
```bash
curl "http://localhost:8765/api/token-status"
```

---

## 📁 Directory Structure

```
backtest_upstox_expiry V3/
├── docs/                    # Documentation
├── frontend/                # React UI
│   ├── src/                 # Source code
│   └── dist/                # Built files
├── upstox_tools/            # Upstox helpers
├── data/                    # Runtime data
│   ├── parquet/             # Parquet files
│   └── jobs/                # Job artifacts
├── expired_contracts/       # Contract snapshots
├── web_app.py               # Main server
└── requirements.txt         # Python deps
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Frontend not loading | Run `npm run build` in `frontend/` |
| Token refresh fails | Verify `UPSTOX_*` env vars |
| No candle data | Check token validity and date range |
| Port in use | Use different port: `--port 8766` |
| Playwright errors | Run `python -m playwright install chromium` |

---

## 🛠️ Development Commands

### Backend
```bash
# Development mode
python web_app.py --reload

# Production mode
uvicorn web_app:app --host 0.0.0.0 --port 8765 --workers 4
```

### Frontend
```bash
cd frontend

# Development server
npm run dev

# Production build
npm run build

# Preview build
npm run preview
```

### Docker
```bash
# Build image
docker build -t upstox-backtest:latest .

# Run container
docker run -d --name upstox-backtest -p 8765:10000 upstox-backtest:latest
```

---

## 📊 Data Files

| File | Purpose |
|------|---------|
| `data/parquet/expired_candles_master.parquet` | Master candle data |
| `data/parquet/expired_candles_index.parquet` | Candle index |
| `data/expired_data.duckdb` | DuckDB database |
| `data/ohlc_errors.log` | Error logs |
| `expired_contracts/<underlying>/expired_contracts.json` | Contract snapshots |

---

## 🔒 Security Notes

- ⚠️ **Never commit** `.env` file
- ⚠️ Keep credentials secure
- ⚠️ Use HTTPS in production
- ⚠️ Enable authentication for multi-user setups

---

## 📞 Support

1. Check [Documentation](INDEX.md)
2. Review [Troubleshooting](GETTING_STARTED.md#troubleshooting)
3. Examine logs: `data/ohlc_errors.log`
4. Check API responses in browser dev tools

---

**Version**: V3  
**Last Updated**: March 21, 2026
