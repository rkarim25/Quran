#!/usr/bin/env python3
"""Build compact full-text search index from docs/data/surah_*.json files."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
OUTPUT = DATA / "search-index.json"


def normalize_search(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = re.sub(r"[\u0300-\u036f]", "", text)
    text = re.sub(r"[\u0640\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]", "", text)
    text = re.sub(r"[''`´]", "", text)
    text = re.sub(r"[^a-z0-9\u0621-\u064a\s:/\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"[إأآا]", "ا", text)
    text = text.replace("ى", "ي").replace("ة", "ه")
    return text


def snippet(text: str, max_len: int = 100) -> str:
    clean = re.sub(r"\s+", " ", (text or "").strip())
    if len(clean) <= max_len:
        return clean
    return clean[: max_len - 1].rsplit(" ", 1)[0] + "…"


def main() -> int:
    entries = []
    for path in sorted(DATA.glob("surah_*.json"), key=lambda p: int(p.stem.split("_")[1])):
        data = json.loads(path.read_text(encoding="utf-8"))
        surah_id = data["id"]
        for ayah in data.get("ayahs", []):
            en_parts = [ayah.get("translation", "")]
            ar_parts = [ayah.get("arabic", "")]
            for word in (ayah.get("word_by_word") or {}).values():
                if word.get("translation"):
                    en_parts.append(word["translation"])
                if word.get("arabic"):
                    ar_parts.append(word["arabic"])
            en = normalize_search(" ".join(en_parts))
            ar = normalize_search(" ".join(ar_parts))
            if not en and not ar:
                continue
            entries.append(
                [
                    surah_id,
                    ayah["ayah"],
                    en,
                    ar,
                    snippet(ayah.get("translation", "")),
                ]
            )

    OUTPUT.write_text(
        json.dumps({"v": 1, "entries": entries}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Search index: {len(entries)} ayahs -> {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
