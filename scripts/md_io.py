"""Read and write Quran ayah markdown files."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "Quran-obs"

SECTIONS = (
    "Context",
    "Tafsir Summary",
    "Tafsir Ibn Kathir",
    "Maarif ul Quran",
    "Personal Reflections",
)


def ayah_path(surah: int, ayah: int) -> Path:
    return SOURCE / f"Surah_{surah}" / f"Ayah_{ayah}.md"


def _parse_sections(body: str) -> dict[str, str]:
    import re

    sections: dict[str, str] = {}
    for name in SECTIONS:
        pattern = rf"## {re.escape(name)}\s*\n(.*?)(?=\n## |\Z)"
        match = re.search(pattern, body, re.DOTALL)
        sections[name.lower().replace(" ", "_")] = match.group(1).strip() if match else ""
    return sections


def read_ayah(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    meta: dict = {}
    body = text
    if text.startswith("---"):
        _, frontmatter, body = text.split("---", 2)
        meta = yaml.safe_load(frontmatter) or {}

    sections = _parse_sections(body)
    ayah_num = int(path.stem.split("_")[1])
    wbw = meta.get("word_by_word") or {}
    if isinstance(wbw, dict):
        wbw = {str(k): v for k, v in wbw.items()}

    return {
        "surah": int(path.parent.name.split("_")[1]),
        "ayah": ayah_num,
        "arabic": meta.get("arabic_ayat", ""),
        "translation": meta.get("sentence_translation", ""),
        "word_by_word": wbw,
        "context": sections.get("context", ""),
        "tafsir_summary": sections.get("tafsir_summary", ""),
        "tafsir_ibn_kathir": sections.get("tafsir_ibn_kathir", ""),
        "maarif_ul_quran": sections.get("maarif_ul_quran", ""),
        "personal_reflections": sections.get("personal_reflections", ""),
    }


def write_ayah(path: Path, data: dict) -> None:
    wbw = data.get("word_by_word") or {}
    ordered_wbw = {}
    for key in sorted(wbw.keys(), key=lambda k: int(k)):
        ordered_wbw[int(key)] = wbw[key]

    frontmatter = {
        "arabic_ayat": data.get("arabic", ""),
        "sentence_translation": data.get("translation", ""),
        "word_by_word": ordered_wbw,
    }
    fm = yaml.dump(frontmatter, allow_unicode=True, default_flow_style=False, sort_keys=False)

    body_parts: list[str] = []
    if data.get("context", "").strip():
        body_parts.append(f"## Context\n\n{data['context'].strip()}")
    if data.get("tafsir_summary", "").strip():
        body_parts.append(f"## Tafsir Summary\n\n{data['tafsir_summary'].strip()}")
    if data.get("tafsir_ibn_kathir", "").strip():
        body_parts.append(f"## Tafsir Ibn Kathir\n\n{data['tafsir_ibn_kathir'].strip()}")
    if data.get("maarif_ul_quran", "").strip():
        body_parts.append(f"## Maarif ul Quran\n\n{data['maarif_ul_quran'].strip()}")
    body_parts.append(f"## Personal Reflections\n\n{data.get('personal_reflections', '').strip()}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{fm}---\n\n" + "\n\n".join(body_parts) + "\n", encoding="utf-8")


def to_json_ayah(data: dict) -> dict:
    return {
        "ayah": data["ayah"],
        "arabic": data["arabic"],
        "translation": data["translation"],
        "word_by_word": data["word_by_word"],
        "context": data.get("context", ""),
        "tafsir_summary": data.get("tafsir_summary", ""),
        "tafsir_ibn_kathir": data.get("tafsir_ibn_kathir", ""),
        "maarif_ul_quran": data.get("maarif_ul_quran", ""),
        "personal_reflections": data.get("personal_reflections", ""),
        "has_context": bool(data.get("context", "").strip()),
    }
