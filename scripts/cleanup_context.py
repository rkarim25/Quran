#!/usr/bin/env python3
"""Strip generic Context sections; keep only ayah-specific revelation context."""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from md_io import SOURCE, ayah_path, read_ayah, write_ayah

REVELATION_RE = re.compile(
    r"(?:reason for (?:the )?revelation|"
    r"this (?:ayah|verse|surah|passage) was revealed|"
    r"(?:ayah|verse|surah) (?:was|were) revealed|"
    r"was revealed (?:when|after|about|concerning|regarding|in|upon|to)|"
    r"revealed (?:when|after|about|concerning|regarding|in|upon|to|following)|"
    r"occasion of revelation|"
    r"following (?:incident|event|story)|"
    r"afterwards,? this (?:ayah|verse) was revealed|"
    r"sent down (?:when|after|in response|because|following))",
    re.IGNORECASE,
)

GENERIC_MARKERS = (
    "Yasir Qadhi often begins with",
    "That historical lens is essential",
    "we need to step into the world of the Prophet",
    "This ayah sits within a surah of",
    "The broader story of this surah",
    "While the mufassirun do not always record",
)


def _is_arabic_heavy(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return False
    arabic = sum(1 for ch in letters if "\u0600" <= ch <= "\u06FF")
    return arabic / len(letters) > 0.4


def extract_revelation_context(ibn: str, maarif: str) -> str:
    import re as re_mod

    found: list[str] = []
    seen: set[str] = set()
    for text in (ibn, maarif):
        for paragraph in re_mod.split(r"\n\s*\n", text.strip()):
            paragraph = paragraph.strip()
            if not paragraph or _is_arabic_heavy(paragraph):
                continue
            cleaned = re_mod.sub(r"\s+", " ", paragraph)
            if len(cleaned) < 60 or not REVELATION_RE.search(cleaned):
                continue
            key = cleaned[:120].lower()
            if key in seen:
                continue
            seen.add(key)
            found.append(cleaned)
            if len(found) >= 2:
                break
        if len(found) >= 2:
            break
    return "\n\n".join(found)


def is_generic_context(text: str) -> bool:
    if not text.strip():
        return True
    return any(marker in text for marker in GENERIC_MARKERS)


def main() -> int:
    updated = 0
    cleared = 0

    for surah in range(1, 115):
        surah_dir = SOURCE / f"Surah_{surah}"
        if not surah_dir.exists():
            continue
        for path in sorted(surah_dir.glob("Ayah_*.md")):
            data = read_ayah(path)
            new_context = extract_revelation_context(
                data.get("tafsir_ibn_kathir", ""),
                data.get("maarif_ul_quran", ""),
            )
            if not new_context and is_generic_context(data.get("context", "")):
                if data.get("context", "").strip():
                    data["context"] = ""
                    write_ayah(path, data)
                    cleared += 1
                continue
            if new_context and new_context != data.get("context", ""):
                data["context"] = new_context
                write_ayah(path, data)
                updated += 1
            elif not new_context and data.get("context", "").strip():
                data["context"] = ""
                write_ayah(path, data)
                cleared += 1

    print(f"Done. Set ayah-specific context: {updated}, cleared generic/empty: {cleared}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
