# Developer Guide

This guide is for developers contributing to the Backtest Upstox Expiry project.

## Table of Contents

1. [Development Setup](#development-setup)
2. [Code Structure](#code-structure)
3. [Backend Development](#backend-development)
4. [Frontend Development](#frontend-development)
5. [Testing](#testing)
6. [Code Style](#code-style)
7. [Contributing](#contributing)

---

## Development Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- Git
- Code editor (VS Code recommended)

### Clone and Setup

```bash
git clone <repository-url>
cd "backtest_upstox_expiry V3"

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend
npm ci
cd ..
```

### Development Environment Variables

Create `.env.development`:

```env
UPSTOX_API_KEY=dev_key
UPSTOX_SECRET_KEY=dev_secret
UPSTOX_TOTP_KEY=dev_totp
UPSTOX_MOBILE_NO=dev_mobile
UPSTOX_PIN=dev_pin
SITE_URL=http://localhost:8765

# Optional: Supabase for auth
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Development settings
PYTHONUNBUFFERED=1
DEBUG=1
```

### IDE Setup

#### VS Code Extensions

Recommended extensions:

- Python (ms-python.python)
- Pylance (ms-python.vscode-pylance)
- Black Formatter (ms-python.black-formatter)
- ESLint (dbaeumer.vscode-eslint)
- TypeScript (vscode.typescript-language-features)

#### VS Code Settings

`.vscode/settings.json`:

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/venv/Scripts/python.exe",
  "python.formatting.provider": "black",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

---

## Code Structure

```
backtest_upstox_expiry V3/
├── web_app.py                 # Main FastAPI application
├── upstox_OC_test_v1.py       # CLI tool for auth testing
│
├── upstox_tools/              # Core Upstox integration
│   ├── __init__.py
│   ├── auth.py                # Authentication flow
│   ├── config.py              # Configuration constants
│   ├── expired_contracts.py   # Expired contract helpers
│   ├── backtest.py            # Backtesting engine
│   ├── server.py              # Legacy HTTP server
│   ├── supabase_auth.py       # Supabase authentication
│   ├── astro_service.py       # Astrological data service
│   ├── trend_data.py          # Trend data utilities
│   └── payoff.py              # Options payoff calculator
│
├── frontend/                  # React frontend
│   ├── src/
│   │   ├── App.tsx            # Main application component
│   │   ├── main.tsx           # Entry point
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── utils/             # Utility functions
│   │   └── types/             # TypeScript types
│   ├── public/                # Static assets
│   ├── index.html             # HTML template
│   └── vite.config.ts         # Vite configuration
│
├── docs/                      # Documentation
│   ├── README.md              # Project overview
│   ├── API.md                 # API reference
│   ├── ARCHITECTURE.md        # Architecture docs
│   ├── GETTING_STARTED.md     # Setup guide
│   ├── USER_GUIDE.md          # User documentation
│   ├── DEPLOYMENT.md          # Deployment guide
│   └── DEVELOPER_GUIDE.md     # This file
│
├── data/                      # Runtime data (gitignored)
│   ├── parquet/               # Parquet datasets
│   ├── jobs/                  # Job artifacts
│   └── expired_data.duckdb    # DuckDB database
│
├── expired_contracts/         # Contract snapshots (gitignored)
├── output/                    # Output files (gitignored)
│
├── requirements.txt           # Python dependencies
├── package.json               # Frontend dependencies
├── Dockerfile                 # Docker configuration
├── docker-compose.yml         # Docker Compose (create)
├── vercel.json                # Vercel config
└── render.yaml                # Render config
```

---

## Backend Development

### Running the Backend

```bash
# Development mode with auto-reload
python web_app.py --reload

# Specific host/port
python web_app.py --host 0.0.0.0 --port 8765

# Production mode
uvicorn web_app:app --host 0.0.0.0 --port 8765 --workers 4
```

### Adding New API Endpoints

Example: Add a new endpoint for instrument details:

```python
@app.get('/api/instrument/{instrument_key}')
async def get_instrument_details(instrument_key: str):
    """Get detailed information for a specific instrument."""
    instruments = _load_instruments_cache()
    
    for ins in instruments:
        if ins.get('instrument_key') == instrument_key:
            return {
                'instrument_key': ins.get('instrument_key'),
                'symbol': ins.get('symbol'),
                'name': ins.get('name'),
                'segment': ins.get('segment'),
                'lot_size': ins.get('lot_size'),
                'tick_size': ins.get('tick_size'),
            }
    
    raise HTTPException(status_code=404, detail='Instrument not found')
```

### Working with Upstox API

#### Authentication Flow

`upstox_tools/auth.py` handles the login:

```python
from upstox_tools.auth import login_upstox, get_access_token

# Interactive login
code = await login_upstox()
token = get_access_token(code)
```

#### Making API Calls

```python
import requests
from upstox_tools.config import UPSTOX_BASE

def fetch_instrument_details(token: str, instrument_key: str):
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json',
    }
    
    url = f'{UPSTOX_BASE}/v2/instruments/{instrument_key}'
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()
```

### Database Operations

#### DuckDB Integration

```python
import duckdb

def query_candles(from_date: str, to_date: str):
    conn = duckdb.connect('data/expired_data.duckdb')
    
    query = """
        SELECT * FROM candles
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp
    """
    
    result = conn.execute(query, [from_date, to_date]).fetchdf()
    conn.close()
    return result
```

#### Parquet Operations

```python
import pyarrow as pa
import pyarrow.parquet as pq

def write_candles_parquet(candles: list, output_path: str):
    table = pa.Table.from_pylist(candles)
    pq.write_table(table, output_path, compression='snappy')

def read_candles_parquet(path: str):
    table = pq.read_table(path)
    return table.to_pydict()
```

### Background Jobs

#### Creating a New Job Type

```python
from uuid import uuid4
from threading import Lock

JOBS: Dict[str, Dict] = {}
JOBS_LOCK = Lock()

@app.post('/api/my-job')
async def create_my_job(background_tasks: BackgroundTasks):
    job_id = str(uuid4())
    
    JOBS[job_id] = {
        'status': 'running',
        'progress': 0,
        'total': 100,
    }
    
    background_tasks.add_task(run_my_job, job_id)
    
    return {'job_id': job_id, 'status': 'started'}

def run_my_job(job_id: str):
    try:
        for i in range(100):
            # Do work
            with JOBS_LOCK:
                JOBS[job_id]['progress'] = i + 1
    except Exception as e:
        with JOBS_LOCK:
            JOBS[job_id]['status'] = 'error'
            JOBS[job_id]['error'] = str(e)
```

### Error Handling

```python
from fastapi import HTTPException

@app.get('/api/example')
async def example_endpoint():
    try:
        # Your code here
        pass
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        logger.exception('Key error in example endpoint')
        raise HTTPException(status_code=500, detail='Internal error')
```

### Logging

```python
import logging

logger = logging.getLogger(__name__)

def my_function():
    logger.debug('Debug message')
    logger.info('Info message')
    logger.warning('Warning message')
    logger.error('Error message')
    logger.exception('Exception message')
```

---

## Frontend Development

### Running the Frontend

```bash
cd frontend

# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Project Structure

```
frontend/src/
├── App.tsx                    # Root component
├── main.tsx                   # Entry point
├── components/                # Reusable components
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Modal.tsx
│   └── Table.tsx
├── pages/                     # Page components
│   ├── Home.tsx
│   ├── Ranges.tsx
│   └── RangeDetail.tsx
├── hooks/                     # Custom hooks
│   ├── useAuth.ts
│   ├── useJobs.ts
│   └── useApi.ts
├── utils/                     # Utilities
│   ├── api.ts
│   ├── formatters.ts
│   └── validators.ts
└── types/                     # TypeScript types
    ├── index.ts
    └── api.ts
```

### Adding New Components

Example: Create a new card component:

```tsx
// frontend/src/components/Card.tsx
import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <div className={twMerge(clsx(
      'bg-white rounded-lg shadow-md p-6',
      className
    ))}>
      {title && (
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
      )}
      {children}
    </div>
  );
}
```

### API Integration

```tsx
// frontend/src/utils/api.ts
const API_BASE = '/api';

export async function fetchInstruments(query: string) {
  const response = await fetch(`${API_BASE}/search-instruments?query=${query}`);
  if (!response.ok) throw new Error('Failed to fetch');
  return response.json();
}

export async function startOhlcJob(params: OhlcJobParams) {
  const queryString = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/ohlc-job?${queryString}`);
  if (!response.ok) throw new Error('Failed to start job');
  return response.json();
}
```

### Custom Hooks

```tsx
// frontend/src/hooks/useJobs.ts
import { useState, useEffect } from 'react';

interface Job {
  job_id: string;
  status: string;
  progress: number;
}

export function useJob(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const fetchJob = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/ohlc-job/${jobId}`);
        const data = await response.json();
        setJob(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
    const interval = setInterval(fetchJob, 2000);
    return () => clearInterval(interval);
  }, [jobId]);

  return { job, loading, error };
}
```

### State Management

For simple state, use React Context:

```tsx
// frontend/src/context/AppContext.tsx
import React, { createContext, useContext, useState } from 'react';

interface AppState {
  token: string | null;
  setToken: (token: string | null) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  return (
    <AppContext.Provider value={{ token, setToken }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
```

---

## Testing

### Python Testing

Install testing dependencies:

```bash
pip install pytest pytest-asyncio pytest-cov httpx
```

Create tests:

```python
# tests/test_api.py
import pytest
from fastapi.testclient import TestClient
from web_app import app

client = TestClient(app)

def test_search_instruments():
    response = client.get('/api/search-instruments?query=NIFTY')
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_token_status():
    response = client.get('/api/token-status')
    assert response.status_code == 200
    data = response.json()
    assert 'status' in data
```

Run tests:

```bash
pytest
pytest --cov=web_app
pytest tests/ -v
```

### Frontend Testing

Install testing dependencies:

```bash
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom
```

Create tests:

```tsx
// frontend/src/components/__tests__/Button.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('renders correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vitest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    screen.getByText('Click me').click();
    expect(handleClick).toHaveBeenCalled();
  });
});
```

Run tests:

```bash
npm run test
```

---

## Code Style

### Python

Follow PEP 8 with Black formatting:

```bash
# Format code
black web_app.py upstox_tools/

# Lint code
pylint web_app.py upstox_tools/

# Type checking
mypy web_app.py upstox_tools/
```

#### Python Style Guide

- **Line length**: 100 characters
- **Indentation**: 4 spaces
- **Imports**: Grouped and sorted
- **Type hints**: Use for all function signatures
- **Docstrings**: Google style

Example:

```python
def fetch_candles(
    token: str,
    instrument_key: str,
    from_date: str,
    to_date: str,
) -> list[dict]:
    """Fetch candle data for an instrument.
    
    Args:
        token: Upstox access token
        instrument_key: Instrument identifier
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
    
    Returns:
        List of candle dictionaries with OHLC data
    """
    pass
```

### TypeScript/React

Follow TypeScript best practices:

```bash
# Format code
npx prettier --write "src/**/*.tsx"

# Lint code
npm run lint

# Type check
npx tsc --noEmit
```

#### TypeScript Style Guide

- **Components**: Functional components with hooks
- **Props**: Interface definitions
- **State**: TypeScript generics
- **Events**: Properly typed event handlers

Example:

```tsx
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({ 
  label, 
  onClick, 
  disabled = false,
  variant = 'primary' 
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {label}
    </button>
  );
}
```

---

## Contributing

### Git Workflow

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make changes** and commit:
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

4. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request**

### Commit Message Convention

Follow Conventional Commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

Examples:

```
feat(api): add instrument details endpoint

fix(frontend): resolve chart rendering issue on mobile

docs: update deployment guide with Render instructions

refactor(auth): simplify token refresh logic
```

### Pull Request Guidelines

1. **Keep PRs small**: Focus on one feature/fix
2. **Write clear descriptions**: Explain what and why
3. **Include tests**: For new features and bug fixes
4. **Update documentation**: If behavior changes
5. **Check CI**: Ensure all tests pass

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
```

---

## Debugging

### Backend Debugging

```python
import pdb

def problematic_function():
    pdb.set_trace()  # Breakpoint
    # ... code
```

Or use logging:

```python
logger.debug('Variable state: %s', variable)
```

### Frontend Debugging

Use browser DevTools:
- Console for logs
- Network tab for API calls
- React DevTools for component state

### Remote Debugging

For Docker:

```bash
docker exec -it upstox-backtest /bin/bash
python -m pdb web_app.py
```

---

## Performance Optimization

### Backend

1. **Database indexing**:
   ```sql
   CREATE INDEX idx_timestamp ON candles(timestamp);
   ```

2. **Query optimization**:
   ```python
   # Use WHERE clauses
   # Limit result sets
   # Use prepared statements
   ```

3. **Caching**:
   ```python
   from functools import lru_cache
   
   @lru_cache(maxsize=100)
   def get_instrument_meta(key: str):
       # Expensive operation
       pass
   ```

### Frontend

1. **Code splitting**:
   ```tsx
   const Chart = lazy(() => import('./Chart'));
   ```

2. **Memoization**:
   ```tsx
   const memoizedValue = useMemo(() => expensiveCalculation(data), [data]);
   ```

3. **Virtual scrolling**: For large lists

---

## Next Steps

- [API Reference](API.md) - Endpoint details
- [Architecture](ARCHITECTURE.md) - System internals
- [User Guide](USER_GUIDE.md) - Feature documentation
