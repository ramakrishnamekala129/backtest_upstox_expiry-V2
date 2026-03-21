# -*- coding: utf-8 -*-
"""
Created on Thu Mar  5 15:38:07 2026

@author: ramak
"""
from __future__ import annotations

import asyncio
import datetime
import gzip
import json
import logging
import math
import os
import pickle
import random
import re
from collections import Counter
from datetime import timedelta
from pathlib import Path

import pandas as pd
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
LOGGER = logging.getLogger(__name__)


def compute_alpha(
    df: pd.DataFrame,
    maindate: datetime.datetime,
    *,
    precleaned: bool = False,
) -> pd.DataFrame:
    """
    Returns alpha DataFrame for maindate.month using last-month OHLC data.

    Required columns in df: Date, Open, High, Low, Close
    maindate: datetime-like (used to compute last month range and target month)
    """

    # ---------- 1) clean + last month filter ----------
    if precleaned:
        working_df = df
    else:
        working_df = df.copy()
        working_df["Date"] = pd.to_datetime(working_df["Date"], errors="coerce")
        for col in ["Open", "High", "Low", "Close"]:
            working_df[col] = pd.to_numeric(working_df[col], errors="coerce")

    d1f = maindate
    first_day_this_month = maindate.replace(day=1)
    last_day_last_month = first_day_this_month - timedelta(days=1)
    first_day_last_month = last_day_last_month.replace(day=1)

    start_date = pd.to_datetime(first_day_last_month)
    end_date = pd.to_datetime(last_day_last_month)

    df = working_df.loc[working_df["Date"].between(start_date, end_date)].copy()
    df = df.dropna(subset=["Date", "High", "Low"]).drop_duplicates()
    if df.empty:
        return pd.DataFrame(
            columns=[
                "Strong Trend Change Date",
                "Strong Trend",
                "Strong Weekday",
                "Major Trend Change Date",
                "Major Trend",
                "Major Weekday",
            ]
        )

    # ---------- 2) extrema + indices ----------
    t = df.sort_values("Date").set_index("Date")
    maxh = t["High"].max()
    minh = t["Low"].min()

    maxhdate = t.index[t["High"] == maxh][0]
    minhdate = t.index[t["Low"] == minh][0]

    tmp = t.reset_index()
    maxhindex = tmp.index[tmp["High"] == maxh][0]
    minhindex = tmp.index[tmp["Low"] == minh][0]

    tradeday = abs(minhindex - maxhindex) + 1
    calenderdate = abs(maxhdate.day - minhdate.day) + 1

    # ---------- helpers ----------
    def deg_from_value(x: float) -> float:
        return ((math.sqrt(x)) * 180 - 225) % 360

    def build_dates(anchor_max, anchor_min, maxdeg, mindeg, a_mult=2):
        max1 = (a_mult * 1 + (2 * maxdeg) / 360 + 1.25) ** 2
        max2 = (a_mult * 2 + (2 * maxdeg) / 360 + 1.25) ** 2
        max3 = (a_mult * 3 + (2 * maxdeg) / 360 + 1.25) ** 2

        min1 = (a_mult * 1 + (2 * mindeg) / 360 + 1.25) ** 2
        min2 = (a_mult * 2 + (2 * mindeg) / 360 + 1.25) ** 2
        min3 = (a_mult * 3 + (2 * mindeg) / 360 + 1.25) ** 2

        hi = max(anchor_max, anchor_min)
        lo = min(anchor_max, anchor_min)

        return [
            (hi + timedelta(days=max1)).date(),
            (hi + timedelta(days=max2)).date(),
            (hi + timedelta(days=max3)).date(),
            (hi + timedelta(days=min1)).date(),
            (hi + timedelta(days=min2)).date(),
            (hi + timedelta(days=min3)).date(),
            (lo + timedelta(days=max1)).date(),
            (lo + timedelta(days=max2)).date(),
            (lo + timedelta(days=max3)).date(),
            (lo + timedelta(days=min1)).date(),
            (lo + timedelta(days=min2)).date(),
            (lo + timedelta(days=min3)).date(),
        ]

    def alpha_from_dates(dates, target_month):
        dates = [d for d in dates if d.month == target_month]
        date_counter = Counter(dates)
        sorted_dates = sorted(date_counter.items(), key=lambda x: x[0])

        strong, weak = [], []
        for d, count in sorted_dates:
            row = [d.strftime("%d-%B-%Y"), str(count), d.strftime("%A")]
            if int(count) == 1:
                weak.append(row)
            else:
                strong.append(row)

        strong_df = pd.DataFrame(
            strong,
            columns=["Major Trend Change Date", "Major Trend", "Major Weekday"],
        )
        weak_df = pd.DataFrame(
            weak,
            columns=["Minor Trend Change Date", "Minor Trend", "Minor Weekday"],
        )

        if len(weak_df) > len(strong_df):
            out = weak_df.copy()
            out["Major Trend Change Date"] = strong_df.get("Major Trend Change Date")
            out["Major Trend"] = strong_df.get("Major Trend")
            out["Major Weekday"] = strong_df.get("Major Weekday")
        else:
            out = strong_df.copy()
            out["Minor Trend Change Date"] = weak_df.get("Minor Trend Change Date")
            out["Minor Trend"] = weak_df.get("Minor Trend")
            out["Minor Weekday"] = weak_df.get("Minor Weekday")

        out = out[
            [
                "Major Trend Change Date",
                "Major Trend",
                "Major Weekday",
                "Minor Trend Change Date",
                "Minor Trend",
                "Minor Weekday",
            ]
        ]

        out.columns = [
            "Strong Trend Change Date",
            "Strong Trend",
            "Strong Weekday",
            "Major Trend Change Date",
            "Major Trend",
            "Major Weekday",
        ]
        return out

    # ---------- 3) build h1, h2, h3 then combine ----------
    maxmod = deg_from_value(maxh)
    minmod = deg_from_value(minh)
    calenderdatemod = deg_from_value(calenderdate)
    tradedaymod = deg_from_value(tradeday)

    # h1
    maxdeg_1 = max([maxmod, minmod, calenderdatemod, tradedaymod])
    mindeg_1 = min([maxmod, minmod, calenderdatemod, tradedaymod])
    h1 = build_dates(maxhdate, minhdate, maxdeg_1, mindeg_1, a_mult=2)

    # h2
    range_mod = deg_from_value(maxh - minh)
    maxdeg_2 = max([range_mod, tradedaymod, calenderdatemod])
    mindeg_2 = min([range_mod, tradedaymod, calenderdatemod])
    h2 = build_dates(maxhdate, minhdate, maxdeg_2, mindeg_2, a_mult=2)

    # h3
    if minh == 0:
        return pd.DataFrame(
            columns=[
                "Strong Trend Change Date",
                "Strong Trend",
                "Strong Weekday",
                "Major Trend Change Date",
                "Major Trend",
                "Major Weekday",
            ]
        )
    deg = ((maxh / minh) * 180) - 180
    mins = [(2 * i + (2 * deg) / 360 + 1.25) ** 2 for i in range(1, 6)]
    hi = max(maxhdate, minhdate)
    lo = min(maxhdate, minhdate)
    h3 = [(hi + timedelta(days=x)).date() for x in mins] + [
        (lo + timedelta(days=x)).date() for x in mins
    ]

    h5 = h1 + h2 + h3

    # ---------- 4) return alpha ----------
    return alpha_from_dates(h5, d1f.month)


