# Deployment Guide

This guide covers deploying the Backtest Upstox Expiry application to various platforms.

## Table of Contents

1. [Local Deployment](#local-deployment)
2. [Docker Deployment](#docker-deployment)
3. [Vercel Deployment](#vercel-deployment)
4. [Render Deployment](#render-deployment)
5. [Production Considerations](#production-considerations)

---

## Local Deployment

### Standard Setup

For development and personal use:

```bash
# Install dependencies
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..

# Set environment variables
copy .env.example .env
# Edit .env with your credentials

# Run the application
python web_app.py --host 127.0.0.1 --port 8765
```

### Production Mode with Gunicorn

For better performance on Linux:

```bash
pip install gunicorn

gunicorn web_app:app \
  --bind 0.0.0.0:8765 \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --timeout 120 \
  --keep-alive 5
```

### Windows Service (Optional)

Run as a background service using NSSM:

```powershell
# Download NSSM from https://nssm.cc/
nssm install UpstoxBacktest "C:\Python312\python.exe" "d:\backtest_upstox_expiry V3\web_app.py"
nssm set UpstoxBacktest DisplayName "Upstox Backtest Service"
nssm set UpstoxBacktest StartService SERVICE_AUTO_START
nssm set UpstoxBacktest AppDirectory "d:\backtest_upstox_expiry V3"
nssm set UpstoxBacktest AppEnvironmentExtra "PATH=%PATH%"
nssm start UpstoxBacktest
```

---

## Docker Deployment

### Build the Image

```bash
docker build -t upstox-backtest:latest .
```

### Run the Container

```bash
docker run -d \
  --name upstox-backtest \
  -p 8765:10000 \
  -e UPSTOX_API_KEY=your_key \
  -e UPSTOX_SECRET_KEY=your_secret \
  -e UPSTOX_TOTP_KEY=your_totp \
  -e UPSTOX_MOBILE_NO=your_mobile \
  -e UPSTOX_PIN=your_pin \
  -v upstox-data:/app/data \
  -v upstox-contracts:/app/expired_contracts \
  upstox-backtest:latest
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  upstox-backtest:
    build: .
    ports:
      - "8765:10000"
    environment:
      - UPSTOX_API_KEY=${UPSTOX_API_KEY}
      - UPSTOX_SECRET_KEY=${UPSTOX_SECRET_KEY}
      - UPSTOX_TOTP_KEY=${UPSTOX_TOTP_KEY}
      - UPSTOX_MOBILE_NO=${UPSTOX_MOBILE_NO}
      - UPSTOX_PIN=${UPSTOX_PIN}
      - SITE_URL=${SITE_URL:-http://localhost:8765}
    volumes:
      - upstox-data:/app/data
      - upstox-contracts:/app/expired_contracts
      - upstox-token:/root/.upstox_access_token.json
    restart: unless-stopped

volumes:
  upstox-data:
  upstox-contracts:
  upstox-token:
```

Run with:

```bash
docker-compose up -d
```

### Container Management

```bash
# View logs
docker logs -f upstox-backtest

# Stop container
docker stop upstox-backtest

# Restart container
docker restart upstox-backtest

# Access shell
docker exec -it upstox-backtest /bin/bash
```

---

## Vercel Deployment

### Prerequisites

- Vercel account
- Vercel CLI installed: `npm i -g vercel`

### Configuration

The project includes `vercel.json` for serverless configuration.

### Environment Variables

Set these in Vercel dashboard or `.env.local`:

```env
UPSTOX_API_KEY=your_key
UPSTOX_SECRET_KEY=your_secret
UPSTOX_TOTP_KEY=your_totp
UPSTOX_MOBILE_NO=your_mobile
UPSTOX_PIN=your_pin
VERCEL=true
```

### Deploy Steps

```bash
# Login to Vercel
vercel login

# Link project
vercel link

# Set environment variables
vercel env add UPSTOX_API_KEY
vercel env add UPSTOX_SECRET_KEY
vercel env add UPSTOX_TOTP_KEY
vercel env add UPSTOX_MOBILE_NO
vercel env add UPSTOX_PIN

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Vercel Limitations

⚠️ **Important Considerations**:

1. **Serverless Timeout**: Max 10 seconds (Hobby), 60 seconds (Pro)
   - Long-running OHLC jobs may timeout
   - Consider async job pattern with webhooks

2. **Ephemeral Storage**: `/tmp` is temporary
   - Data lost between invocations
   - Use external storage (S3, Supabase)

3. **Browser Automation**: Playwright may not work in serverless
   - Pre-generate access tokens
   - Use manual token refresh

4. **Rate Limiting**: Vercel imposes request limits
   - Monitor usage
   - Implement caching

### Recommended Vercel Setup

For Vercel, use the app as a **frontend-only** deployment:

1. Build frontend statically
2. Deploy backend separately (Render, Railway, etc.)
3. Update `SITE_URL` to point to backend

---

## Render Deployment

### Prerequisites

- Render account
- Render CLI (optional)

### Configuration Files

The project includes:

- `render.yaml` - Blueprint configuration
- `render-create-headers.txt` - API headers
- `render-create-payload.json` - Creation payload

### Deploy via Dashboard

1. **Create New Web Service**
2. **Connect Repository**
3. **Configure**:
   - **Name**: upstox-backtest
   - **Region**: Choose closest to you
   - **Branch**: main
   - **Root Directory**: (leave blank)
   - **Runtime**: Python 3
   - **Build Command**: 
     ```bash
     pip install -r requirements.txt && cd frontend && npm ci && npm run build
     ```
   - **Start Command**: 
     ```bash
     python web_app.py --host 0.0.0.0 --port $PORT
     ```

4. **Add Environment Variables**:
   ```
   UPSTOX_API_KEY=your_key
   UPSTOX_SECRET_KEY=your_secret
   UPSTOX_TOTP_KEY=your_totp
   UPSTOX_MOBILE_NO=your_mobile
   UPSTOX_PIN=your_pin
   RENDER=true
   ```

5. **Choose Instance Type**:
   - **Free**: Good for testing
   - **Standard**: For production use

6. **Click "Create Web Service"**

### Deploy via CLI

```bash
# Login to Render
renderctl login

# Create service
renderctl create -f render.yaml

# Or use API
curl -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @render-create-payload.json
```

### Persistent Disk

For data persistence on Render:

1. **Add Disk** in dashboard
2. **Mount Path**: `/app/data`
3. **Size**: Start with 5GB

Update `render.yaml`:

```yaml
disks:
  - name: upstox-data
    mountPath: /app/data
    sizeGB: 5
```

### Auto-Deploy

Render automatically deploys on git push to connected branch.

### Render Limitations

⚠️ **Important**:

1. **Free Tier**:
   - Spins down after 15 minutes of inactivity
   - Cold start on next request (~30 seconds)
   - 750 hours/month limit

2. **Ephemeral Filesystem**:
   - Use persistent disk for data
   - Token cache may be lost

3. **Playwright**:
   - Requires additional setup
   - Consider pre-generated tokens

---

## Production Considerations

### Security

#### Environment Variables

Never commit credentials:

```bash
# Add to .gitignore
echo ".env" >> .gitignore

# Use secrets management
# AWS Secrets Manager
# Azure Key Vault
# Google Secret Manager
```

#### HTTPS

Always use HTTPS in production:

```python
# Behind reverse proxy (nginx, traefik)
# SSL termination at proxy level
```

#### Authentication

Enable Supabase authentication:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

### Performance

#### Caching

Implement Redis for:

- Token caching
- Job state persistence
- API response caching

```bash
pip install redis
```

#### Database

For production workloads, consider:

- **PostgreSQL**: Replace DuckDB
- **TimescaleDB**: For time-series candle data
- **S3**: For Parquet file storage

#### Concurrency

Increase workers based on load:

```bash
# Gunicorn with more workers
gunicorn web_app:app \
  --workers 8 \
  --worker-class uvicorn.workers.UvicornWorker \
  --threads 4
```

### Monitoring

#### Logging

Structured logging with JSON:

```python
import logging
import json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
```

#### Health Checks

Add health endpoint:

```python
@app.get('/health')
async def health_check():
    return {
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat()
    }
```

#### Metrics

Track:

- Request latency
- Job completion time
- API rate limit usage
- Storage growth

### Backup Strategy

#### Automated Backups

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/upstox_$DATE"

mkdir -p $BACKUP_DIR
cp -r data/parquet $BACKUP_DIR/
cp -r expired_contracts $BACKUP_DIR/

# Upload to S3
aws s3 cp $BACKUP_DIR s3://your-bucket/backups/

# Keep last 7 days
find /backups -type d -mtime +7 -exec rm -rf {} \;
```

#### Cron Job

```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup.sh
```

### Scaling

#### Horizontal Scaling

For multiple instances:

1. **Shared Storage**: S3, GCS, or NFS
2. **Session Store**: Redis for job state
3. **Load Balancer**: Distribute requests

#### Vertical Scaling

Increase resources:

- More CPU for parallel OHLC jobs
- More RAM for larger datasets
- Faster disk for I/O operations

### Rate Limiting

Protect Upstox API:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.get("/api/expired-contracts")
@limiter.limit("10/minute")
async def get_expired_contracts(request: Request):
    ...
```

### Disaster Recovery

#### Recovery Plan

1. **Restore from backup**:
   ```bash
   aws s3 cp s3://your-bucket/backups/latest ./data/
   ```

2. **Re-deploy application**:
   ```bash
   docker-compose up -d
   ```

3. **Verify data integrity**:
   ```bash
   curl http://localhost:8765/api/candles-index?limit=1
   ```

#### RTO/RPO Targets

- **Recovery Time Objective (RTO)**: < 1 hour
- **Recovery Point Objective (RPO)**: < 24 hours

---

## Platform Comparison

| Feature | Local | Docker | Vercel | Render |
|---------|-------|--------|--------|--------|
| **Setup Complexity** | Low | Medium | Medium | Low |
| **Cost** | Free | Free* | Free* | Free* |
| **Persistence** | Full | Volume | Limited | Disk |
| **Scalability** | Limited | Good | Excellent | Good |
| **Playwright** | ✅ | ✅ | ❌ | ⚠️ |
| **Long Jobs** | ✅ | ✅ | ❌ | ⚠️ |
| **Best For** | Dev | Self-host | Frontend | Backend |

*Excluding infrastructure costs

---

## Troubleshooting Deployments

### Container Won't Start

```bash
# Check logs
docker logs upstox-backtest

# Common issues:
# - Missing environment variables
# - Port already in use
# - Permission errors
```

### Vercel Build Fails

```bash
# Check build logs in dashboard
# Common issues:
# - Node version mismatch
# - Missing dependencies
# - Build timeout
```

### Render Service Crashes

```bash
# Check logs in dashboard
# Common issues:
# - Memory limit exceeded
# - Missing disk mount
# - Invalid start command
```

### Data Lost After Restart

**Solution**: Use persistent volumes/disks

```yaml
# Docker Compose
volumes:
  - upstox-data:/app/data

# Render
disks:
  - name: data
    mountPath: /app/data
```

---

## Next Steps

- [API Reference](API.md) - Endpoint documentation
- [Architecture](ARCHITECTURE.md) - System design
- [User Guide](USER_GUIDE.md) - Feature walkthrough
