"""Minimal entry to demonstrate Upstox login, cache reuse, and expired-data helpers."""

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

import requests

from upstox_tools.auth import build_auth_headers, get_access_token, login_upstox
from upstox_tools.config import UPSTOX_BASE
from upstox_tools.expired_contracts import (
    DEFAULT_UNDERLYINGS,
    collect_expired_contracts,
    discover_fno_underlyings,
    discover_indexes,
    fetch_expired_candle,
)


def _token_cache_path() -> Path:
    """Return the access-token cache file, overridable via the env var."""

    override = os.environ.get('UPSTOX_TOKEN_CACHE')
    return Path(override).expanduser().resolve() if override else Path.home() / '.upstox_access_token.json'


def _load_cached_token(path: Path) -> Tuple[Optional[str], str]:
    """Return the cached access token and emitted warning if malformed."""

    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return None, ''
    except json.JSONDecodeError:
        return None, 'cache-malformed'

    token = payload.get('access_token')
    return (token if isinstance(token, str) and token else None), ''


def _persist_token(path: Path, token: str) -> None:
    """Persist the token for reuse."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'access_token': token}), encoding='utf-8')


def _login_and_cache(path: Path) -> str:
    print('?? Starting Upstox auth flow...')
    code = asyncio.run(login_upstox())
    if not code:
        raise SystemExit('Login flow did not return a code.')

    token = get_access_token(code)
    if not token:
        raise SystemExit('Failed to obtain access token.')

    _persist_token(path, token)
    print(f'Stored fresh token in {path}.')
    return token


def _is_token_valid(token: str) -> bool:
    """Return True if the cached token still works (via /user/profile)."""

    if not token:
        return False

    url = f"{UPSTOX_BASE}/v2/user/profile"
    headers = {
        'Accept': 'application/json',
        'Authorization': f'Bearer {token}',
    }
    try:
        resp = requests.get(url, headers=headers, timeout=10)
    except requests.RequestException:
        return False

    return resp.status_code == 200


def _ensure_token() -> Tuple[str, Path]:
    token_cache = _token_cache_path()
    token, warning = _load_cached_token(token_cache)

    if warning == 'cache-malformed':
        print('Cached token file is malformed; it will be recreated.')
        token = None

    if token and _is_token_valid(token):
        print(f'Using cached token from {token_cache}.')
        return token, token_cache

    if token:
        print('Cached token is invalid or expired; fetching a new one.')
        try:
            token_cache.unlink()
        except FileNotFoundError:
            pass

    token = _login_and_cache(token_cache)
    return token, token_cache


def _print_headers(token: str) -> None:
    headers = build_auth_headers(token)
    print('Access token:')
    print(token)
    print('\nUse these headers for Upstox API calls:')
    print(headers)


def _handle_collect(
    token: str,
    additional_underlyings: Iterable[str],
    max_expiries: int,
) -> None:
    underlyings = tuple(additional_underlyings) or DEFAULT_UNDERLYINGS
    snapshots = collect_expired_contracts(
        token,
        underlyings=underlyings,
        max_expiries=max_expiries,
    )
    print(f'Collected expired contracts for {len(snapshots)} underlyings.')


def _handle_candle(token: str, args: List[str]) -> None:
    key, interval, from_date, to_date = args
    candles = fetch_expired_candle(token, key, interval, from_date, to_date)
    if not candles:
        print('No candles returned for that expired instrument/window.')
        return
    print(f'{len(candles)} candles found for {key} between {from_date} and {to_date}.')
    for candle in candles[:5]:
        print(candle)


def main() -> None:
    parser = argparse.ArgumentParser(description='Obtain Upstox auth token and optionally cache expired data.')
    parser.add_argument(
        '--collect-expired',
        action='store_true',
        help='Call Upstox expired-instrument endpoints and cache results.',
    )
    parser.add_argument(
        '--max-expiries',
        type=int,
        default=6,
        help='Maximum number of expiries to pull per underlying when collecting.',
    )
    parser.add_argument(
        '--underlying',
        action='append',
        help='Extra underlying instrument_key(s) to include when collecting expired data.',
    )
    parser.add_argument(
        '--expired-candle',
        nargs=4,
        metavar=('KEY', 'INTERVAL', 'FROM', 'TO'),
        help='Fetch candles for a specific expired contract.',
    )
    parser.add_argument(
        '--discover-indexes',
        action='store_true',
        help='Print NSE index instrument keys that can be used with --underlying.',
    )
    parser.add_argument(
        '--discover-fno',
        action='store_true',
        help='Print a short list of NSE_FO underlyings derived from the instrument cache.',
    )
    args = parser.parse_args()

    token, _ = _ensure_token()
    _print_headers(token)

    if args.discover_indexes:
        print('Known NSE indexes:', discover_indexes())

    if args.discover_fno:
        print('Cached NSE_FO underlyings:', discover_fno_underlyings())

    if args.collect_expired:
        _handle_collect(token, args.underlying or [], args.max_expiries)

    if args.expired_candle:
        _handle_candle(token, args.expired_candle)


if __name__ == '__main__':
    main()
