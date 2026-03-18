import datetime
import gzip
import json
import math
import os
import time
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlencode

import requests

from .config import INSTRUMENTS_URL, UPSTOX_BASE


def _upstox_get(path: str, params: Optional[Dict] = None, token: str = '', timeout: int = 30) -> requests.Response:
    headers = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    url = f"{UPSTOX_BASE}{path}"
    if params:
        url = f"{url}?{urlencode(params)}"
    return requests.get(url, headers=headers, timeout=timeout)


def _load_instruments_cache(cache_path: str = 'instruments_cache.json') -> Sequence[Dict]:
    cache_file = Path(cache_path)
    if cache_file.exists() and (time.time() - cache_file.stat().st_mtime) < 24 * 3600:
        with cache_file.open('r', encoding='utf-8') as f:
            return json.load(f)

    r = requests.get(INSTRUMENTS_URL, timeout=60)
    r.raise_for_status()
    data = gzip.decompress(r.content).decode('utf-8')
    instruments = json.loads(data)
    with cache_file.open('w', encoding='utf-8') as f:
        json.dump(instruments, f)
    return instruments


def _resolve_underlying_key(symbol: str, instruments: Sequence[Dict]) -> Optional[str]:
    sym = symbol.upper()
    mapping = {
        'NIFTY': 'NSE_INDEX|Nifty 50',
        'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
        'FINNIFTY': 'NSE_INDEX|Nifty Fin Service',
        'MIDCPNIFTY': 'NSE_INDEX|Nifty Midcap Select',
    }
    if sym in mapping:
        return mapping[sym]
    for ins in instruments:
        if str(ins.get('symbol', '')).upper() == sym:
            return ins.get('instrument_key')
        if str(ins.get('name', '')).upper() == sym:
            return ins.get('instrument_key')
        if str(ins.get('trading_symbol', '')).upper() == sym:
            return ins.get('instrument_key')
    return None


def _futures_candidates(symbol: str, instruments: Sequence[Dict]) -> List[Dict]:
    sym = symbol.upper()
    res: List[Dict] = []
    for ins in instruments:
        it = str(ins.get('instrument_type', '')).upper()
        if it not in ('FUTIDX', 'FUTSTK'):
            continue
        name = str(ins.get('name', '')).upper()
        ts = str(ins.get('trading_symbol', '')).upper()
        if sym not in name and sym not in ts:
            continue
        exp = ins.get('expiry') or ins.get('expiry_date') or ins.get('expiryDate')
        if not exp:
            continue
        try:
            exp_d = datetime.date.fromisoformat(str(exp)[:10])
        except Exception:
            continue
        res.append({'instrument_key': ins.get('instrument_key'), 'expiry': exp_d})
    return res


def _select_nearest_future(cands: Sequence[Dict], day: datetime.date) -> Optional[Dict]:
    future = [c for c in cands if c['expiry'] >= day]
    if not future:
        return None
    return sorted(future, key=lambda c: c['expiry'])[0]


def _next_weekly_expiry(d: datetime.date) -> datetime.date:
    wd = d.weekday()
    days_ahead = (3 - wd) % 7
    if days_ahead == 0:
        return d
    return d + datetime.timedelta(days=days_ahead)


def _get_option_contracts(underlying_key: str, expiry_date: str, token: str, expired: bool = False) -> List[Dict]:
    path = '/v2/option/contract'
    if expired:
        path = '/v2/expired-instruments/option/contract'
    r = _upstox_get(path, params={'instrument_key': underlying_key, 'expiry_date': expiry_date}, token=token)
    if r.status_code != 200:
        return []
    return r.json().get('data', []) or []


def _get_fut_contracts(underlying_key: str, expiry_date: str, token: str, expired: bool = False) -> List[Dict]:
    path = '/v2/expired-instruments/future/contract' if expired else '/v2/option/contract'
    if not expired:
        return []
    r = _upstox_get(path, params={'instrument_key': underlying_key, 'expiry_date': expiry_date}, token=token)
    if r.status_code != 200:
        return []
    return r.json().get('data', []) or []


