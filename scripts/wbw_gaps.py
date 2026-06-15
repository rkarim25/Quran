#!/usr/bin/env python3
"""Report which chunk files of a surah still have unanalysed forms.

After partial workflow runs (e.g. transient 529s leaving gaps), this scans the
banked result_*.json files in scripts/_forms/surah_N/ and prints the chunk
indices that are not yet fully covered — ready to paste into the workflow's
{chunks:[...]} arg for a precise re-run.

Usage: python scripts/wbw_gaps.py N
"""
from __future__ import annotations
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def unwrap(txt: str):
    d = json.loads(txt)
    while isinstance(d, dict) and "result" in d:
        r = d["result"]
        d = json.loads(r) if isinstance(r, str) else r
    if isinstance(d, str):
        d = json.loads(d)
    return d.get("analyses", d) if isinstance(d, dict) else d


def main() -> int:
    n = int(sys.argv[1])
    sdir = ROOT / "scripts" / "_forms" / f"surah_{n}"
    done: set[int] = set()
    for rf in sorted(sdir.glob("result_*.json")):
        for it in unwrap(rf.read_text(encoding="utf-8")) or []:
            if it and "id" in it:
                done.add(int(it["id"]))

    redo, total_chunks = [], 0
    for cf in sorted(sdir.glob("chunk_*.json")):
        total_chunks += 1
        ids = [f["id"] for f in json.loads(cf.read_text(encoding="utf-8"))]
        if any(i not in done for i in ids):
            redo.append(int(cf.stem.split("_")[1]))

    print(f"surah {n}: {len(done)} forms analysed; {total_chunks - len(redo)}/{total_chunks} chunks complete")
    print(f"redo {len(redo)} chunk(s):")
    print(json.dumps(redo))
    return 0


if __name__ == "__main__":
    sys.exit(main())