UPSTOX_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
NSE_HOME_URL = "https://www.nseindia.com/"
NSE_HISTORY_URL = "https://www.nseindia.com/api/historicalOR/cm/equity"
DB_PATH = Path("db.pkl")
STATE_PATH = Path("download_state.json")
OUTPUT_DIR = Path("excel_output")
CHUNK_DAYS = 30
MAX_SYMBOL_CONCURRENCY = 4
MAX_REQUEST_CONCURRENCY = 6
BACKTEST_MONTHS = 6
DB_SAVE_EVERY = 25
CHUNK_SLEEP_MIN = 0.05
CHUNK_SLEEP_MAX = 0.2
STOCK_UNIVERSE_JSON = Path("data/stock_universes.json")

NSE_HEADERS = {
    "accept": "application/json,text/plain,*/*",
    "accept-language": "en-US,en;q=0.9",
    "referer": "https://www.nseindia.com/",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
}


def empty_price_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=["Date", "Open", "High", "Low", "Close", "Symbol"])


def atomic_write_pickle(path: Path, payload: dict) -> None:
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    with temp_path.open("wb") as file:
        pickle.dump(payload, file)
    temp_path.replace(path)


def load_db(db_path: Path) -> dict:
    try:
        with db_path.open("rb") as file:
            return pickle.load(file)
    except FileNotFoundError:
        LOGGER.warning("%s not found. Starting with empty cache.", db_path.name)
        return {}
    except EOFError:
        LOGGER.warning("EOFError while loading %s. Starting with empty cache.", db_path.name)
        return {}
    except Exception as exc:
        LOGGER.exception("Failed to load %s: %s", db_path.name, exc)
        return {}


