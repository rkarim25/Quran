#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Remove the superseded per-ayah `## AI Tafsir` section from the md sources.

The per-ayah AI Tafsir (layered-v1, complete only to 3:132) was discarded on the
user's instruction in favour of passage-based tafsir — see TAFSIR_PLAN.md. Its
content stays recoverable from git history; this only removes it going forward
so the reader has one tafsir section, not two competing ones.

Only the `## AI Tafsir` section is touched. `## Tafsir Ibn Kathir`,
`## Maarif ul Quran`, `## AI Translation`, `## Tafsir Summary`, `## Context`
and `## Personal Reflections` are left exactly as they are — the passage
pipeline is grounded in them.

Usage:
  python scripts/strip_old_ai_tafsir.py --dry-run   # report only
  python scripts/strip_old_ai_tafsir.py             # rewrite
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "Quran-obs"
SIDECARS = ROOT / "docs" / "data" / "ai_tafsir"

# The section, up to the next "## " heading or end of file.
PATTERN = re.compile(r"^## AI Tafsir\s*$.*?(?=^## |\Z)", re.S | re.M)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = sorted(SOURCE.glob("Surah_*/Ayah_*.md"))
    if not files:
        sys.exit(f"no ayah files under {SOURCE}")

    changed = 0
    chars_removed = 0
    for path in files:
        text = path.read_text(encoding="utf-8")
        new = PATTERN.sub("", text)
        if new == text:
            continue
        # Collapse the blank-line run the removal leaves behind.
        new = re.sub(r"\n{3,}", "\n\n", new)
        changed += 1
        chars_removed += len(text) - len(new)
        if not args.dry_run:
            path.write_text(new, encoding="utf-8")

    print(f"{'would strip' if args.dry_run else 'stripped'} AI Tafsir from "
          f"{changed} of {len(files)} ayah file(s) ({chars_removed:,} chars)")

    sidecars = sorted(SIDECARS.glob("surah_*.json")) if SIDECARS.exists() else []
    if sidecars:
        print(f"{'would delete' if args.dry_run else 'deleting'} {len(sidecars)} "
              f"stale sidecar(s) in {SIDECARS}")
        if not args.dry_run:
            for p in sidecars:
                p.unlink()
            try:
                SIDECARS.rmdir()
            except OSError:
                pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
