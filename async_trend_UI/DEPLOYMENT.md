# Deployment Guide

## Overview

This guide covers deploying the TrendDates Vercel UI application to various platforms, with a focus on Vercel as the primary deployment target.

---

## Table of Contents

1. [Vercel Deployment](#vercel-deployment)
2. [Alternative Platforms](#alternative-platforms)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Domain Configuration](#domain-configuration)
6. [CI/CD Setup](#cicd-setup)
7. [Monitoring & Logging](#monitoring--logging)
8. [Performance Optimization](#performance-optimization)
9. [Security Checklist](#security-checklist)
10. [Troubleshooting](#troubleshooting)

---

## Vercel Deployment

### Prerequisites

- GitHub/GitLab/Bitbucket account
- Vercel account (free tier available)
- Supabase project (for authentication)
- Node.js 18+ installed locally

### Step-by-Step Deployment

#### 1. Prepare Your Repository

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit for deployment"

# Create repository on GitHub/GitLab/Bitbucket
# Then add remote and push
git remote add origin <your-repo-url>
git push -u origin main
```

#### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your Git repository
4. Vercel will auto-detect Next.js configuration

#### 3. Configure Build Settings

**Framework Preset:** Next.js (auto-detected)

**Build Command:** `npm run build` (default)

**Output Directory:** `.next` (default)

**Install Command:** `npm install` (default)

**Node.js Version:** 18.x (recommended)

#### 4. Set Environment Variables

Add the following in Vercel Dashboard → Settings → Environment Variables:

```env
# Optional: Remote data source
TREND_DATA_URL=https://example.com/trend_tables.json

# Optional: Local data path
TREND_JSON_PATH=excel_output/trend_tables.json

# Required: Site URL
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app

# Required: Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

**Important:** Set environment variables for all environments (Production, Preview, Development)

#### 5. Deploy

1. Click "Deploy"
2. Wait for build to complete (typically 2-3 minutes)
3. Visit your deployment URL

#### 6. Configure Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed
4. Wait for SSL certificate provisioning

### Vercel Configuration File

Create `vercel.json` in project root:

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "s-maxage=60, stale-while-revalidate"
        }
      ]
    }
  ]
}
```

### Automatic Deployments

Vercel automatically deploys:
- **Production**: Pushes to `main` branch
- **Preview**: Pull requests and other branches

### Deployment Logs

View logs in:
- Vercel Dashboard → Deployments → Select deployment → View logs
- Real-time logs during build
- Runtime logs for serverless functions

---

## Alternative Platforms

### AWS Amplify

#### Setup

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize Amplify
amplify init

# Add hosting
amplify add hosting

# Deploy
amplify publish
```

#### Configuration

```yaml
# amplify.yml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

### Netlify

#### Setup

1. Connect repository to Netlify
2. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Functions directory: `.netlify/functions`

#### Configuration

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Docker Deployment

#### Dockerfile

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

#### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
    volumes:
      - ./public:/app/public
      - ./ephe:/app/ephe
    restart: unless-stopped
```

#### Build & Run

```bash
# Build image
docker build -t trenddates-ui .

# Run container
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=your_url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key \
  trenddates-ui

# Or use docker-compose
docker-compose up -d
```

---

## Environment Configuration

### Environment Variables by Stage

#### Development (.env.local)

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://dev-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dev_anon_key
TREND_JSON_PATH=excel_output/trend_tables.json
```

#### Staging (.env.staging)

```env
NEXT_PUBLIC_SITE_URL=https://staging.your-app.com
NEXT_PUBLIC_SUPABASE_URL=https://staging-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=staging_anon_key
TREND_DATA_URL=https://staging-api.example.com/trend_tables.json
```

#### Production (.env.production)

```env
NEXT_PUBLIC_SITE_URL=https://your-app.com
NEXT_PUBLIC_SUPABASE_URL=https://prod-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=prod_anon_key
TREND_DATA_URL=https://api.example.com/trend_tables.json
```

### Secrets Management

**Vercel:**
- Use Vercel Environment Variables (encrypted at rest)
- Mark sensitive variables as "Secret"
- Use different values per environment

**AWS:**
- Use AWS Secrets Manager
- Integrate with Amplify

**Docker:**
- Use Docker secrets
- Mount secrets as files
- Use environment variable files

---

## Database Setup

### Supabase Configuration

#### 1. Create Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Choose region closest to your users
4. Note project URL and anon key

#### 2. Enable Authentication

```sql
-- Enable email authentication
-- Done via Supabase Dashboard → Authentication → Providers
```

#### 3. Configure URLs

**Site URL:** Your production URL
**Redirect URLs:** Add these URLs:
- `http://localhost:3000/auth/callback` (development)
- `https://your-app.vercel.app/auth/callback` (production)
- `https://your-custom-domain.com/auth/callback` (custom domain)

#### 4. Email Templates (Optional)

Customize email templates in:
- Dashboard → Authentication → Email Templates
- Confirm signup
- Reset password
- Magic link

#### 5. Security Settings

```sql
-- Enable Row Level Security (RLS)
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own data"
  ON your_table
  FOR SELECT
  USING (auth.uid() = user_id);
```

---

## Domain Configuration

### Custom Domain Setup

#### Vercel

1. **Add Domain**
   - Project Settings → Domains
   - Enter your domain
   - Click "Add"

2. **Configure DNS**
   - Add A record: `76.76.21.21`
   - Or CNAME: `cname.vercel-dns.com`

3. **SSL Certificate**
   - Automatically provisioned
   - Usually takes 5-10 minutes

#### Cloudflare (Optional)

1. **Add Site to Cloudflare**
2. **Update Nameservers**
3. **Configure DNS**
   ```
   Type: CNAME
   Name: @
   Target: your-app.vercel.app
   Proxy: Enabled (orange cloud)
   ```

4. **SSL/TLS Settings**
   - Mode: Full (strict)
   - Always Use HTTPS: On
   - Automatic HTTPS Rewrites: On

---

## CI/CD Setup

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run type check
        run: npm run typecheck
      
      - name: Run linter
        run: npm run lint
      
      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
image: node:18

stages:
  - test
  - build
  - deploy

cache:
  paths:
    - node_modules/

test:
  stage: test
  script:
    - npm ci
    - npm run typecheck
    - npm run lint

build:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - .next/

deploy:
  stage: deploy
  script:
    - npm install -g vercel
    - vercel --token $VERCEL_TOKEN --prod
  only:
    - main
```

---

## Monitoring & Logging

### Vercel Analytics

Enable in Vercel Dashboard:
- Project Settings → Analytics
- View real-time metrics
- Track Web Vitals

### Error Tracking

#### Sentry Integration

```bash
npm install @sentry/nextjs
```

```javascript
// sentry.client.config.js
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
});
```

### Logging

#### Vercel Logs

```bash
# Install Vercel CLI
npm i -g vercel