def _select_atm_contracts(contracts: Sequence[Dict], spot: float) -> Tuple[Optional[Dict], Optional[Dict]]:
    def _strike(c: Dict) -> float:
        return float(c.get('strike_price') or c.get('strike') or c.get('strikePrice') or 0.0)

    ce = [c for c in contracts if str(c.get('option_type') or c.get('type') or '').upper().endswith('CE')]
    pe = [c for c in contracts if str(c.get('option_type') or c.get('type') or '').upper().endswith('PE')]
    if not ce or not pe:
        return None, None
    best = min(ce, key=lambda c: abs(_strike(c) - spot))
    strike = _strike(best)
    ce_sel = min(ce, key=lambda c: abs(_strike(c) - strike))
    pe_sel = min(pe, key=lambda c: abs(_strike(c) - strike))
    return ce_sel, pe_sel


def _fetch_candles(
    instrument_key: str,
    interval: int,
    from_date: str,
    to_date: str,
    token: str,
    expired: bool = False,
    kind: str = 'option',
) -> List[List[float]]:
    if expired:
        if kind == 'future':
            path = f"/v2/expired-instruments/future/historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}"
        else:
            path = f"/v2/expired-instruments/option/historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}"
    else:
        path = f"/v3/historical-candle/{instrument_key}/minutes/{interval}/{to_date}/{from_date}"
    r = _upstox_get(path, token=token)
    if r.status_code != 200:
        return []
    return (r.json().get('data', {}) or {}).get('candles', []) or []


def _group_candles_by_day(candles: Sequence[List[float]]) -> Dict[str, List[List[float]]]:
    by: Dict[str, List[List[float]]] = {}
    for c in candles:
        ts = c[0]
        dt = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
        d = dt.date().isoformat()
        by.setdefault(d, []).append(c)
    return by


def _calc_kpis(trades: Sequence[Dict], equity_curve: Sequence[Dict], start_capital: float) -> Dict[str, float]:
    if not trades:
        return dict(cagr=0, max_dd=0, win_rate=0, sharpe=0, avg_pnl=0, avg_duration_days=0)

    pnl_list = [t['pnl'] for t in trades]
    wins = sum(1 for p in pnl_list if p > 0)
    win_rate = wins / len(pnl_list) if pnl_list else 0
    avg_pnl = sum(pnl_list) / len(pnl_list)
    avg_dur = sum(t.get('duration_days', 0) for t in trades) / len(trades)

    equity = [p['equity'] for p in equity_curve]
    peak = -1e18
    max_dd = 0
    for e in equity:
        peak = max(peak, e)
        dd = peak - e
        max_dd = max(max_dd, dd)

    returns = [p / start_capital for p in pnl_list]
    if len(returns) > 1:
        mean_r = sum(returns) / len(returns)
        var = sum((r - mean_r) ** 2 for r in returns) / (len(returns) - 1)
        std = math.sqrt(var) if var > 0 else 0
        sharpe = (mean_r / std) * math.sqrt(252) if std > 0 else 0
    else:
        sharpe = 0

    start = equity_curve[0]['t']
    end = equity_curve[-1]['t']
    d0 = datetime.datetime.fromisoformat(start)
    d1 = datetime.datetime.fromisoformat(end)
    days = max((d1 - d0).days, 1)
    total_return = (equity[-1] / start_capital) if start_capital > 0 else 0
    cagr = (total_return ** (365 / days) - 1) if total_return > 0 else 0

    return dict(
        cagr=cagr * 100,
        max_dd=max_dd,
        win_rate=win_rate * 100,
        sharpe=sharpe,
        avg_pnl=avg_pnl,
        avg_duration_days=avg_dur,
    )


def _histogram(values: Sequence[float], buckets: int = 20) -> List[Dict[str, float]]:
    if not values:
        return []
    vmin, vmax = min(values), max(values)
    if vmin == vmax:
        return [{'bucket': vmin, 'count': len(values)}]
    step = (vmax - vmin) / buckets
    hist = [0] * buckets
    for v in values:
        idx = min(int((v - vmin) / step), buckets - 1)
        hist[idx] += 1
    return [{'bucket': round(vmin + i * step, 2), 'count': hist[i]} for i in range(buckets)]


