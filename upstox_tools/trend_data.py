from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Tuple

import requests


TrendPayload = Dict[str, Any]


def _candidate_paths() -> list[Path]:
    generated = Path(
        os.getenv("GENERATED_TREND_JSON_PATH", "").strip() or "data/trend_tables.json"
    )
    env_path = os.getenv("TREND_JSON_PATH", "").strip()
    fallback = Path("async_trend_UI") / "public" / "trend_tables.json"
    paths: list[Path] = [generated]
    if env_path:
        paths.append(Path(env_path))
    paths.append(fallback)
    deduped: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        resolved = str(path.resolve()) if path.exists() else str(path)
        if resolved in seen:
            continue
        seen.add(resolved)
        deduped.append(path)
    return deduped


def _unwrap_payload(value: Any) -> TrendPayload | None:
    if not isinstance(value, dict):
        return None
    payload = value.get("payload", value)
    if not isinstance(payload, dict):
        return None
    required = (
        "trend_dates",
        "dates_wise_single",
        "dates_wise_summary",
        "dates_wise_table",
    )
    if not all(key in payload for key in required):
        return None
    if not isinstance(payload["dates_wise_table"], dict):
        return None
    return payload


def load_trend_payload() -> Tuple[str, TrendPayload]:
    failures: list[str] = []

    for path in _candidate_paths():
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError as exc:
            failures.append(f"{path}: {exc}")
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            failures.append(f"{path}: {exc}")
            continue
        payload = _unwrap_payload(data)
        if payload is not None:
            return (str(path), payload)
        failures.append(f"{path}: invalid trend payload shape")

    remote_url = os.getenv("TREND_DATA_URL", "").strip()
    if remote_url:
        try:
            response = requests.get(remote_url, timeout=20)
            response.raise_for_status()
            payload = _unwrap_payload(response.json())
            if payload is not None:
                return ("TREND_DATA_URL", payload)
            failures.append("TREND_DATA_URL: invalid trend payload shape")
        except requests.RequestException as exc:
            failures.append(f"TREND_DATA_URL: {exc}")

    joined = " | ".join(failures) if failures else "No trend sources configured."
    raise RuntimeError(f"Unable to load trend data. {joined}")

