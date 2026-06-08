#!/usr/bin/env python3
"""Regenerate ## Tafsir Summary sections for all ayah notes."""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from md_io import SOURCE, read_ayah
from tafsir_summary import build_educational_summary

PERSONAL_REFLECTIONS = "## Personal Reflections"
TAFSIR_SUMMARY = "## Tafsir Summary"
IBN_KATHIR = "## Tafsir Ibn Kathir"
MAARIF = "## Maarif ul Quran"


def replace_summary_section(content: str, new_summary: str) -> str:
    if TAFSIR_SUMMARY not in content:
        return content
    pattern = rf"({re.escape(TAFSIR_SUMMARY)}\s*\n)(.*?)(?=\n## |\n{re.escape(PERSONAL_REFLECTIONS)}|\Z)"

    def repl(match: re.Match[str]) -> str:
        return f"{match.group(1)}{new_summary.strip()}\n"

    return re.sub(pattern, repl, content, count=1, flags=re.DOTALL)


def iter_ayah_files(surah: int | None = None):
    if surah:
        surah_dir = SOURCE / f"Surah_{surah}"
        if not surah_dir.exists():
            return
        paths = sorted(surah_dir.glob("Ayah_*.md"), key=lambda p: int(p.stem.split("_")[1]))
        yield from paths
        return
    for surah_dir in sorted(SOURCE.glob("Surah_*"), key=lambda p: int(p.name.split("_")[1])):
        for path in sorted(surah_dir.glob("Ayah_*.md"), key=lambda p: int(p.stem.split("_")[1])):
            yield path


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate concise tafsir summaries")
    parser.add_argument("--surah", type=int, help="Process one surah only")
    parser.add_argument("--dry-run", action="store_true", help="Print samples without writing")
    parser.add_argument("--sample", type=int, default=0, help="Print N sample summaries")
    args = parser.parse_args()

    if not SOURCE.exists():
        print(f"Source not found: {SOURCE}", file=sys.stderr)
        return 1

    updated = 0
    skipped = 0
    samples: list[tuple[str, str]] = []
    current_surah = None
    used_in_surah: set[str] = set()

    for path in iter_ayah_files(args.surah):
        if args.sample and len(samples) >= args.sample and args.dry_run:
            break

        data = read_ayah(path)
        if data["surah"] != current_surah:
            current_surah = data["surah"]
            used_in_surah = set()

        ibn = data.get("tafsir_ibn_kathir", "")
        maarif = data.get("maarif_ul_quran", "")
        if not ibn and not maarif:
            skipped += 1
            continue

        exclude: set[str] = set()
        summary = ""
        for _ in range(5):
            summary = build_educational_summary(
                ibn,
                maarif,
                surah=data["surah"],
                ayah=data["ayah"],
                translation=data.get("translation", ""),
                word_by_word=data.get("word_by_word"),
                exclude=exclude,
            )
            if not summary:
                break
            norm = re.sub(r"[^a-z0-9 ]", "", summary.lower())[:100]
            if norm not in used_in_surah:
                used_in_surah.add(norm)
                break
            exclude.add(summary)
            summary = ""

        if not summary:
            skipped += 1
            continue

        if args.sample and len(samples) < args.sample:
            samples.append((f"{data['surah']}:{data['ayah']}", summary))

        if args.dry_run:
            continue

        content = path.read_text(encoding="utf-8")
        new_content = replace_summary_section(content, summary)
        if new_content != content:
            path.write_text(new_content, encoding="utf-8")
            updated += 1
        else:
            skipped += 1

    if samples:
        print("Sample summaries:\n")
        for ref, text in samples:
            print(f"--- {ref} ---")
            print(text)
            print()

    if args.dry_run:
        print(f"Dry run complete. Would update ayahs with summaries.")
        return 0

    print(f"Done. Updated: {updated}, skipped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