def load_download_state(state_path: Path) -> dict:
    try:
        with state_path.open("r", encoding="utf-8") as file:
            state = json.load(file)
        return state if isinstance(state, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as exc:
        LOGGER.exception("Could not load %s: %s", state_path.name, exc)
        return {}


def save_download_state(state_path: Path, state: dict) -> None:
    try:
        temp_path = state_path.with_suffix(f"{state_path.suffix}.tmp")
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(state, file, ensure_ascii=True, indent=2)
        temp_path.replace(state_path)
    except Exception as exc:
        LOGGER.exception("Could not save %s: %s", state_path.name, exc)


def build_sheet_name(raw_name: str, used_names: set[str]) -> str:
    sheet_name = re.sub(r"[\\/*?:\[\]]", "_", raw_name).strip()
    if not sheet_name:
        sheet_name = "Sheet"

    base_name = sheet_name[:31]
    candidate = base_name
    suffix = 1
    while candidate in used_names:
        suffix_txt = f"_{suffix}"
        candidate = f"{base_name[: 31 - len(suffix_txt)]}{suffix_txt}"
        suffix += 1

    used_names.add(candidate)
    return candidate


def export_dataframes_to_excel(
    trend_dates_df: pd.DataFrame,
    dates_table: dict[str, pd.DataFrame],
    single_df: pd.DataFrame,
    summary_df: pd.DataFrame,
    output_dir: Path,
) -> None:
    def to_excel_with_fallback(df: pd.DataFrame, path: Path) -> Path:
        try:
            df.to_excel(path, index=False)
            return path
        except PermissionError:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            fallback_path = path.with_name(f"{path.stem}_{timestamp}{path.suffix}")
            df.to_excel(fallback_path, index=False)
            LOGGER.warning(
                "%s is locked/open. Saved to %s instead.",
                path.name,
                fallback_path.name,
            )
            return fallback_path

    def table_excel_with_fallback(path: Path) -> Path:
        try:
            with pd.ExcelWriter(path) as writer:
                if dates_table:
                    used_names = set()
                    for trend_date, trend_df in dates_table.items():
                        sheet_name = build_sheet_name(trend_date, used_names)
                        trend_df.to_excel(writer, sheet_name=sheet_name, index=False)
                else:
                    pd.DataFrame(columns=["Symbol", "Trend", "Strength", "Week"]).to_excel(
                        writer, sheet_name="NoData", index=False
                    )
            return path
        except PermissionError:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            fallback_path = path.with_name(f"{path.stem}_{timestamp}{path.suffix}")
            with pd.ExcelWriter(fallback_path) as writer:
                if dates_table:
                    used_names = set()
                    for trend_date, trend_df in dates_table.items():
                        sheet_name = build_sheet_name(trend_date, used_names)
                        trend_df.to_excel(writer, sheet_name=sheet_name, index=False)
                else:
                    pd.DataFrame(columns=["Symbol", "Trend", "Strength", "Week"]).to_excel(
                        writer, sheet_name="NoData", index=False
                    )
            LOGGER.warning(
                "%s is locked/open. Saved to %s instead.",
                path.name,
                fallback_path.name,
            )
            return fallback_path

    output_dir.mkdir(parents=True, exist_ok=True)

    trend_dates_path = output_dir / "TrendDates.xlsx"
    single_df_path = output_dir / "dates_wise_single_df.xlsx"
    summary_df_path = output_dir / "dates_wise_summary.xlsx"
    table_path = output_dir / "dates_wise_table.xlsx"

    trend_dates_path = to_excel_with_fallback(trend_dates_df, trend_dates_path)
    single_df_path = to_excel_with_fallback(single_df, single_df_path)
    summary_df_path = to_excel_with_fallback(summary_df, summary_df_path)
    table_path = table_excel_with_fallback(table_path)

    LOGGER.info("TrendDates Excel: %s", trend_dates_path.resolve())
    LOGGER.info("Dates Single Excel: %s", single_df_path.resolve())
    LOGGER.info("Dates Summary Excel: %s", summary_df_path.resolve())
    LOGGER.info("Dates Table Excel: %s", table_path.resolve())


def export_dataframes_to_json(
    trend_dates_df: pd.DataFrame,
    dates_table: dict[str, pd.DataFrame],
    single_df: pd.DataFrame,
    summary_df: pd.DataFrame,
    output_dir: Path,
) -> None:
    def normalize_df(df: pd.DataFrame) -> pd.DataFrame:
        clean_df = df.copy()
        for col in clean_df.columns:
            if pd.api.types.is_datetime64_any_dtype(clean_df[col]):
                clean_df[col] = clean_df[col].dt.strftime("%Y-%m-%d")
        clean_df = clean_df.where(pd.notnull(clean_df), None)
        return clean_df

    def to_records(df: pd.DataFrame) -> list[dict]:
        return normalize_df(df).to_dict(orient="records")

    payload = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "trend_dates": to_records(trend_dates_df),
        "dates_wise_single": to_records(single_df),
        "dates_wise_summary": to_records(summary_df),
        "dates_wise_table": {
            trend_date: to_records(trend_df)
            for trend_date, trend_df in dates_table.items()
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "trend_tables.json"

    try:
        with json_path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=True, indent=2)
        saved_path = json_path
    except PermissionError:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        fallback_path = json_path.with_name(f"{json_path.stem}_{timestamp}{json_path.suffix}")
        with fallback_path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=True, indent=2)
        LOGGER.warning(
            "%s is locked/open. Saved to %s instead.",
            json_path.name,
            fallback_path.name,
        )
        saved_path = fallback_path

    LOGGER.info("Trend Tables JSON: %s", saved_path.resolve())


