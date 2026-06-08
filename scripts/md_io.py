"""Read and write Quran ayah markdown files."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "Quran-obs"

SECTIONS = (
    "Context",
    "Tafsir Summary",
    "Tafsir Ibn Kathir",
    "Maarif ul Quran",
    "AI Translation",
    "AI Tafsir",
    "Personal Reflections",
)


def ayah_path(surah: int, ayah: int) -> Path:
    return SOURCE / f"Surah_{surah}" / f"Ayah_{ayah}.md"


def _parse_sections(body: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    for name in SECTIONS:
        pattern = rf"## {re.escape(name)}\s*\n(.*?)(?=\n## |\Z)"
        match = re.search(pattern, body, re.DOTALL)
        sections[name.lower().replace(" ", "_")] = match.group(1).strip() if match else ""
    return sections


def _split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---"):
        return "", text
    _, frontmatter, body = text.split("---", 2)
    return f"---{frontmatter}---\n\n", body.lstrip("\n")


def _upsert_section(body: str, section_name: str, content: str) -> tuple[str, bool]:
    content = content.strip()
    pattern = rf"## {re.escape(section_name)}\s*\n(.*?)(?=\n## |\Z)"
    match = re.search(pattern, body, re.DOTALL)
    new_block = f"## {section_name}\n\n{content}"

    if match:
        if match.group(1).strip() == content:
            return body, False
        new_body = body[: match.start()] + new_block + body[match.end() :]
        return new_body.rstrip() + "\n", True

    pr_pattern = r"\n## Personal Reflections\s*\n"
    pr_match = re.search(pr_pattern, body)
    if pr_match:
        new_body = body[: pr_match.start()].rstrip() + "\n\n" + new_block + body[pr_match.start() :]
    else:
        sep = "\n\n" if body.strip() else ""
        new_body = body.rstrip() + sep + new_block + "\n"
    return new_body, True


def update_ai_sections(path: Path, ai_translation: str = "", ai_tafsir: str = "") -> bool:
    """Add or update AI Translation and AI Tafsir without touching other content."""
    if not path.exists():
        return False

    text = path.read_text(encoding="utf-8")
    prefix, body = _split_frontmatter(text)
    changed = False

    if ai_translation.strip():
        body, section_changed = _upsert_section(body, "AI Translation", ai_translation)
        changed = changed or section_changed
    if ai_tafsir.strip():
        body, section_changed = _upsert_section(body, "AI Tafsir", ai_tafsir)
        changed = changed or section_changed

    if not changed:
        return False

    new_text = prefix + body if prefix else body
    if not new_text.endswith("\n"):
        new_text += "\n"
    path.write_text(new_text, encoding="utf-8")
    return True


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
        "ai_translation": sections.get("ai_translation", ""),
        "ai_tafsir": sections.get("ai_tafsir", ""),
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
    if data.get("ai_translation", "").strip():
        body_parts.append(f"## AI Translation\n\n{data['ai_translation'].strip()}")
    if data.get("ai_tafsir", "").strip():
        body_parts.append(f"## AI Tafsir\n\n{data['ai_tafsir'].strip()}")
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
        "ai_translation": data.get("ai_translation", ""),
        "ai_tafsir": data.get("ai_tafsir", ""),
        "personal_reflections": data.get("personal_reflections", ""),
        "has_context": bool(data.get("context", "").strip()),
    }
