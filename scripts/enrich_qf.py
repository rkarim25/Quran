#!/usr/bin/env python3
"""Fetch Clear Quran + Ibn Kathir tafsir from Quran Foundation API into sidecar JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from quran_foundation import configured, fetch_chapter_verses, verse_sidecar_fields

ROOT = Path(__file__).resolve().parent.parent
QF_TRANSLATIONS = ROOT / "docs" / "data" / "qf_translations"
QF_TAFSIR = ROOT / "docs" / "data" / "qf_tafsir"


def enrich_surah(surah: int) -> tuple[int, int]:
    verses = fetch_chapter_verses(surah)
    tr_map: dict[str, str] = {}
    tf_map: dict[str, str] = {}
    for verse in verses:
        ayah, translation, tafsir = verse_sidecar_fields(verse)
        if not ayah:
            continue
        if translation:
            tr_map[str(ayah)] = translation
        if tafsir:
            tf_map[str(ayah)] = tafsir

    QF_TRANSLATIONS.mkdir(parents=True, exist_ok=True)
    QF_TAFSIR.mkdir(parents=True, exist_ok=True)
    (QF_TRANSLATIONS / f"surah_{surah}.json").write_text(
        json.dumps({"surah": surah, "ayahs": tr_map}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (QF_TAFSIR / f"surah_{surah}.json").write_text(
        json.dumps({"surah": surah, "ayahs": tf_map}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return len(tr_map), len(tf_map)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--surah", type=int, help="Fetch one surah only")
    args = parser.parse_args()

    if not configured():
        print(
            "Quran Foundation API not configured.\n"
            "Set QURAN_CLIENT_ID and QURAN_CLIENT_SECRET (request access at https://api-docs.quran.foundation/).",
            file=sys.stderr,
        )
        return 1

    surahs = [args.surah] if args.surah else range(1, 115)
    for surah in surahs:
        tr_n, tf_n = enrich_surah(surah)
        print(f"Surah {surah}: {tr_n} translations, {tf_n} tafsir entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
