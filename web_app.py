"""Browser-ready FastAPI portal for downloading cached expired data."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from datetime import date, datetime, timedelta
import calendar
import random
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
import time
import asyncio
import pyarrow as pa
import pyarrow.parquet as pq
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import click
import duckdb
import httpx
import requests
import uvicorn
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from upstox_tools.backtest import _load_instruments_cache
from upstox_tools.astro_service import (
    build_astro_payload,
    build_moon_ascendant_payload,
    build_planetary_aspects_payload,
)
from upstox_tools.config import UPSTOX_BASE
from upstox_tools.expired_contracts import EXPIRED_CACHE_ROOT, collect_expired_contracts, fetch_expired_candle
from upstox_tools.supabase_auth import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    SupabaseAuthError,
    get_user as get_supabase_user,
    is_supabase_configured,
    load_supabase_config,
    refresh_session as refresh_supabase_session,
    sign_in_with_password,
    sign_up_user,
)
from upstox_tools.trend_data import load_trend_payload

logger = logging.getLogger(__name__)
app = FastAPI(title='Expired Contracts Portal')
IS_VERCEL = bool(os.getenv('VERCEL'))
IS_RENDER = bool(os.getenv('RENDER'))
IS_CLOUD_DEPLOYMENT = IS_VERCEL or IS_RENDER
RUNTIME_ROOT = Path('/tmp/backtest_upstox_expiry_v3') if IS_VERCEL else Path('.')
TOKEN_CACHE = Path.home() / '.upstox_access_token.json'
TOKEN_REFRESH_LOCK = Lock()
LAST_REFRESH_TS = 0.0
LAST_REFRESH_STATUS: Dict[str, object] = {'status': 'unknown', 'message': '', 'last_refresh_ts': 0.0}
UPSTOX_REQUEST_LOCK = Lock()
ASYNC_UPSTOX_REQUEST_LOCK: Optional[asyncio.Lock] = None
LAST_UPSTOX_REQUEST_TS = 0.0
MIN_UPSTOX_REQUEST_GAP_SECONDS = 0.15
OHLC_FETCH_MAX_WORKERS = 4
OHLC_EXPIRY_DISCOVERY_MAX_CONCURRENCY = 6
DATA_ROOT = RUNTIME_ROOT / 'data'
PARQUET_ROOT = DATA_ROOT / 'parquet'
DB_PATH = DATA_ROOT / 'expired_data.duckdb'
FRONTEND_DIST = Path('frontend') / 'dist'
FRONTEND_ASSETS = FRONTEND_DIST / 'assets'
LOG_PATH = DATA_ROOT / 'ohlc_errors.log'
JOB_DB_ROOT = DATA_ROOT / 'jobs'
MASTER_CANDLES_PARQUET = PARQUET_ROOT / 'expired_candles_master.parquet'
MASTER_INDEX_PARQUET = PARQUET_ROOT / 'expired_candles_index.parquet'

DATA_ROOT.mkdir(parents=True, exist_ok=True)
PARQUET_ROOT.mkdir(parents=True, exist_ok=True)
JOB_DB_ROOT.mkdir(parents=True, exist_ok=True)
EXPIRED_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
if not logger.handlers:
    file_handler = logging.FileHandler(LOG_PATH, encoding='utf-8')
    formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
    file_handler.setFormatter(formatter)
    logger.setLevel(logging.INFO)
    logger.addHandler(file_handler)
OHLC_JOBS: Dict[str, Dict[str, object]] = {}
OHLC_JOBS_LOCK = Lock()
DB_WRITE_LOCK = Lock()
_DB_CONN: Optional[duckdb.DuckDBPyConnection] = None
INSTRUMENT_META_CACHE: Optional[Dict[str, Dict[str, object]]] = None
INSTRUMENT_META_LOCK = Lock()
EXPIRED_CONTRACT_META_CACHE: Optional[Dict[str, Dict[str, object]]] = None
EXPIRED_CONTRACT_META_LOCK = Lock()

# Clean up stale WAL files from previous crashes/unclean shutdowns
for _wal_ext in ('.wal', '.wal.checkpoint'):
    _wal_path = Path(str(DB_PATH) + _wal_ext)
    if _wal_path.exists():
        try:
            _wal_path.unlink()
            logger.info('Cleaned up stale WAL file: %s', _wal_path)
        except OSError as _e:
            logger.warning('Could not remove stale WAL file %s: %s', _wal_path, _e)

if FRONTEND_ASSETS.exists():
    app.mount('/assets', StaticFiles(directory=FRONTEND_ASSETS), name='assets')


def _is_public_path(path: str) -> bool:
    if path in {'/auth/sign-in', '/auth/sign-up', '/auth/callback', '/sign-in', '/sign-up'}:
        return True
    return path.startswith('/assets/') or path in {'/favicon.ico'}


def _is_api_path(path: str) -> bool:
    return path.startswith('/api/') or path.startswith('/download/')


def _set_session_cookies(response: Response, session: Dict[str, Any]) -> None:
    config = load_supabase_config()
    secure = config.secure_cookies if config else False
    max_age = int(session.get('expires_in') or 60 * 60 * 24 * 7)
    access_token = str(session.get('access_token') or '').strip()
    refresh_token = str(session.get('refresh_token') or '').strip()
    if access_token:
        response.set_cookie(
            ACCESS_COOKIE,
            access_token,
            httponly=True,
            secure=secure,
            samesite='lax',
            max_age=max_age,
            path='/',
        )
    if refresh_token:
        response.set_cookie(
            REFRESH_COOKIE,
            refresh_token,
            httponly=True,
            secure=secure,
            samesite='lax',
            max_age=60 * 60 * 24 * 30,
            path='/',
        )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path='/')
    response.delete_cookie(REFRESH_COOKIE, path='/')


def _resolve_authenticated_user(request: Request) -> Optional[Dict[str, Any]]:
    if not is_supabase_configured():
        user = {'email': 'local@offline', 'id': 'local-session', 'user_metadata': {'username': 'local'}}
        request.state.supabase_user = user
        request.state.supabase_session = None
        return user
    access_token = request.cookies.get(ACCESS_COOKIE)
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    refreshed_session: Optional[Dict[str, Any]] = None
    user: Optional[Dict[str, Any]] = None
    if access_token:
        try:
            user = get_supabase_user(access_token)
        except SupabaseAuthError:
            user = None
    if user is None and refresh_token:
        try:
            refreshed_session = refresh_supabase_session(refresh_token)
            access_token = str(refreshed_session.get('access_token') or '')
            if access_token:
                user = get_supabase_user(access_token)
        except SupabaseAuthError:
            user = None
            refreshed_session = None
    if user is None:
        return None
    request.state.supabase_user = user
    request.state.supabase_session = refreshed_session
    return user


class SupabaseSessionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if _is_public_path(path):
            return await call_next(request)
        user = _resolve_authenticated_user(request)
        if user is None:
            if _is_api_path(path):
                return JSONResponse({'detail': 'Authentication required'}, status_code=401)
            return RedirectResponse(url='/sign-in', status_code=303)
        response = await call_next(request)
        refreshed_session = getattr(request.state, 'supabase_session', None)
        if refreshed_session:
            _set_session_cookies(response, refreshed_session)
        return response


app.add_middleware(SupabaseSessionMiddleware)


@app.exception_handler(SupabaseAuthError)
async def handle_supabase_auth_error(_: Request, exc: SupabaseAuthError):
    return JSONResponse({'detail': str(exc)}, status_code=400)


def _read_token() -> Optional[str]:
    env_token = os.getenv('UPSTOX_ACCESS_TOKEN', '').strip()
    if env_token:
        return env_token
    try:
        payload = json.loads(TOKEN_CACHE.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return payload.get('access_token')


def _is_token_valid(token: str) -> bool:
    try:
        resp = requests.get(
            f'{UPSTOX_BASE}/v2/user/profile',
            headers={'Accept': 'application/json', 'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        return resp.status_code == 200
    except requests.RequestException as exc:
        logger.debug('Profile validation failed: %s', exc)
        return False


def _normalize_access_token() -> Optional[str]:
    token = _read_token()
    if token and _is_token_valid(token):
        return token
    refreshed = refresh_access_token()
    if refreshed and _is_token_valid(refreshed):
        return refreshed
    return None


def refresh_access_token() -> Optional[str]:
    """Refresh access token via Upstox login flow."""
    global LAST_REFRESH_TS
    now = time.time()
    with TOKEN_REFRESH_LOCK:
        if now - LAST_REFRESH_TS < 60:
            return _read_token()
        LAST_REFRESH_TS = now
    try:
        from upstox_tools.auth import get_access_token, login_upstox

        code = asyncio.run(login_upstox())
        token = get_access_token(code)
        if not token:
            LAST_REFRESH_STATUS.update(
                {'status': 'refresh_failed', 'message': 'Empty token from auth flow', 'last_refresh_ts': LAST_REFRESH_TS}
            )
            return None
        TOKEN_CACHE.write_text(json.dumps({'access_token': token}), encoding='utf-8')
        LAST_REFRESH_STATUS.update(
            {'status': 'valid', 'message': 'Token refreshed', 'last_refresh_ts': LAST_REFRESH_TS}
        )
        return token
    except Exception as exc:
        logger.exception('Token refresh failed: %s', exc)
        LAST_REFRESH_STATUS.update(
            {'status': 'refresh_failed', 'message': str(exc), 'last_refresh_ts': LAST_REFRESH_TS}
        )
        return None


def _fno_underlying_keys(instruments: Sequence[Dict[str, object]]) -> Set[str]:
    keys: Set[str] = set()
    for ins in instruments:
        segment = str(ins.get('segment', '')).upper()
        if segment != 'NSE_FO':
            continue
        underlying = str(ins.get('underlying_key') or '').strip()
        if underlying:
            keys.add(underlying)
    return keys


def _search_token_master(query: str, limit: int = 25) -> List[Dict[str, str]]:
    q = query.strip().upper()
    if not q:
        return []
    instruments = _load_instruments_cache()
    fno_underlyings = _fno_underlying_keys(instruments)
    scored: List[Tuple[int, Dict[str, str]]] = []
    for ins in instruments:
        segment = str(ins.get('segment', '')).upper()
        if segment == 'NSE_EQ':
            key = str(ins.get('instrument_key') or '').strip()
            if not key or key not in fno_underlyings:
                continue
        elif segment != 'NSE_INDEX':
            continue
        symbol = str(ins.get('symbol', '')).strip()
        name = str(ins.get('name', '')).strip()
        trading = str(ins.get('trading_symbol', '')).strip()
        key = str(ins.get('instrument_key', '')).strip()
        hay = f"{symbol} {name} {trading} {key}".upper()
        if q not in hay:
            continue
        if symbol.upper() == q:
            score = 0
        elif symbol.upper().startswith(q):
            score = 1
        elif name.upper().startswith(q):
            score = 2
        elif trading.upper().startswith(q):
            score = 3
        else:
            score = 4
        scored.append(
            (
                score,
                {
                    'symbol': symbol or name or trading or key,
                    'name': name,
                    'trading_symbol': trading,
                    'instrument_key': key,
                    'segment': segment,
                },
            )
        )
    scored.sort(key=lambda item: (item[0], item[1]['symbol'], item[1]['instrument_key']))
    return [item[1] for item in scored[:limit]]


def _base_instrument_key(instrument_key: str) -> str:
    parts = instrument_key.split('|')
    if len(parts) >= 2:
        return f'{parts[0]}|{parts[1]}'
    return instrument_key


def _get_instrument_meta_map() -> Dict[str, Dict[str, object]]:
    global INSTRUMENT_META_CACHE
    if INSTRUMENT_META_CACHE is not None:
        return INSTRUMENT_META_CACHE
    with INSTRUMENT_META_LOCK:
        if INSTRUMENT_META_CACHE is not None:
            return INSTRUMENT_META_CACHE
        instruments = _load_instruments_cache()
        meta: Dict[str, Dict[str, object]] = {}
        for ins in instruments:
            if str(ins.get('segment', '')).upper() != 'NSE_FO':
                continue
            key = str(ins.get('instrument_key') or '').strip()
            if not key:
                continue
            instrument_type = str(ins.get('instrument_type') or '').upper() or None
            if instrument_type and instrument_type.startswith('FUT'):
                instrument_type = 'FUT'
            meta[key] = {
                'instrument_type': instrument_type,
                'strike_price': ins.get('strike_price'),
            }
        INSTRUMENT_META_CACHE = meta
        return meta


def _get_expired_contract_meta_map() -> Dict[str, Dict[str, object]]:
    global EXPIRED_CONTRACT_META_CACHE
    if EXPIRED_CONTRACT_META_CACHE is not None:
        return EXPIRED_CONTRACT_META_CACHE
    with EXPIRED_CONTRACT_META_LOCK:
        if EXPIRED_CONTRACT_META_CACHE is not None:
            return EXPIRED_CONTRACT_META_CACHE
        meta: Dict[str, Dict[str, object]] = {}
        if not EXPIRED_CACHE_ROOT.exists():
            EXPIRED_CONTRACT_META_CACHE = meta
            return meta
        for entry in EXPIRED_CACHE_ROOT.iterdir():
            if not entry.is_dir():
                continue
            candidate = entry / 'expired_contracts.json'
            if not candidate.exists():
                continue
            try:
                payload = json.loads(candidate.read_text(encoding='utf-8'))
            except json.JSONDecodeError:
                continue
            for bucket in ('options', 'futures'):
                group = payload.get(bucket) or {}
                if not isinstance(group, dict):
                    continue
                for contracts in group.values():
                    if not isinstance(contracts, list):
                        continue
                    for contract in contracts:
                        key = str(contract.get('instrument_key') or '').strip()
                        if not key:
                            continue
                        instrument_type = str(contract.get('instrument_type') or '').upper() or None
                        if instrument_type and instrument_type.startswith('FUT'):
                            instrument_type = 'FUT'
                        strike_price = contract.get('strike_price')
                        meta[key] = {
                            'instrument_type': instrument_type,
                            'strike_price': strike_price,
                        }
        EXPIRED_CONTRACT_META_CACHE = meta
        return meta


def _fetch_expired_contracts_for_expiry(
    access_token: str,
    underlying_key: str,
    expiry_date: str,
) -> List[Dict[str, str]]:
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    options_url = f'{UPSTOX_BASE}/v2/expired-instruments/option/contract'
    futures_url = f'{UPSTOX_BASE}/v2/expired-instruments/future/contract'
    contracts: List[Dict[str, str]] = []
    for url in (options_url, futures_url):
        resp = requests.get(
            url,
            headers=headers,
            params={'instrument_key': underlying_key, 'expiry_date': expiry_date},
            timeout=20,
        )
        if resp.status_code != 200:
            continue
        data = resp.json().get('data', []) or []
        for item in data:
            contracts.append(
                {
                    'instrument_key': str(item.get('instrument_key') or ''),
                    'trading_symbol': str(item.get('trading_symbol') or ''),
                    'instrument_type': str(item.get('instrument_type') or ''),
                    'strike_price': str(item.get('strike_price') or ''),
                    'expiry': str(item.get('expiry') or expiry_date),
                    'segment': str(item.get('segment') or ''),
                }
            )
    return contracts


def _parse_date(value: str) -> date:
    return datetime.strptime(value, '%Y-%m-%d').date()


def _format_date(value: date) -> str:
    return value.isoformat()


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _adjust_range_by_instrument(
    instrument_type: str,
    from_date: str,
    to_date: str,
) -> Tuple[str, str]:
    to_dt = _parse_date(to_date)
    instrument_type = instrument_type.upper()
    if instrument_type in {'CE', 'PE'}:
        start_dt = to_dt - timedelta(days=35)
    elif instrument_type == 'FUT':
        start_dt = _add_months(to_dt, -2)
    else:
        start_dt = _parse_date(from_date)
    if start_dt > to_dt:
        start_dt = to_dt
    return _format_date(start_dt), to_date


def _spot_desired_range(snapshot: dict, fallback_from: str, to_date: str) -> Tuple[str, str]:
    expiries = snapshot.get('expiries') or []
    min_expiry: Optional[date] = None
    for expiry in expiries:
        try:
            expiry_dt = _parse_date(str(expiry))
        except ValueError:
            continue
        if min_expiry is None or expiry_dt < min_expiry:
            min_expiry = expiry_dt
    if min_expiry is None:
        desired_from = _parse_date(fallback_from)
    else:
        desired_from = min_expiry
    # Upstox v3 historical candle API enforces a max date span; cap to last 365 days.
    max_span_start = _parse_date(to_date) - timedelta(days=365)
    if desired_from < max_span_start:
        desired_from = max_span_start
    return _format_date(desired_from), to_date


def _expiries_between(snapshot: dict, from_date: str, to_date: str) -> List[str]:
    expiries = snapshot.get('expiries') or []
    start = _parse_date(from_date)
    end = _parse_date(to_date)
    if start > end:
        start, end = end, start
    in_range: List[str] = []
    for expiry in expiries:
        try:
            expiry_date = _parse_date(str(expiry))
        except ValueError:
            continue
        if start <= expiry_date <= end:
            in_range.append(str(expiry))
    return sorted(in_range)


def _update_job(job_id: str, **updates: object) -> None:
    with OHLC_JOBS_LOCK:
        job = OHLC_JOBS.get(job_id)
        if not job:
            return
        job.update(updates)


def _get_job_snapshot(job_id: str) -> Optional[Dict[str, object]]:
    with OHLC_JOBS_LOCK:
        job = OHLC_JOBS.get(job_id)
        if not job:
            return None
        return dict(job)


class JobControlError(RuntimeError):
    pass


class InvalidTokenError(RuntimeError):
    pass


def _add_failure_sample(job_id: str, instrument_key: str, detail: str) -> None:
    with OHLC_JOBS_LOCK:
        job = OHLC_JOBS.get(job_id)
        if not job:
            return
        samples = job.setdefault('failure_samples', [])
        if isinstance(samples, list) and len(samples) < 20:
            samples.append({'instrument_key': instrument_key, 'detail': detail})
    logger.warning('OHLC fetch failed: %s %s', instrument_key, detail)


def _format_fetch_error(exc: Exception) -> str:
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        body = exc.response.text
        snippet = body[:200].replace('\n', ' ')
        return f'http_{exc.response.status_code}: {snippet}'
    if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
        body = exc.response.text
        snippet = body[:200].replace('\n', ' ')
        return f'http_{exc.response.status_code}: {snippet}'
    return str(exc)


def _is_invalid_token_error(exc: Exception) -> bool:
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        if exc.response.status_code == 401:
            body = exc.response.text.upper()
            return 'INVALID TOKEN' in body or 'UDAPI100050' in body
    if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
        if exc.response.status_code == 401:
            body = exc.response.text.upper()
            return 'INVALID TOKEN' in body or 'UDAPI100050' in body
    text = str(exc).upper()
    return 'INVALID TOKEN' in text or 'UDAPI100050' in text


def _retry_delay_seconds(resp: Optional[requests.Response], attempt: int) -> float:
    if resp is not None:
        retry_after = resp.headers.get('Retry-After')
        if retry_after:
            try:
                return max(1.0, float(retry_after))
            except ValueError:
                pass
    base = min(12.0, 1.5 * (2 ** max(0, attempt - 1)))
    jitter = random.uniform(0.0, 0.75)
    return base + jitter


def _pace_upstox_request() -> None:
    global LAST_UPSTOX_REQUEST_TS
    with UPSTOX_REQUEST_LOCK:
        now = time.time()
        wait_for = MIN_UPSTOX_REQUEST_GAP_SECONDS - (now - LAST_UPSTOX_REQUEST_TS)
        if wait_for > 0:
            time.sleep(wait_for)
        LAST_UPSTOX_REQUEST_TS = time.time()


def _get_async_upstox_request_lock() -> asyncio.Lock:
    global ASYNC_UPSTOX_REQUEST_LOCK
    if ASYNC_UPSTOX_REQUEST_LOCK is None:
        ASYNC_UPSTOX_REQUEST_LOCK = asyncio.Lock()
    return ASYNC_UPSTOX_REQUEST_LOCK


async def _async_pace_upstox_request() -> None:
    global LAST_UPSTOX_REQUEST_TS
    lock = _get_async_upstox_request_lock()
    async with lock:
        now = time.time()
        wait_for = MIN_UPSTOX_REQUEST_GAP_SECONDS - (now - LAST_UPSTOX_REQUEST_TS)
        if wait_for > 0:
            await asyncio.sleep(wait_for)
        LAST_UPSTOX_REQUEST_TS = time.time()


def _job_control_state(job_id: Optional[str]) -> str:
    if not job_id:
        return 'running'
    snapshot = _get_job_snapshot(job_id)
    if not snapshot:
        return 'stopped'
    return str(snapshot.get('control_state') or 'running')


def _controlled_sleep(job_id: Optional[str], seconds: float) -> None:
    remaining = seconds
    while remaining > 0:
        state = _job_control_state(job_id)
        if state == 'stopped':
            raise JobControlError('Job stopped by user.')
        if state == 'paused':
            _update_job(job_id or '', status='paused', message='Paused by user.')
            time.sleep(0.25)
            continue
        step = min(0.25, remaining)
        time.sleep(step)
        remaining -= step


async def _async_controlled_sleep(job_id: Optional[str], seconds: float) -> None:
    remaining = seconds
    while remaining > 0:
        state = _job_control_state(job_id)
        if state == 'stopped':
            raise JobControlError('Job stopped by user.')
        if state == 'paused':
            _update_job(job_id or '', status='paused', message='Paused by user.')
            await asyncio.sleep(0.25)
            continue
        step = min(0.25, remaining)
        await asyncio.sleep(step)
        remaining -= step


def _honor_job_control(job_id: Optional[str]) -> None:
    state = _job_control_state(job_id)
    if state == 'stopped':
        raise JobControlError('Job stopped by user.')
    if state == 'paused':
        _update_job(job_id or '', status='paused', message='Paused by user.')
        while _job_control_state(job_id) == 'paused':
            time.sleep(0.25)
        if _job_control_state(job_id) == 'stopped':
            raise JobControlError('Job stopped by user.')
        _update_job(job_id or '', status='running', message='Resumed. Continuing OHLC fetch...')


async def _async_honor_job_control(job_id: Optional[str]) -> None:
    state = _job_control_state(job_id)
    if state == 'stopped':
        raise JobControlError('Job stopped by user.')
    if state == 'paused':
        _update_job(job_id or '', status='paused', message='Paused by user.')
        while _job_control_state(job_id) == 'paused':
            await asyncio.sleep(0.25)
        if _job_control_state(job_id) == 'stopped':
            raise JobControlError('Job stopped by user.')
        _update_job(job_id or '', status='running', message='Resumed. Continuing OHLC fetch...')


def _get_json_with_backoff(
    url: str,
    *,
    headers: Dict[str, str],
    timeout: int,
    job_id: Optional[str] = None,
    max_attempts: int = 6,
) -> requests.Response:
    last_response: Optional[requests.Response] = None
    for attempt in range(1, max_attempts + 1):
        _honor_job_control(job_id)
        _pace_upstox_request()
        resp = requests.get(url, headers=headers, timeout=timeout)
        last_response = resp
        if resp.status_code != 429:
            return resp
        delay = _retry_delay_seconds(resp, attempt)
        logger.warning('Rate limited by Upstox for %s on attempt %s/%s. Sleeping %.2fs.', url, attempt, max_attempts, delay)
        _controlled_sleep(job_id, delay)
    assert last_response is not None
    return last_response


async def _async_get_json_with_backoff(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: Dict[str, str],
    timeout: int,
    params: Optional[Dict[str, str]] = None,
    job_id: Optional[str] = None,
    max_attempts: int = 6,
) -> httpx.Response:
    last_response: Optional[httpx.Response] = None
    for attempt in range(1, max_attempts + 1):
        await _async_honor_job_control(job_id)
        await _async_pace_upstox_request()
        resp = await client.get(url, headers=headers, params=params, timeout=timeout)
        last_response = resp
        if resp.status_code != 429:
            return resp
        delay = _retry_delay_seconds(resp, attempt)
        logger.warning('Rate limited by Upstox for %s on attempt %s/%s. Sleeping %.2fs.', url, attempt, max_attempts, delay)
        await _async_controlled_sleep(job_id, delay)
    assert last_response is not None
    return last_response


def _fetch_expired_candle_with_meta(
    access_token: str,
    expired_instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    job_id: Optional[str] = None,
) -> Tuple[List[List[object]], int, str, str]:
    url = f'{UPSTOX_BASE}/v2/expired-instruments/historical-candle/{expired_instrument_key}/{interval}/{to_date}/{from_date}'
    resp = _get_json_with_backoff(
        url,
        headers={
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        timeout=20,
        job_id=job_id,
    )
    status_code = resp.status_code
    body_text = resp.text
    try:
        payload = resp.json()
    except ValueError:
        payload = None
    if status_code != 200:
        resp.raise_for_status()
    candles: List[List[object]] = []
    if isinstance(payload, dict):
        candles = payload.get('data', {}).get('candles', []) or []
        body_text = json.dumps(payload, ensure_ascii=False)
    return candles, status_code, url, body_text


async def _fetch_expired_contracts_for_expiry_async(
    client: httpx.AsyncClient,
    access_token: str,
    underlying_key: str,
    expiry_date: str,
    job_id: Optional[str] = None,
) -> List[Dict[str, str]]:
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    options_url = f'{UPSTOX_BASE}/v2/expired-instruments/option/contract'
    futures_url = f'{UPSTOX_BASE}/v2/expired-instruments/future/contract'
    contracts: List[Dict[str, str]] = []
    for url in (options_url, futures_url):
        resp = await _async_get_json_with_backoff(
            client,
            url,
            headers=headers,
            params={'instrument_key': underlying_key, 'expiry_date': expiry_date},
            timeout=20,
            job_id=job_id,
        )
        if resp.status_code != 200:
            continue
        data = resp.json().get('data', []) or []
        for item in data:
            contracts.append(
                {
                    'instrument_key': str(item.get('instrument_key') or ''),
                    'trading_symbol': str(item.get('trading_symbol') or ''),
                    'instrument_type': str(item.get('instrument_type') or ''),
                    'strike_price': str(item.get('strike_price') or ''),
                    'expiry': str(item.get('expiry') or expiry_date),
                    'segment': str(item.get('segment') or ''),
                }
            )
    return contracts


async def _fetch_expired_candle_with_meta_async(
    client: httpx.AsyncClient,
    access_token: str,
    expired_instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    job_id: Optional[str] = None,
) -> Tuple[List[List[object]], int, str, str]:
    url = f'{UPSTOX_BASE}/v2/expired-instruments/historical-candle/{expired_instrument_key}/{interval}/{to_date}/{from_date}'
    resp = await _async_get_json_with_backoff(
        client,
        url,
        headers={
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        timeout=20,
        job_id=job_id,
    )
    status_code = resp.status_code
    body_text = resp.text
    try:
        payload = resp.json()
    except ValueError:
        payload = None
    if status_code != 200:
        resp.raise_for_status()
    candles: List[List[object]] = []
    if isinstance(payload, dict):
        candles = payload.get('data', {}).get('candles', []) or []
        body_text = json.dumps(payload, ensure_ascii=False)
    return candles, status_code, url, body_text


def _spot_interval_path(interval: str) -> str:
    if interval == 'day':
        return 'days/1'
    if interval.endswith('minute'):
        try:
            minutes = int(interval.replace('minute', ''))
        except ValueError:
            minutes = 1
        return f'minutes/{minutes}'
    return 'minutes/1'


def _fetch_spot_candle_with_meta(
    access_token: str,
    instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    job_id: Optional[str] = None,
) -> Tuple[List[List[object]], int, str, str]:
    interval_path = _spot_interval_path(interval)
    url = f'{UPSTOX_BASE}/v3/historical-candle/{instrument_key}/{interval_path}/{to_date}/{from_date}'
    resp = _get_json_with_backoff(
        url,
        headers={
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        timeout=20,
        job_id=job_id,
    )
    status_code = resp.status_code
    body_text = resp.text
    try:
        payload = resp.json()
    except ValueError:
        payload = None
    if status_code != 200:
        resp.raise_for_status()
    candles: List[List[object]] = []
    if isinstance(payload, dict):
        candles = payload.get('data', {}).get('candles', []) or []
        body_text = json.dumps(payload, ensure_ascii=False)
    return candles, status_code, url, body_text


async def _fetch_spot_candle_with_meta_async(
    client: httpx.AsyncClient,
    access_token: str,
    instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    job_id: Optional[str] = None,
) -> Tuple[List[List[object]], int, str, str]:
    interval_path = _spot_interval_path(interval)
    url = f'{UPSTOX_BASE}/v3/historical-candle/{instrument_key}/{interval_path}/{to_date}/{from_date}'
    resp = await _async_get_json_with_backoff(
        client,
        url,
        headers={
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        timeout=20,
        job_id=job_id,
    )
    status_code = resp.status_code
    body_text = resp.text
    try:
        payload = resp.json()
    except ValueError:
        payload = None
    if status_code != 200:
        resp.raise_for_status()
    candles: List[List[object]] = []
    if isinstance(payload, dict):
        candles = payload.get('data', {}).get('candles', []) or []
        body_text = json.dumps(payload, ensure_ascii=False)
    return candles, status_code, url, body_text


def _fetch_spot_candles_range(
    access_token: str,
    instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    job_id: Optional[str] = None,
) -> Tuple[List[List[object]], int, str, str]:
    start_dt = _parse_date(from_date)
    end_dt = _parse_date(to_date)
    if start_dt > end_dt:
        start_dt, end_dt = end_dt, start_dt
    candles: List[List[object]] = []
    status_code = 200
    last_url = ''
    last_body = ''
    chunk_days = 25
    current = start_dt
    while current <= end_dt:
        chunk_end = min(current + timedelta(days=chunk_days), end_dt)
        chunk_from = _format_date(current)
        chunk_to = _format_date(chunk_end)
        data, status_code, last_url, last_body = _fetch_spot_candle_with_meta(
            access_token,
            instrument_key,
            interval,
            chunk_from,
            chunk_to,
            job_id=job_id,
        )
        if not data:
            return [], status_code, last_url, last_body
        candles.extend(data)
        current = chunk_end + timedelta(days=1)
    return candles, status_code, last_url, last_body


async def _fetch_spot_candles_range_async(
    client: httpx.AsyncClient,
    access_token: str,
    instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    job_id: Optional[str] = None,
) -> Tuple[List[List[object]], int, str, str]:
    start_dt = _parse_date(from_date)
    end_dt = _parse_date(to_date)
    if start_dt > end_dt:
        start_dt, end_dt = end_dt, start_dt
    candles: List[List[object]] = []
    status_code = 200
    last_url = ''
    last_body = ''
    chunk_days = 25
    current = start_dt
    while current <= end_dt:
        chunk_end = min(current + timedelta(days=chunk_days), end_dt)
        chunk_from = _format_date(current)
        chunk_to = _format_date(chunk_end)
        data, status_code, last_url, last_body = await _fetch_spot_candle_with_meta_async(
            client,
            access_token,
            instrument_key,
            interval,
            chunk_from,
            chunk_to,
            job_id=job_id,
        )
        if not data:
            return [], status_code, last_url, last_body
        candles.extend(data)
        current = chunk_end + timedelta(days=1)
    return candles, status_code, last_url, last_body


def _format_exception(exc: Exception) -> str:
    return f'{exc.__class__.__name__}: {exc}'


def _tail_log(path: Path, limit: int = 200) -> List[str]:
    if not path.exists():
        return []
    lines = path.read_text(encoding='utf-8').splitlines()
    return lines[-limit:]


def _clear_log(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('', encoding='utf-8')


async def _run_ohlc_job(
    job_id: str,
    access_token: str,
    underlying_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    include_spot: bool,
    include_futures: bool,
    include_options: bool,
) -> None:
    try:
        snapshot = _load_snapshot(underlying_key)
        if not snapshot:
            await asyncio.to_thread(collect_expired_contracts, access_token, underlyings=[underlying_key], max_expiries=120)
            snapshot = _load_snapshot(underlying_key)
        if not snapshot:
            _update_job(job_id, status='error', message='Snapshot not found for underlying.')
            return

        expiries = _expiries_between(snapshot, from_date, to_date)
        if not expiries:
            _update_job(job_id, status='error', message='No expiries found in the selected date range.')
            return

        contracts: Dict[str, Dict[str, str]] = {}
        async with httpx.AsyncClient(
            limits=httpx.Limits(max_connections=max(OHLC_FETCH_MAX_WORKERS + OHLC_EXPIRY_DISCOVERY_MAX_CONCURRENCY + 2, 6)),
            follow_redirects=True,
        ) as client:
            expiry_semaphore = asyncio.Semaphore(OHLC_EXPIRY_DISCOVERY_MAX_CONCURRENCY)

            async def _fetch_contracts_for_expiry(expiry: str) -> List[Dict[str, str]]:
                async with expiry_semaphore:
                    await _async_honor_job_control(job_id)
                    return await _fetch_expired_contracts_for_expiry_async(
                        client,
                        access_token,
                        underlying_key,
                        expiry,
                        job_id=job_id,
                    )

            expiry_tasks = [asyncio.create_task(_fetch_contracts_for_expiry(expiry)) for expiry in expiries]
            for task in asyncio.as_completed(expiry_tasks):
                for contract in await task:
                    instrument_type = contract.get('instrument_type', '').upper()
                    if instrument_type.startswith('FUT'):
                        instrument_type = 'FUT'
                        contract['instrument_type'] = 'FUT'
                    if instrument_type in {'CE', 'PE'} and not include_options:
                        continue
                    if instrument_type == 'FUT' and not include_futures:
                        continue
                    if instrument_type not in {'CE', 'PE', 'FUT'}:
                        continue
                    contracts[contract['instrument_key']] = contract
        if include_spot:
            contracts[underlying_key] = {
                'instrument_key': underlying_key,
                'instrument_type': 'SPOT',
                'trading_symbol': '',
                'expiry': '',
                'segment': '',
                'strike_price': '',
            }

        total = len(contracts)
        if total == 0:
            _update_job(job_id, status='error', message='No expired contracts found for the selected range.')
            return

        job_output_dir = JOB_DB_ROOT / f'ohlc_{job_id}'
        job_output_dir.mkdir(parents=True, exist_ok=True)
        try:
            (job_output_dir / 'meta.json').write_text(
                json.dumps(
                    {
                        'underlying_key': underlying_key,
                        'interval': interval,
                        'from_date': from_date,
                        'to_date': to_date,
                        'include_spot': include_spot,
                        'include_futures': include_futures,
                        'include_options': include_options,
                    },
                    ensure_ascii=False,
                ),
                encoding='utf-8',
            )
        except OSError:
            logger.warning('Could not write job metadata for %s', job_id)
        job_parquet_path = job_output_dir / 'ohlc_job.parquet'
        writer: Optional[pq.ParquetWriter] = None
        index_entries: List[Dict[str, object]] = []
        empty_index_entries: List[Dict[str, object]] = []
        _update_job(
            job_id,
            total=total,
            completed=0,
            stored_rows=0,
            failed_instruments=0,
            skipped_instruments=0,
            job_db_path=str(job_output_dir),
            job_parquet_path=str(job_parquet_path),
        )

        keys_to_fetch: List[Tuple[str, str, str, str]] = []
        skipped = 0
        for key, contract in contracts.items():
            instrument_type = str(contract.get('instrument_type') or '').upper()
            if instrument_type == 'SPOT':
                desired_from, desired_to = _spot_desired_range(snapshot, from_date, to_date)
                desired_to_dt = _parse_date(desired_to)
                max_to_dt = _max_index_to_date(key, interval)
                if max_to_dt is not None and max_to_dt >= desired_to_dt:
                    skipped += 1
                    continue
                if max_to_dt is not None:
                    range_from = _format_date(max_to_dt + timedelta(days=1))
                else:
                    range_from = desired_from
                range_to = desired_to
                if _parse_date(range_from) > desired_to_dt:
                    skipped += 1
                    continue
            else:
                effective_to = to_date
                expiry_value = str(contract.get('expiry') or '').strip()
                if expiry_value:
                    try:
                        expiry_dt = _parse_date(expiry_value)
                        if expiry_dt < _parse_date(effective_to):
                            effective_to = expiry_value
                    except ValueError:
                        pass
                range_from, range_to = _adjust_range_by_instrument(instrument_type, from_date, effective_to)
                if _index_has_range(key, underlying_key, interval, range_from, range_to):
                    skipped += 1
                    continue
            keys_to_fetch.append((key, instrument_type, range_from, range_to))

        if skipped:
            _update_job(job_id, skipped_instruments=skipped, completed=skipped)

        max_workers = min(OHLC_FETCH_MAX_WORKERS, len(keys_to_fetch)) if keys_to_fetch else 0
        if max_workers == 0:
            _update_job(job_id, status='completed', message='Nothing new to store.')
            return

        async with httpx.AsyncClient(
            limits=httpx.Limits(max_connections=max(OHLC_FETCH_MAX_WORKERS + 2, 4)),
            follow_redirects=True,
        ) as client:
            async def _fetch_one(
                key: str,
                instrument_type: str,
                range_from: str,
                range_to: str,
            ) -> Tuple[str, Optional[List[List[object]]], str, str, str]:
                data = None
                last_error: Optional[Exception] = None
                for _ in range(3):
                    try:
                        await _async_honor_job_control(job_id)
                        if instrument_type == 'SPOT':
                            candles, status_code, url, body = await _fetch_spot_candles_range_async(
                                client,
                                access_token,
                                key,
                                interval,
                                range_from,
                                range_to,
                                job_id=job_id,
                            )
                        else:
                            candles, status_code, url, body = await _fetch_expired_candle_with_meta_async(
                                client,
                                access_token,
                                key,
                                interval,
                                range_from,
                                range_to,
                                job_id=job_id,
                            )
                        data = candles
                        if data:
                            break
                        last_error = RuntimeError(
                            f'empty_candles: status={status_code} url={url} body={body}'
                        )
                    except Exception as exc:
                        if _is_invalid_token_error(exc):
                            raise InvalidTokenError('Upstox token expired or became invalid during OHLC fetch.')
                        last_error = exc
                    await _async_controlled_sleep(job_id, 1.5)
                if not data:
                    detail = _format_fetch_error(last_error) if last_error else 'unknown_error'
                    return key, None, detail, range_from, range_to
                return key, data, '', range_from, range_to

            fetch_semaphore = asyncio.Semaphore(max_workers)

            async def _fetch_with_semaphore(
                key: str,
                instrument_type: str,
                range_from: str,
                range_to: str,
            ) -> Tuple[str, Optional[List[List[object]]], str, str, str]:
                async with fetch_semaphore:
                    return await _fetch_one(key, instrument_type, range_from, range_to)

            fetch_tasks = [
                asyncio.create_task(_fetch_with_semaphore(key, instrument_type, range_from, range_to))
                for key, instrument_type, range_from, range_to in keys_to_fetch
            ]
            for task in asyncio.as_completed(fetch_tasks):
                instrument_key = ''
                range_from = ''
                range_to = ''
                error_detail = ''
                data: Optional[List[List[object]]] = None
                try:
                    instrument_key, data, error_detail, range_from, range_to = await task
                except InvalidTokenError as exc:
                    _update_job(job_id, status='error', message=str(exc), control_state='stopped')
                    return
                except Exception as exc:
                    logger.exception('OHLC worker crashed: %s', exc)
                    error_detail = _format_exception(exc)

                stored = 0
                failed = False
                if data:
                    error_detail = ''
                    try:
                        table = _build_parquet_table(
                            instrument_key,
                            interval,
                            range_from,
                            range_to,
                            data,
                        )
                        if table is None:
                            stored = 0
                        else:
                            if writer is None:
                                writer = pq.ParquetWriter(job_parquet_path, table.schema)
                            writer.write_table(table)
                            stored = table.num_rows
                    except Exception as exc:
                        stored = 0
                        failed = True
                        error_detail = _format_exception(exc)
                else:
                    failed = True
                    if error_detail.startswith('empty_candles:'):
                        empty_index_entries.append(
                            _make_index_entry(
                                instrument_key,
                                underlying_key,
                                interval,
                                range_from,
                                range_to,
                                0,
                                status='empty',
                            )
                        )
                        failed = False
                if stored:
                    index_entries.append(
                        _make_index_entry(
                            instrument_key,
                            underlying_key,
                            interval,
                            range_from,
                            range_to,
                            stored,
                        )
                    )

                with OHLC_JOBS_LOCK:
                    job = OHLC_JOBS.get(job_id)
                    if not job:
                        continue
                    job['completed'] = int(job.get('completed', 0)) + 1
                    job['stored_rows'] = int(job.get('stored_rows', 0)) + stored
                    job['failed_instruments'] = int(job.get('failed_instruments', 0)) + (1 if failed else 0)

                if failed and error_detail:
                    _add_failure_sample(job_id, instrument_key, error_detail)

        if writer is not None:
            writer.close()

        merged = 0
        try:
            merged = _append_master_parquet(job_parquet_path)
            _append_index_entries(index_entries)
            _append_index_entries(empty_index_entries)
            _update_job(
                job_id,
                status='completed',
                message=f'Stored OHLC parquet file. Merged {merged} rows into master parquet.',
            )
        except Exception as exc:
            logger.warning('Parquet merge failed for %s: %s', job_output_dir, exc)
            _update_job(
                job_id,
                status='completed',
                message='Stored OHLC parquet file. Merge to master parquet failed.',
            )
    except Exception as exc:
        if 'writer' in locals() and writer is not None:
            try:
                writer.close()
            except Exception:
                pass
        if isinstance(exc, JobControlError):
            logger.info('OHLC job %s stopped/paused control exit: %s', job_id, exc)
            _update_job(job_id, status='stopped', message=str(exc))
            return
        logger.exception('OHLC job failed: %s', exc)
        _update_job(job_id, status='error', message=f'Job failed: {exc}')


def _load_snapshot(instrument_key: str) -> Optional[dict]:
    if not EXPIRED_CACHE_ROOT.exists():
        EXPIRED_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
        return None
    for entry in EXPIRED_CACHE_ROOT.iterdir():
        if not entry.is_dir():
            continue
        candidate = entry / 'expired_contracts.json'
        if not candidate.exists():
            continue
        try:
            payload = json.loads(candidate.read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            continue
        if payload.get('instrument_key') == instrument_key:
            return payload
    return None


def _ensure_storage_dirs() -> None:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    PARQUET_ROOT.mkdir(parents=True, exist_ok=True)
    JOB_DB_ROOT.mkdir(parents=True, exist_ok=True)


def _get_db_conn() -> duckdb.DuckDBPyConnection:
    global _DB_CONN
    if _DB_CONN is None:
        _DB_CONN = duckdb.connect(str(DB_PATH))
    return _DB_CONN


def _reset_db_conn() -> duckdb.DuckDBPyConnection:
    """Close and reopen the global DuckDB connection to clear stale file handles."""
    global _DB_CONN
    if _DB_CONN is not None:
        try:
            _DB_CONN.close()
        except Exception:
            pass
        _DB_CONN = None
    _DB_CONN = duckdb.connect(str(DB_PATH))
    return _DB_CONN


def _reset_db_conn_silent() -> None:
    """Close the global DuckDB connection without reopening. Must hold DB_WRITE_LOCK."""
    global _DB_CONN
    if _DB_CONN is not None:
        try:
            _DB_CONN.close()
        except Exception:
            pass
        _DB_CONN = None


def _sanitize_filename(value: str) -> str:
    safe = ''.join(ch if ch.isalnum() or ch in ('_', '-', '.') else '_' for ch in value)
    return safe.strip('_') or 'unknown'


def _build_parquet_table(
    instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    candles: Sequence[Sequence[object]],
) -> Optional[pa.Table]:
    rows: List[Tuple[str, str, str, str, str, float, float, float, float, float]] = []
    for candle in candles:
        if len(candle) < 6:
            continue
        rows.append(
            (
                instrument_key,
                interval,
                from_date,
                to_date,
                str(candle[0]),
                float(candle[1]),
                float(candle[2]),
                float(candle[3]),
                float(candle[4]),
                float(candle[5]),
            )
        )
    if not rows:
        return None
    return pa.table(
        {
            'instrument_key': [r[0] for r in rows],
            'interval': [r[1] for r in rows],
            'from_date': [r[2] for r in rows],
            'to_date': [r[3] for r in rows],
            'ts': [r[4] for r in rows],
            'open': [r[5] for r in rows],
            'high': [r[6] for r in rows],
            'low': [r[7] for r in rows],
            'close': [r[8] for r in rows],
            'volume': [r[9] for r in rows],
        }
    )


def _read_index_table() -> Optional[pa.Table]:
    if not MASTER_INDEX_PARQUET.exists():
        return None
    return pq.read_table(MASTER_INDEX_PARQUET)


def _index_has_range(
    instrument_key: str,
    underlying_key: str,
    interval: str,
    from_date: str,
    to_date: str,
) -> bool:
    table = _read_index_table()
    if table is None or table.num_rows == 0:
        return False
    key_col = table.column('instrument_key').to_pylist()
    has_underlying = 'underlying_key' in table.column_names
    underlying_col = table.column('underlying_key').to_pylist() if has_underlying else []
    interval_col = table.column('interval').to_pylist()
    from_col = table.column('from_date').to_pylist()
    to_col = table.column('to_date').to_pylist()
    for idx in range(table.num_rows):
        if key_col[idx] != instrument_key:
            continue
        if has_underlying and underlying_col[idx] != underlying_key:
            continue
        if (
            interval_col[idx] == interval
            and from_col[idx] == from_date
            and to_col[idx] == to_date
        ):
            return True
    return False


def _max_index_to_date(instrument_key: str, interval: str) -> Optional[date]:
    table = _read_index_table()
    if table is None or table.num_rows == 0:
        return None
    key_col = table.column('instrument_key').to_pylist()
    interval_col = table.column('interval').to_pylist()
    to_col = table.column('to_date').to_pylist()
    max_dt: Optional[date] = None
    for idx in range(table.num_rows):
        if key_col[idx] != instrument_key:
            continue
        if interval_col[idx] != interval:
            continue
        try:
            candidate = _parse_date(str(to_col[idx]))
        except ValueError:
            continue
        if max_dt is None or candidate > max_dt:
            max_dt = candidate
    return max_dt


def _make_index_entry(
    instrument_key: str,
    underlying_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    rows: int,
    status: str = 'stored',
) -> Dict[str, object]:
    return {
        'instrument_key': instrument_key,
        'underlying_key': underlying_key,
        'interval': interval,
        'from_date': from_date,
        'to_date': to_date,
        'rows': rows,
        'status': status,
    }


def _append_master_parquet(job_parquet_path: Path) -> int:
    _ensure_storage_dirs()
    if not job_parquet_path.exists():
        return 0
    job_table = pq.read_table(job_parquet_path)
    if job_table.num_rows == 0:
        return 0
    if MASTER_CANDLES_PARQUET.exists():
        master_table = pq.read_table(MASTER_CANDLES_PARQUET)
        combined = pa.concat_tables([master_table, job_table])
    else:
        combined = job_table
    temp_path = MASTER_CANDLES_PARQUET.with_suffix(f'{MASTER_CANDLES_PARQUET.suffix}.tmp')
    pq.write_table(combined, temp_path)
    temp_path.replace(MASTER_CANDLES_PARQUET)
    return int(job_table.num_rows)


def _append_index_entries(entries: List[Dict[str, object]]) -> None:
    if not entries:
        return
    _ensure_storage_dirs()
    now = datetime.utcnow().isoformat()
    new_table = pa.table(
        {
            'instrument_key': [entry['instrument_key'] for entry in entries],
            'underlying_key': [entry['underlying_key'] for entry in entries],
            'interval': [entry['interval'] for entry in entries],
            'from_date': [entry['from_date'] for entry in entries],
            'to_date': [entry['to_date'] for entry in entries],
            'rows': [entry['rows'] for entry in entries],
            'status': [str(entry.get('status') or 'stored') for entry in entries],
            'updated_at': [now for _ in entries],
        }
    )
    if MASTER_INDEX_PARQUET.exists():
        existing = pq.read_table(MASTER_INDEX_PARQUET)
        if 'underlying_key' not in existing.column_names:
            existing = existing.append_column(
                'underlying_key',
                pa.array(['' for _ in range(existing.num_rows)]),
            )
        if 'status' not in existing.column_names:
            existing = existing.append_column(
                'status',
                pa.array(['stored' for _ in range(existing.num_rows)]),
            )
        combined = pa.concat_tables([existing, new_table], promote=True)
    else:
        combined = new_table
    temp_path = MASTER_INDEX_PARQUET.with_suffix(f'{MASTER_INDEX_PARQUET.suffix}.tmp')
    pq.write_table(combined, temp_path)
    temp_path.replace(MASTER_INDEX_PARQUET)


def _index_entries_from_job_parquet(
    job_parquet_path: Path,
    underlying_key: Optional[str] = None,
) -> List[Dict[str, object]]:
    if not job_parquet_path.exists():
        return []
    table = pq.read_table(job_parquet_path)
    if table.num_rows == 0:
        return []
    keys = table.column('instrument_key').to_pylist()
    intervals = table.column('interval').to_pylist()
    from_dates = table.column('from_date').to_pylist()
    to_dates = table.column('to_date').to_pylist()
    counts: Dict[Tuple[str, str, str, str], int] = {}
    for idx in range(table.num_rows):
        key = (keys[idx], intervals[idx], from_dates[idx], to_dates[idx])
        counts[key] = counts.get(key, 0) + 1
    entries: List[Dict[str, object]] = []
    for (instrument_key, interval, from_date, to_date), rows in counts.items():
        entries.append(_make_index_entry(instrument_key, underlying_key or '', interval, from_date, to_date, rows))
    return entries


def _merge_job_parquet(job_dir: Path) -> int:
    if not job_dir.exists():
        raise FileNotFoundError(f'Job output dir not found: {job_dir}')
    parquet_path = job_dir / 'ohlc_job.parquet'
    if not parquet_path.exists():
        return 0
    merged = _append_master_parquet(parquet_path)
    meta_path = job_dir / 'meta.json'
    underlying_key = None
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding='utf-8'))
            underlying_key = str(meta.get('underlying_key') or '') or None
        except (json.JSONDecodeError, OSError):
            underlying_key = None
    entries = _index_entries_from_job_parquet(parquet_path, underlying_key=underlying_key)
    _append_index_entries(entries)
    return merged


def _query_master_candles(
    instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    limit: int,
    offset: int,
) -> Tuple[int, List[Dict[str, object]]]:
    if not MASTER_CANDLES_PARQUET.exists():
        return 0, []
    con = _get_db_conn()
    count_query = """
        SELECT COUNT(*)
        FROM read_parquet(?)
        WHERE instrument_key = ? AND interval = ? AND from_date = ? AND to_date = ?
    """
    total = con.execute(
        count_query,
        [str(MASTER_CANDLES_PARQUET), instrument_key, interval, from_date, to_date],
    ).fetchone()[0]
    data_query = """
        SELECT ts, open, high, low, close, volume
        FROM read_parquet(?)
        WHERE instrument_key = ? AND interval = ? AND from_date = ? AND to_date = ?
        ORDER BY ts
        LIMIT ? OFFSET ?
    """
    rows = con.execute(
        data_query,
        [str(MASTER_CANDLES_PARQUET), instrument_key, interval, from_date, to_date, limit, offset],
    ).fetchall()
    payload: List[Dict[str, object]] = []
    for row in rows:
        payload.append(
            {
                'ts': row[0],
                'open': row[1],
                'high': row[2],
                'low': row[3],
                'close': row[4],
                'volume': row[5],
            }
        )
    return int(total), payload


def _write_contracts_to_duckdb(instrument_key: str, snapshot: dict) -> int:
    _ensure_storage_dirs()
    rows: List[Tuple[str, str, str]] = []
    for expiry, contracts in (snapshot.get('options') or {}).items():
        for contract in contracts:
            rows.append((instrument_key, expiry, json.dumps(contract, ensure_ascii=False)))
    for expiry, contracts in (snapshot.get('futures') or {}).items():
        for contract in contracts:
            rows.append((instrument_key, expiry, json.dumps(contract, ensure_ascii=False)))
    if not rows:
        return 0
    with DB_WRITE_LOCK:
        con = _get_db_conn()
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS expired_contracts (
                instrument_key TEXT,
                expiry TEXT,
                payload JSON
            )
            """
        )
        con.executemany(
            "INSERT INTO expired_contracts (instrument_key, expiry, payload) VALUES (?, ?, ?)",
            rows,
        )
        parquet_path = PARQUET_ROOT / 'expired_contracts.parquet'
        con.execute(
            "COPY (SELECT * FROM expired_contracts) TO ? (FORMAT 'parquet')",
            [str(parquet_path)],
        )
    return len(rows)


