#!/usr/bin/env python3
"""Build static site data from Quran-obs markdown files."""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "Quran-obs"
OUTPUT = ROOT / "docs" / "data"
QURAN_API = "https://api.quran.com/api/v4/chapters?language=en"

SECTIONS = (
    "Context",
    "Tafsir Summary",
    "Tafsir Ibn Kathir",
    "Maarif ul Quran",
)


def fetch_chapters() -> dict[int, dict]:
    req = urllib.request.Request(QURAN_API, headers={"User-Agent": "QuranProject/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = json.load(response)
    return {c["id"]: c for c in data["chapters"]}


def parse_sections(body: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    for name in SECTIONS:
        pattern = rf"## {re.escape(name)}\s*\n(.*?)(?=\n## |\Z)"
        match = re.search(pattern, body, re.DOTALL)
        sections[name.lower().replace(" ", "_")] = match.group(1).strip() if match else ""
    return sections


def parse_ayah_file(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    meta: dict = {}
    body = text
    if text.startswith("---"):
        _, frontmatter, body = text.split("---", 2)
        meta = yaml.safe_load(frontmatter) or {}

    sections = parse_sections(body)
    ayah_num = int(path.stem.split("_")[1])
    return {
        "ayah": ayah_num,
        "arabic": meta.get("arabic_ayat", ""),
        "translation": meta.get("sentence_translation", ""),
        "word_by_word": meta.get("word_by_word", {}),
        **sections,
    }


def main() -> int:
    if not SOURCE.exists():
        print(f"Source not found: {SOURCE}", file=sys.stderr)
        return 1

    OUTPUT.mkdir(parents=True, exist_ok=True)
    chapters = fetch_chapters()
    index = []

    for surah in range(1, 115):
        surah_dir = SOURCE / f"Surah_{surah}"
        if not surah_dir.exists():
            continue

        ayahs = []
        for path in sorted(surah_dir.glob("Ayah_*.md"), key=lambda p: int(p.stem.split("_")[1])):
            ayahs.append(parse_ayah_file(path))

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
        (OUTPUT / f"surah_{surah}.json").write_text(
            json.dumps(surah_data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
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
        print(f"Built surah {surah}/114 ({len(ayahs)} ayahs)")

    (OUTPUT / "index.json").write_text(
        json.dumps({"surahs": index}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"\nDone. {len(index)} surahs written to {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
