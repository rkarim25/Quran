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
AI_TRANSLATIONS = OUTPUT / "ai_translations"
AI_TAFSIR = OUTPUT / "ai_tafsir"
QF_TRANSLATIONS = OUTPUT / "qf_translations"
QF_TAFSIR = OUTPUT / "qf_tafsir"
QURAN_API = "https://api.quran.com/api/v4/chapters?language=en"


def load_sidecar(directory: Path, surah: int) -> dict[int, str]:
    path = directory / f"surah_{surah}.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    ayahs = data.get("ayahs", {})
    return {int(k): v for k, v in ayahs.items() if v and str(v).strip()}


def load_ai_translations(surah: int) -> dict[int, str]:
    return load_sidecar(AI_TRANSLATIONS, surah)


def load_ai_tafsir(surah: int) -> dict[int, str]:
    return load_sidecar(AI_TAFSIR, surah)


def load_qf_translations(surah: int) -> dict[int, str]:
    return load_sidecar(QF_TRANSLATIONS, surah)


def load_qf_tafsir(surah: int) -> dict[int, str]:
    return load_sidecar(QF_TAFSIR, surah)


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
    ai_map = load_ai_translations(surah)
    tafsir_map = load_ai_tafsir(surah)
    qf_tr_map = load_qf_translations(surah)
    qf_tf_map = load_qf_tafsir(surah)
    for path in sorted(surah_dir.glob("Ayah_*.md"), key=lambda p: int(p.stem.split("_")[1])):
        row = to_json_ayah(read_ayah(path))
        if not row.get("ai_translation", "").strip() and row["ayah"] in ai_map:
            row["ai_translation"] = ai_map[row["ayah"]]
        if not row.get("ai_tafsir", "").strip() and row["ayah"] in tafsir_map:
            row["ai_tafsir"] = tafsir_map[row["ayah"]]
        if row["ayah"] in qf_tr_map:
            row["qf_translation"] = qf_tr_map[row["ayah"]]
        if row["ayah"] in qf_tf_map:
            row["qf_tafsir"] = qf_tf_map[row["ayah"]]
        ayahs.append(row)

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


def stamp_build() -> None:
    """Stamp a build id into docs/index.html (__BUILD_ID__) and docs/build.json.

    The reader fetches build.json (no-store) on load and reloads once, cache-busted,
    if the live build differs from the one baked into the cached index.html — so a
    stale CDN/browser copy never sticks. Uses the commit SHA in CI, else a timestamp.
    """
    import os, time

    build_id = os.environ.get("GITHUB_SHA", "")[:8] or str(int(time.time()))
    docs = ROOT / "docs"
    (docs / "build.json").write_text(json.dumps({"build": build_id}), encoding="utf-8")
    idx = docs / "index.html"
    if idx.exists():
        html = idx.read_text(encoding="utf-8")
        if "__BUILD_ID__" in html:
            idx.write_text(html.replace("__BUILD_ID__", build_id), encoding="utf-8")


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

    from build_search_index import main as build_search_index

    build_search_index()
    stamp_build()
    print(f"\nDone. {len(index)} surahs written to {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