# View logs
vercel logs <deployment-url>
```

#### Custom Logging

```typescript
// lib/logger.ts
export const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data);
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error);
  }
};
```

---

## Performance Optimization

### Build Optimization

```javascript
// next.config.mjs
const nextConfig = {
  // Enable SWC minification
  swcMinify: true,
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  },
  
  // Compress output
  compress: true,
  
  // Generate standalone output
  output: 'standalone',
};
```

### Caching Strategy

```typescript
// app/api/trends/route.ts
export const revalidate = 3600; // Revalidate every hour

export async function GET() {
  const data = await loadTrendPayload();
  
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
```

### Bundle Analysis

```bash
# Install analyzer
npm install @next/bundle-analyzer

# Analyze bundle
ANALYZE=true npm run build
```

---

## Security Checklist

### Pre-Deployment

- [ ] Remove all console.log statements
- [ ] Verify no hardcoded secrets
- [ ] Enable HTTPS only
- [ ] Configure CORS properly
- [ ] Set secure headers
- [ ] Enable rate limiting
- [ ] Validate all user inputs
- [ ] Sanitize data outputs
- [ ] Update dependencies
- [ ] Run security audit: `npm audit`

### Headers Configuration

```javascript
// next.config.mjs
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};
```

### Environment Security

- Use environment variables for secrets
- Never commit `.env.local`
- Rotate API keys regularly
- Use different keys per environment
- Enable 2FA on all accounts

---

## Troubleshooting

### Build Failures

**Issue:** Build fails with TypeScript errors

```bash
# Solution: Run type check locally
npm run typecheck

# Fix errors and rebuild
npm run build
```

**Issue:** Out of memory during build

```bash
# Solution: Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Deployment Issues

**Issue:** Environment variables not working

- Verify variables are set in Vercel Dashboard
- Check variable names match exactly
- Redeploy after adding variables

**Issue:** 404 on API routes

- Verify route files exist in `app/api/`
- Check file naming (route.ts)
- Review middleware configuration

### Runtime Errors

**Issue:** Supabase authentication fails

- Verify Supabase URL and key
- Check redirect URLs in Supabase
- Clear browser cookies
- Check CORS settings

**Issue:** Data not loading

- Verify `trend_tables.json` exists
- Check file permissions
- Review API logs in Vercel
- Test API endpoint directly

---

## Post-Deployment

### Verification Checklist

- [ ] Homepage loads correctly
- [ ] Authentication works (sign up/in/out)
- [ ] Dashboard displays data
- [ ] API endpoints respond
- [ ] Astro tools function
- [ ] PWA installs correctly
- [ ] Theme toggle works
- [ ] Mobile responsive
- [ ] SSL certificate active
- [ ] Custom domain resolves

### Monitoring Setup

1. Enable Vercel Analytics
2. Set up error tracking (Sentry)
3. Configure uptime monitoring
4. Set up alerts for errors
5. Monitor performance metrics

### Maintenance

- Update dependencies monthly
- Review security advisories
- Monitor error logs
- Optimize based on analytics
- Backup data regularly

---

## Rollback Procedure

### Vercel Rollback

1. Go to Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"
4. Confirm rollback

### Git Rollback

```bash
# Revert to previous commit
git revert HEAD

# Or reset to specific commit
git reset --hard <commit-hash>

# Force push (use with caution)
git push --force
```

---

## Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Supabase Guides](https://supabase.com/docs/guides)
- [GitHub Actions](https://docs.github.com/en/actions)

---

## Conclusion

This deployment guide covers the essential steps for deploying the TrendDates Vercel UI application. Follow the checklist, monitor your deployment, and refer to troubleshooting sections as needed.

For additional help, consult the main [DOCUMENTATION.md](./DOCUMENTATION.md) or contact the development team.
