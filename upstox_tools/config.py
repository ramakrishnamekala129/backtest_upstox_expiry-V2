from pathlib import Path
from urllib.parse import quote

REPO_ROOT = Path(__file__).resolve().parent.parent

API_KEY = 'a24f3517-a6d8-4622-916f-bc664f9b32fe'
SECRET_KEY = '2q1gqkdxx0'
TOTP_KEY = 'YV4SSJZEI2PD4QAKCEAYIHC4NZ2PJ6GI'
MOBILE_NO = '6353854816'
PIN = '260999'

RURL = 'https://127.0.0.1:5000/'
AUTH_URL = (
    'https://api.upstox.com/v2/login/authorization/dialog'
    f'?response_type=code&client_id={API_KEY}&redirect_uri={quote(RURL, safe="")}'
)

FILE_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz'
UPSTOX_BASE = 'https://api.upstox.com'
INSTRUMENTS_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz'

CUSTOM_PAYOFF_LEGS = [
    {'option_type': 'call', 'side': 'buy', 'qty': 65, 'strike_offset': 0, 'premium': None},
    {'option_type': 'put', 'side': 'buy', 'qty': 65, 'strike_offset': 0, 'premium': None}
]

PORT = 8765

PAYOFF_JSON = REPO_ROOT / 'payoff_data.json'
PAYOFF_CHART = REPO_ROOT / 'payoff_chart.html'
PAYOFF_CHART_BACKUP = REPO_ROOT / 'payoff_chart copy.html'
BACKTEST_OUTPUT = REPO_ROOT / 'backtest_data.json'
BACKTEST_STATUS_OUTPUT = REPO_ROOT / 'backtest_status.json'

BACKTEST_DEFAULTS = {
    'symbol': 'NIFTY',
    'days': 90,
    'interval': 5,
    'exit_offset_days': 2,
    'cost_per_lot': 0.0,
    'strategy': 'ATM_STRADDLE'
}
