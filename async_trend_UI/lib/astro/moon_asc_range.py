from __future__ import annotations

import datetime as dt
import json
import sys

import pytz
import swisseph as swe


TIMEZONE = "Asia/Kolkata"
LATITUDE = 19.054999
LONGITUDE = 72.8692035


def _format_row(local_dt: dt.datetime, value: float) -> dict[str, object]:
    date_key = local_dt.strftime("%Y-%m-%d")
    time_key = local_dt.strftime("%H:%M")
    datetime_key = local_dt.strftime("%Y-%m-%d %H:%M")
    value_rounded = round(float(value), 4)
    return {
        "date_key": date_key,
        "time": time_key,
        "timezone": TIMEZONE,
        "datetime_key": datetime_key,
        "value": value_rounded,
        "longitude": value_rounded,
    }


def _jd_ut_from_local(local_dt: dt.datetime) -> float:
    utc_dt = local_dt.astimezone(pytz.utc)
    return swe.julday(
        utc_dt.year,
        utc_dt.month,
        utc_dt.day,
        utc_dt.hour + utc_dt.minute / 60 + utc_dt.second / 3600,
    )


def generate_rows(start_date: str, end_date: str, include_moon: bool, include_asc: bool) -> dict[str, list[dict[str, object]]]:
    tz = pytz.timezone(TIMEZONE)
    start_day = dt.datetime.strptime(start_date, "%Y-%m-%d").date()
    end_day = dt.datetime.strptime(end_date, "%Y-%m-%d").date()

    if end_day < start_day:
        raise ValueError("endDate must be on or after startDate")

    swe.set_ephe_path("./ephe")

    moon_rows: list[dict[str, object]] = []
    asc_rows: list[dict[str, object]] = []

    current = tz.localize(dt.datetime.combine(start_day, dt.time(0, 0)))
    end = tz.localize(dt.datetime.combine(end_day, dt.time(23, 59)))

    while current <= end:
        jd_ut = _jd_ut_from_local(current)
        if include_moon:
            # Match Streamlit cache builder: tropical Moon longitude.
            moon_pos, _ = swe.calc_ut(jd_ut, swe.MOON)
            moon_rows.append(_format_row(current, moon_pos[0]))
        if include_asc:
            _, ascmc = swe.houses(jd_ut, LATITUDE, LONGITUDE)
            asc_rows.append(_format_row(current, ascmc[0]))
        current = current + dt.timedelta(minutes=1)

    return {"moon": moon_rows, "ascendant": asc_rows}


def main() -> int:
    if len(sys.argv) != 5:
        print(json.dumps({"error": "Usage: moon_asc_range.py YYYY-MM-DD YYYY-MM-DD includeMoon includeAsc"}))
        return 1

    start_date = sys.argv[1]
    end_date = sys.argv[2]
    include_moon = sys.argv[3] == "1"
    include_asc = sys.argv[4] == "1"

    try:
        rows = generate_rows(start_date, end_date, include_moon, include_asc)
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"error": str(exc)}))
        return 1

    print(json.dumps(rows, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
