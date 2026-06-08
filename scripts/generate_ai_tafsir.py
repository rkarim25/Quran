#!/usr/bin/env python3
"""Generate AI tafsir sidecar JSON for all surahs from Quran-obs markdown."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ai_tafsir_builder import build_ai_tafsir
from md_io import SOURCE, read_ayah

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "data" / "ai_tafsir"
INDEX = ROOT / "docs" / "data" / "index.json"


def surah_verse_counts() -> dict[int, int]:
    if INDEX.exists():
        data = json.loads(INDEX.read_text(encoding="utf-8"))
        return {s["id"]: s["verses_count"] for s in data["surahs"]}
    return {n: len(list((SOURCE / f"Surah_{n}").glob("Ayah_*.md"))) for n in range(1, 115)}


def generate_surah(surah: int, verses_count: int) -> dict[str, str]:
    surah_dir = SOURCE / f"Surah_{surah}"
    ayahs: dict[str, str] = {}
    for path in sorted(surah_dir.glob("Ayah_*.md"), key=lambda p: int(p.stem.split("_")[1])):
        row = read_ayah(path)
        text = build_ai_tafsir(
            row.get("tafsir_ibn_kathir", ""),
            row.get("maarif_ul_quran", ""),
            context=row.get("context", ""),
            surah=surah,
            ayah=row["ayah"],
            translation=row.get("translation", ""),
            word_by_word=row.get("word_by_word"),
            verses_count=verses_count,
        )
        ayahs[str(row["ayah"])] = text
    return ayahs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--surah", type=int, help="Generate one surah only")
    parser.add_argument("--from", dest="from_surah", type=int, default=1)
    parser.add_argument("--to", dest="to_surah", type=int, default=114)
    args = parser.parse_args()

    if not SOURCE.exists():
        print(f"Source not found: {SOURCE}", file=sys.stderr)
        return 1

    counts = surah_verse_counts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.surah:
        surahs = [args.surah]
    else:
        surahs = range(args.from_surah, args.to_surah + 1)

    total = 0
    for surah in surahs:
        surah_dir = SOURCE / f"Surah_{surah}"
        if not surah_dir.exists():
            print(f"Skip surah {surah}: no directory")
            continue
        verses = counts.get(surah, 0)
        ayahs = generate_surah(surah, verses)
        out = {"surah": surah, "ayahs": ayahs}
        path = OUT_DIR / f"surah_{surah}.json"
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        total += len(ayahs)
        print(f"Surah {surah}: {len(ayahs)} ayahs -> {path.name}")

    print(f"\nDone. {total} AI tafsir entries in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
