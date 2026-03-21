# TrendDates Vercel UI - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Installation & Setup](#installation--setup)
5. [Configuration](#configuration)
6. [Project Structure](#project-structure)
7. [API Reference](#api-reference)
8. [Components](#components)
9. [Authentication](#authentication)
10. [Data Flow](#data-flow)
11. [Deployment](#deployment)
12. [Development Guide](#development-guide)
13. [Troubleshooting](#troubleshooting)

---

## Overview

TrendDates Vercel UI is a production-ready Next.js 14 dashboard for visualizing TrendDates output JSON data. It provides an interactive interface for analyzing trend dates, astronomical calculations, and market data with built-in authentication and PWA support.

### Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Authentication**: Supabase (Email/Password)
- **Styling**: Custom CSS with CSS Variables
- **Astronomical Calculations**: Swiss Ephemeris (@swisseph/node)
- **PWA**: Progressive Web App support
- **Deployment**: Vercel-optimized

---

## Architecture

### Application Structure
```
┌─────────────────────────────────────────┐
│         Next.js App Router              │
├─────────────────────────────────────────┤
│  Authentication Layer (Supabase)        │
├─────────────────────────────────────────┤
│  API Routes                             │
│  ├─ /api/trends                         │
│  ├─ /api/astro/planetary-aspects        │
│  └─ /api/astro/moon-ascendant           │
├─────────────────────────────────────────┤
│  Pages & Components                     │
│  ├─ Dashboard (/)                       │
│  ├─ Astro Tools (/astro)                │
│  ├─ Sign In/Up                          │
│  └─ Auth Callback                       │
├─────────────────────────────────────────┤
│  Data Layer                             │
│  ├─ trend_tables.json                   │
│  ├─ Swiss Ephemeris Files (ephe/)      │
│  └─ Astro Data Cache (data/astro/)     │
└─────────────────────────────────────────┘
```

### Key Design Patterns
- **Server Components**: Default for data fetching
- **Client Components**: Interactive UI elements
- **API Routes**: RESTful endpoints for data access
- **Middleware**: Session management and route protection
- **Type Safety**: Full TypeScript coverage

---

## Features

### 1. Dashboard Features
- **KPI Cards**: Quick metrics overview
- **Trend Dates Table**: Comprehensive trend analysis
- **Date-wise Summary**: Aggregated statistics by date
- **Date Bucket Preview**: Quick filtering and navigation
- **Search & Filter**: Real-time data filtering
- **Responsive Design**: Mobile-first approach

### 2. Astronomical Tools
- **Planetary Aspects Explorer**
  - Calculate aspects between planets
  - Filter by aspect types (conjunction, opposition, etc.)
  - Date range analysis
  - CSV export functionality

- **Moon-Ascendant Explorer**
  - Moon sign calculations
  - Ascendant calculations
  - Nakshatra analysis
  - Time-based filtering

### 3. Authentication
- Email/password authentication via Supabase
- Protected routes
- Session management
- Secure callback handling

### 4. PWA Support
- Offline capability
- Install to home screen
- Service worker for caching
- App manifest configuration

### 5. Theme Support
- Light/Dark mode toggle
- System preference detection
- Persistent theme selection
- CSS variable-based theming

---

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account (for authentication)

### Local Development Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd async_trend_UI
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:
```env
# Optional: Remote JSON source
TREND_DATA_URL=https://example.com/trend_tables.json

# Optional: Local JSON path
TREND_JSON_PATH=excel_output/trend_tables.json

# Optional: Site URL for production
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app

# Required: Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

4. **Run development server**
```bash
npm run dev
```

5. **Open browser**
Navigate to `http://localhost:3000`

---

## Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `TREND_DATA_URL` | No | Remote JSON URL (highest priority) | - |
| `TREND_JSON_PATH` | No | Local JSON path | `public/trend_tables.json` |
| `NEXT_PUBLIC_SITE_URL` | No | Production site URL | - |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes* | Supabase project URL | - |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes* | Supabase anonymous key | - |

*Required only if using authentication features

### Data Source Priority
1. `TREND_DATA_URL` - Remote JSON endpoint
2. `TREND_JSON_PATH` - Local file path
3. `public/trend_tables.json` - Default fallback

### Supabase Setup

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Note your project URL and anon key

2. **Enable Email Authentication**
   - Dashboard → Authentication → Providers
   - Enable "Email" provider

3. **Configure URLs**
   - Dashboard → Authentication → URL Configuration
   - Site URL: `http://localhost:3000` (local) or your production URL
   - Redirect URLs: Add `http://localhost:3000/auth/callback`

4. **Add Environment Variables**
   - Copy credentials to `.env.local`
   - Restart dev server

---

## Project Structure

```
async_trend_UI/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group
│   │   └── actions.ts            # Server actions for auth
│   ├── api/                      # API routes
│   │   ├── astro/                # Astronomical calculations
│   │   │   ├── moon-ascendant/   # Moon & ascendant API
│   │   │   └── planetary-aspects/ # Planetary aspects API
│   │   └── trends/               # Trend data API
│   │       └── route.ts
│   ├── astro/                    # Astro tools pages
│   │   ├── moon-ascendant/
│   │   ├── planetary-aspects/
│   │   └── page.tsx
│   ├── auth/                     # Auth callbacks
│   │   ├── callback/
│   │   └── sign-out/
│   ├── sign-in/                  # Sign in page
│   ├── sign-up/                  # Sign up page
│   ├── error.tsx                 # Error boundary
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Dashboard page
├── components/                   # React components
│   ├── astro-page.tsx            # Astro tools layout
│   ├── moon-ascendant-explorer.tsx
│   ├── planetary-aspect-explorer.tsx
│   ├── pwa-register.tsx          # PWA registration
│   ├── theme-toggle.tsx          # Theme switcher
│   └── trend-dashboard.tsx       # Main dashboard
├── data/                         # Static data
│   ├── astro/                    # Astronomical data cache
│   │   ├── aspect_cache_rows.json
│   │   └── *.csv                 # Aspect data files
│   └── stock_universes.json      # Stock symbols
├── ephe/                         # Swiss Ephemeris files
│   ├── ep4/                      # Ephemeris data
│   └── sat/                      # Satellite data
├── excel_output/                 # Generated data files
│   └── trend_tables.json         # Main data source
├── lib/                          # Utility libraries
│   ├── astro/                    # Astronomical calculations
│   │   ├── calculations.ts       # Core calculations
│   │   ├── data.ts               # Data loading
│   │   ├── parsers.ts            # Data parsers
│   │   ├── service.ts            # Service layer
│   │   ├── moon_asc_calc.py      # Python calculations
│   │   └── moon_asc_range.py     # Range calculations
│   ├── supabase/                 # Supabase integration
│   │   ├── client.ts             # Client-side client
│   │   ├── server.ts             # Server-side client
│   │   ├── middleware.ts         # Auth middleware
│   │   └── database.types.ts     # Database types
│   ├── trend-data.ts             # Trend data loader
│   └── types.ts                  # TypeScript types
├── public/                       # Static assets
│   ├── icons/                    # PWA icons
│   ├── manifest.webmanifest      # PWA manifest
│   ├── sw.js                     # Service worker
│   └── trend_tables.json         # Default data file
├── .env.example                  # Environment template
├── .env.local                    # Local environment (gitignored)
├── middleware.ts                 # Next.js middleware
├── next.config.mjs               # Next.js configuration
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
└── vercel.json                   # Vercel config
```

---

## API Reference

### `/api/trends`

**GET** - Fetch trend data

**Query Parameters:**
- `date` (optional): Filter by specific date (YYYY-MM-DD)

**Response (without date):**
```json
{
  "source": "remote|local|fallback",
  "payload": {
    "generated_at": "2024-01-01T00:00:00Z",
    "trend_dates": [...],
    "dates_wise_single": [...],
    "dates_wise_summary": [...],
    "dates_wise_table": {...}
  }
}
```

**Response (with date):**
```json
{
  "source": "remote|local|fallback",
  "date": "2024-01-01",
  "rows": [...]
}
```

**Error Response:**
```json
{
  "error": "Error message"
}
```

### `/api/astro/planetary-aspects`

**POST** - Calculate planetary aspects

**Request Body:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "planet1": "Sun",
  "planet2": "Moon",
  "aspects": ["conjunction", "opposition"],
  "orb": 1.0
}
```

**Response:**
```json
{
  "payload": {
    "snapshot": {...},
    "aspects": [...],
    "filteredAspects": {...},
    "errors": []
  }
}
```

### `/api/astro/moon-ascendant`

**POST** - Calculate Moon and Ascendant positions

**Request Body:**
```json
{
  "date": "2024-01-01",
  "time": "12:00",
  "symbol": "NIFTY",
  "includeMoon": true,
  "includeAscendant": true
}
```

**Response:**
```json
{
  "payload": {
    "snapshot": {...},
    "moonShift": {...},
    "currentPadas": [...],
    "levels": [...],
    "positions": [...]
  }
}
```

---

## Components

### TrendDashboard
Main dashboard component displaying trend data.

**Location:** `components/trend-dashboard.tsx`

**Features:**
- KPI cards with metrics
- Sortable trend dates table
- Date-wise summary table
- Date bucket filtering
- Search functionality
- Export capabilities

**Props:** None (fetches data internally)

### PlanetaryAspectExplorer
Interactive tool for planetary aspect calculations.

**Location:** `components/planetary-aspect-explorer.tsx`

**Features:**
- Planet selection
- Date range picker
- Aspect type filtering
- Orb configuration
- Results table
- CSV export

**Props:** None

### MoonAscendantExplorer
Tool for Moon and Ascendant calculations.

**Location:** `components/moon-ascendant-explorer.tsx`

**Features:**
- Symbol selection
- Date/time picker
- Moon/Ascendant toggle
- Nakshatra display
- Level calculations
- Price analysis

**Props:** None

### ThemeToggle
Theme switcher component.

**Location:** `components/theme-toggle.tsx`

**Features:**
- Light/Dark mode toggle
- System preference detection
- LocalStorage persistence
- Smooth transitions

**Props:** None

### PwaRegister
PWA registration handler.

**Location:** `components/pwa-register.tsx`

**Features:**
- Service worker registration
- Update notifications
- Offline support

**Props:** None

---

## Authentication

### Flow Diagram
```
User → Sign In/Up Page → Supabase Auth → Callback → Dashboard
                                ↓
                         Session Cookie
                                ↓
                          Middleware Check
                                ↓
                    Protected Routes (/, /astro)
```

### Implementation

**Sign Up:**
```typescript
// app/sign-up/SignUpForm.tsx
const { error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${origin}/auth/callback`
  }
});
```

**Sign In:**
```typescript
// app/sign-in/page.tsx
const { error } = await supabase.auth.signInWithPassword({
  email,
  password
});
```

**Sign Out:**
```typescript
// app/auth/sign-out/route.ts
await supabase.auth.signOut();
```

**Protected Routes:**
```typescript
// lib/supabase/middleware.ts
export async function updateSession(request: NextRequest) {
  const { user } = await supabase.auth.getUser();
  
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  
  return response;
}
```

---

## Data Flow

### Trend Data Loading

```
Request → loadTrendPayload()
            ↓
    Check TREND_DATA_URL
            ↓ (if set)
    Fetch remote JSON
            ↓ (if not set)
    Check TREND_JSON_PATH
            ↓ (if set)
    Read local file
            ↓ (if not set)
    Read public/trend_tables.json
            ↓
    Parse & Validate
            ↓
    Return { source, payload }
```

### Astronomical Calculations

```
User Input → API Route → Swiss Ephemeris
                ↓              ↓
         Validation      Calculate Positions
                ↓              ↓
         Service Layer ← Parse Results
                ↓
         Format Response
                ↓
         Return to Client
```

---

## Deployment

### Vercel Deployment

1. **Push to Git**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your repository
   - Framework Preset: Next.js (auto-detected)

3. **Configure Environment Variables**
   - Add all required env vars from `.env.example`
   - Set `NEXT_PUBLIC_SITE_URL` to your Vercel URL

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Visit your deployed site

5. **Update Supabase URLs**
   - Add Vercel URL to Supabase redirect URLs
   - Update Site URL in Supabase settings

### Build Optimization

**Check build locally:**
```bash
npm run build
npm start
```

**Build output:**
- Static pages: Pre-rendered at build time
- Dynamic pages: Server-rendered on demand
- API routes: Serverless functions

### Performance Tips
- Use `public/trend_tables.json` for fastest loading
- Enable Vercel Edge Network for global CDN
- Configure caching headers for static assets
- Use ISR (Incremental Static Regeneration) for data updates

---

## Development Guide

### Adding New Features

1. **New Page**
```typescript
// app/new-page/page.tsx
export default function NewPage() {
  return <div>New Page</div>;
}
```

2. **New API Route**
```typescript
// app/api/new-route/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ data: "response" });
}
```

3. **New Component**
```typescript
// components/new-component.tsx
"use client";

export function NewComponent() {
  return <div>Component</div>;
}
```

### Code Style

- Use TypeScript for all files
- Follow Next.js App Router conventions
- Use server components by default
- Add "use client" only when needed
- Keep components small and focused
- Use CSS variables for theming

### Type Safety

```typescript
// Define types in lib/types.ts
export type NewType = {
  id: string;
  name: string;
};

// Use in components
import type { NewType } from "@/lib/types";
```

### Testing

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build test
npm run build
```

---

## Troubleshooting

### Common Issues

**1. Authentication not working**
- Check Supabase credentials in `.env.local`
- Verify redirect URLs in Supabase dashboard
- Clear browser cookies and try again
- Check browser console for errors

**2. Data not loading**
- Verify `trend_tables.json` exists in `public/`
- Check file format (valid JSON)
- Inspect Network tab for API errors
- Check environment variable configuration

**3. Build errors**
- Run `npm run typecheck` to find type errors
- Check for missing dependencies
- Clear `.next` folder and rebuild
- Verify Node.js version (18+)

**4. Swiss Ephemeris errors**
- Ensure `ephe/` folder exists with data files
- Check file permissions
- Verify `@swisseph/node` installation
- Check server logs for detailed errors

**5. PWA not installing**
- Verify `manifest.webmanifest` is valid
- Check `sw.js` is accessible
- Use HTTPS in production
- Check browser PWA support

### Debug Mode

Enable detailed logging:
```typescript
// Add to next.config.mjs
const nextConfig = {
  logging: {
    fetches: {
      fullUrl: true
    }
  }
};
```

### Getting Help

- Check browser console for errors
- Review server logs (`npm run dev` output)
- Inspect Network tab for failed requests
- Check Vercel deployment logs
- Review Supabase logs for auth issues

---

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Swiss Ephemeris Documentation](https://www.astro.com/swisseph/)
- [Vercel Deployment Guide](https://vercel.com/docs)

---

## License

This project is private and proprietary.

## Support

For issues and questions, contact the development team.
