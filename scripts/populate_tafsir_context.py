#!/usr/bin/env python3
"""Populate Context, Tafsir Summary, and detailed tafsir sections for all ayah notes."""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API_ROOT = "https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir"
QURAN_API = "https://api.quran.com/api/v4"
USER_AGENT = "QuranProject/1.0 (Obsidian vault enrichment)"

TAFSIRS = {
    "ibn_kathir": {
        "slug": "en-tafisr-ibn-kathir",
        "heading": "## Tafsir Ibn Kathir",
    },
    "maarif": {
        "slug": "en-tafsir-maarif-ul-quran",
        "heading": "## Maarif ul Quran",
    },
}

HEADINGS = (
    "## Context",
    "## Tafsir Summary",
    TAFSIRS["ibn_kathir"]["heading"],
    TAFSIRS["maarif"]["heading"],
)

MAX_SUMMARY_EXCERPT_CHARS = 500
MAX_CONTEXT_CHARS = 1800
MAX_TAFSIR_SUMMARY_CHARS = 650
ROOT = Path(__file__).resolve().parent.parent / "Quran-obs"
PERSONAL_REFLECTIONS = "## Personal Reflections"

STUB_CONTINUATION_RE = re.compile(r"When (?:he|the servant) says,?\s*$", re.IGNORECASE)

REVELATION_RE = re.compile(
    r"(?:reason for (?:the )?revelation|"
    r"this (?:ayah|verse|surah|passage) was revealed|"
    r"(?:ayah|verse|surah) (?:was|were) revealed|"
    r"was revealed (?:when|after|about|concerning|regarding|in|upon|to)|"
    r"revealed (?:when|after|about|concerning|regarding|in|upon|to|following)|"
    r"occasion of revelation|"
    r"following (?:incident|event|story)|"
    r"afterwards,? this (?:ayah|verse) was revealed|"
    r"period of revelation|"
    r"beginning of revelation|"
    r"circumstances (?:in|of|surrounding) which|"
    r"sent down (?:when|after|in response|because|following))",
    re.IGNORECASE,
)

ORDINALS = {
    1: "1st",
    2: "2nd",
    3: "3rd",
}


def ordinal(n: int) -> str:
    if n in ORDINALS:
        return ORDINALS[n]
    suffix = "th"
    if n % 100 not in (11, 12, 13):
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def fetch_json(url: str, retries: int = 4) -> object:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == retries - 1:
                raise RuntimeError(f"Failed to fetch {url}: {exc}") from exc
            time.sleep(1.5 * (attempt + 1))
    return None


def fetch_surah_tafsir(slug: str, surah: int) -> list[dict]:
    return fetch_json(f"{API_ROOT}/{slug}/{surah}.json")


def fetch_chapters() -> dict[int, dict]:
    data = fetch_json(f"{QURAN_API}/chapters?language=en")
    return {chapter["id"]: chapter for chapter in data["chapters"]}


def fetch_chapter_info(surah: int) -> str:
    data = fetch_json(f"{QURAN_API}/chapters/{surah}/info?language=en")
    return data.get("chapter_info", {}).get("text", "").strip()


def _is_arabic_heavy(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return False
    arabic = sum(1 for ch in letters if "\u0600" <= ch <= "\u06FF")
    return arabic / len(letters) > 0.4


def _clean_text(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text.strip())
    text = re.sub(r"\*+", "", text)
    return text


def _paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]


