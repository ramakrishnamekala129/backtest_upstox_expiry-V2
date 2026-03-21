from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import requests


ACCESS_COOKIE = "sb-access-token"
REFRESH_COOKIE = "sb-refresh-token"


class SupabaseAuthError(RuntimeError):
    """Raised when a Supabase auth operation fails."""


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    anon_key: str
    site_url: str
    secure_cookies: bool


def load_supabase_config() -> Optional[SupabaseConfig]:
    url = (
        os.getenv("SUPABASE_URL", "").strip()
        or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    )
    anon_key = (
        os.getenv("SUPABASE_ANON_KEY", "").strip()
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "").strip()
    )
    site_url = (
        os.getenv("SITE_URL", "").strip()
        or os.getenv("NEXT_PUBLIC_SITE_URL", "").strip()
        or "http://127.0.0.1:8765"
    )
    if not url or not anon_key:
        return None
    secure_cookies = site_url.startswith("https://")
    return SupabaseConfig(
        url=url.rstrip("/"),
        anon_key=anon_key,
        site_url=site_url.rstrip("/"),
        secure_cookies=secure_cookies,
    )


def is_supabase_configured() -> bool:
    return load_supabase_config() is not None


def _headers(config: SupabaseConfig, access_token: Optional[str] = None) -> Dict[str, str]:
    headers = {
        "apikey": config.anon_key,
        "Content-Type": "application/json",
    }
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def _raise_for_payload(response: requests.Response) -> None:
    try:
        payload = response.json()
    except ValueError:
        payload = {"msg": response.text or response.reason}
    if response.ok:
        return
    message = (
        payload.get("msg")
        or payload.get("error_description")
        or payload.get("error")
        or response.reason
    )
    raise SupabaseAuthError(str(message))


def sign_in_with_password(email: str, password: str) -> Dict[str, Any]:
    config = load_supabase_config()
    if config is None:
        raise SupabaseAuthError("Supabase configuration is missing.")
    response = requests.post(
        f"{config.url}/auth/v1/token?grant_type=password",
        headers=_headers(config),
        json={"email": email, "password": password},
        timeout=20,
    )
    _raise_for_payload(response)
    return response.json()


def sign_up_user(
    *,
    email: str,
    password: str,
    username: str,
    full_name: str,
    phone_number: str,
    country: str,
) -> Dict[str, Any]:
    config = load_supabase_config()
    if config is None:
        raise SupabaseAuthError("Supabase configuration is missing.")
    response = requests.post(
        f"{config.url}/auth/v1/signup",
        headers=_headers(config),
        json={
            "email": email,
            "password": password,
            "data": {
                "username": username,
                "full_name": full_name,
                "phone_number": phone_number,
                "country": country,
            },
            "email_redirect_to": f"{config.site_url}/auth/callback",
        },
        timeout=20,
    )
    _raise_for_payload(response)
    return response.json()


def refresh_session(refresh_token: str) -> Dict[str, Any]:
    config = load_supabase_config()
    if config is None:
        raise SupabaseAuthError("Supabase configuration is missing.")
    response = requests.post(
        f"{config.url}/auth/v1/token?grant_type=refresh_token",
        headers=_headers(config),
        json={"refresh_token": refresh_token},
        timeout=20,
    )
    _raise_for_payload(response)
    return response.json()


def get_user(access_token: str) -> Dict[str, Any]:
    config = load_supabase_config()
    if config is None:
        raise SupabaseAuthError("Supabase configuration is missing.")
    response = requests.get(
        f"{config.url}/auth/v1/user",
        headers=_headers(config, access_token=access_token),
        timeout=20,
    )
    _raise_for_payload(response)
    return response.json()

