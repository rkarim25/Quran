#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Passage-based AI tafsir — source export, assembly, and validation.

The unit of tafsir is a PASSAGE (a contiguous run of thematically related
ayahs), not a single ayah. Segmentation is proposed by an LLM (see
scripts/workflows/passage_tafsir_pipeline.js) because the source tafsirs'
own block boundaries are too erratic to use — Ibn Kathir's abridgement runs
one block for all of surah 94/100/112 but nearly one block per ayah in
surah 2. This module is the deterministic (non-LLM) half of the pipeline.

Grounding rule: everything a passage says must come from the covered ayahs'
own `## Tafsir Ibn Kathir` / `## Maarif ul Quran` / `## Tafsir Summary`
sections. Hadith may only be cited if present in that text, with the
collection named as the source names it. Never invent isnad or grading.

Subcommands
  outline  --surah N   -> _tafsir/surah_N/outline.json     (for segmentation)
  bundles  --surah N   -> _tafsir/surah_N/src_<a>_<b>.md   (for drafting)
  apply    --surah N   -> docs/data/passage_tafsir/surah_N.json
  validate --surah N   -> exit 0 iff coverage + grounding checks pass

Working files live in scripts/_tafsir/ (git-ignored, derived).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "Quran-obs"
WORK = ROOT / "scripts" / "_tafsir"
OUT = ROOT / "docs" / "data" / "passage_tafsir"
PROGRESS = ROOT / "scripts" / "tafsir_progress.json"

# Runaway guard ONLY. The user's brief is "everything you need to get a deeper
# understanding", so length must follow the passage — a dense opening like
# al-Fatiha 1–4 legitimately runs ~13k chars. This catches a looping agent, not
# a thorough one; validate prints the length spread so depth stays visible.
MAX_TAFSIR_CHARS = 18000
SECTIONS = ("Tafsir Summary", "Tafsir Ibn Kathir", "Maarif ul Quran")


def surah_dir(n: int) -> Path:
    return SOURCE / f"Surah_{n}"


def work_dir(n: int) -> Path:
    d = WORK / f"surah_{n}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def ayah_files(n: int) -> list[Path]:
    d = surah_dir(n)
    if not d.exists():
        return []
    return sorted(d.glob("Ayah_*.md"), key=lambda p: int(re.sub(r"\D", "", p.stem)))


def split_front_matter(text: str) -> tuple[str, str]:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            nl = text.find("\n", end + 1)
            return text[: nl + 1], text[nl + 1 :]
    return "", text


def section(body: str, name: str) -> str:
    m = re.search(
        r"^## " + re.escape(name) + r"\s*$(.*?)(?=^## |\Z)", body, re.S | re.M
    )
    return m.group(1).strip() if m else ""


def frontmatter_value(fm: str, key: str) -> str:
    m = re.search(rf"^{re.escape(key)}:\s*(.*)$", fm, re.M)
    return m.group(1).strip() if m else ""