def normalize_cached_df(records) -> pd.DataFrame:
    cached_df = pd.DataFrame.from_dict(records) if records else empty_price_frame()
    if cached_df.empty:
        return empty_price_frame()

    cached_df["Date"] = pd.to_datetime(cached_df["Date"], errors="coerce")
    cached_df = cached_df.dropna(subset=["Date"])

    required_cols = ["Date", "Open", "High", "Low", "Close", "Symbol"]
    for col in required_cols:
        if col not in cached_df.columns:
            cached_df[col] = None

    cached_df = cached_df[required_cols]
    cached_df = (
        cached_df.sort_values("Date")
        .drop_duplicates(subset=["Date"])
        .reset_index(drop=True)
    )
    return cached_df


def merge_price_frames(cached_df: pd.DataFrame, new_df: pd.DataFrame) -> pd.DataFrame:
    if cached_df.empty:
        return new_df.copy()
    if new_df.empty:
        return cached_df.copy()

    df = pd.concat([cached_df, new_df], ignore_index=True)
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date"])
    df = df.sort_values("Date").drop_duplicates(subset=["Date"]).reset_index(drop=True)
    return df


def build_nse_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(NSE_HEADERS)
    return session


async def fetch_fut_symbols() -> list[str]:
    response = await asyncio.to_thread(requests.get, UPSTOX_URL, timeout=30)
    response.raise_for_status()
    compressed = response.content

    decompressed = gzip.decompress(compressed)
    data = json.loads(decompressed.decode("utf-8"))

    instruments_df = pd.json_normalize(data)
    instruments_df = instruments_df[
        (instruments_df["segment"] == "NSE_FO")
        & (instruments_df["instrument_type"] != "CE")
        & (instruments_df["instrument_type"] != "PE")
    ]
    return list(instruments_df["underlying_symbol"].dropna().unique())


def load_symbols_from_stock_universes(universe_key: str) -> list[str]:
    if not STOCK_UNIVERSE_JSON.exists():
        raise FileNotFoundError(f"Missing universe file: {STOCK_UNIVERSE_JSON}")

    with STOCK_UNIVERSE_JSON.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    universes = payload.get("universes", {})
    key_map = {
        "NIFTY50": "nifty50",
        "NIFTY100": "nifty100",
        "NIFTY250": "nifty250",
        "NIFTY500": "nifty500",
        "FNO": "fno",
    }
    resolved_key = key_map.get(universe_key.upper())
    if not resolved_key:
        raise ValueError(
            f"Invalid STOCK_UNIVERSE='{universe_key}'. Use one of: {', '.join(key_map)}"
        )

    symbols = universes.get(resolved_key, [])
    if not isinstance(symbols, list):
        raise ValueError(f"Universe '{resolved_key}' is not a valid list in {STOCK_UNIVERSE_JSON}")

    normalized = sorted({str(symbol).strip().upper() for symbol in symbols if str(symbol).strip()})
    if not normalized:
        raise ValueError(f"Universe '{resolved_key}' has no symbols in {STOCK_UNIVERSE_JSON}")
    return normalized


