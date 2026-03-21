# TrendDates Vercel UI

Production-ready Next.js dashboard for visualizing TrendDates output JSON (`trend_tables.json`).

## Features

- Vercel-ready Next.js 14 + TypeScript app
- API endpoint: `/api/trends`
- Data source priority:
  1. `TREND_DATA_URL` (remote JSON)
  2. `TREND_JSON_PATH` (local path)
  3. `public/trend_tables.json` (default fallback)
- Responsive dashboard with:
  - KPI cards
  - Trend dates table
  - Date-wise summary table
  - Date-bucket preview with quick filtering
- Supabase email/password authentication:
  - `/sign-up`
  - `/sign-in`
  - Protected `/` dashboard route

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Authentication Setup (Supabase)

1. Create a Supabase project.
2. In Supabase Dashboard -> Authentication -> Providers, enable Email.
3. Add URL config in Supabase Dashboard -> Authentication -> URL Configuration:
   - Site URL: your app URL (for local: `http://localhost:3000`)
   - Redirect URL: `http://localhost:3000/auth/callback`
4. Add env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Restart the Next.js dev server.

## Build Check

```bash
npm run build
```

## Deploy To Vercel

1. Push this project to GitHub/GitLab/Bitbucket.
2. Import the repo in Vercel.
3. Framework preset: `Next.js`.
4. Add optional environment variables if needed:
   - `TREND_DATA_URL`
   - `TREND_JSON_PATH`
   - `NEXT_PUBLIC_SITE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy.

## Data File

Default bundled file is `public/trend_tables.json`.

To replace data:

1. Generate JSON from your Python pipeline.
2. Copy it to `public/trend_tables.json`.
3. Redeploy.
