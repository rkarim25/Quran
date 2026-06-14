#!/usr/bin/env python3
"""Measure the token-cost of AI word-by-word for a surah range, comparing
per-surah dedup (current) vs a global form cache (proposed). No AI, no writes —
just counts unique diacritized surface forms from the built surah data.

Usage:
    python scripts/measure_wbw.py [--from 2 --to 77]
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_forms import norm  # same normalization used to key the dedup

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
DONE = {1, *range(78, 115)}  # Al-Fatihah + Juzʾ ʿAmma already generated


def surah_forms(n: int) -> tuple[int, set[str]]:
    """(word_count, set of unique normalized forms) for one surah."""
    p = DATA / f"surah_{n}.json"
    if not p.exists():
        return 0, set()
    src = json.loads(p.read_text(encoding="utf-8"))
    words, forms = 0, set()
    for a in src["ayahs"]:
        for w in a.get("word_by_word", {}).values():
            k = norm(w.get("arabic", ""))
            if not k:
                continue
            words += 1
            forms.add(k)
    return words, forms


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="lo", type=int, default=2)
    ap.add_argument("--to", dest="hi", type=int, default=77)
    args = ap.parse_args()

    done_forms: set[str] = set()
    for n in sorted(DONE):
        done_forms |= surah_forms(n)[1]

    total_words = 0
    persurah_unique_sum = 0          # current per-surah approach: re-analyse per surah
    global_forms: set[str] = set()   # global cache: each unique form once for the whole run
    contrib = []                     # (surah, new_forms_added_to_global)

    for n in range(args.lo, args.hi + 1):
        words, forms = surah_forms(n)
        if not words:
            continue
        total_words += words
        persurah_unique_sum += len(forms)
        before = len(global_forms)
        global_forms |= forms
        contrib.append((n, len(global_forms) - before))

    global_unique = len(global_forms)
    global_minus_done = len(global_forms - done_forms)

    def pct(a, b):
        return f"{100 * (1 - a / b):.0f}%" if b else "—"

    print(f"=== AI word-by-word cost: surahs {args.lo}–{args.hi} ===")
    print(f"already done (forms cached, free): {len(done_forms):,} unique forms from surahs 1, 78–114")
    print(f"total word positions to cover:     {total_words:,}")
    print()
    print(f"A) no dedup (per word):            {total_words:,} analyses")
    print(f"B) per-surah dedup (CURRENT):      {persurah_unique_sum:,} analyses   ({pct(persurah_unique_sum, total_words)} vs A)")
    print(f"C) global cache, fresh:            {global_unique:,} analyses   ({pct(global_unique, persurah_unique_sum)} vs B)")
    print(f"D) global cache, seeded w/ done:   {global_minus_done:,} analyses   ({pct(global_minus_done, persurah_unique_sum)} vs B)")
    print()
    print(f"global vs per-surah saving:         {persurah_unique_sum - global_unique:,} fewer analyses "
          f"({pct(global_unique, persurah_unique_sum)} reduction)")
    print(f"extra saving if seeded from done:   {global_unique - global_minus_done:,} more")
    print()
    top = sorted(contrib, key=lambda x: -x[1])[:8]
    print("biggest NEW-form contributors (global, fresh):")
    for s, c in top:
        print(f"   surah {s:>3}: +{c:,} new forms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
