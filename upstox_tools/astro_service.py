from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Sequence

try:
    import pytz
    import swisseph as swe
except Exception:  # pragma: no cover - optional dependency fallback
    pytz = None
    swe = None


PLANETS = [
    "Sun",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Rahu",
    "Ketu",
    "Ascendant",
]
ASPECT_TARGETS = [0.0, 22.5, 30.0, 36.0, 45.0, 60.0, 72.0, 90.0, 120.0, 135.0, 144.0, 150.0, 180.0]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
SIGNS = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
]


def _parse_datetime(date_value: str, time_value: str) -> datetime:
    return datetime.strptime(f"{date_value} {time_value}", "%Y-%m-%d %H:%M")


def _day_of_year(value: datetime) -> int:
    return int(value.strftime("%j"))


def _sign_for_longitude(longitude: float) -> str:
    return SIGNS[int((longitude % 360) // 30)]


def _planet_longitude(name: str, stamp: datetime) -> float:
    base = sum(ord(char) for char in name) % 360
    minute_of_day = stamp.hour * 60 + stamp.minute
    return (base + _day_of_year(stamp) * 0.9856 + minute_of_day * 0.13 + len(name) * 7.1) % 360


def _planet_positions(stamp: datetime) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for planet in PLANETS:
        longitude = _planet_longitude(planet, stamp)
        rows.append(
            {
                "Planet": planet,
                "Longitude": round(longitude, 2),
                "Sign": _sign_for_longitude(longitude),
                "NakshatraPada": f"{_sign_for_longitude(longitude)}-{int(longitude % 4) + 1}",
            }
        )
    return rows


def _build_aspects(positions: Sequence[Dict[str, Any]], orb: float = 1.5) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for index, left in enumerate(positions):
        for right in positions[index + 1 :]:
            angle = abs(float(left["Longitude"]) - float(right["Longitude"]))
            separation = min(angle, 360 - angle)
            nearest = min(ASPECT_TARGETS, key=lambda value: abs(value - separation))
            delta = abs(nearest - separation)
            if delta > orb:
                continue
            rows.append(
                {
                    "Planet1": left["Planet"],
                    "Planet2": right["Planet"],
                    "Angle": round(separation, 2),
                    "Aspect": nearest,
                    "Delta": round(delta, 2),
                }
            )
    return rows


def _filtered_aspects(aspects: Sequence[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    with_moon = [row for row in aspects if "Moon" in {row["Planet1"], row["Planet2"]}]
    with_asc = [row for row in aspects if "Ascendant" in {row["Planet1"], row["Planet2"]}]
    without_moon = [row for row in aspects if "Moon" not in {row["Planet1"], row["Planet2"]}]
    without_asc = [row for row in aspects if "Ascendant" not in {row["Planet1"], row["Planet2"]}]
    with_either = [
        row for row in aspects if {"Moon", "Ascendant"} & {row["Planet1"], row["Planet2"]}
    ]
    without_either = [
        row for row in aspects if not ({"Moon", "Ascendant"} & {row["Planet1"], row["Planet2"]})
    ]
    return {
        "all": list(aspects),
        "withoutMoon": without_moon,
        "withMoon": with_moon,
        "withoutAscendant": without_asc,
        "withAscendant": with_asc,
        "withMoonOrAscendant": with_either,
        "withoutMoonOrAscendant": without_either,
    }


def build_astro_payload(date_value: str, time_value: str, symbol: str, reference_price: float) -> Dict[str, Any]:
    stamp = _parse_datetime(date_value, time_value)
    positions = _planet_positions(stamp)
    aspects = _build_aspects(positions)
    primary_sign = _sign_for_longitude(float(positions[1]["Longitude"]))
    weekday = WEEKDAYS[stamp.weekday()]
    levels = [
        {"Label": "Support -5%", "Value": round(reference_price * 0.95, 2)},
        {"Label": "Support -2%", "Value": round(reference_price * 0.98, 2)},
        {"Label": "Reference", "Value": round(reference_price, 2)},
        {"Label": "Resistance +2%", "Value": round(reference_price * 1.02, 2)},
        {"Label": "Resistance +5%", "Value": round(reference_price * 1.05, 2)},
    ]
    hora = []
    base_time = datetime.combine(stamp.date(), datetime.min.time()) + timedelta(hours=6)
    for index in range(8):
        slot = base_time + timedelta(hours=index)
        hora.append(
            {
                "Hora": index + 1,
                "Starts": slot.strftime("%H:%M"),
                "Ends": (slot + timedelta(hours=1)).strftime("%H:%M"),
                "Planet": PLANETS[index % len(PLANETS)],
            }
        )
    return {
        "snapshot": {
            "date": date_value,
            "time": time_value,
            "symbol": symbol.strip().upper() or "NIFTY",
            "referencePrice": reference_price,
            "reviewWindow": f"{date_value} previous 45 sessions",
            "weekday": weekday,
        },
        "moonShift": {
            "Weekday": weekday,
            "Moon Sign": primary_sign,
            "Reference Price": round(reference_price, 2),
            "Bias": "Bullish" if stamp.day % 2 == 0 else "Bearish",
            "Symbol": symbol.strip().upper() or "NIFTY",
        },
        "currentPadas": positions[:5],
        "nextPadas": positions[5:],
        "nearestPriceRow": {
            "source": "synthetic",
            "matchedColumn": "Reference",
            "rows": [
                {
                    "Symbol": symbol.strip().upper() or "NIFTY",
                    "Reference": round(reference_price, 2),
                    "Buy1": round(reference_price * 0.985, 2),
                    "Buy2": round(reference_price * 0.9725, 2),
                    "Sell1": round(reference_price * 1.015, 2),
                    "Sell2": round(reference_price * 1.0275, 2),
                }
            ],
        },
        "levels": levels,
        "horaTimings": hora,
        "aspectMatrix": aspects,
        "planetaryLevels": [
            {
                "Planet": row["Planet"],
                "Longitude": row["Longitude"],
                "PriceLevel": round(reference_price * (1 + (index - 4) * 0.01), 2),
            }
            for index, row in enumerate(positions)
        ],
        "monthlyEvents": {
            "transit": [],
            "yoga": [],
            "retrograde": [],
            "asta": [],
        },
        "positions": positions,
        "aspects": aspects,
        "filteredAspects": _filtered_aspects(aspects),
        "errors": [],
    }


def _daterange(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def build_planetary_aspects_payload(
    *,
    start_date: str,
    end_date: str,
    moon_mode: str,
    planet1: Sequence[str],
    planet2: Sequence[str],
    selected_aspects: Sequence[float],
    orb: float,
    max_rows: int,
) -> Dict[str, Any]:
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    rows: List[Dict[str, Any]] = []
    detailed_rows: List[Dict[str, Any]] = []
    planet1_set = {item for item in planet1 if item}
    planet2_set = {item for item in planet2 if item}
    allowed_aspects = set(selected_aspects) if selected_aspects else set(ASPECT_TARGETS)

    for current in _daterange(start, end):
        stamp = datetime.combine(current, datetime.min.time()).replace(hour=9, minute=15)
        positions = _planet_positions(stamp)
        aspects = _build_aspects(positions, orb=max(orb, 0.1))
        for row in aspects:
            if row["Aspect"] not in allowed_aspects:
                continue
            pair = {str(row["Planet1"]), str(row["Planet2"])}
            if planet1_set and not pair & planet1_set:
                continue
            if planet2_set and not pair & planet2_set:
                continue
            if moon_mode == "exclude_moon_ascendant" and pair & {"Moon", "Ascendant"}:
                continue
            if moon_mode == "exclude_moon" and "Moon" in pair:
                continue
            if moon_mode == "exclude_ascendant" and "Ascendant" in pair:
                continue
            if moon_mode == "only_moon" and "Moon" not in pair:
                continue
            if moon_mode == "only_ascendant" and "Ascendant" not in pair:
                continue
            if moon_mode == "moon_ascendant" and pair != {"Moon", "Ascendant"}:
                continue
            final_signal = "Bullish" if int(row["Aspect"]) in {60, 120} else "Bearish" if int(row["Aspect"]) in {90, 180} else "Depends"
            result = {
                "DT": stamp.strftime("%Y-%m-%d %H:%M"),
                "Planet1": row["Planet1"],
                "Planet2": row["Planet2"],
                "Aspect": row["Aspect"],
                "Delta": row["Delta"],
                "FinalSignal": final_signal,
            }
            rows.append(result)
            detailed_rows.append(
                {
                    **result,
                    "Longitude1": next(item["Longitude"] for item in positions if item["Planet"] == row["Planet1"]),
                    "Longitude2": next(item["Longitude"] for item in positions if item["Planet"] == row["Planet2"]),
                }
            )
            if len(rows) >= max_rows:
                break
        if len(rows) >= max_rows:
            break

    return {
        "range": {
            "startDate": start_date,
            "endDate": end_date,
            "daySpan": (end - start).days + 1,
        },
        "filters": {
            "moonMode": moon_mode,
            "planet1": list(planet1_set),
            "planet2": list(planet2_set),
            "selectedAspects": [str(value) for value in sorted(allowed_aspects)],
            "orb": orb,
        },
        "totalRows": len(rows),
        "truncated": len(rows) >= max_rows,
        "rows": rows,
        "detailedRows": detailed_rows,
    }


def _swe_available() -> bool:
    return swe is not None and pytz is not None


def _swisseph_row(local_dt: datetime, include_moon: bool, include_asc: bool) -> tuple[float | None, float | None]:
    if not _swe_available():
        raise RuntimeError("Swiss Ephemeris is unavailable.")
    tz = pytz.timezone("Asia/Kolkata")
    localized = tz.localize(local_dt)
    utc_dt = localized.astimezone(pytz.utc)
    swe.set_sid_mode(swe.SIDM_LAHIRI)
    swe.set_ephe_path(str((__import__("pathlib").Path("async_trend_UI") / "ephe").resolve()))
    jd_ut = swe.julday(
        utc_dt.year,
        utc_dt.month,
        utc_dt.day,
        utc_dt.hour + utc_dt.minute / 60 + utc_dt.second / 3600,
    )
    moon_value = None
    asc_value = None
    if include_moon:
        moon_pos, _ = swe.calc_ut(jd_ut, swe.MOON, swe.FLG_SIDEREAL | swe.FLG_SPEED)
        moon_value = float(moon_pos[0])
    if include_asc:
        _, ascmc = swe.houses(jd_ut, 19.054999, 72.8692035)
        asc_value = float(ascmc[0])
    return moon_value, asc_value


def _fallback_longitude(seed: float) -> float:
    return round(seed % 360, 4)


def build_moon_ascendant_payload(
    *,
    start_date: str,
    end_date: str,
    include_moon: bool,
    include_asc: bool,
    moon_target: float,
    asc_target: float,
    tolerance: float,
) -> Dict[str, Any]:
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    if end < start:
        raise ValueError("endDate must be on or after startDate")
    raw_moon: List[Dict[str, Any]] = []
    raw_asc: List[Dict[str, Any]] = []
    precision_mode = "python_swisseph" if _swe_available() else "js_fallback"

    for day in _daterange(start, end):
        for hour in range(0, 24):
            current = datetime.combine(day, datetime.min.time()).replace(hour=hour)
            moon_value: float | None
            asc_value: float | None
            if _swe_available():
                moon_value, asc_value = _swisseph_row(current, include_moon, include_asc)
            else:
                moon_value = _fallback_longitude(day.toordinal() * 13.2 + hour * 12.8) if include_moon else None
                asc_value = _fallback_longitude(day.toordinal() * 9.7 + hour * 15.3) if include_asc else None
            if moon_value is not None:
                raw_moon.append(
                    {
                        "date_key": current.strftime("%Y-%m-%d"),
                        "time": current.strftime("%H:%M"),
                        "timezone": "Asia/Kolkata",
                        "datetime_key": current.strftime("%Y-%m-%d %H:%M"),
                        "value": round(moon_value, 4),
                        "longitude": round(moon_value, 4),
                    }
                )
            if asc_value is not None:
                raw_asc.append(
                    {
                        "date_key": current.strftime("%Y-%m-%d"),
                        "time": current.strftime("%H:%M"),
                        "timezone": "Asia/Kolkata",
                        "datetime_key": current.strftime("%Y-%m-%d %H:%M"),
                        "value": round(asc_value, 4),
                        "longitude": round(asc_value, 4),
                    }
                )

    filtered_moon = [
        row for row in raw_moon if abs(float(row["value"]) - moon_target) <= tolerance
    ] if include_moon else []
    filtered_asc = [
        row for row in raw_asc if abs(float(row["value"]) - asc_target) <= tolerance
    ] if include_asc else []

    return {
        "range": {
            "startDate": start_date,
            "endDate": end_date,
            "daySpan": (end - start).days + 1,
        },
        "controls": {
            "precisionMode": precision_mode,
        },
        "moon": {
            "rawTotal": len(raw_moon),
            "rawRows": raw_moon,
            "filteredTotal": len(filtered_moon),
            "filteredRows": filtered_moon,
        },
        "ascendant": {
            "rawTotal": len(raw_asc),
            "rawRows": raw_asc,
            "filteredTotal": len(filtered_asc),
            "filteredRows": filtered_asc,
        },
    }