def read_ayah(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    fm, body = split_front_matter(text)
    return {
        "ayah": int(re.sub(r"\D", "", path.stem)),
        "arabic": frontmatter_value(fm, "arabic_ayat"),
        "translation": frontmatter_value(fm, "sentence_translation"),
        "sections": {name: section(body, name) for name in SECTIONS},
    }


def load_rows(n: int) -> list[dict]:
    rows = [read_ayah(p) for p in ayah_files(n)]
    if not rows:
        sys.exit(f"surah {n}: no ayah files under {surah_dir(n)}")
    return rows


# ---------------------------------------------------------------- outline

def cmd_outline(n: int) -> int:
    """Compact per-ayah view for the segmentation agent.

    Deliberately excludes the full tafsir text — a segmentation agent needs
    to see the whole surah's flow at once, which the full sources would not
    fit. It gets the translation (enough to spot topic shifts) plus a marker
    of how much commentary each ayah carries.
    """
    rows = load_rows(n)
    outline = [
        {
            "ayah": r["ayah"],
            "translation": r["translation"],
            "commentary_chars": sum(len(v) for v in r["sections"].values()),
        }
        for r in rows
    ]
    path = work_dir(n) / "outline.json"
    path.write_text(
        json.dumps({"surah": n, "ayah_count": len(rows), "ayahs": outline},
                   ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"surah {n}: outline for {len(rows)} ayat -> {path}")
    print(f"  segmentation agent should read: {path}")
    return 0


# ---------------------------------------------------------------- bundles

def read_passages(n: int) -> list[dict]:
    path = work_dir(n) / "passages.json"
    if not path.exists():
        sys.exit(f"surah {n}: missing {path} (run the segmentation step first)")
    data = json.loads(path.read_text(encoding="utf-8"))
    passages = data.get("passages", data if isinstance(data, list) else [])
    if not passages:
        sys.exit(f"surah {n}: {path} has no passages")
    return sorted(passages, key=lambda p: int(p["start"]))


def check_coverage(n: int, passages: list[dict], total: int) -> list[str]:
    """Every ayah covered by exactly one passage, in order, no gaps/overlaps."""
    problems = []
    expected = 1
    for p in passages:
        start, end = int(p["start"]), int(p["end"])
        if end < start:
            problems.append(f"passage {start}-{end}: end before start")
        if start < expected:
            problems.append(f"passage {start}-{end}: overlaps ayah {expected - 1}")
        elif start > expected:
            missing = f"{expected}" if start - expected == 1 else f"{expected}-{start - 1}"
            problems.append(f"gap: ayah {missing} not covered by any passage")
        expected = max(expected, end + 1)
    if expected <= total:
        missing = f"{expected}" if total - expected == 0 else f"{expected}-{total}"
        problems.append(f"gap: ayah {missing} not covered (surah has {total} ayat)")
    if expected > total + 1:
        problems.append(f"passages run past the end of the surah ({total} ayat)")
    return problems


def bundle_path(n: int, start: int, end: int) -> Path:
    return work_dir(n) / f"src_{start}_{end}.md"


def cmd_bundles(n: int) -> int:
    """Write one self-contained source bundle per passage, for the drafting agent."""
    rows = load_rows(n)
    by_ayah = {r["ayah"]: r for r in rows}
    passages = read_passages(n)

    problems = check_coverage(n, passages, len(rows))
    if problems:
        for p in problems:
            print("  -", p)
        sys.exit(f"surah {n}: segmentation does not cover the surah cleanly ({len(problems)} problem(s))")

    for p in passages:
        start, end = int(p["start"]), int(p["end"])
        parts = [
            f"# Source material for surah {n}, ayat {start}–{end}",
            f"Passage theme (as segmented): {p.get('title', '').strip() or '(none given)'}",
            "",
            "Everything the tafsir says MUST come from the text below. Cite a hadith",
            "ONLY if it appears below, naming the collection exactly as the text names",
            "it. Never invent isnad, wording, or grading.",
            "",
        ]
        for a in range(start, end + 1):
            r = by_ayah.get(a)
            if not r:
                continue
            parts.append(f"---\n\n## Ayah {n}:{a}\n")
            parts.append(f"**Arabic:** {r['arabic']}\n")
            parts.append(f"**Translation:** {r['translation']}\n")
            for name in SECTIONS:
                txt = r["sections"].get(name, "").strip()
                if txt:
                    parts.append(f"### {name}\n\n{txt}\n")
        bundle_path(n, start, end).write_text("\n".join(parts), encoding="utf-8")

    print(f"surah {n}: {len(passages)} passage bundle(s) -> {work_dir(n)}")
    for p in passages:
        s, e = int(p["start"]), int(p["end"])
        size = bundle_path(n, s, e).stat().st_size
        print(f"  {n}:{s}-{e}  {size // 1024} KB  {p.get('title', '')[:60]}")
    return 0


# ------------------------------------------------------------------ apply

def cmd_apply(n: int, drafts: list[str]) -> int:
    """Merge segmentation + drafted passage tafsir into the published sidecar."""
    rows = load_rows(n)
    passages = read_passages(n)
    problems = check_coverage(n, passages, len(rows))
    if problems:
        for p in problems:
            print("  -", p)
        sys.exit(f"surah {n}: refusing to apply, segmentation is not clean")

    # drafts: files each holding {start, end, tafsir} or a list of those
    text_by_range: dict[tuple[int, int], str] = {}
    paths = [Path(d) for pat in drafts for d in sorted(Path().glob(pat))] if drafts else []
    if not paths:
        paths = sorted(work_dir(n).glob("draft_*.json"))
    for path in paths:
        raw = json.loads(path.read_text(encoding="utf-8"))
        items = raw if isinstance(raw, list) else [raw]
        for it in items:
            if not it or not it.get("tafsir"):
                continue
            text_by_range[(int(it["start"]), int(it["end"]))] = it["tafsir"].strip()

    out_passages, missing = [], []
    for p in passages:
        start, end = int(p["start"]), int(p["end"])
        text = text_by_range.get((start, end), "")
        if not text:
            missing.append(f"{start}-{end}")
            continue
        out_passages.append({
            "start": start,
            "end": end,
            "title": p.get("title", "").strip(),
            "tafsir": text,
        })

    if missing:
        print(f"  MISSING draft for {len(missing)} passage(s): {', '.join(missing)}")

    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"surah_{n}.json"
    dest.write_text(
        json.dumps({"surah": n, "format": "passage-v2", "passages": out_passages},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"surah {n}: applied {len(out_passages)}/{len(passages)} passage(s) -> {dest}")
    return 1 if missing else 0


# --------------------------------------------------------------- validate

HADITH_CUE = re.compile(
    r"\b(Bukhari|Muslim|Tirmidhi|Abu Dawud|Abu Dawood|Nasa'i|Nasai|Ibn Majah|"
    r"Ahmad|Tabarani|Hakim|Bayhaqi|Darimi|Malik|Muwatta)\b",
    re.I,
)


def normalise(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def cmd_validate(n: int) -> int:
    rows = load_rows(n)
    total = len(rows)
    dest = OUT / f"surah_{n}.json"
    if not dest.exists():
        print(f"surah {n}: MISSING {dest}")
        return 1
    data = json.loads(dest.read_text(encoding="utf-8"))
    passages = data.get("passages", [])
    problems: list[str] = []

    problems += check_coverage(n, sorted(passages, key=lambda p: int(p["start"])), total)

    by_ayah = {r["ayah"]: r for r in rows}
    for p in passages:
        start, end = int(p["start"]), int(p["end"])
        tag = f"{n}:{start}-{end}"
        text = (p.get("tafsir") or "").strip()
        if not text:
            problems.append(f"{tag}: empty tafsir")
            continue
        if len(text) > MAX_TAFSIR_CHARS:
            problems.append(f"{tag}: {len(text)} chars exceeds guard {MAX_TAFSIR_CHARS}")
        if not (p.get("title") or "").strip():
            problems.append(f"{tag}: missing title")
        # Creed/style rules carried over from the layered runbook.
        if re.search(r"\bGod\b", text):
            problems.append(f"{tag}: uses standalone 'God' (must be 'Allah')")
        # Hadith grounding: any collection named in the tafsir must also be
        # named in the covered ayahs' own source text.
        src = normalise(" ".join(
            v for a in range(start, end + 1)
            for v in by_ayah.get(a, {}).get("sections", {}).values()
        ))
        for coll in {m.group(0) for m in HADITH_CUE.finditer(text)}:
            if normalise(coll) not in src:
                problems.append(
                    f"{tag}: cites '{coll}' but that collection is not named in the "
                    f"ayahs' own source text"
                )

    lengths = sorted(len((p.get("tafsir") or "")) for p in passages)
    if lengths:
        spread = (f"len min={lengths[0]} median={lengths[len(lengths) // 2]} "
                  f"max={lengths[-1]} total={sum(lengths):,}")
    else:
        spread = "len n/a"
    print(f"surah {n}: ayat={total} passages={len(passages)} {spread} "
          f"PROBLEMS={len(problems)}")
    for p in problems[:40]:
        print("  -", p)
    if len(problems) > 40:
        print(f"  ... and {len(problems) - 40} more")
    return 1 if problems else 0


# ------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=("outline", "bundles", "apply", "validate"))
    ap.add_argument("--surah", type=int, required=True)
    ap.add_argument("--drafts", nargs="*", default=[],
                    help="apply: draft JSON globs (default: _tafsir/surah_N/draft_*.json)")
    args = ap.parse_args()

    if args.cmd == "outline":
        return cmd_outline(args.surah)
    if args.cmd == "bundles":
        return cmd_bundles(args.surah)
    if args.cmd == "apply":
        return cmd_apply(args.surah, args.drafts)
    return cmd_validate(args.surah)


if __name__ == "__main__":
    sys.exit(main())