async def warm_nse_cookie(
    session: requests.Session, request_sem: asyncio.Semaphore
) -> int:
    async with request_sem:
        response = await asyncio.to_thread(session.get, NSE_HOME_URL, timeout=15)
    return response.status_code


async def get_chunk(
    session: requests.Session,
    request_sem: asyncio.Semaphore,
    symbol: str,
    f_date: str,
    t_date: str,
    retries: int = 5,
) -> pd.DataFrame:
    params = {
        "symbol": symbol,
        "series": "[\"EQ\"]",
        "from": f_date,
        "to": t_date,
    }

    for attempt in range(1, retries + 1):
        try:
            async with request_sem:
                response = await asyncio.to_thread(
                    session.get, NSE_HISTORY_URL, params=params, timeout=25
                )

            if response.status_code == 200:
                payload = response.json()
                rows = payload.get("data", [])
                if not rows:
                    LOGGER.info("Empty data %s -> %s for %s", f_date, t_date, symbol)
                    return empty_price_frame()

                out = pd.DataFrame(rows)
                out["Date"] = pd.to_datetime(
                    out["mTIMESTAMP"], format="%d-%b-%Y", errors="coerce"
                )
                out["Open"] = pd.to_numeric(out["CH_OPENING_PRICE"], errors="coerce")
                out["High"] = pd.to_numeric(out["CH_TRADE_HIGH_PRICE"], errors="coerce")
                out["Low"] = pd.to_numeric(out["CH_TRADE_LOW_PRICE"], errors="coerce")
                out["Close"] = pd.to_numeric(out["CH_CLOSING_PRICE"], errors="coerce")
                out["Symbol"] = out["CH_SYMBOL"]

                out = out[["Date", "Open", "High", "Low", "Close", "Symbol"]]
                out = out.dropna(subset=["Date"])
                out = (
                    out.sort_values("Date")
                    .drop_duplicates(subset=["Date"])
                    .reset_index(drop=True)
                )
                LOGGER.info("%s -> %s | %s rows for %s", f_date, t_date, len(out), symbol)
                return out

            if response.status_code in (401, 403):
                wait = (2**attempt) + random.uniform(0.5, 1.5)
                LOGGER.warning(
                    "Auth status %s for %s; refreshing cookie and retrying in %.1fs",
                    response.status_code,
                    symbol,
                    wait,
                )
                warm_status = await warm_nse_cookie(session, request_sem)
                LOGGER.info("Cookie refresh status for %s: %s", symbol, warm_status)
                await asyncio.sleep(wait)
                continue

            if response.status_code in (429, 500, 502, 503, 504):
                wait = (2**attempt) + random.uniform(0.5, 1.5)
                LOGGER.warning(
                    "Retry %s/%s after %.1fs (%s) for %s",
                    attempt,
                    retries,
                    wait,
                    response.status_code,
                    symbol,
                )
                await asyncio.sleep(wait)
                continue

            LOGGER.warning(
                "HTTP %s for %s %s -> %s",
                response.status_code,
                symbol,
                f_date,
                t_date,
            )
            return empty_price_frame()

        except (requests.RequestException, ValueError, json.JSONDecodeError) as exc:
            wait = (2**attempt) + random.uniform(0.5, 1.5)
            LOGGER.warning("Error %s, retry in %.1fs (attempt %s)", exc, wait, attempt)
            await asyncio.sleep(wait)

    return empty_price_frame()


