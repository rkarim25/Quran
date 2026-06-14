#!/usr/bin/env python3
"""Assemble the dedup pipeline's per-form analyses into a per-ayah wbw chunk.

The ai-wbw-pipeline workflow returns per-UNIQUE-FORM analyses: {analyses:[{id,entry}]}.
This script maps those back onto every word position using the PRISTINE on-disk
positions map from scripts/_forms/surah_N.json (the position map never passes
through an LLM, so word->analysis mapping cannot be silently corrupted).

Output is the same chunk shape apply_ai_wbw.py expects: { "<ayah>": { "<widx>": entry } }.

Usage:
    python scripts/assemble_wbw.py --surah N --analyses workflow_result.json --out chunk.json
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORMS = ROOT / "scripts" / "_forms"


def find_result(s: str):
    """Unwrap {result: ...} (possibly string-encoded), tolerate bare JSON."""
    d = json.loads(s)
    while isinstance(d, dict) and "result" in d:
        r = d["result"]
        d = json.loads(r) if isinstance(r, str) else r
    return d


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--surah", type=int, required=True)
    ap.add_argument("--analyses", required=True, help="workflow result JSON")
    ap.add_argument("--out", required=True, help="dest chunk path")
    args = ap.parse_args()

    res = find_result(Path(args.analyses).read_text(encoding="utf-8"))
    if isinstance(res, str):
        res = json.loads(res)
    items = res.get("analyses", res) if isinstance(res, dict) else res

    by_id: dict[int, dict] = {}
    for it in items or []:
        if not it or "id" not in it or "entry" not in it:
            continue
        by_id[int(it["id"])] = it["entry"]

    positions = json.loads((FORMS / f"surah_{args.surah}.json").read_text(encoding="utf-8"))["positions"]

    chunk: dict[str, dict] = {}
    missing: list[str] = []
    for ayah in sorted(positions, key=lambda x: int(x)):
        words = {}
        for widx in sorted(positions[ayah], key=lambda x: int(x)):
            fid = positions[ayah][widx]
            if fid in by_id:
                words[widx] = by_id[fid]
            else:
                missing.append(f"{ayah}:{widx}(form {fid})")
        chunk[ayah] = words

    Path(args.out).write_text(json.dumps(chunk, ensure_ascii=False), encoding="utf-8")
    nwords = sum(len(v) for v in chunk.values())
    total_pos = sum(len(positions[a]) for a in positions)
    print(f"surah {args.surah}: assembled {len(chunk)} ayat, {nwords}/{total_pos} positions filled, "
          f"{len(by_id)} unique form entries -> {args.out}")
    if missing:
        print(f"MISSING {len(missing)} position(s): " + ", ".join(missing[:30]) +
              ("..." if len(missing) > 30 else ""), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
