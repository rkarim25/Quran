#!/usr/bin/env python3
"""Validate a produced ai_wbw/surah_N.json against its source: coverage + schema.

Checks every source ayah/word index is present (and no extras), and that each
entry has meaning/grammar (non-empty strings), parts (non-empty list of {ar,en}),
and a root field. ASCII-only output (Windows cp1252 console safe).

Usage: python scripts/validate_wbw.py --surah N
Exit 0 if clean, 1 if any problem.
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--surah", type=int, required=True)
    args = ap.parse_args()
    n = args.surah

    src = json.loads((DATA / f"surah_{n}.json").read_text(encoding="utf-8"))
    ai = json.loads((DATA / "ai_wbw" / f"surah_{n}.json").read_text(encoding="utf-8"))
    src_ayahs = {str(a["ayah"]): a["word_by_word"] for a in src["ayahs"]}

    problems: list[str] = []
    for ay, wbw in src_ayahs.items():
        if ay not in ai:
            problems.append(f"ayah {ay} missing entirely"); continue
        for widx in wbw:
            if widx not in ai[ay]:
                problems.append(f"{ay}:{widx} missing")
    for ay in ai:
        if ay not in src_ayahs:
            problems.append(f"extra ayah {ay}"); continue
        for widx in ai[ay]:
            if widx not in src_ayahs[ay]:
                problems.append(f"extra word {ay}:{widx}")

    for ay, words in ai.items():
        for widx, e in words.items():
            for k in ("meaning", "parts", "grammar", "root"):
                if k not in e:
                    problems.append(f"{ay}:{widx} missing field {k}")
            if not isinstance(e.get("meaning"), str) or not e.get("meaning", "").strip():
                problems.append(f"{ay}:{widx} empty meaning")
            if not isinstance(e.get("grammar"), str) or not e.get("grammar", "").strip():
                problems.append(f"{ay}:{widx} empty grammar")
            parts = e.get("parts")
            if not isinstance(parts, list) or not parts:
                problems.append(f"{ay}:{widx} parts not a non-empty list")
            else:
                for i, p in enumerate(parts):
                    if not isinstance(p, dict) or "ar" not in p or "en" not in p:
                        problems.append(f"{ay}:{widx} part {i} missing ar/en")

    n_entries = sum(len(w) for w in ai.values())
    print(f"surah {n}: ayat={len(ai)} entries={n_entries} PROBLEMS={len(problems)}")
    for p in problems[:40]:
        print("  -", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
