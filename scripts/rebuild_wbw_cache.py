#!/usr/bin/env python3
"""Rebuild the global wbw form cache from already-applied ai_wbw surahs.

The cache (scripts/_forms/_wbw_cache.json) maps normKey -> entry so each unique
diacritized form is analysed once across the whole run. It is a DERIVED artifact
(git-ignored): this script reconstructs it from docs/data/ai_wbw/surah_N.json
(entries) + the built docs/data/surah_N.json (the Arabic per word, to recompute
the normKey). Run it at the start of a session to warm the cache so generation
resumes with full cross-surah reuse.

By default it scans ONLY surahs 2-77 (the intrinsic global-cache run), NOT the
earlier per-surah Juzʾ ʿAmma / Fatiha data, whose entries are slightly verse-
contextual and should not be reused elsewhere.

Usage:
    python scripts/rebuild_wbw_cache.py [--from 2 --to 77]
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_forms import norm

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
AIWBW = DATA / "ai_wbw"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="lo", type=int, default=2)
    ap.add_argument("--to", dest="hi", type=int, default=77)
    ap.add_argument("--out", default=str(ROOT / "scripts" / "_forms" / "_wbw_cache.json"))
    args = ap.parse_args()

    cache: dict[str, dict] = {}
    scanned = []
    for n in range(args.lo, args.hi + 1):
        ai_p = AIWBW / f"surah_{n}.json"
        src_p = DATA / f"surah_{n}.json"
        if not ai_p.exists() or not src_p.exists():
            continue
        ai = json.loads(ai_p.read_text(encoding="utf-8"))
        src = {str(a["ayah"]): a.get("word_by_word", {})
               for a in json.loads(src_p.read_text(encoding="utf-8"))["ayahs"]}
        added = 0
        for ay, words in ai.items():
            wbw = src.get(ay, {})
            for widx, entry in words.items():
                ar = (wbw.get(widx) or {}).get("arabic", "")
                k = norm(ar)
                if k and k not in cache:
                    cache[k] = entry
                    added += 1
        scanned.append((n, added))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"rebuilt cache: {len(cache)} unique forms from {len(scanned)} surah(s) "
          f"in {args.lo}-{args.hi} -> {out}")
    for n, a in scanned:
        print(f"  surah {n}: +{a}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
