# Documentation Index

Welcome to the Backtest Upstox Expiry V3 documentation. This index helps you find the right documentation for your needs.

---

## 📚 Documentation Overview

### For New Users

1. **[Getting Started Guide](GETTING_STARTED.md)** - Start here!
   - Prerequisites and installation
   - Configuration and setup
   - First-time authentication
   - Basic usage examples
   - Troubleshooting common issues

2. **[User Guide](USER_GUIDE.md)** - Learn how to use the application
   - Dashboard overview
   - Instrument search
   - Expired contracts collection
   - OHLC data jobs
   - Range explorer
   - Candlestick charts
   - Job control

### For Developers

1. **[Developer Guide](DEVELOPER_GUIDE.md)** - Development setup and contribution
   - Development environment setup
   - Code structure overview
   - Backend development guide
   - Frontend development guide
   - Testing guidelines
   - Code style and conventions
   - Contributing workflow

2. **[API Reference](API.md)** - API endpoint documentation
   - UI routes
   - Instrument discovery endpoints
   - Expired contract endpoints
   - OHLC job endpoints
   - Token management
   - Candle index queries

3. **[Architecture](ARCHITECTURE.md)** - System design documentation
   - System overview
   - Backend responsibilities
   - Authentication model
   - Storage model
   - Data flow diagrams
   - Concurrency notes

### For DevOps/Deployment

1. **[Deployment Guide](DEPLOYMENT.md)** - Production deployment
   - Local deployment options
   - Docker deployment
   - Vercel deployment
   - Render deployment
   - Production considerations
   - Monitoring and backup

---

## 📖 Quick Reference

### Common Tasks

| Task | Documentation | Section |
|------|--------------|---------|
| Install the application | [Getting Started](GETTING_STARTED.md) | Step 1-6 |
| Configure credentials | [Getting Started](GETTING_STARTED.md) | Step 2 |
| Run the application | [Getting Started](GETTING_STARTED.md) | Step 6 |
| Search for instruments | [User Guide](USER_GUIDE.md) | Instrument Search |
| Collect expired contracts | [User Guide](USER_GUIDE.md) | Expired Contracts |
| Start OHLC job | [User Guide](USER_GUIDE.md) | OHLC Data Jobs |
| View candlestick charts | [User Guide](USER_GUIDE.md) | Candlestick Charts |
| Deploy with Docker | [Deployment](DEPLOYMENT.md) | Docker Deployment |
| Deploy to Render | [Deployment](DEPLOYMENT.md) | Render Deployment |
| Add new API endpoint | [Developer Guide](DEVELOPER_GUIDE.md) | Backend Development |
| Add new React component | [Developer Guide](DEVELOPER_GUIDE.md) | Frontend Development |
| Run tests | [Developer Guide](DEVELOPER_GUIDE.md) | Testing |

### API Endpoints Quick Reference

| Endpoint | Description | Docs |
|----------|-------------|------|
| `GET /api/search-instruments` | Search F&O underlyings | [API Reference](API.md) |
| `GET /api/expired-contracts` | Collect expired contracts | [API Reference](API.md) |
| `GET /download/expired-ohlcv` | Start OHLC job | [API Reference](API.md) |
| `GET /api/ohlc-job/{job_id}` | Get job status | [API Reference](API.md) |
| `GET /api/candles-index` | Query candle index | [API Reference](API.md) |
| `GET /api/token-status` | Check token validity | [API Reference](API.md) |

### File Structure

```
backtest_upstox_expiry V3/
├── docs/                      # 📚 Documentation
│   ├── INDEX.md              # This file
│   ├── GETTING_STARTED.md    # Setup guide
│   ├── USER_GUIDE.md         # User documentation
│   ├── API.md                # API reference
│   ├── ARCHITECTURE.md       # Architecture docs
│   ├── DEPLOYMENT.md         # Deployment guide
│   └── DEVELOPER_GUIDE.md    # Developer guide
├── web_app.py                # Main FastAPI server
├── frontend/                 # React frontend
├── upstox_tools/             # Upstox integration
└── data/                     # Runtime data
```

