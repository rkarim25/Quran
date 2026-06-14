#!/usr/bin/env python3
"""Fetch QCF v2 mushaf page layout (Madani 15-line) for a page range.

Writes docs/data/mushaf/page_N.json — a minimal per-line layout used by the
reader's 15-line mushaf view:
    { "page": N, "lines": { "<1..15>": [ {"c": <code_v2 glyph>, "t": "w"|"e", "k": "<surah:ayah>"}, ... ] } }
where t = "w" (word) or "e" (ayah-end marker). Glyphs render in font p{N}-v2.

Important: a verse that spills across a page break has its spilled words tagged
with the NEXT page's page_number / line_number. The by_page endpoint returns the
whole verse under its STARTING page, so we must bucket each word by its OWN
page_number (not the queried page) — otherwise spilled words land on the wrong
page/line. We therefore fetch one extra page before the range and dedupe words
by id, then write each target page from words whose page_number matches it.

Usage: python scripts/fetch_mushaf.py [from_page to_page]   (default 582 604)
"""
from __future__ import annotations
import json, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "mushaf"
API = ("https://api.quran.com/api/v4/verses/by_page/{page}"
       "?words=true&word_fields=code_v2,line_number,char_type_name,page_number&fields=verse_key&per_page=50&page={p}")


def fetch_verses(page: int) -> list:
    verses, p = [], 1
    while True:
        req = urllib.request.Request(API.format(page=page, p=p), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
        verses += d["verses"]
        nxt = d["pagination"]["next_page"]
        if not nxt:
            return verses
        p = nxt


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    lo, hi = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (582, 604)

    # Collect every word once (deduped by id), tagged with its TRUE page/line.
    by_id: dict[int, dict] = {}
    for page in range(max(1, lo - 1), hi + 1):  # lo-1 catches verses spilling INTO page lo
        for v in fetch_verses(page):
            s, a = (int(x) for x in v["verse_key"].split(":"))
            for w in v["words"]:
                by_id[w["id"]] = {
                    "pg": w["page_number"], "ln": w["line_number"],
                    "c": w["code_v2"], "t": "e" if w["char_type_name"] == "end" else "w",
                    "k": v["verse_key"], "s": s, "a": a, "pos": w["position"],
                }

    for page in range(lo, hi + 1):
        ws = sorted((w for w in by_id.values() if w["pg"] == page), key=lambda w: (w["s"], w["a"], w["pos"]))
        lines: dict[str, list] = {}
        for w in ws:
            lines.setdefault(str(w["ln"]), []).append({"c": w["c"], "t": w["t"], "k": w["k"]})
        (OUT / f"page_{page}.json").write_text(
            json.dumps({"page": page, "lines": lines}, ensure_ascii=False), encoding="utf-8")
        print(f"page {page}: {len(ws)} words, lines {sorted(int(k) for k in lines)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
