from __future__ import annotations

import datetime as dt
import json
import sys

import pytz
import swisseph as swe


def compute_moon_asc(date_str: str, time_str: str) -> dict[str, float]:
    day, month, year = [int(x) for x in date_str.split("/")]
    hour, minute = [int(x) for x in time_str.split(":")]

    timezone_str = "Asia/Kolkata"
    latitude = 19.054999
    longitude = 72.8692035

    swe.set_ephe_path("./ephe")
    swe.set_sid_mode(swe.SIDM_LAHIRI)

    local_tz = pytz.timezone(timezone_str)
    local_dt = local_tz.localize(dt.datetime(year, month, day, hour, minute, 0))
    utc_dt = local_dt.astimezone(pytz.utc)

    jd_ut = swe.julday(
        utc_dt.year,
        utc_dt.month,
        utc_dt.day,
        utc_dt.hour + utc_dt.minute / 60 + utc_dt.second / 3600,
    )

    moon_pos, _ = swe.calc_ut(jd_ut, swe.MOON, swe.FLG_SIDEREAL | swe.FLG_SPEED)
    moon_lon = float(moon_pos[0])

    _, ascmc = swe.houses(jd_ut, latitude, longitude)
    asc = float(ascmc[0])

    return {"moon": round(moon_lon, 2), "ascendant": round(asc, 2)}


def main() -> int:
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: moon_asc_calc.py dd/mm/yyyy HH:MM"}))
        return 1
    try:
        result = compute_moon_asc(sys.argv[1], sys.argv[2])
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"error": str(exc)}))
        return 1
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
