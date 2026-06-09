"""Quran Foundation Content API client (OAuth2). Used at build time only."""

from __future__ import annotations

import base64
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

AUTH_URL = os.environ.get("QURAN_AUTH_URL", "https://oauth2.quran.foundation/oauth2/token")
API_BASE = os.environ.get("QURAN_API_BASE", "https://apis.quran.foundation/content/api/v4")
TRANSLATION_RESOURCE_ID = int(os.environ.get("QURAN_TRANSLATION_ID", "131"))  # Clear Quran
TAFSIR_RESOURCE_ID = int(os.environ.get("QURAN_TAFSIR_ID", "169"))  # Ibn Kathir (English)

_token: str | None = None
_token_expires = 0.0


def configured() -> bool:
    return bool(os.environ.get("QURAN_CLIENT_ID") and os.environ.get("QURAN_CLIENT_SECRET"))


def html_to_text(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"</p>\s*", "\n\n", text, flags=re.I)
    text = re.sub(r"</h[1-6]>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _get_token() -> str:
    global _token, _token_expires
    if _token and time.time() < _token_expires - 60:
        return _token

    client_id = os.environ["QURAN_CLIENT_ID"]
    client_secret = os.environ["QURAN_CLIENT_SECRET"]
    creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    body = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "content"}).encode()
    req = urllib.request.Request(
        AUTH_URL,
        data=body,
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "QuranProject/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    _token = data["access_token"]
    _token_expires = time.time() + int(data.get("expires_in", 3600))
    return _token


def _api_get(path: str, params: dict | None = None) -> dict:
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    url = f"{API_BASE}{path}{query}"
    token = _get_token()
    client_id = os.environ["QURAN_CLIENT_ID"]
    req = urllib.request.Request(
        url,
        headers={
            "x-auth-token": token,
            "x-client-id": client_id,
            "User-Agent": "QuranProject/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Quran Foundation API {e.code} for {path}: {body[:300]}") from e


def fetch_chapter_verses(surah: int, per_page: int = 300) -> list[dict]:
    """Fetch all verses for a surah with Clear Quran translation + Ibn Kathir tafsir."""
    out: list[dict] = []
    page = 1
    while True:
        data = _api_get(
            f"/verses/by_chapter/{surah}",
            {
                "translations": TRANSLATION_RESOURCE_ID,
                "tafsirs": TAFSIR_RESOURCE_ID,
                "per_page": per_page,
                "page": page,
            },
        )
        verses = data.get("verses") or []
        out.extend(verses)
        pagination = data.get("pagination") or {}
        next_page = pagination.get("next_page")
        if not next_page or not verses:
            break
        page = int(next_page)
        time.sleep(0.15)
    return out


def verse_sidecar_fields(verse: dict) -> tuple[int, str, str]:
    ayah = int(verse.get("verse_number") or 0)
    translation = ""
    for tr in verse.get("translations") or []:
        if int(tr.get("resource_id", 0)) == TRANSLATION_RESOURCE_ID:
            translation = (tr.get("text") or "").strip()
            break
    tafsir = ""
    for tf in verse.get("tafsirs") or []:
        if int(tf.get("resource_id", 0)) == TAFSIR_RESOURCE_ID:
            tafsir = html_to_text(tf.get("text") or "")
            break
    return ayah, translation, tafsir
