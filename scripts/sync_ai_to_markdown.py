#!/usr/bin/env python3
"""Sync AI translation and tafsir sidecar JSON into Quran-obs markdown files."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from md_io import SOURCE, ayah_path, update_ai_sections

ROOT = Path(__file__).resolve().parent.parent
AI_TRANSLATIONS = ROOT / "docs" / "data" / "ai_translations"
AI_TAFSIR = ROOT / "docs" / "data" / "ai_tafsir"


def load_sidecar(directory: Path, surah: int) -> dict[int, str]:
    path = directory / f"surah_{surah}.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    ayahs = data.get("ayahs", {})
    return {int(k): v for k, v in ayahs.items() if v and str(v).strip()}


def sync_surah(surah: int) -> dict[str, int]:
    ai_map = load_sidecar(AI_TRANSLATIONS, surah)
    tafsir_map = load_sidecar(AI_TAFSIR, surah)
    stats = {
        "updated": 0,
        "skipped_missing_md": 0,
        "skipped_unchanged": 0,
        "translation_only": 0,
        "tafsir_only": 0,
        "both": 0,
    }

    ayah_nums = sorted(set(ai_map) | set(tafsir_map))
    for ayah in ayah_nums:
        path = ayah_path(surah, ayah)
        if not path.exists():
            stats["skipped_missing_md"] += 1
            continue

        ai_translation = ai_map.get(ayah, "")
        ai_tafsir = tafsir_map.get(ayah, "")
        if update_ai_sections(path, ai_translation=ai_translation, ai_tafsir=ai_tafsir):
            stats["updated"] += 1
            if ai_translation and ai_tafsir:
                stats["both"] += 1
            elif ai_translation:
                stats["translation_only"] += 1
            else:
                stats["tafsir_only"] += 1
        else:
            stats["skipped_unchanged"] += 1

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--surah", type=int, help="Sync a single surah only")
    args = parser.parse_args()

    if not SOURCE.exists():
        print(f"Source not found: {SOURCE}", file=sys.stderr)
        return 1

    surahs = [args.surah] if args.surah else range(1, 115)
    totals = {
        "updated": 0,
        "skipped_missing_md": 0,
        "skipped_unchanged": 0,
        "translation_only": 0,
        "tafsir_only": 0,
        "both": 0,
    }

    for surah in surahs:
        stats = sync_surah(surah)
        for key in totals:
            totals[key] += stats[key]
        if args.surah:
            print(f"Surah {surah}: updated {stats['updated']}, unchanged {stats['skipped_unchanged']}")
            return 0
        print(
            f"Surah {surah:3d}/114: updated {stats['updated']:4d}, "
            f"unchanged {stats['skipped_unchanged']:4d}"
        )

    print(
        f"\nDone. {totals['updated']} ayah files updated "
        f"({totals['both']} with both sections, "
        f"{totals['translation_only']} translation only, "
        f"{totals['tafsir_only']} tafsir only). "
        f"{totals['skipped_unchanged']} already up to date. "
        f"{totals['skipped_missing_md']} missing markdown files."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
