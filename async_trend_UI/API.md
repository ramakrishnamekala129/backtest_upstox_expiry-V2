# API Documentation

## Overview

This document provides detailed information about all API endpoints available in the TrendDates Vercel UI application.

## Base URL

- **Local Development**: `http://localhost:3000`
- **Production**: `https://your-app.vercel.app`

---

## Endpoints

### 1. Trends API

#### Get All Trend Data

**Endpoint:** `GET /api/trends`

**Description:** Fetches complete trend data including trend dates, date-wise summaries, and date-wise tables.

**Authentication:** Required (session cookie)

**Query Parameters:** None

**Response:**

```json
{
  "source": "remote" | "local" | "fallback",
  "payload": {
    "generated_at": "2024-01-01T00:00:00Z",
    "trend_dates": [
      {
        "Date": "2024-01-01",
        "Trend": "Bullish",
        "Strength": 85,
        "Symbols": "NIFTY, BANKNIFTY"
      }
    ],
    "dates_wise_single": [
      {
        "Date": "2024-01-01",
        "Symbol": "NIFTY",
        "Price": 21500,
        "Change": 1.5
      }
    ],
    "dates_wise_summary": [
      {
        "Date": "2024-01-01",
        "TotalSymbols": 50,
        "AvgChange": 1.2,
        "BullishCount": 35
      }
    ],
    "dates_wise_table": {
      "2024-01-01": [
        {
          "Symbol": "NIFTY",
          "Price": 21500,
          "Change": 1.5
        }
      ]
    }
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Data loading failed

**Example:**

```bash
curl http://localhost:3000/api/trends
```

---

#### Get Trend Data by Date

**Endpoint:** `GET /api/trends?date={date}`

**Description:** Fetches trend data for a specific date.

**Authentication:** Required (session cookie)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `date` | string | Yes | Date in YYYY-MM-DD format |

**Response:**

```json
{
  "source": "remote" | "local" | "fallback",
  "date": "2024-01-01",
  "rows": [
    {
      "Symbol": "NIFTY",
      "Price": 21500,
      "Change": 1.5,
      "Volume": 1000000
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Success (returns empty array if date not found)
- `500 Internal Server Error`: Data loading failed

**Example:**

```bash
curl "http://localhost:3000/api/trends?date=2024-01-01"
```

---

### 2. Planetary Aspects API

#### Calculate Planetary Aspects

**Endpoint:** `POST /api/astro/planetary-aspects`

**Description:** Calculates planetary aspects between two planets for a given date range.

**Authentication:** Required (session cookie)

**Request Body:**

```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "planet1": "Sun",
  "planet2": "Moon",
  "aspects": ["conjunction", "opposition", "trine", "square", "sextile"],
  "orb": 1.0,
  "includeMoon": true,
  "includeAscendant": false
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | Yes | Start date (YYYY-MM-DD) |
| `endDate` | string | Yes | End date (YYYY-MM-DD) |
| `planet1` | string | Yes | First planet name |
| `planet2` | string | Yes | Second planet name |
| `aspects` | string[] | Yes | Array of aspect types |
| `orb` | number | No | Orb tolerance in degrees (default: 1.0) |
| `includeMoon` | boolean | No | Include Moon aspects (default: false) |
| `includeAscendant` | boolean | No | Include Ascendant aspects (default: false) |

**Valid Planet Names:**
- Sun
- Moon
- Mercury
- Venus
- Mars
- Jupiter
- Saturn
- Rahu (North Node)
- Ketu (South Node)
- Uranus
- Neptune
- Pluto

**Valid Aspect Types:**
- conjunction (0°)
- opposition (180°)
- trine (120°)
- square (90°)
- sextile (60°)

**Response:**

```json
{
  "payload": {
    "snapshot": {
      "date": "2024-01-01",
      "time": "12:00",
      "symbol": "NIFTY",
      "referencePrice": 21500,
      "reviewWindow": "2024-01-01 to 2024-12-31",
      "weekday": "Monday"
    },
    "aspects": [
      {
        "date": "2024-01-15",
        "time": "14:30",
        "planet1": "Sun",
        "planet2": "Moon",
        "aspect": "conjunction",
        "angle": 0.5,
        "orb": 0.5,
        "exact": true
      }
    ],
    "filteredAspects": {
      "all": [...],
      "withoutMoon": [...],
      "withMoon": [...],
      "withoutAscendant": [...],
      "withAscendant": [...],
      "withMoonOrAscendant": [...],
      "withoutMoonOrAscendant": [...]
    },
    "monthlyEvents": {
      "transit": [...],
      "yoga": [...],
      "retrograde": [...],
      "asta": [...]
    },
    "errors": []
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `400 Bad Request`: Invalid parameters
- `500 Internal Server Error`: Calculation failed

**Example:**

```bash
curl -X POST http://localhost:3000/api/astro/planetary-aspects \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "planet1": "Sun",
    "planet2": "Moon",
    "aspects": ["conjunction"],
    "orb": 1.0
  }'
```

---

### 3. Moon & Ascendant API

#### Calculate Moon and Ascendant Positions

**Endpoint:** `POST /api/astro/moon-ascendant`

**Description:** Calculates Moon sign, Ascendant, Nakshatra, and related astrological data for a specific date, time, and symbol.

**Authentication:** Required (session cookie)

**Request Body:**

```json
{
  "date": "2024-01-01",
  "time": "12:00",
  "symbol": "NIFTY",
  "includeMoon": true,
  "includeAscendant": true,
  "reviewWindow": 7
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string | Yes | Date (YYYY-MM-DD) |
| `time` | string | Yes | Time (HH:MM in 24-hour format) |
| `symbol` | string | Yes | Stock/Index symbol |
| `includeMoon` | boolean | No | Calculate Moon positions (default: true) |
| `includeAscendant` | boolean | No | Calculate Ascendant (default: true) |
| `reviewWindow` | number | No | Days to analyze (default: 7) |

**Response:**

```json
{
  "payload": {
    "snapshot": {
      "date": "2024-01-01",
      "time": "12:00",
      "symbol": "NIFTY",
      "referencePrice": 21500,
      "reviewWindow": "7 days",
      "weekday": "Monday"
    },
    "moonShift": {
      "currentSign": "Aries",
      "currentNakshatra": "Ashwini",
      "currentPada": 1,
      "nextSign": "Taurus",
      "nextSignTime": "2024-01-03 08:30",
      "nextNakshatra": "Bharani",
      "nextNakshatraTime": "2024-01-02 14:15"
    },
    "currentPadas": [
      {
        "nakshatra": "Ashwini",
        "pada": 1,
        "sign": "Aries",
        "startDegree": 0.0,
        "endDegree": 3.33,
        "lord": "Ketu"
      }
    ],
    "nextPadas": [
      {
        "nakshatra": "Bharani",
        "pada": 1,
        "sign": "Aries",
        "startDegree": 13.33,
        "endDegree": 16.66,
        "lord": "Venus"
      }
    ],
    "nearestPriceRow": {
      "source": "historical_data",
      "matchedColumn": "Close",
      "rows": [
        {
          "Date": "2024-01-01",
          "Close": 21500,
          "High": 21600,
          "Low": 21400
        }
      ]
    },
    "levels": [
      {
        "type": "Support",
        "level": 21400,
        "strength": "Strong",
        "distance": -100
      },
      {
        "type": "Resistance",
        "level": 21600,
        "strength": "Moderate",
        "distance": 100
      }
    ],
    "horaTimings": [
      {
        "time": "06:00",
        "hora": "Sun",
        "favorable": true
      }
    ],
    "aspectMatrix": [...],
    "planetaryLevels": [...],
    "positions": [
      {
        "planet": "Moon",
        "sign": "Aries",
        "degree": 5.25,
        "nakshatra": "Ashwini",
        "pada": 1
      }
    ],
    "errors": []
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `400 Bad Request`: Invalid parameters
- `500 Internal Server Error`: Calculation failed

**Example:**

```bash
curl -X POST http://localhost:3000/api/astro/moon-ascendant \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-01-01",
    "time": "12:00",
    "symbol": "NIFTY",
    "includeMoon": true,
    "includeAscendant": true
  }'
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common Error Codes

| Status Code | Description |
|-------------|-------------|
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Authentication required |
| `404` | Not Found - Endpoint doesn't exist |
| `500` | Internal Server Error - Server-side error |

---

## Authentication

All API endpoints require authentication via Supabase session cookies. The session is automatically managed by the middleware.

### Session Management

- Sessions are created on sign-in
- Sessions are validated on each request
- Sessions expire after inactivity
- Refresh tokens are automatically handled

### Making Authenticated Requests

**Browser (Fetch API):**

```javascript
const response = await fetch('/api/trends', {
  credentials: 'include' // Include cookies
});
const data = await response.json();
```

**Server Component:**

```typescript
import { createClient } from '@/lib/supabase/server';

export default async function Page() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // User is authenticated
  const response = await fetch('/api/trends');
  const data = await response.json();
}
```

---

## Rate Limiting

Currently, there are no rate limits implemented. In production, consider adding rate limiting for:

- API endpoints: 100 requests/minute per user
- Authentication endpoints: 10 requests/minute per IP

---

## Data Formats

### Date Format
- **Standard**: `YYYY-MM-DD` (e.g., "2024-01-01")
- **ISO 8601**: `YYYY-MM-DDTHH:mm:ssZ` (for timestamps)

### Time Format
- **24-hour**: `HH:MM` (e.g., "14:30")

### Number Format
- **Decimal**: Use dot as separator (e.g., 1.5, not 1,5)
- **Precision**: Up to 2 decimal places for prices

---

## Caching

### Client-Side Caching

API responses can be cached using standard HTTP caching headers:

```javascript
const response = await fetch('/api/trends', {
  cache: 'force-cache', // Cache indefinitely
  next: { revalidate: 3600 } // Revalidate after 1 hour
});
```

### Server-Side Caching

Trend data is cached in memory for 5 minutes to reduce file system reads.

---

## Webhooks

Currently, webhooks are not implemented. Future versions may include:

- Data update notifications
- Calculation completion callbacks
- Error alerts

---

## SDK / Client Libraries

### JavaScript/TypeScript

```typescript
// lib/api-client.ts
export class TrendApiClient {
  async getTrends() {
    const response = await fetch('/api/trends');
    return response.json();
  }
  
  async getTrendsByDate(date: string) {
    const response = await fetch(`/api/trends?date=${date}`);
    return response.json();
  }
  
  async calculateAspects(params: AspectParams) {
    const response = await fetch('/api/astro/planetary-aspects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return response.json();
  }
}
```

---

## Testing

### Example Test Cases

```typescript
// __tests__/api/trends.test.ts
describe('Trends API', () => {
  it('should fetch all trends', async () => {
    const response = await fetch('/api/trends');
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('source');
    expect(data).toHaveProperty('payload');
  });
  
  it('should fetch trends by date', async () => {
    const response = await fetch('/api/trends?date=2024-01-01');
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('date', '2024-01-01');
    expect(data).toHaveProperty('rows');
  });
});
```

---

## Changelog

### Version 1.0.0 (Current)

- Initial API release
- Trends endpoint
- Planetary aspects endpoint
- Moon & Ascendant endpoint
- Supabase authentication integration

---

## Support

For API issues or questions:
- Check the main [DOCUMENTATION.md](./DOCUMENTATION.md)
- Review error messages in responses
- Check server logs for detailed errors
- Contact development team

---

## Future Enhancements

Planned API improvements:

1. **Pagination**: Add pagination for large datasets
2. **Filtering**: Advanced filtering options
3. **Sorting**: Custom sort parameters
4. **Batch Operations**: Process multiple requests
5. **WebSocket Support**: Real-time updates
6. **GraphQL**: Alternative query interface
7. **Rate Limiting**: Protect against abuse
8. **API Versioning**: Support multiple API versions