async def download_missing_range(
    session: requests.Session,
    request_sem: asyncio.Semaphore,
    symbol: str,
    fetch_start: datetime.date,
    fetch_end: datetime.date,
) -> pd.DataFrame:
    all_chunks = []
    current = fetch_start

    while current <= fetch_end:
        next_end = min(current + datetime.timedelta(days=CHUNK_DAYS - 1), fetch_end)
        s_str = current.strftime("%d-%m-%Y")
        e_str = next_end.strftime("%d-%m-%Y")

        LOGGER.info("Fetching %s: %s -> %s", symbol, s_str, e_str)
        chunk_df = await get_chunk(
            session=session,
            request_sem=request_sem,
            symbol=symbol,
            f_date=s_str,
            t_date=e_str,
        )
        if not chunk_df.empty:
            all_chunks.append(chunk_df)

        current = next_end + datetime.timedelta(days=1)
        await asyncio.sleep(random.uniform(CHUNK_SLEEP_MIN, CHUNK_SLEEP_MAX))

    if all_chunks:
        return pd.concat(all_chunks, ignore_index=True)

    return empty_price_frame()


async def process_symbol(
    request_sem: asyncio.Semaphore,
    symbol: str,
    db_snapshot: dict,
    maindates: list[datetime.datetime],
    fetch_end: datetime.date,
    allow_download: bool,
) -> tuple[str, list | None, pd.DataFrame]:
    nse_session = build_nse_session()
    try:
        LOGGER.info("=== %s ===", symbol)
        cached_df = normalize_cached_df(db_snapshot.get(symbol, []))

        if not cached_df.empty:
            latest_cached_date = cached_df["Date"].max().date()
            fetch_start = latest_cached_date + datetime.timedelta(days=1)
            LOGGER.info("%s latest cached date: %s", symbol, latest_cached_date)
        else:
            fetch_start = fetch_end - datetime.timedelta(days=350)
            LOGGER.info("%s no cache found, downloading full range.", symbol)

        LOGGER.info("%s fetch range: %s -> %s", symbol, fetch_start, fetch_end)

        if not allow_download:
            LOGGER.info("%s monthly download already completed. Using cached data only.", symbol)
            final_df = cached_df.copy()
        elif not cached_df.empty and fetch_start > fetch_end:
            LOGGER.info("%s cache already up to date. Using cached data only.", symbol)
            final_df = cached_df.copy()
        else:
            new_df = await download_missing_range(
                session=nse_session,
                request_sem=request_sem,
                symbol=symbol,
                fetch_start=fetch_start,
                fetch_end=fetch_end,
            )

            if not new_df.empty:
                final_df = merge_price_frames(cached_df, new_df)
                LOGGER.info("%s added %s new rows", symbol, len(new_df))
            else:
                LOGGER.info("%s no new data retrieved. Using cached data.", symbol)
                final_df = cached_df.copy()

        if not final_df.empty:
            save_df = final_df.copy()
            save_df["Date"] = save_df["Date"].dt.strftime("%Y-%m-%d")
            records = save_df.to_dict("records")
        else:
            LOGGER.warning("No data available for %s", symbol)
            records = []

        alpha = pd.DataFrame()
        if not final_df.empty:
            # Normalize once for all month windows to avoid repeated coercion.
            final_df_clean = final_df.copy()
            final_df_clean["Date"] = pd.to_datetime(final_df_clean["Date"], errors="coerce")
            for col in ["Open", "High", "Low", "Close"]:
                final_df_clean[col] = pd.to_numeric(final_df_clean[col], errors="coerce")
            final_df_clean = (
                final_df_clean.dropna(subset=["Date", "High", "Low"])
                .drop_duplicates()
                .reset_index(drop=True)
            )

            alpha_frames = []
            for maindate in maindates:
                alpha_piece = compute_alpha(final_df_clean, maindate, precleaned=True)
                if alpha_piece.empty:
                    continue

                alpha_piece.columns = ["Trend", "Strength", "Week", "T", "S", "W"]
                alpha_piece["Symbol"] = symbol
                alpha_piece = alpha_piece[["Symbol", "Trend", "Strength", "Week"]]
                alpha_piece = alpha_piece.dropna()
                alpha_frames.append(alpha_piece)

            if alpha_frames:
                alpha = pd.concat(alpha_frames, ignore_index=True)
                alpha = alpha.drop_duplicates(subset=["Symbol", "Trend", "Strength", "Week"])
                alpha["Trend_dt"] = pd.to_datetime(
                    alpha["Trend"], format="%d-%B-%Y", errors="coerce"
                )
                alpha = alpha.sort_values(
                    ["Trend_dt", "Strength", "Symbol"], ascending=[True, False, True]
                )
                alpha = alpha.drop(columns=["Trend_dt"]).reset_index(drop=True)
                LOGGER.info("%s alpha rows: %s", symbol, len(alpha))
            else:
                LOGGER.info("Skipping alpha for %s because alpha is empty", symbol)
        else:
            LOGGER.info("Skipping alpha for %s because dataframe is empty", symbol)

        return symbol, records, alpha

    except Exception as exc:
        LOGGER.exception("Skip %s | Error: %s", symbol, exc)
        return symbol, None, pd.DataFrame()
    finally:
        nse_session.close()