def _truncate_at_sentence(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    for sep in (". ", "! ", "? "):
        idx = truncated.rfind(sep)
        if idx > max_chars // 2:
            return truncated[: idx + 1].rstrip()
    return truncated.rstrip() + "…"


def format_full_tafsir(text: str) -> str:
    """Return the complete tafsir text with light cleanup, no truncation."""
    text = text.strip()
    if not text:
        return ""

    text = re.sub(r"<[^>]+>", " ", text)
    paragraphs: list[str] = []
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        lines = [re.sub(r"[ \t]+", " ", line.strip()) for line in para.splitlines()]
        lines = [line for line in lines if line]
        paragraphs.append("\n".join(lines))
    return "\n\n".join(paragraphs)


def maybe_add_continuation_note(surah: int, ayah: int, text: str) -> str:
    if not text or not STUB_CONTINUATION_RE.search(text.strip()):
        return text
    if surah == 1 and 2 <= ayah <= 5:
        return (
            f"{text}\n\n"
            "> *In the Ibn Kathir source, the commentary on this ayah continues in "
            "**Ayah 6**, where the full hadith of the conversation between Allah and "
            "the worshipper during al-Fatiha is narrated in complete detail.*"
        )
    return text


def summarize_tafsir(text: str, max_chars: int = MAX_SUMMARY_EXCERPT_CHARS) -> str:
    text = text.strip()
    if not text:
        return ""

    chosen: list[str] = []
    for paragraph in _paragraphs(text):
        if _is_arabic_heavy(paragraph):
            continue
        lines = [line.strip() for line in paragraph.splitlines() if line.strip()]
        if len(lines) == 1 and len(lines[0]) < 90 and lines[0].endswith((")", ":", "?", "!")):
            continue
        if len(paragraph) < 25 and "." not in paragraph:
            continue
        chosen.append(_clean_text(paragraph))
        if len(chosen) >= 2:
            break

    if not chosen:
        chosen = [_clean_text(p) for p in _paragraphs(text) if not _is_arabic_heavy(p)][:2]
    if not chosen:
        chosen = [_clean_text(text)]

    return _truncate_at_sentence("\n\n".join(chosen), max_chars)


def _first_sentence(text: str) -> str:
    text = _clean_text(text)
    if not text:
        return ""
    match = re.search(r"^.+?[.!?](?:\s|$)", text)
    return match.group(0).strip() if match else _truncate_at_sentence(text, 220)


def combine_tafsir_summary(ibn_text: str, maarif_text: str) -> str:
    ibn_sentence = _first_sentence(summarize_tafsir(ibn_text, 500))
    maarif_sentence = _first_sentence(summarize_tafsir(maarif_text, 500))

    parts: list[str] = []
    if ibn_sentence:
        parts.append(ibn_sentence)
    if maarif_sentence:
        normalized_ibn = re.sub(r"[^a-z0-9 ]", "", ibn_sentence.lower())
        normalized_maarif = re.sub(r"[^a-z0-9 ]", "", maarif_sentence.lower())
        if not normalized_ibn or normalized_maarif[:80] not in normalized_ibn:
            parts.append(maarif_sentence)

    if not parts:
        fallback = summarize_tafsir(f"{ibn_text}\n\n{maarif_text}", MAX_TAFSIR_SUMMARY_CHARS)
        return fallback

    summary = " ".join(parts)
    return _truncate_at_sentence(summary, MAX_TAFSIR_SUMMARY_CHARS)


def extract_revelation_paragraphs(*texts: str, limit: int = 3) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    for text in texts:
        for paragraph in _paragraphs(text):
            if _is_arabic_heavy(paragraph):
                continue
            cleaned = _clean_text(paragraph)
            if len(cleaned) < 60 or not REVELATION_RE.search(cleaned):
                continue
            key = cleaned[:120].lower()
            if key in seen:
                continue
            seen.add(key)
            found.append(cleaned)
            if len(found) >= limit:
                return found
    return found


def extract_chapter_info_snippet(chapter_info: str, ayah: int, verses_count: int) -> str:
    if not chapter_info:
        return ""

    text = _clean_text(chapter_info)
    ayah_pattern = re.compile(rf"\b(?:ayah|verse|verses)\s+{ayah}\b", re.IGNORECASE)
    range_pattern = re.compile(rf"\b{ayah}\s*[-–]\s*\d+\b|\b\d+\s*[-–]\s*{ayah}\b")

    for match in re.finditer(
        r"(Period of Revelation|Beginning of Revelation|Occasion of Revelation[^.]*|Theme[s]? of the Surah|Subject Matter)",
        text,
        re.IGNORECASE,
    ):
        start = match.start()
        snippet = text[start : start + 900]
        if ayah == 1 or ayah_pattern.search(snippet) or range_pattern.search(snippet):
            return _truncate_at_sentence(snippet, 700)

    if ayah == 1:
        return _truncate_at_sentence(text, 700)

    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if ayah_pattern.search(sentence) or range_pattern.search(sentence):
            return _truncate_at_sentence(sentence, 700)

    period_match = re.search(r"Period of Revelation.*?(?=Theme|Subject|Name|$)", text, re.IGNORECASE)
    if period_match:
        return _truncate_at_sentence(period_match.group(0), 550)

    theme_match = re.search(r"(Theme[s]? of the Surah|Subject Matter).*", text, re.IGNORECASE)
    if theme_match:
        return _truncate_at_sentence(theme_match.group(0), 550)

    return _truncate_at_sentence(text, 450)


def period_label(revelation_place: str, revelation_order: int) -> str:
    place = revelation_place.title()
    if revelation_place.lower() == "makkah":
        if revelation_order <= 20:
            phase = "the earliest and most intense days of persecution in Makkah"
        elif revelation_order <= 60:
            phase = "the later Makkan period, as the message spread despite opposition"
        else:
            phase = "the final chapter of the Makkan struggle"
    else:
        if revelation_order <= 90:
            phase = "the early Madinan period, when the Muslim community was being built"
        else:
            phase = "the mature Madinan period, as laws and social order took shape"
    return f"the {place} phase of revelation ({phase})"


def build_context(
    surah: int,
    ayah: int,
    chapter: dict,
    chapter_info: str,
    ibn_full: str,
    maarif_full: str,
) -> str:
    name_simple = chapter["name_simple"]
    translated = chapter["translated_name"]["name"]
    place = chapter["revelation_place"].title()
    order = chapter["revelation_order"]
    verses_count = chapter["verses_count"]

    revelation_bits = extract_revelation_paragraphs(ibn_full, maarif_full)
    chapter_snippet = extract_chapter_info_snippet(chapter_info, ayah, verses_count)

    parts: list[str] = [
        (
            f"To understand **{translated}** ({name_simple}) {ayah}, we need to step into the world of the Prophet ﷺ "
            f"and ask the questions Yasir Qadhi often begins with: *what was happening, when was this revealed, and why did Allah choose this moment?*"
        ),
        (
            f"Surah {name_simple} is a **{place}** surah—revealed as the {ordinal(order)} surah in chronological order, "
            f"during {period_label(chapter['revelation_place'], order)}. "
            f"This ayah sits within a surah of {verses_count} verses that shaped how the companions understood their Lord, their community, and their mission."
        ),
    ]

    if revelation_bits:
        parts.append(
            "When we turn to the scholars of tafsir and the seerah, the backdrop of this specific verse comes into focus:"
        )
        parts.extend(revelation_bits[:2])
    elif chapter_snippet:
        parts.append(
            "The broader story of this surah—drawn from classical tafsir introductions—helps us see why this ayah mattered when it descended:"
        )
        parts.append(chapter_snippet)
    else:
        parts.append(
            f"While the mufassirun do not always record a single isolated incident for every ayah, they situate Surah {name_simple} "
            f"within the lived experience of the Prophet ﷺ in {place}. "
            f"Each verse was not revealed in a vacuum; it answered a real question, eased a real pain, or guided a real community through a real crisis."
        )

    parts.append(
        "That historical lens is essential. The Qur'an is not an abstract textbook—it is divine speech anchored in the life of Muhammad ﷺ, "
        "and this ayah becomes far richer once we read it with that scene in mind."
    )

    return _truncate_at_sentence("\n\n".join(parts), MAX_CONTEXT_CHARS)


def strip_generated_sections(before: str) -> str:
    cut_at = len(before)
    for heading in HEADINGS:
        idx = before.find(f"\n{heading}")
        if idx != -1:
            cut_at = min(cut_at, idx)
    return before[:cut_at].rstrip()


def build_body(context: str, tafsir_summary: str, ibn_kathir: str, maarif: str) -> str:
    sections = [
        f"## Context\n\n{context}" if context else "## Context\n",
        f"## Tafsir Summary\n\n{tafsir_summary}" if tafsir_summary else "## Tafsir Summary\n",
        f"{TAFSIRS['ibn_kathir']['heading']}\n\n{ibn_kathir}" if ibn_kathir else f"{TAFSIRS['ibn_kathir']['heading']}\n",
        f"{TAFSIRS['maarif']['heading']}\n\n{maarif}" if maarif else f"{TAFSIRS['maarif']['heading']}\n",
    ]
    return "\n\n".join(sections)


def update_markdown_file(
    filepath: Path,
    context: str,
    tafsir_summary: str,
    ibn_kathir: str,
    maarif: str,
) -> bool:
    try:
        content = filepath.read_text(encoding="utf-8")
    except OSError as exc:
        raise PermissionError(f"Cannot read {filepath}: {exc}") from exc

    marker = f"\n{PERSONAL_REFLECTIONS}"
    if marker not in content:
        return False

    before, after = content.split(marker, 1)
    before = strip_generated_sections(before)
    body = build_body(context, tafsir_summary, ibn_kathir, maarif)

    try:
        filepath.write_text(f"{before}\n\n{body}\n\n{PERSONAL_REFLECTIONS}{after}", encoding="utf-8")
    except OSError as exc:
        raise PermissionError(f"Cannot write {filepath}: {exc}") from exc
    return True


def index_by_ayah(entries: list[dict]) -> dict[int, str]:
    return {entry["ayah"]: entry.get("text", "") for entry in entries if entry.get("ayah") is not None}


def section_block(existing: str, heading: str, next_heading: str | None) -> str:
    if heading not in existing:
        return ""
    block = existing.split(heading, 1)[1]
    if next_heading and next_heading in block:
        block = block.split(next_heading, 1)[0]
    elif PERSONAL_REFLECTIONS in block:
        block = block.split(PERSONAL_REFLECTIONS, 1)[0]
    return block.strip()


def tafsir_needs_update(existing: str, heading: str, next_heading: str, full_text: str) -> bool:
    formatted = format_full_tafsir(full_text)
    if not formatted:
        return False
    current = section_block(existing, heading, next_heading)
    if not current:
        return True
    # Previously truncated entries are much shorter than the API source.
    return len(current) < len(formatted) * 0.95


def needs_update(existing: str, surah: int, ayah: int, ibn_full: str, maarif_full: str) -> bool:
    if not section_block(existing, "## Context", "## Tafsir Summary"):
        return True
    if not section_block(existing, "## Tafsir Summary", TAFSIRS["ibn_kathir"]["heading"]):
        return True
    if tafsir_needs_update(existing, TAFSIRS["ibn_kathir"]["heading"], TAFSIRS["maarif"]["heading"], ibn_full):
        return True
    if tafsir_needs_update(existing, TAFSIRS["maarif"]["heading"], PERSONAL_REFLECTIONS, maarif_full):
        return True
    ibn_formatted = format_full_tafsir(ibn_full)
    ibn_current = section_block(existing, TAFSIRS["ibn_kathir"]["heading"], TAFSIRS["maarif"]["heading"])
    if (
        surah == 1
        and 2 <= ayah <= 5
        and STUB_CONTINUATION_RE.search(ibn_formatted)
        and "continues in **Ayah 6**" not in ibn_current
    ):
        return True
    return False


def main() -> int:
    force = "--force" in sys.argv
    updated = 0
    skipped = 0
    missing = 0
    errors: list[str] = []

    print("Loading chapter metadata...", flush=True)
    chapters = fetch_chapters()

    for surah in range(1, 115):
        print(f"Processing surah {surah}/114...", flush=True)
        chapter = chapters[surah]
        try:
            chapter_info = fetch_chapter_info(surah)
            ibn_entries = fetch_surah_tafsir(TAFSIRS["ibn_kathir"]["slug"], surah)
            maarif_entries = fetch_surah_tafsir(TAFSIRS["maarif"]["slug"], surah)
        except RuntimeError as exc:
            errors.append(str(exc))
            continue

        ibn_by_ayah = index_by_ayah(ibn_entries)
        maarif_by_ayah = index_by_ayah(maarif_entries)
        ayahs = sorted(set(ibn_by_ayah) | set(maarif_by_ayah))

        for ayah in ayahs:
            filepath = ROOT / f"Surah_{surah}" / f"Ayah_{ayah}.md"
            if not filepath.exists():
                missing += 1
                errors.append(f"Missing file: {filepath.relative_to(ROOT)}")
                continue

            if not force:
                existing = filepath.read_text(encoding="utf-8")
                if not needs_update(existing, surah, ayah, ibn_by_ayah.get(ayah, ""), maarif_by_ayah.get(ayah, "")):
                    skipped += 1
                    continue

            ibn_full = ibn_by_ayah.get(ayah, "")
            maarif_full = maarif_by_ayah.get(ayah, "")

            context = build_context(surah, ayah, chapter, chapter_info, ibn_full, maarif_full)
            tafsir_summary = combine_tafsir_summary(ibn_full, maarif_full)
            ibn_text = maybe_add_continuation_note(surah, ayah, format_full_tafsir(ibn_full))
            maarif_text = format_full_tafsir(maarif_full)

            try:
                if update_markdown_file(filepath, context, tafsir_summary, ibn_text, maarif_text):
                    updated += 1
                else:
                    errors.append(f"Could not update: {filepath.relative_to(ROOT)}")
            except PermissionError as exc:
                errors.append(str(exc))

        time.sleep(0.2)

    print(f"\nDone. Updated: {updated}, skipped (already filled): {skipped}, missing files: {missing}")
    if errors:
        print(f"Errors ({len(errors)}):")
        for err in errors[:20]:
            print(f"  - {err}")
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
