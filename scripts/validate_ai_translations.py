#!/usr/bin/env python3
"""Validate AI translation files for coverage and forbidden flattening."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AI_DIR = ROOT / "docs" / "data" / "ai_translations"
DATA_DIR = ROOT / "docs" / "data"

FORBIDDEN = (
    (re.compile(r"\bMost Gracious\b", re.I), "ar-Rahman flattened to 'Most Gracious'"),
    (re.compile(r"\bMost Merciful\b", re.I), "ar-Rahim flattened to 'Most Merciful'"),
    (re.compile(r"\bMost Compassionate\b", re.I), "ar-Rahman flattened"),
    (re.compile(r"\bmindful of Allah\b", re.I), "taqwa flattened"),
    (re.compile(r"\bGod\b(?!-consciousness)"), "Use Allah, not God"),
    (re.compile(r"\bdisbelievers?\b", re.I), "Use 'those who reject' instead of disbeliever"),
)

REQUIRED_TERMS = (
    re.compile(r"\bRahman\b|\bRahim\b|\brahman\b|\brahim\b", re.I),
)


def load_surah_counts() -> dict[int, int]:
    index = json.loads((DATA_DIR / "index.json").read_text(encoding="utf-8"))
    return {s["id"]: s["verses_count"] for s in index["surahs"]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--surah", type=int)
    args = parser.parse_args()

    counts = load_surah_counts()
    surahs = [args.surah] if args.surah else range(1, 115)
    missing: list[str] = []
    warnings: list[str] = []
    total = 0

    for surah in surahs:
        path = AI_DIR / f"surah_{surah}.json"
        expected = counts.get(surah, 0)
        if not path.exists():
            missing.append(f"Surah {surah}: file missing ({expected} ayahs)")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        ayahs = data.get("ayahs", {})
        for n in range(1, expected + 1):
            key = str(n)
            if key not in ayahs or not ayahs[key].strip():
                missing.append(f"{surah}:{n}")
            else:
                total += 1
                text = ayahs[key]
                if len(text) < 20:
                    warnings.append(f"{surah}:{n} very short ({len(text)} chars)")
                for pat, msg in FORBIDDEN:
                    if pat.search(text):
                        warnings.append(f"{surah}:{n} — {msg}")

    print(f"Translated ayahs found: {total} / {sum(counts.values())}")
    if missing:
        print(f"\nMissing ({len(missing)}):")
        for m in missing[:30]:
            print(f"  {m}")
        if len(missing) > 30:
            print(f"  ... and {len(missing) - 30} more")
    if warnings:
        print(f"\nWarnings ({len(warnings)}):")
        for w in warnings[:25]:
            print(f"  {w}")
        if len(warnings) > 25:
            print(f"  ... and {len(warnings) - 25} more")

    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
