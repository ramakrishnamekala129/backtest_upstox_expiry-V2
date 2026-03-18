import datetime
import http.server
import json
import os
import threading
from urllib.parse import parse_qs, urlparse

from .backtest import run_backtest_upstox
from .config import BACKTEST_OUTPUT, BACKTEST_STATUS_OUTPUT, PORT, BACKTEST_DEFAULTS

backtest_output = str(BACKTEST_OUTPUT)
backtest_status_output = str(BACKTEST_STATUS_OUTPUT)


def is_valid_html_file(path: str) -> bool:
    if not os.path.exists(path):
        return False
    try:
        with open(path, 'rb') as f:
            sample = f.read(8192)
        if not sample:
            return False
        if sample.count(b'\x00') == len(sample):
            return False
        return b'<!DOCTYPE html>' in sample or b'<html' in sample.lower()
    except Exception:
        return False


def write_backtest_status(state: str, **extra) -> None:
    payload = {
        'state': state,
        'updated_at': datetime.datetime.now().isoformat(),
    }
    payload.update(extra)
    with open(backtest_status_output, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)


def _run_backtest_job(**kwargs) -> None:
    symbol = kwargs.get('symbol', BACKTEST_DEFAULTS['symbol'])
    days = kwargs.get('days', BACKTEST_DEFAULTS['days'])
    interval = kwargs.get('interval', BACKTEST_DEFAULTS['interval'])
    exit_offset_days = kwargs.get('exit_offset_days', BACKTEST_DEFAULTS['exit_offset_days'])
    cost_per_lot = kwargs.get('cost_per_lot', BACKTEST_DEFAULTS['cost_per_lot'])
    strategy = kwargs.get('strategy', BACKTEST_DEFAULTS['strategy'])

    try:
        write_backtest_status(
            'running',
            symbol=symbol,
            days=days,
            interval=interval,
            exit_offset_days=exit_offset_days,
            strategy=strategy,
        )
        run_backtest_upstox(
            symbol=symbol,
            days=days,
            interval=interval,
            exit_offset_days=exit_offset_days,
            cost_per_lot=cost_per_lot,
            strategy=strategy,
            output_path=backtest_output,
        )
        write_backtest_status('ready', symbol=symbol)
    except Exception as exc:
        with open(backtest_output, 'w', encoding='utf-8') as f:
            json.dump({'error': str(exc), 'meta': {'symbol': symbol}}, f, indent=2)
        write_backtest_status('error', symbol=symbol, error=str(exc))


def start_backtest_job(**kwargs) -> threading.Thread:
    worker = threading.Thread(target=_run_backtest_job, kwargs=kwargs, daemon=True)
    worker.start()
    return worker


class BacktestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/backtest_run'):
            parsed = urlparse(self.path)
            q = parse_qs(parsed.query or '')
            symbol = (q.get('symbol') or [BACKTEST_DEFAULTS['symbol']])[0]
            days = int((q.get('days') or [BACKTEST_DEFAULTS['days']])[0])
            interval = int((q.get('interval') or [BACKTEST_DEFAULTS['interval']])[0])
            exit_offset = int((q.get('exit_offset') or [BACKTEST_DEFAULTS['exit_offset_days']])[0])
            cost_per_lot = float((q.get('cost_per_lot') or [BACKTEST_DEFAULTS['cost_per_lot']])[0])
            strategy = (q.get('strategy') or [BACKTEST_DEFAULTS['strategy']])[0]
            start_backtest_job(
                symbol=symbol,
                days=days,
                interval=interval,
                exit_offset_days=exit_offset,
                cost_per_lot=cost_per_lot,
                strategy=strategy,
            )
            self.send_response(202)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"started"}')
            return
        if self.path.startswith('/backtest_status'):
            if not os.path.exists(backtest_status_output):
                write_backtest_status('idle')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            with open(backtest_status_output, 'rb') as f:
                self.wfile.write(f.read())
            return
        return super().do_GET()