def shift_month(base_date: datetime.date, months: int) -> datetime.date:
    year = base_date.year + (base_date.month - 1 + months) // 12
    month = (base_date.month - 1 + months) % 12 + 1
    return datetime.date(year, month, 1)


def build_main_dates(today: datetime.date, backtest_months: int) -> list[datetime.datetime]:
    first_day_this_month = datetime.date(today.year, today.month, 1)
    month_starts: list[datetime.datetime] = []

    for offset in range(backtest_months - 1, -1, -1):
        month_start = shift_month(first_day_this_month, -offset)
        month_starts.append(datetime.datetime(month_start.year, month_start.month, 1))

    return month_starts


async def run_pipeline() -> pd.DataFrame:
    today = datetime.date.today()
    env_symbol_concurrency = os.getenv("MAX_SYMBOL_CONCURRENCY", str(MAX_SYMBOL_CONCURRENCY)).strip()
    env_request_concurrency = os.getenv("MAX_REQUEST_CONCURRENCY", str(MAX_REQUEST_CONCURRENCY)).strip()
    env_db_save_every = os.getenv("DB_SAVE_EVERY", str(DB_SAVE_EVERY)).strip()

    env_backtest_months = os.getenv("BACKTEST_MONTHS", str(BACKTEST_MONTHS)).strip()
    env_stock_universe = os.getenv("STOCK_UNIVERSE", "FNO").strip().upper()
    try:
        backtest_months = max(1, int(env_backtest_months))
    except ValueError:
        backtest_months = BACKTEST_MONTHS
    try:
        symbol_concurrency = max(1, int(env_symbol_concurrency))
    except ValueError:
        symbol_concurrency = MAX_SYMBOL_CONCURRENCY
    try:
        request_concurrency = max(1, int(env_request_concurrency))
    except ValueError:
        request_concurrency = MAX_REQUEST_CONCURRENCY
    try:
        db_save_every = max(1, int(env_db_save_every))
    except ValueError:
        db_save_every = DB_SAVE_EVERY

    maindates = build_main_dates(today, backtest_months)
    target_months = [main_date.strftime("%Y-%m") for main_date in maindates]
    LOGGER.info("Backtest months: %s", target_months)
    LOGGER.info(
        "Concurrency config: symbols=%s requests=%s db_save_every=%s",
        symbol_concurrency,
        request_concurrency,
        db_save_every,
    )

    fetch_end = today - datetime.timedelta(days=1)
    dbfile = load_db(DB_PATH)
    db_snapshot = dict(dbfile)
    trend_dates_list = []
    download_state = load_download_state(STATE_PATH)
    current_month = today.strftime("%Y-%m")
    monthly_download_pending = download_state.get("last_download_month") != current_month

    if monthly_download_pending:
        LOGGER.info("Monthly download enabled for %s.", current_month)
    else:
        LOGGER.info(
            "Monthly download already done for %s. Using cache unless a new symbol appears.",
            current_month,
        )

    if env_stock_universe == "FNO":
        list_fut_syms = await fetch_fut_symbols()
        symbol_source = "Upstox NSE_FO underlying symbols"
    else:
        list_fut_syms = load_symbols_from_stock_universes(env_stock_universe)
        symbol_source = f"{STOCK_UNIVERSE_JSON}:{env_stock_universe}"

    list_fut_syms = sorted({sym.strip().upper() for sym in list_fut_syms if sym and str(sym).strip()})
    LOGGER.info(
        "Stock universe: %s | source=%s | symbols=%s",
        env_stock_universe,
        symbol_source,
        len(list_fut_syms),
    )

    symbol_sem = asyncio.Semaphore(symbol_concurrency)
    request_sem = asyncio.Semaphore(request_concurrency)

    async def bounded_worker(sym: str):
        async with symbol_sem:
            allow_download = monthly_download_pending or (sym not in db_snapshot)
            return await process_symbol(
                request_sem=request_sem,
                symbol=sym,
                db_snapshot=db_snapshot,
                maindates=maindates,
                fetch_end=fetch_end,
                allow_download=allow_download,
            )

    tasks = [asyncio.create_task(bounded_worker(sym)) for sym in list_fut_syms]

    completed_count = 0
    dirty_writes = 0
    for task in asyncio.as_completed(tasks):
        symbol, records, alpha = await task
        completed_count += 1

        if records is not None:
            dbfile[symbol] = records
            dirty_writes += 1
            if dirty_writes >= db_save_every:
                atomic_write_pickle(DB_PATH, dbfile)
                LOGGER.info(
                    "Checkpoint DB save after %s completed symbols.",
                    completed_count,
                )
                dirty_writes = 0

        if not alpha.empty:
            trend_dates_list.append(alpha)

    if dirty_writes > 0:
        atomic_write_pickle(DB_PATH, dbfile)
        LOGGER.info("Final DB save with remaining %s updates.", dirty_writes)

    if monthly_download_pending:
        download_state["last_download_month"] = current_month
        download_state["last_run_date"] = today.isoformat()
        save_download_state(STATE_PATH, download_state)
        LOGGER.info("Updated monthly download state in %s", STATE_PATH.name)

    if trend_dates_list:
        return pd.concat(trend_dates_list, ignore_index=True)

    return pd.DataFrame(columns=["Symbol", "Trend", "Strength", "Week"])


