#!/usr/bin/env python3
"""Five-pass validation for AI tafsir sidecar files.

Pass --ayahs "1,2,3,4" to validate only those ayahs of a surah (used by the
incremental layered-tafsir builder, where the rest of a surah may not yet be
converted). Omit it to validate full surahs.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AI_DIR = ROOT / "docs" / "data" / "ai_tafsir"
DATA_DIR = ROOT / "docs" / "data"

MIN_CHARS = 80
MAX_CHARS = 1800
REQUIRED_SECTION = re.compile(r"\*\*Essence\*\*", re.I)

BAD_PATTERNS = (
    (re.compile(r"\bTranslator\b"), "translator note"),
    (re.compile(r"continues in \*\*Ayah"), "cross-reference fragment"),
    (re.compile(r"\bIn the Ibn Kathir source\b", re.I), "source disclaimer"),
    (re.compile(r"\(\d+\)\s*$"), "orphan footnote"),
    (re.compile(r"\bGod\b(?!-)"), "use Allah not God"),
)

SUBSTANCE_MARKERS = (
    re.compile(r"\*\*Essence\*\*", re.I),
    re.compile(r"\*\*What it teaches\*\*", re.I),
    re.compile(r"\*\*The scholars\*\*", re.I),
    re.compile(r"\*\*From the Sunnah\*\*", re.I),
    re.compile(r"\*\*Reflection\*\*", re.I),
    re.compile(r"\bIbn Kathir\b|\bMaarif\b|\bhadith\b|\bProphet\b", re.I),
)


def load_counts() -> dict[int, int]:
    index = json.loads((DATA_DIR / "index.json").read_text(encoding="utf-8"))
    return {s["id"]: s["verses_count"] for s in index["surahs"]}


def _items(ayahs: dict, only: set[int] | None):
    if only is None:
        return list(ayahs.items())
    return [(k, v) for k, v in ayahs.items() if int(k) in only]


def pass_coverage(counts: dict[int, int], surahs: list[int], only: set[int] | None) -> list[str]:
    errors: list[str] = []
    for surah in surahs:
        path = AI_DIR / f"surah_{surah}.json"
        expected = counts.get(surah, 0)
        if not path.exists():
            errors.append(f"PASS 1 coverage: missing file surah_{surah}.json ({expected} ayahs)")
            continue
        ayahs = json.loads(path.read_text(encoding="utf-8")).get("ayahs", {})
        targets = sorted(only) if only is not None else range(1, expected + 1)
        for n in targets:
            if str(n) not in ayahs or not ayahs[str(n)].strip():
                errors.append(f"PASS 1 coverage: {surah}:{n} missing or empty")
    return errors


def pass_length(surahs: list[int], only: set[int] | None) -> list[str]:
    errors: list[str] = []
    for surah in surahs:
        path = AI_DIR / f"surah_{surah}.json"
        if not path.exists():
            continue
        ayahs = json.loads(path.read_text(encoding="utf-8")).get("ayahs", {})
        for key, text in _items(ayahs, only):
            n = len(text.strip())
            if n < MIN_CHARS:
                errors.append(f"PASS 2 length: {surah}:{key} too short ({n} chars)")
            elif n > MAX_CHARS:
                errors.append(f"PASS 2 length: {surah}:{key} too long ({n} chars)")
    return errors


def pass_structure(surahs: list[int], only: set[int] | None) -> list[str]:
    errors: list[str] = []
    for surah in surahs:
        path = AI_DIR / f"surah_{surah}.json"
        if not path.exists():
            continue
        ayahs = json.loads(path.read_text(encoding="utf-8")).get("ayahs", {})
        for key, text in _items(ayahs, only):
            if not REQUIRED_SECTION.search(text):
                errors.append(f"PASS 3 structure: {surah}:{key} missing 'Essence' layer")
    return errors


def pass_quality(surahs: list[int], only: set[int] | None) -> list[str]:
    errors: list[str] = []
    for surah in surahs:
        path = AI_DIR / f"surah_{surah}.json"
        if not path.exists():
            continue
        ayahs = json.loads(path.read_text(encoding="utf-8")).get("ayahs", {})
        for key, text in _items(ayahs, only):
            for pat, label in BAD_PATTERNS:
                if pat.search(text):
                    errors.append(f"PASS 4 quality: {surah}:{key} — {label}")
    return errors


def pass_substance(surahs: list[int], only: set[int] | None) -> list[str]:
    errors: list[str] = []
    for surah in surahs:
        path = AI_DIR / f"surah_{surah}.json"
        if not path.exists():
            continue
        ayahs = json.loads(path.read_text(encoding="utf-8")).get("ayahs", {})
        for key, text in _items(ayahs, only):
            hits = sum(1 for pat in SUBSTANCE_MARKERS if pat.search(text))
            if hits < 2:
                errors.append(
                    f"PASS 5 substance: {surah}:{key} lacks scholarly depth ({hits} markers)"
                )
    return errors


PASSES = (
    ("Coverage", pass_coverage),
    ("Length", pass_length),
    ("Structure", pass_structure),
    ("Quality", pass_quality),
    ("Substance", pass_substance),
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--surah", type=int)
    parser.add_argument("--ayahs", help="Comma-separated ayah numbers to restrict checks to (one surah)")
    parser.add_argument("--passes", type=int, default=5, help="Number of validation passes (max 5)")
    args = parser.parse_args()

    only = None
    if args.ayahs:
        only = {int(x) for x in args.ayahs.split(",") if x.strip()}

    counts = load_counts()
    surahs = [args.surah] if args.surah else list(range(1, 115))
    n_passes = min(5, max(1, args.passes))

    all_errors: list[str] = []
    scope = f" (ayahs {sorted(only)})" if only else ""
    print(f"Validating surah(s) {surahs}{scope} — {n_passes} passes...\n")

    for i in range(n_passes):
        name, fn = PASSES[i]
        if name == "Coverage":
            errs = fn(counts, surahs, only)
        else:
            errs = fn(surahs, only)
        status = "PASS" if not errs else f"FAIL ({len(errs)} issues)"
        print(f"Pass {i + 1}/5 — {name}: {status}")
        if errs:
            for e in errs[:15]:
                print(f"  {e}")
            if len(errs) > 15:
                print(f"  ... and {len(errs) - 15} more")
            all_errors.extend(errs)
        print()

    if all_errors:
        print(f"Validation failed: {len(all_errors)} total issues")
        return 1

    print("All passes succeeded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