def _write_candles_to_duckdb(
    instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
    candles: Sequence[Sequence[object]],
    export_parquet: bool = True,
    db_path: Optional[Path] = None,
    db_conn: Optional[duckdb.DuckDBPyConnection] = None,
) -> int:
    _ensure_storage_dirs()
    rows: List[Tuple[str, str, str, str, object, object, object, object, object, object]] = []
    for candle in candles:
        if len(candle) < 6:
            continue
        rows.append(
            (
                instrument_key,
                interval,
                from_date,
                to_date,
                candle[0],
                candle[1],
                candle[2],
                candle[3],
                candle[4],
                candle[5],
            )
        )
    if not rows:
        return 0
    last_error: Optional[Exception] = None
    for attempt in range(3):
        try:
            if db_conn is not None:
                con = db_conn
                con.execute(
                    """
                    CREATE TABLE IF NOT EXISTS expired_candles (
                        instrument_key TEXT,
                        interval TEXT,
                        from_date TEXT,
                        to_date TEXT,
                        ts TIMESTAMP,
                        open DOUBLE,
                        high DOUBLE,
                        low DOUBLE,
                        close DOUBLE,
                        volume DOUBLE
                    )
                    """
                )
                con.executemany(
                    """
                    INSERT INTO expired_candles
                    (instrument_key, interval, from_date, to_date, ts, open, high, low, close, volume)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    rows,
                )
            elif db_path is None:
                with DB_WRITE_LOCK:
                    con = _get_db_conn()
                    con.execute(
                        """
                        CREATE TABLE IF NOT EXISTS expired_candles (
                            instrument_key TEXT,
                            interval TEXT,
                            from_date TEXT,
                            to_date TEXT,
                            ts TIMESTAMP,
                            open DOUBLE,
                            high DOUBLE,
                            low DOUBLE,
                            close DOUBLE,
                            volume DOUBLE
                        )
                        """
                    )
                    con.executemany(
                        """
                        INSERT INTO expired_candles
                        (instrument_key, interval, from_date, to_date, ts, open, high, low, close, volume)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        rows,
                    )
                    if export_parquet:
                        parquet_path = PARQUET_ROOT / 'expired_candles.parquet'
                        con.execute(
                            "COPY (SELECT * FROM expired_candles) TO ? (FORMAT 'parquet')",
                            [str(parquet_path)],
                        )
            else:
                con = duckdb.connect(str(db_path))
                try:
                    con.execute(
                        """
                        CREATE TABLE IF NOT EXISTS expired_candles (
                            instrument_key TEXT,
                            interval TEXT,
                            from_date TEXT,
                            to_date TEXT,
                            ts TIMESTAMP,
                            open DOUBLE,
                            high DOUBLE,
                            low DOUBLE,
                            close DOUBLE,
                            volume DOUBLE
                        )
                        """
                    )
                    con.executemany(
                        """
                        INSERT INTO expired_candles
                        (instrument_key, interval, from_date, to_date, ts, open, high, low, close, volume)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        rows,
                    )
                finally:
                    con.close()
            return len(rows)
        except Exception as exc:
            last_error = exc
            time.sleep(0.5 * (attempt + 1))
    if last_error:
        raise last_error
    return len(rows)


def _candles_already_stored(
    instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
) -> bool:
    if not DB_PATH.exists():
        return False
    with DB_WRITE_LOCK:
        con = _get_db_conn()
        exists = con.execute(
            """
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_name = 'expired_candles'
            """
        ).fetchone()[0]
        if not exists:
            return False
        count = con.execute(
            """
            SELECT COUNT(*) FROM expired_candles
            WHERE instrument_key = ? AND interval = ? AND from_date = ? AND to_date = ?
            """,
            [instrument_key, interval, from_date, to_date],
        ).fetchone()[0]
        return count > 0


@app.post('/auth/sign-in')
async def auth_sign_in(request: Request):
    payload = await request.json()
    email = str(payload.get('email') or '').strip()
    password = str(payload.get('password') or '').strip()
    if not email or not password:
        raise HTTPException(status_code=400, detail='Email and password are required.')
    session = sign_in_with_password(email, password)
    user = get_supabase_user(str(session.get('access_token') or ''))
    response = JSONResponse(
        {
            'status': 'ok',
            'user': {
                'id': user.get('id'),
                'email': user.get('email'),
                'user_metadata': user.get('user_metadata') or {},
            },
        }
    )
    _set_session_cookies(response, session)
    return response


@app.post('/auth/sign-up')
async def auth_sign_up(request: Request):
    payload = await request.json()
    email = str(payload.get('email') or '').strip()
    password = str(payload.get('password') or '').strip()
    username = str(payload.get('username') or '').strip()
    full_name = str(payload.get('full_name') or '').strip()
    phone_number = str(payload.get('phone_number') or '').strip()
    country = str(payload.get('country') or '').strip() or 'IN'
    if not email or not password or not username:
        raise HTTPException(status_code=400, detail='Email, password, and username are required.')
    result = sign_up_user(
        email=email,
        password=password,
        username=username,
        full_name=full_name,
        phone_number=phone_number,
        country=country,
    )
    session = result.get('session') or {}
    response = JSONResponse(
        {
            'status': 'ok',
            'message': 'Account created. Check your email if confirmation is enabled.',
            'user': result.get('user'),
        }
    )
    if isinstance(session, dict) and session.get('access_token'):
        _set_session_cookies(response, session)
    return response


@app.post('/auth/sign-out')
def auth_sign_out():
    response = JSONResponse({'status': 'signed_out'})
    _clear_session_cookies(response)
    return response


@app.get('/auth/callback')
def auth_callback():
    return RedirectResponse(url='/sign-in?message=Email confirmed. Please sign in.', status_code=303)


@app.get('/api/auth/session')
def auth_session(request: Request):
    user = getattr(request.state, 'supabase_user', None)
    if not user:
        raise HTTPException(status_code=401, detail='Authentication required')
    return JSONResponse(
        {
            'user': {
                'id': user.get('id'),
                'email': user.get('email'),
                'user_metadata': user.get('user_metadata') or {},
            }
        }
    )


@app.get('/api/trends')
def get_trends(date_key: Optional[str] = Query(None)):
    source, payload = load_trend_payload()
    if date_key:
        rows = payload.get('dates_wise_table', {}).get(date_key, [])
        return JSONResponse({'source': source, 'date': date_key, 'rows': rows})
    return JSONResponse({'source': source, 'payload': payload})


@app.get('/api/astro')
def get_astro(
    date: str = Query(...),
    time: str = Query(...),
    symbol: str = Query('NIFTY'),
    referencePrice: float = Query(...),
):
    if len(date) != 10:
        raise HTTPException(status_code=400, detail='date must use YYYY-MM-DD')
    if len(time) != 5:
        raise HTTPException(status_code=400, detail='time must use HH:MM')
    return JSONResponse({'payload': build_astro_payload(date, time, symbol, referencePrice)})


@app.get('/api/astro/planetary-aspects')
def get_planetary_aspects(
    startDate: str = Query(...),
    endDate: str = Query(...),
    moonMode: str = Query('exclude_moon_ascendant'),
    planet1: str = Query(''),
    planet2: str = Query(''),
    aspects: str = Query(''),
    orb: float = Query(1.0),
    maxRows: int = Query(12000, ge=1, le=50000),
):
    selected_aspects = [float(item) for item in aspects.split(',') if item.strip()]
    payload = build_planetary_aspects_payload(
        start_date=startDate,
        end_date=endDate,
        moon_mode=moonMode,
        planet1=[item.strip() for item in planet1.split(',') if item.strip()],
        planet2=[item.strip() for item in planet2.split(',') if item.strip()],
        selected_aspects=selected_aspects,
        orb=orb,
        max_rows=maxRows,
    )
    return JSONResponse({'payload': payload})


@app.get('/api/astro/moon-ascendant')
def get_moon_ascendant(
    startDate: str = Query(...),
    endDate: str = Query(...),
    includeMoon: bool = Query(True),
    includeAsc: bool = Query(True),
    moonTarget: float = Query(0.0),
    ascTarget: float = Query(0.0),
    tolerance: float = Query(0.1),
):
    try:
        payload = build_moon_ascendant_payload(
            start_date=startDate,
            end_date=endDate,
            include_moon=includeMoon,
            include_asc=includeAsc,
            moon_target=moonTarget,
            asc_target=ascTarget,
            tolerance=tolerance,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return JSONResponse({'payload': payload})


@app.get('/', response_class=HTMLResponse)
def homepage() -> HTMLResponse:
    index_path = FRONTEND_DIST / 'index.html'
    if index_path.exists():
        return FileResponse(index_path)
    return HTMLResponse(
        '<html><body><h1>Frontend build missing</h1><p>Run npm install && npm run build inside ./frontend.</p></body></html>',
        status_code=200,
    )


@app.get('/api/expired-contracts/{instrument_key}')
def get_cached_contract(instrument_key: str):
    snapshot = _load_snapshot(instrument_key)
    if not snapshot:
        raise HTTPException(status_code=404, detail='Snapshot not found')
    return JSONResponse(snapshot)


@app.get('/api/search-instruments')
def search_instruments(q: str = Query(...), limit: int = Query(25, ge=1, le=50)):
    return JSONResponse(_search_token_master(q, limit))


@app.get('/api/expired-contracts')
def search_expired_contracts(
    underlying_key: str = Query(...),
    expiry: str = Query(...),
):
    token = _normalize_access_token()
    if not token:
        raise HTTPException(status_code=503, detail='Valid Upstox token not found; refresh via the CLI login flow.')
    contracts = _fetch_expired_contracts_for_expiry(token, underlying_key, expiry)
    return JSONResponse(contracts)


@app.get('/api/instruments-cache')
def get_instruments_cache():
    instruments = _load_instruments_cache()
    fno_underlyings = _fno_underlying_keys(instruments)
    filtered: List[Dict[str, str]] = []
    for ins in instruments:
        segment = str(ins.get('segment', '')).upper()
        if segment == 'NSE_EQ':
            key = str(ins.get('instrument_key') or '').strip()
            if not key or key not in fno_underlyings:
                continue
        elif segment != 'NSE_INDEX':
            continue
        filtered.append(
            {
                'symbol': str(ins.get('symbol', '')).strip(),
                'name': str(ins.get('name', '')).strip(),
                'trading_symbol': str(ins.get('trading_symbol', '')).strip(),
                'instrument_key': str(ins.get('instrument_key', '')).strip(),
                'segment': segment,
            }
        )
    return JSONResponse(filtered)


@app.get('/download/expired-contracts/')
def store_cached_contract(instrument_key: str = Query(...)):
    snapshot = _load_snapshot(instrument_key)
    if not snapshot:
        token = _normalize_access_token()
        if not token:
            raise HTTPException(
                status_code=503,
                detail='Snapshot missing and no valid token found to refresh.',
            )
        collect_expired_contracts(token, underlyings=[instrument_key], max_expiries=6)
        snapshot = _load_snapshot(instrument_key)
        if not snapshot:
            raise HTTPException(status_code=404, detail='Snapshot not found after refresh')
    rows = _write_contracts_to_duckdb(instrument_key, snapshot)
    return JSONResponse(
        {
            'status': 'stored',
            'rows': rows,
            'duckdb_path': str(DB_PATH),
            'parquet_path': str(PARQUET_ROOT / 'expired_contracts.parquet'),
        }
    )


@app.get('/download/expired-ohlcv')
def store_expired_candles(
    background_tasks: BackgroundTasks,
    underlying_key: str = Query(...),
    interval: str = Query('5minute'),
    from_date: str = Query(...),
    to_date: str = Query(...),
    include_spot: bool = Query(True),
    include_futures: bool = Query(True),
    include_options: bool = Query(True),
):
    token = _normalize_access_token()
    if not token:
        raise HTTPException(status_code=503, detail='Valid Upstox token not found; refresh via the CLI login flow.')
    job_id = uuid4().hex
    with OHLC_JOBS_LOCK:
        OHLC_JOBS[job_id] = {
            'status': 'running',
            'control_state': 'running',
            'message': 'Starting job...',
            'total': 0,
            'completed': 0,
            'stored_rows': 0,
            'failed_instruments': 0,
            'skipped_instruments': 0,
            'failure_samples': [],
            'job_db_path': '',
        }
    background_tasks.add_task(
        _run_ohlc_job,
        job_id,
        token,
        underlying_key,
        interval,
        from_date,
        to_date,
        include_spot,
        include_futures,
        include_options,
    )
    return JSONResponse({'status': 'started', 'job_id': job_id})


@app.get('/api/ohlc-job/{job_id}')
def get_ohlc_job(job_id: str):
    with OHLC_JOBS_LOCK:
        job = OHLC_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found.')
    return JSONResponse(job)


@app.post('/api/ohlc-job/{job_id}/control')
def control_ohlc_job(job_id: str, action: str = Query(...)):
    with OHLC_JOBS_LOCK:
        job = OHLC_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail='Job not found.')
        current_status = str(job.get('status') or 'running')
        if current_status in {'completed', 'error', 'stopped'}:
            return JSONResponse(job)
        if action == 'pause':
            job['control_state'] = 'paused'
            job['status'] = 'paused'
            job['message'] = 'Paused by user.'
        elif action == 'resume':
            job['control_state'] = 'running'
            job['status'] = 'running'
            job['message'] = 'Resumed. Continuing OHLC fetch...'
        elif action == 'stop':
            job['control_state'] = 'stopped'
            job['message'] = 'Stop requested by user.'
        else:
            raise HTTPException(status_code=400, detail='Unsupported action.')
        return JSONResponse(job)


@app.get('/api/ohlc-log')
def get_ohlc_log(limit: int = Query(200, ge=1, le=1000)):
    return JSONResponse({'lines': _tail_log(LOG_PATH, limit)})


@app.post('/api/ohlc-log/clear')
def clear_ohlc_log():
    _clear_log(LOG_PATH)
    logger.info('OHLC backend log cleared by user request.')
    return JSONResponse({'status': 'cleared'})


@app.get('/api/token-status')
def get_token_status():
    token = _read_token()
    if not token:
        return JSONResponse({**LAST_REFRESH_STATUS, 'status': 'invalid', 'message': 'Token file missing or empty'})
    if _is_token_valid(token):
        return JSONResponse({**LAST_REFRESH_STATUS, 'status': 'valid', 'message': 'Token valid'})
    return JSONResponse({**LAST_REFRESH_STATUS, 'status': 'invalid', 'message': 'Token invalid'})


@app.post('/api/export-parquet')
def export_parquet(table: str = Query('expired_candles')):
    if table not in {'expired_candles', 'expired_contracts'}:
        raise HTTPException(status_code=400, detail='Unsupported table name.')
    with DB_WRITE_LOCK:
        con = _get_db_conn()
        parquet_path = PARQUET_ROOT / f'{table}.parquet'
        con.execute(
            "COPY (SELECT * FROM " + table + ") TO ? (FORMAT 'parquet', OVERWRITE 1)",
            [str(parquet_path)],
        )
    return JSONResponse({'status': 'exported', 'parquet_path': str(parquet_path)})


@app.post('/api/merge-job')
def merge_job(job_id: str = Query(...)):
    job_dir = JOB_DB_ROOT / f'ohlc_{job_id}'
    try:
        merged = _merge_job_parquet(job_dir)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail='Job output not found.')
    return JSONResponse({'status': 'merged', 'rows': merged, 'job_dir': str(job_dir)})


@app.get('/api/candles-index')
def get_candles_index(
    instrument_key: Optional[str] = Query(None),
    underlying_key: Optional[str] = Query(None),
    underlying_filter: Optional[str] = Query(None),
    instrument_filter: Optional[str] = Query(None),
    option_type: Optional[str] = Query(None),
    strike_contains: Optional[str] = Query(None),
    interval: Optional[str] = Query(None),
    from_date_min: Optional[str] = Query(None),
    to_date_max: Optional[str] = Query(None),
    min_rows: Optional[int] = Query(None),
    updated_after: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    table = _read_index_table()
    if table is None or table.num_rows == 0:
        return JSONResponse({'total': 0, 'rows': []})
    contract_meta_map = _get_expired_contract_meta_map()
    meta_map = _get_instrument_meta_map()
    key_col = table.column('instrument_key').to_pylist()
    underlying_col = (
        table.column('underlying_key').to_pylist()
        if 'underlying_key' in table.column_names
        else [''] * table.num_rows
    )
    interval_col = table.column('interval').to_pylist()
    from_col = table.column('from_date').to_pylist()
    to_col = table.column('to_date').to_pylist()
    rows_col = table.column('rows').to_pylist()
    updated_col = table.column('updated_at').to_pylist()

    underlying_needle = underlying_key.strip().upper() if underlying_key else None
    instrument_needle = instrument_key.strip().upper() if instrument_key else None
    option_type_needle = option_type.strip().upper() if option_type else None
    underlying_filter_needle = underlying_filter.strip().upper() if underlying_filter else None
    instrument_filter_needle = instrument_filter.strip().upper() if instrument_filter else None
    strike_filter = strike_contains.strip() if strike_contains else None
    interval_filter = interval.strip() if interval else None
    from_date_filter = from_date_min.strip() if from_date_min else None
    to_date_filter = to_date_max.strip() if to_date_max else None
    updated_after_filter = updated_after.strip() if updated_after else None

    total = 0
    rows: List[Dict[str, object]] = []
    for idx in range(table.num_rows):
        if underlying_needle:
            if underlying_needle not in str(underlying_col[idx]).upper():
                continue
        if instrument_needle:
            if instrument_needle not in str(key_col[idx]).upper():
                continue
        if underlying_filter_needle:
            if underlying_filter_needle not in str(underlying_col[idx]).upper():
                continue
        if instrument_filter_needle:
            if instrument_filter_needle not in str(key_col[idx]).upper():
                continue
        if interval_filter:
            if str(interval_col[idx]) != interval_filter:
                continue
        if from_date_filter:
            if str(from_col[idx]) < from_date_filter:
                continue
        if to_date_filter:
            if str(to_col[idx]) > to_date_filter:
                continue
        if min_rows is not None:
            try:
                if int(rows_col[idx]) < min_rows:
                    continue
            except (TypeError, ValueError):
                continue
        instrument_key_value = str(key_col[idx])
        underlying_value = str(underlying_col[idx])
        option_type: Optional[str] = None
        strike_price: Optional[object] = None
        if instrument_key_value.startswith(('NSE_INDEX|', 'NSE_EQ|')) and instrument_key_value == underlying_value:
            option_type = 'SPOT'
        else:
            meta = contract_meta_map.get(instrument_key_value)
            if meta is None:
                base_key = _base_instrument_key(instrument_key_value)
                meta = meta_map.get(base_key)
            if meta:
                option_type = meta.get('instrument_type') or None
                strike_price = meta.get('strike_price')
                if option_type not in {'CE', 'PE'}:
                    strike_price = None
        if option_type_needle:
            if option_type is None:
                continue
            if option_type.upper() != option_type_needle:
                continue
        if strike_filter:
            if strike_filter not in str(strike_price or ''):
                continue
        if updated_after_filter:
            updated_date = str(updated_col[idx] or '').split('T')[0]
            if not updated_date or updated_date < updated_after_filter:
                continue
        total += 1
        if total <= offset:
            continue
        if len(rows) < limit:
            rows.append(
                {
                    'instrument_key': instrument_key_value,
                    'underlying_key': underlying_value,
                    'interval': interval_col[idx],
                    'from_date': from_col[idx],
                    'to_date': to_col[idx],
                    'rows': rows_col[idx],
                    'updated_at': updated_col[idx],
                    'option_type': option_type,
                    'strike_price': strike_price,
                }
            )
    return JSONResponse({'total': total, 'rows': rows})


@app.get('/api/candles-rows')
def get_candles_rows(
    instrument_key: str = Query(...),
    interval: str = Query(...),
    from_date: str = Query(...),
    to_date: str = Query(...),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    total, rows = _query_master_candles(
        instrument_key=instrument_key,
        interval=interval,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )
    return JSONResponse({'total': total, 'rows': rows})


@app.get('/{full_path:path}')
def spa_fallback(full_path: str):
    if full_path.startswith(('api/', 'download/', 'assets/')):
        raise HTTPException(status_code=404, detail='Not found')
    index_path = FRONTEND_DIST / 'index.html'
    if not index_path.exists():
        raise HTTPException(status_code=404, detail='Frontend not built')
    target = FRONTEND_DIST / full_path
    if target.exists() and target.is_file():
        return FileResponse(target)
    return FileResponse(index_path)


@click.command(name='serve')
@click.option('--host', default='127.0.0.1', show_default=True, help='Host to bind to.')
@click.option('--port', default=8765, show_default=True, help='Port to listen on.')
@click.option('--reload/--no-reload', default=False, help='Reload the server on code changes.')
def main(host: str, port: int, reload: bool) -> None:
    """Run the FastAPI application."""
    uvicorn.run(app, host=host, port=port, reload=reload, log_level='info')


if __name__ == '__main__':
    main()
