"""Helpers to gather and persist Upstox expired-instrument data."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Mapping, Optional

import requests

from .backtest import _load_instruments_cache
from .config import REPO_ROOT, UPSTOX_BASE

logger = logging.getLogger(__name__)

DEFAULT_INDEX_UNDERLYINGS = (
    'NSE_INDEX|Nifty 50',
    'NSE_INDEX|Nifty Bank',
    'NSE_INDEX|Nifty Fin Service',
    'NSE_INDEX|Nifty Midcap Select',
)

DEFAULT_FNO_STOCK_UNDERLYINGS = (
    'NSE_EQ|INE002A01018',  # RELIANCE
    'NSE_EQ|INE040A01034',  # HDFCBANK
    'NSE_EQ|INE090A01021',  # ICICIBANK
    'NSE_EQ|INE009A01021',  # INFY
    'NSE_EQ|INE467B01029',  # TCS
    'NSE_EQ|INE018A01030',  # LT
    'NSE_EQ|INE062A01020',  # SBIN
    'NSE_EQ|INE238A01034',  # AXISBANK
    'NSE_EQ|INE296A01032',  # BAJFINANCE
    'NSE_EQ|INE860A01027',  # HCLTECH
)

DEFAULT_UNDERLYINGS = DEFAULT_INDEX_UNDERLYINGS + DEFAULT_FNO_STOCK_UNDERLYINGS
EXPIRED_CACHE_ROOT = REPO_ROOT / 'expired_contracts'


@dataclass
class ExpiredInstrumentSnapshot:
    """Serialized result for each underlying instrument."""

    instrument_key: str
    expiries: List[str]
    options: Mapping[str, List[Mapping[str, object]]]
    futures: Mapping[str, List[Mapping[str, object]]]


def _create_session(access_token: str) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
    )
    return session


def _persist_snapshot(snapshot: ExpiredInstrumentSnapshot, destination: Path) -> None:
    subdir = destination / snapshot.instrument_key.replace('|', '_')
    subdir.mkdir(parents=True, exist_ok=True)
    target = subdir / 'expired_contracts.json'
    target.write_text(json.dumps(asdict(snapshot), ensure_ascii=False, indent=2), encoding='utf-8')


def _normalize_expiries(raw: Iterable[str], limit: int) -> List[str]:
    # Keep unique strings in descending order (latest first).
    entries = []
    seen = set()
    parsed = []
    for e in raw:
        if not isinstance(e, str):
            continue
        if e in seen:
            continue
        seen.add(e)
        try:
            parsed.append((datetime.fromisoformat(e), e))
        except ValueError:
            continue
    parsed.sort(key=lambda item: item[0], reverse=True)
    for _, value in parsed[:limit]:
        entries.append(value)
    return entries


def _fetch_expiries(
    session: requests.Session, instrument_key: str, max_entries: int = 6
) -> List[str]:
    """Call the Get Expiries endpoint for the supplied key."""

    url = f'{UPSTOX_BASE}/v2/expired-instruments/expiries'
    resp = session.get(url, params={'instrument_key': instrument_key}, timeout=15)
    resp.raise_for_status()
    payload = resp.json()
    if not payload.get('data'):
        return []
    return _normalize_expiries(payload['data'], max_entries)


def _fetch_expired_options(session: requests.Session, instrument_key: str, expiry: str) -> List[Mapping[str, object]]:
    url = f'{UPSTOX_BASE}/v2/expired-instruments/option/contract'
    resp = session.get(url, params={'instrument_key': instrument_key, 'expiry_date': expiry}, timeout=20)
    resp.raise_for_status()
    return resp.json().get('data', []) or []


def _fetch_expired_futures(session: requests.Session, instrument_key: str, expiry: str) -> List[Mapping[str, object]]:
    url = f'{UPSTOX_BASE}/v2/expired-instruments/future/contract'
    resp = session.get(url, params={'instrument_key': instrument_key, 'expiry_date': expiry}, timeout=20)
    resp.raise_for_status()
    return resp.json().get('data', []) or []


def collect_expired_contracts(
    access_token: str,
    *,
    underlyings: Iterable[str] = DEFAULT_UNDERLYINGS,
    cache_root: Path = EXPIRED_CACHE_ROOT,
    max_expiries: int = 6,
) -> List[ExpiredInstrumentSnapshot]:
    session = _create_session(access_token)
    cache_root.mkdir(parents=True, exist_ok=True)
    snapshots: List[ExpiredInstrumentSnapshot] = []

    for key in underlyings:
        try:
            expiries = _fetch_expiries(session, key, max_entries=max_expiries)
        except requests.HTTPError as exc:
            logger.warning('Unable to fetch expiries for %s: %s', key, exc)
            continue

        options_by_expiry: dict[str, List[Mapping[str, object]]] = {}
        futures_by_expiry: dict[str, List[Mapping[str, object]]] = {}

        for expiry in expiries:
            options_by_expiry[expiry] = _fetch_expired_options(session, key, expiry)
            futures_by_expiry[expiry] = _fetch_expired_futures(session, key, expiry)

        snapshot = ExpiredInstrumentSnapshot(
            instrument_key=key,
            expiries=expiries,
            options=options_by_expiry,
            futures=futures_by_expiry,
        )
        _persist_snapshot(snapshot, cache_root)
        snapshots.append(snapshot)

    return snapshots


def discover_fno_underlyings(limit: int = 15) -> List[str]:
    instruments = _load_instruments_cache()
    seen: set[str] = set()
    keys: List[str] = []
    for instrument in instruments:
        if instrument.get('segment') != 'NSE_FO':
            continue
        key = instrument.get('underlying_key')
        if not key or key in seen:
            continue
        seen.add(key)
        keys.append(key)
        if len(keys) >= limit:
            break
    return keys


def discover_indexes() -> List[str]:
    instruments = _load_instruments_cache()
    keys = sorted(
        {
            instrument['instrument_key']
            for instrument in instruments
            if instrument.get('segment') == 'NSE_INDEX'
        }
    )
    return keys


def fetch_expired_candle(
    access_token: str,
    expired_instrument_key: str,
    interval: str,
    from_date: str,
    to_date: str,
) -> List[List[object]]:
    """Fetch OHLC data for an expired individual contract."""

    url = f'{UPSTOX_BASE}/v2/expired-instruments/historical-candle/{expired_instrument_key}/{interval}/{to_date}/{from_date}'
    resp = requests.get(
        url,
        headers={
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json().get('data', {}).get('candles', []) or []