def run_backtest_upstox(
    symbol: str = 'NIFTY',
    days: int = 90,
    interval: int = 5,
    exit_offset_days: int = 2,
    cost_per_lot: float = 0.0,
    strategy: str = 'ATM_STRADDLE',
    output_path: str = 'backtest_data.json',
) -> str:
    token = os.environ.get('UPSTOX_ACCESS_TOKEN', '')
    result = {
        'meta': {
            'symbol': symbol,
            'start': '',
            'end': '',
            'granularity': f"{interval}m",
            'expiry_rule': 'nearest_weekly',
            'exit_offset_days': exit_offset_days,
            'cost_per_lot': cost_per_lot,
        },
        'equity_curve': [],
        'trades': [],
        'kpis': {},
        'distributions': {'pnl_hist': [], 'dd_hist': []},
        'heatmaps': {'dow_pnl': [], 'month_pnl': []},
    }

    if not token:
        result['error'] = 'Missing UPSTOX_ACCESS_TOKEN'
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        return output_path

    instruments = _load_instruments_cache()
    underlying_key = _resolve_underlying_key(symbol, instruments)
    if not underlying_key:
        result['error'] = 'Unable to resolve underlying instrument key'
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        return output_path

    fut_cands = _futures_candidates(symbol, instruments)
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=int(days))
    result['meta']['start'] = start_date.isoformat()
    result['meta']['end'] = end_date.isoformat()

    spot_candles = _fetch_candles(
        underlying_key,
        interval,
        start_date.isoformat(),
        end_date.isoformat(),
        token,
        expired=False,
    )
    if not spot_candles:
        result['error'] = 'No spot candle data returned'
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        return output_path

    spot_by_day = _group_candles_by_day(spot_candles)
    trading_days = sorted(spot_by_day.keys())

    contracts_cache: Dict[str, List[Dict]] = {}
    candle_cache: Dict[Tuple[str, str], List[List[float]]] = {}

    trades: List[Dict] = []
    start_capital = float(os.environ.get('BACKTEST_START_CAPITAL', '1000000'))
    equity = start_capital
    equity_curve = [{'t': f"{start_date.isoformat()}T09:15:00", 'equity': equity}]

    for d_str in trading_days:
        day = datetime.date.fromisoformat(d_str)
        expiry = _next_weekly_expiry(day)
        expiry_str = expiry.isoformat()

        days_before = [d for d in trading_days if d < expiry_str]
        if len(days_before) < exit_offset_days:
            continue
        exit_day = days_before[-exit_offset_days]
        if exit_day <= d_str:
            continue

        if expiry_str not in contracts_cache:
            contracts = _get_option_contracts(underlying_key, expiry_str, token, expired=False)
            if not contracts:
                contracts = _get_option_contracts(underlying_key, expiry_str, token, expired=True)
            contracts_cache[expiry_str] = contracts

        contracts = contracts_cache[expiry_str]
        if not contracts:
            continue

        entry_candles = spot_by_day.get(d_str, [])
        if not entry_candles:
            continue
        entry_ts, entry_open = entry_candles[0][0], float(entry_candles[0][1])

        ce, pe = _select_atm_contracts(contracts, entry_open)
        if ce is None or pe is None:
            continue

        legs: List[Dict] = []
        for opt in [ce, pe]:
            opt_key = opt.get('instrument_key') or opt.get('instrumentKey')
            if not opt_key:
                continue
            key_entry = (opt_key, d_str)
            if key_entry not in candle_cache:
                c = _fetch_candles(opt_key, interval, d_str, d_str, token, expired=False)
                if not c:
                    c = _fetch_candles(opt_key, interval, d_str, d_str, token, expired=True)
                candle_cache[key_entry] = c
                time.sleep(0.2)
            cands = candle_cache.get(key_entry, [])
            if not cands:
                continue
            entry_price = float(cands[0][1])

            exit_key = (opt_key, exit_day)
            if exit_key not in candle_cache:
                c = _fetch_candles(opt_key, interval, exit_day, exit_day, token, expired=False)
                if not c:
                    c = _fetch_candles(opt_key, interval, exit_day, exit_day, token, expired=True)
                candle_cache[exit_key] = c
                time.sleep(0.2)
            exit_cands = candle_cache.get(exit_key, [])
            if not exit_cands:
                continue
            exit_price = float(exit_cands[-1][4])

            strike = float(opt.get('strike_price') or opt.get('strike') or 0.0)
            opt_type = str(opt.get('option_type') or opt.get('type') or '').upper()
            legs.append({
                'type': opt_type,
                'side': 'B',
                'strike': strike,
                'entry': entry_price,
                'exit': exit_price,
                'qty': 65,
            })

        if len(legs) < 2:
            continue

        pnl = sum((leg['exit'] - leg['entry']) * leg['qty'] for leg in legs)
        entry_cost = sum(leg['entry'] * leg['qty'] for leg in legs)
        pnl -= cost_per_lot * len(legs)
        pnl_pct = (pnl / entry_cost * 100) if entry_cost else 0

        fut_entry = fut_exit = None
        fut_sel = _select_nearest_future(fut_cands, day)
        if fut_sel and fut_sel.get('instrument_key'):
            fk = fut_sel['instrument_key']
            key_entry = (fk, d_str)
            if key_entry not in candle_cache:
                c = _fetch_candles(fk, interval, d_str, d_str, token, expired=False, kind='future')
                if not c:
                    c = _fetch_candles(fk, interval, d_str, d_str, token, expired=True, kind='future')
                candle_cache[key_entry] = c
                time.sleep(0.2)
            fce = candle_cache.get(key_entry, [])
            if fce:
                fut_entry = float(fce[0][1])
            key_exit = (fk, exit_day)
            if key_exit not in candle_cache:
                c = _fetch_candles(fk, interval, exit_day, exit_day, token, expired=False, kind='future')
                if not c:
                    c = _fetch_candles(fk, interval, exit_day, exit_day, token, expired=True, kind='future')
                candle_cache[key_exit] = c
                time.sleep(0.2)
            fcx = candle_cache.get(key_exit, [])
            if fcx:
                fut_exit = float(fcx[-1][4])

        trade = {
            'entry_time': entry_ts,
            'exit_time': exit_cands[-1][0] if exit_cands else '',
            'expiry': expiry_str,
            'strategy': strategy,
            'legs': legs,
            'pnl': pnl,
            'pnl_pct': pnl_pct,
            'duration_days': (datetime.date.fromisoformat(exit_day) - day).days,
            'fut_entry': fut_entry,
            'fut_exit': fut_exit,
        }
        trades.append(trade)

        equity += pnl
        equity_curve.append({'t': trade['exit_time'], 'equity': equity})

    kpis = _calc_kpis(trades, equity_curve, start_capital)
    pnl_hist = _histogram([t['pnl'] for t in trades])

    dd_series = []
    peak = -1e18
    for p in equity_curve:
        peak = max(peak, p['equity'])
        dd_series.append(max(0, peak - p['equity']))
    dd_hist = _histogram(dd_series)

    dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    dow_map = {d: [] for d in dow}
    month_map: Dict[str, List[float]] = {}
    for t in trades:
        dt = datetime.datetime.fromisoformat(t['entry_time'])
        dow_map[dow[dt.weekday()] if dt.weekday() < 5 else dow[0]].append(t['pnl'])
        m = dt.strftime('%Y-%m')
        month_map.setdefault(m, []).append(t['pnl'])

    result['equity_curve'] = equity_curve
    result['trades'] = trades
    result['kpis'] = kpis
    result['distributions'] = {'pnl_hist': pnl_hist, 'dd_hist': dd_hist}
    result['heatmaps'] = {
        'dow_pnl': [{'dow': k, 'avg': (sum(v) / len(v)) if v else 0} for k, v in dow_map.items()],
        'month_pnl': [{'month': k, 'avg': (sum(v) / len(v)) if v else 0} for k, v in sorted(month_map.items())],
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)
    return output_path
