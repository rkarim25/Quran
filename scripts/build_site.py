#!/usr/bin/env python3
"""Build static site data from Quran-obs markdown files."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from md_io import SOURCE, ayah_path, read_ayah, to_json_ayah

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs" / "data"
QURAN_API = "https://api.quran.com/api/v4/chapters?language=en"


def fetch_chapters() -> dict[int, dict]:
    req = urllib.request.Request(QURAN_API, headers={"User-Agent": "QuranProject/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = json.load(response)
    return {c["id"]: c for c in data["chapters"]}


def build_surah(surah: int, chapters: dict[int, dict]) -> None:
    surah_dir = SOURCE / f"Surah_{surah}"
    if not surah_dir.exists():
        return

    ayahs = []
    for path in sorted(surah_dir.glob("Ayah_*.md"), key=lambda p: int(p.stem.split("_")[1])):
        ayahs.append(to_json_ayah(read_ayah(path)))

    chapter = chapters[surah]
    surah_data = {
        "id": surah,
        "name_simple": chapter["name_simple"],
        "name_arabic": chapter["name_arabic"],
        "translated_name": chapter["translated_name"]["name"],
        "revelation_place": chapter["revelation_place"],
        "verses_count": chapter["verses_count"],
        "ayahs": ayahs,
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / f"surah_{surah}.json").write_text(
        json.dumps(surah_data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--surah", type=int, help="Build a single surah only")
    args = parser.parse_args()

    if not SOURCE.exists():
        print(f"Source not found: {SOURCE}", file=sys.stderr)
        return 1

    chapters = fetch_chapters()
    surahs = [args.surah] if args.surah else range(1, 115)
    index = []

    for surah in surahs:
        build_surah(surah, chapters)
        if args.surah:
            print(f"Built surah {surah}")
            return 0
        chapter = chapters[surah]
        if (SOURCE / f"Surah_{surah}").exists():
            index.append(
                {
                    "id": surah,
                    "name_simple": chapter["name_simple"],
                    "name_arabic": chapter["name_arabic"],
                    "translated_name": chapter["translated_name"]["name"],
                    "revelation_place": chapter["revelation_place"],
                    "verses_count": chapter["verses_count"],
                }
            )
            print(f"Built surah {surah}/114")

    (OUTPUT / "index.json").write_text(
        json.dumps({"surahs": index}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"\nDone. {len(index)} surahs written to {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
