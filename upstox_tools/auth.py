from urllib.parse import parse_qs, urlparse

import requests

from .config import AUTH_URL, MOBILE_NO, PIN, RURL, SECRET_KEY, API_KEY, TOTP_KEY


async def login_upstox(
    auth_url: str = AUTH_URL,
    mobile: str = MOBILE_NO,
    totp_key: str = TOTP_KEY,
    pin: str = PIN,
):
    """Perform the browser-based login flow and return the authorization code."""
    try:
        import pyotp
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise RuntimeError(
            'Upstox browser login dependencies are unavailable. Install pyotp and playwright to enable local login.'
        ) from exc

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        async with page.expect_request(f"*{RURL}?code*") as request_info:
            await page.goto(auth_url)
            await page.locator("#mobileNum").fill(mobile)
            await page.get_by_role("button", name="Get OTP").click()
            otp = pyotp.TOTP(totp_key).now()
            await page.locator("#otpNum").fill(otp)
            await page.get_by_role("button", name="Continue").click()
            await page.get_by_label("Enter 6-digit PIN").fill(pin)
            await page.get_by_role("button", name="Continue").click()
            await page.wait_for_load_state()

        req = await request_info.value
        code = parse_qs(urlparse(req.url).query)["code"][0]
        await context.close()
        await browser.close()
        return code


def get_access_token(code: str) -> str:
    """Exchange the authorization code for an access token."""

    url = 'https://api.upstox.com/v2/login/authorization/token'
    headers = {
        'accept': 'application/json',
        'Api-Version': '2.0',
        'Content-Type': 'application/x-www-form-urlencoded',
    }
    data = {
        'code': code,
        'client_id': API_KEY,
        'client_secret': SECRET_KEY,
        'redirect_uri': RURL,
        'grant_type': 'authorization_code',
    }
    response = requests.post(url, headers=headers, data=data)
    response.raise_for_status()
    return response.json().get('access_token', '')


def build_auth_headers(token: str) -> dict:
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': f'Bearer {token}',
    }
