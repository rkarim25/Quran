#!/usr/bin/env python3
"""Apply AI word-by-word analysis for one surah into docs/data/ai_wbw/surah_N.json.

Usage:
    python scripts/apply_ai_wbw.py --surah N --input ayahs.json

`ayahs.json` maps ayah number -> { wordIndex -> entry }, where entry is
{ meaning, parts:[{ar,tr,en}], grammar, root }. Existing ayahs are merged
(re-running a surah updates only the ayahs supplied).
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "ai_wbw"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--surah", type=int, required=True)
    ap.add_argument("--input", required=True, help="JSON: ayah -> {wordIdx -> entry}")
    args = ap.parse_args()

    incoming = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if not incoming:
        print("Nothing to apply (empty input).", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"surah_{args.surah}.json"
    data = json.loads(dest.read_text(encoding="utf-8")) if dest.exists() else {}

    for ayah, words in incoming.items():
        data.setdefault(str(ayah), {})
        for widx, entry in words.items():
            data[str(ayah)][str(widx)] = entry

    # keep ayahs/words in numeric order for clean diffs
    ordered = {
        a: {w: data[a][w] for w in sorted(data[a], key=lambda x: int(x))}
        for a in sorted(data, key=lambda x: int(x))
    }
    dest.write_text(json.dumps(ordered, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    nwords = sum(len(v) for v in incoming.values())
    print(f"Applied surah {args.surah}: {len(incoming)} ayah(s), {nwords} word(s) -> {dest.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
