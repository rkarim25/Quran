#!/usr/bin/env python3
"""Assemble the dedup pipeline's per-form analyses into a per-ayah wbw chunk.

The ai-wbw-pipeline workflow returns per-UNIQUE-FORM analyses: {analyses:[{id,entry}]}
(or a bare [{id,entry}] list). This script maps those back onto every word position
using the PRISTINE on-disk positions map (which never passes through an LLM, so the
word->analysis mapping cannot be silently corrupted).

Output is the chunk shape apply_ai_wbw.py expects: { "<ayah>": { "<widx>": entry } }.

Two modes:

  Legacy (no --cache): positions come from scripts/_forms/surah_N.json; the
  analyses must cover every form.

  Global cache (--cache PATH): positions + already-cached entries come from
  scripts/_forms/surah_N/asm.json; the analyses cover only the NEW forms. The two
  are merged to fill every position, and the global cache is GROWN with the new
  forms (normKey->entry) so later surahs reuse them for free.

Usage:
    python scripts/assemble_wbw.py --surah N --analyses result.json --out chunk.json
    python scripts/assemble_wbw.py --surah N --analyses result.json --out chunk.json --cache scripts/_forms/_wbw_cache.json
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


def load_analyses(paths: list[str]) -> dict[int, dict]:
    """Merge per-form analyses from one or more workflow result files (sliced runs)."""
    by_id: dict[int, dict] = {}
    for path in paths:
        res = find_result(Path(path).read_text(encoding="utf-8"))
        if isinstance(res, str):
            res = json.loads(res)
        items = res.get("analyses", res) if isinstance(res, dict) else res
        for it in items or []:
            if it and "id" in it and "entry" in it:
                by_id[int(it["id"])] = it["entry"]
    return by_id


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--surah", type=int, required=True)
    ap.add_argument("--analyses", required=True, nargs="+", help="one or more workflow result JSON files (sliced runs merge)")
    ap.add_argument("--out", required=True, help="dest chunk path")
    ap.add_argument("--cache", default="", help="global form cache JSON to read+grow (cache mode)")
    args = ap.parse_args()
    n = args.surah

    new_by_id = load_analyses(args.analyses)

    if args.cache:
        asm = json.loads((FORMS / f"surah_{n}" / "asm.json").read_text(encoding="utf-8"))
        positions = asm["positions"]
        by_id: dict[int, dict] = {int(k): v for k, v in asm.get("cached", {}).items()}
        by_id.update(new_by_id)
        new_keys = asm.get("new_keys", {})
    else:
        positions = json.loads((FORMS / f"surah_{n}.json").read_text(encoding="utf-8"))["positions"]
        by_id = new_by_id
        new_keys = {}

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

    # grow the global cache with the new forms (normKey -> entry)
    grown = 0
    if args.cache and new_by_id and new_keys:
        cache_path = Path(args.cache)
        cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
        for fid, entry in new_by_id.items():
            k = new_keys.get(str(fid))
            if k:
                cache[k] = entry
                grown += 1
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    nwords = sum(len(v) for v in chunk.values())
    total_pos = sum(len(positions[a]) for a in positions)
    msg = (f"surah {n}: assembled {len(chunk)} ayat, {nwords}/{total_pos} positions filled, "
           f"{len(new_by_id)} new form entries")
    if args.cache:
        msg += f", cache grown +{grown} (now {len(json.loads(Path(args.cache).read_text(encoding='utf-8')))})"
    print(msg + f" -> {args.out}")
    if missing:
        print(f"MISSING {len(missing)} position(s): " + ", ".join(missing[:30]) +
              ("..." if len(missing) > 30 else ""), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