def dates_wise_table(all_alpha: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """
    Input: all_alpha with columns: Symbol, Trend, Strength, Week
    Returns: dict where key = Trend date string, value = df of symbols for that date
    """
    df = all_alpha.copy()

    # ensure Trend is datetime for proper sorting
    df["Trend_dt"] = pd.to_datetime(df["Trend"], format="%d-%B-%Y", errors="coerce")
    df = df.dropna(subset=["Trend_dt"]).sort_values(
        ["Trend_dt", "Strength", "Symbol"], ascending=[True, False, True]
    )

    out = {}
    for d, g in df.groupby("Trend_dt"):
        out[d.strftime("%d-%B-%Y")] = g[["Symbol", "Trend", "Strength", "Week"]].reset_index(drop=True)

    return out


def dates_wise_single_df(all_alpha: pd.DataFrame) -> pd.DataFrame:
    df = all_alpha.copy()
    df["Trend_dt"] = pd.to_datetime(df["Trend"], format="%d-%B-%Y", errors="coerce")

    df = df.dropna(subset=["Trend_dt"]).sort_values(
        ["Trend_dt", "Strength", "Symbol"], ascending=[True, False, True]
    )

    # optional: show date as a header-like column
    df["Trend"] = df["Trend_dt"].dt.strftime("%d-%B-%Y")

    return df[["Trend", "Week", "Symbol", "Strength"]].reset_index(drop=True)


def dates_wise_summary(all_alpha: pd.DataFrame) -> pd.DataFrame:
    df = all_alpha.copy()
    df["Trend_dt"] = pd.to_datetime(df["Trend"], format="%d-%B-%Y", errors="coerce")
    df = df.dropna(subset=["Trend_dt"])

    # sort so strong ones appear first in the list
    df = df.sort_values(["Trend_dt", "Strength", "Symbol"], ascending=[True, False, True])

    summary = (
        df.groupby("Trend_dt")
        .agg(
            Week=("Week", "first"),
            Count=("Symbol", "count"),
            MaxStrength=("Strength", "max"),
            Symbols=("Symbol", lambda s: ", ".join(s.tolist())),
        )
        .reset_index()
    )
    summary["Trend"] = summary["Trend_dt"].dt.strftime("%d-%B-%Y")
    return summary[["Trend", "Week", "Count", "MaxStrength", "Symbols"]]


def main() -> None:
    trend_dates = asyncio.run(run_pipeline())
    dates_table = dates_wise_table(trend_dates)
    single_df = dates_wise_single_df(trend_dates)
    summary_df = dates_wise_summary(trend_dates)

    export_dataframes_to_excel(
        trend_dates_df=trend_dates,
        dates_table=dates_table,
        single_df=single_df,
        summary_df=summary_df,
        output_dir=OUTPUT_DIR,
    )

    export_dataframes_to_json(
        trend_dates_df=trend_dates,
        dates_table=dates_table,
        single_df=single_df,
        summary_df=summary_df,
        output_dir=OUTPUT_DIR,
    )


if __name__ == "__main__":
    main()