---

## 🎯 Documentation by Role

### Trader/Analyst

Focus on:
1. [Getting Started Guide](GETTING_STARTED.md) - Setup and basic usage
2. [User Guide](USER_GUIDE.md) - Feature walkthrough
3. [Troubleshooting](GETTING_STARTED.md#troubleshooting) - Common issues

### Developer

Focus on:
1. [Developer Guide](DEVELOPER_GUIDE.md) - Development setup
2. [API Reference](API.md) - API documentation
3. [Architecture](ARCHITECTURE.md) - System design
4. [Contributing](DEVELOPER_GUIDE.md#contributing) - How to contribute

### DevOps/SysAdmin

Focus on:
1. [Deployment Guide](DEPLOYMENT.md) - Deployment options
2. [Production Considerations](DEPLOYMENT.md#production-considerations) - Production setup
3. [Monitoring](DEPLOYMENT.md#monitoring) - Logging and monitoring
4. [Backup Strategy](DEPLOYMENT.md#backup-strategy) - Data backup

---

## 📝 Document Changelog

### Latest Updates (March 2026)

- **GETTING_STARTED.md** - Initial creation
- **USER_GUIDE.md** - Initial creation
- **DEPLOYMENT.md** - Initial creation
- **DEVELOPER_GUIDE.md** - Initial creation
- **INDEX.md** - Initial creation
- **README.md** - Updated with new documentation links

### Existing Documentation

- **API.md** - Original API reference (maintained)
- **ARCHITECTURE.md** - Original architecture docs (maintained)

---

## 🔍 Finding Information

### By Topic

**Authentication**
- Setup: [Getting Started - Step 2](GETTING_STARTED.md#step-2-configure-environment-variables)
- First-time login: [Getting Started - Step 7](GETTING_STARTED.md#step-7-first-time-authentication)
- Token management: [User Guide - Token Management](USER_GUIDE.md#token-management)
- Technical details: [Architecture - Authentication Model](ARCHITECTURE.md#authentication-model)

**OHLC Data Collection**
- Starting jobs: [User Guide - OHLC Data Jobs](USER_GUIDE.md#ohlc-data-jobs)
- Job control: [User Guide - Job Control](USER_GUIDE.md#job-control)
- API endpoints: [API Reference - OHLC Download](API.md#ohlc-download-and-job-control)
- Implementation: [Developer Guide - Background Jobs](DEVELOPER_GUIDE.md#background-jobs)

**Deployment**
- Local setup: [Getting Started](GETTING_STARTED.md)
- Docker: [Deployment - Docker](DEPLOYMENT.md#docker-deployment)
- Render: [Deployment - Render](DEPLOYMENT.md#render-deployment)
- Vercel: [Deployment - Vercel](DEPLOYMENT.md#vercel-deployment)

**Development**
- Setup: [Developer Guide - Setup](DEVELOPER_GUIDE.md#development-setup)
- Backend: [Developer Guide - Backend](DEVELOPER_GUIDE.md#backend-development)
- Frontend: [Developer Guide - Frontend](DEVELOPER_GUIDE.md#frontend-development)
- Testing: [Developer Guide - Testing](DEVELOPER_GUIDE.md#testing)

---

## 💡 Tips for Using Documentation

1. **Start with Getting Started** if you're new to the project
2. **Use the User Guide** for feature-specific questions
3. **Check API Reference** for endpoint details
4. **Read Architecture** to understand system design
5. **Follow Deployment Guide** for production setup
6. **Use Developer Guide** for contributing code

---

## 📞 Need Help?

If you can't find what you're looking for:

1. Check the [Troubleshooting section](GETTING_STARTED.md#troubleshooting)
2. Review the [Support options](../README.md#support)
3. Examine application logs in `data/ohlc_errors.log`
4. Check API responses via browser developer tools

---

## 📚 External Resources

- [Upstox API Documentation](https://upstox.com/api/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [DuckDB Documentation](https://duckdb.org/docs/)
- [PyArrow Documentation](https://arrow.apache.org/docs/python/)

---

**Last Updated**: March 21, 2026
