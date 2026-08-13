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
  status  [--surah N]  -> what is done / what is left / the exact next command
  pause   [--reason R] -> set the pause flag; the loop stops at the next surah
  resume               -> clear the pause flag
  outline  --surah N   -> _tafsir/surah_N/outline.json     (for segmentation)
  bundles  --surah N   -> _tafsir/surah_N/src_<a>_<b>.md   (for drafting)
  apply    --surah N   -> docs/data/passage_tafsir/surah_N.json
  validate --surah N   -> exit 0 iff coverage + grounding checks pass

Working files live in scripts/_tafsir/ (git-ignored, derived).

RESUMING AFTER A SESSION LIMIT
`status` derives everything from what is actually on disk, so it cannot go
stale — run it first in any new session. Drafting persists each passage the
moment it is finished, and `apply` is safe to run with only some passages
drafted: it publishes what exists and records the missing ranges in
scripts/tafsir_progress.json (which IS committed), so the footprint survives
even a fresh clone. Re-run drafting for just the missing ranges.
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

def load_progress() -> dict:
    if PROGRESS.exists():
        return json.loads(PROGRESS.read_text(encoding="utf-8"))
    return {"format": "passage-v2", "completed_surahs": []}


def save_progress(prog: dict) -> None:
    PROGRESS.write_text(json.dumps(prog, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")


def record_progress(n: int, total: int, applied: int, missing: list[str]) -> None:
    """Write the resume footprint into the COMMITTED progress file.

    scripts/_tafsir/ is git-ignored, so on a fresh clone the only durable record
    of "surah N was half done, these ranges are missing" is this file. Written on
    every apply, including partial ones, so a session limit mid-run still leaves
    a complete picture of what is left.
    """
    prog = load_progress()
    done = set(prog.get("completed_surahs") or [])
    in_prog = {k: v for k, v in (prog.get("in_progress") or {}).items()}

    if missing:
        done.discard(n)
        in_prog[str(n)] = {
            "total_passages": total,
            "applied": applied,
            "missing_ranges": missing,
            "next": (f"re-run the tafsir-draft workflow for surah {n} with only "
                     f"these ranges in `passages`: {', '.join(missing)}"),
        }
    else:
        done.add(n)
        in_prog.pop(str(n), None)

    prog["completed_surahs"] = sorted(done)
    if in_prog:
        prog["in_progress"] = in_prog
    else:
        prog.pop("in_progress", None)
    save_progress(prog)


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
    record_progress(n, len(passages), len(out_passages), missing)
    if missing:
        print(f"  recorded resume footprint in {PROGRESS.name} "
              f"(in_progress.{n}.missing_ranges) — commit it so the state survives")
    return 1 if missing else 0


# --------------------------------------------------------------- validate

HADITH_CUE = re.compile(
    r"\b(Bukhari|Muslim|Tirmidhi|Abu Dawud|Abu Dawood|Nasa'i|Nasai|Ibn Majah|"
    r"Ahmad|Tabarani|Hakim|Bayhaqi|Darimi|Malik|Muwatta)\b",
    re.I,
)


def normalise(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


# Spellings the source texts actually use for a collection, beyond the name the
# tafsir is likely to use. The Maarif ul Quran translation prints "al-Bukhri"
# (missing the 'a') in a number of places; treating that as absent made the
# grounding check reject citations that were in fact properly grounded, which is
# the more dangerous failure — it pushes toward deleting true attributions.
# Only add a variant here after confirming it in the source text itself.
COLLECTION_ALIASES = {
    "bukhari": ("bukhari", "bukhri", "bukhaari"),
    "ahmad": ("ahmad", "abmad", "ahmed"),      # "Imam Abmad in his Musnad" — OCR 'h'->'b'
    "bayhaqi": ("bayhaqi", "baihaqi"),
    "tabarani": ("tabarani", "tabrani"),
}


def named_in_source(coll: str, src: str) -> bool:
    key = normalise(coll)
    for variant in COLLECTION_ALIASES.get(key, (key,)):
        if variant in src:
            return True
    return False


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
        title = (p.get("title") or "").strip()
        if not title:
            problems.append(f"{tag}: missing title")
        # Titles are published alongside the tafsir, so they are held to the
        # same language rule. Checking only the body let a title through.
        if re.search(r"\bGod\b", title):
            problems.append(f"{tag}: title uses standalone 'God' (must be 'Allah')")
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
            if not named_in_source(coll, src):
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


# ----------------------------------------------------------- pause / resume

def cmd_pause(reason: str) -> int:
    """Set the pause flag. Checked between surahs, so work in flight finishes."""
    prog = load_progress()
    prog["paused"] = {"reason": reason or "paused by the user"}
    save_progress(prog)
    print("PAUSED — tafsir generation will stop at the next surah boundary.")
    print(f"  reason: {prog['paused']['reason']}")
    print("  resume with: python scripts/tafsir_passages.py resume")
    print(f"  commit {PROGRESS.name} so the pause holds across sessions/machines.")
    return 0


def cmd_resume() -> int:
    prog = load_progress()
    was = prog.pop("paused", None)
    save_progress(prog)
    if was:
        print(f"Resumed (was paused: {was.get('reason', '')}).")
    else:
        print("Not paused — nothing to clear.")
    return 0


def is_paused(prog: dict) -> dict | None:
    p = prog.get("paused")
    return p if isinstance(p, dict) else None


# ---------------------------------------------------------------- status

PRIORITY = [1, 36, 55, 67, 18, 112, 113, 114] + list(range(78, 112)) + [2, 3]


def surah_state(n: int) -> dict:
    """Everything about surah N's tafsir, derived from disk only."""
    files = ayah_files(n)
    wd = WORK / f"surah_{n}"
    pj = wd / "passages.json"
    segmented, planned = False, []
    if pj.exists():
        try:
            data = json.loads(pj.read_text(encoding="utf-8"))
            planned = sorted(data.get("passages", []), key=lambda p: int(p["start"]))
            segmented = bool(planned)
        except Exception:
            pass
    drafted = {(int(m.group(1)), int(m.group(2)))
               for f in wd.glob("draft_*.json")
               if (m := re.match(r"draft_(\d+)_(\d+)$", f.stem))}
    published = 0
    dest = OUT / f"surah_{n}.json"
    if dest.exists():
        try:
            published = len(json.loads(dest.read_text(encoding="utf-8")).get("passages", []))
        except Exception:
            pass
    missing = [f"{int(p['start'])}-{int(p['end'])}" for p in planned
               if (int(p["start"]), int(p["end"])) not in drafted]
    return {
        "ayat": len(files),
        "segmented": segmented,
        "planned": len(planned),
        "drafted": len(drafted),
        "published": published,
        "missing": missing,
        "work_dir": str(wd),
    }


def next_command(n: int, st: dict) -> str:
    wd = st["work_dir"].replace("\\", "/")
    if not st["segmented"]:
        return (f"python scripts/tafsir_passages.py outline --surah {n}\n"
                f"    then Workflow scripts/workflows/tafsir_segment.js with args "
                f'{{"surah": {n}, "dir": "{wd}", "ayah_count": {st["ayat"]}}}')
    if st["missing"]:
        return (f"python scripts/tafsir_passages.py bundles --surah {n}\n"
                f"    then Workflow scripts/workflows/tafsir_draft.js for the "
                f"{len(st['missing'])} missing range(s): {', '.join(st['missing'])}")
    if st["published"] < st["planned"]:
        return f"python scripts/tafsir_passages.py apply --surah {n}"
    return (f"python scripts/tafsir_passages.py validate --surah {n}  (then "
            f"build_site.py --surah {n}, bump versions, commit, push)")


def cmd_status(only: int | None) -> int:
    prog = load_progress()
    done = set(prog.get("completed_surahs") or [])

    paused = is_paused(prog)
    if paused:
        print("*** PAUSED ***")
        print(f"  reason: {paused.get('reason', '')}")
        print("  Do NOT start new tafsir work. Only the user saying resume should")
        print("  clear this: python scripts/tafsir_passages.py resume")
        print()

    if only:
        targets = [only]
    else:
        # Anything with work on disk or recorded as in progress, plus the next
        # not-yet-started surah in priority order.
        targets = sorted({int(p.name.split("_")[1]) for p in WORK.glob("surah_*")
                          if p.is_dir()} | {int(k) for k in (prog.get("in_progress") or {})} | done)
        nxt = next((s for s in PRIORITY if s not in done), None)
        if nxt and nxt not in targets:
            targets.append(nxt)

    print(f"completed: {len(done)}/114 -> {sorted(done) if done else 'none'}")
    incomplete = []
    for n in targets:
        st = surah_state(n)
        if not st["ayat"]:
            continue
        flag = "DONE " if n in done and not st["missing"] else "TODO "
        print(f"\n{flag}surah {n}: {st['ayat']} ayat | segmented={st['segmented']} "
              f"planned={st['planned']} drafted={st['drafted']} published={st['published']}")
        if st["missing"]:
            print(f"      missing drafts: {', '.join(st['missing'])}")
        if n not in done or st["missing"]:
            incomplete.append(n)
            print(f"      NEXT: {next_command(n, st)}")

    if not incomplete:
        nxt = next((s for s in PRIORITY if s not in done), None)
        if nxt:
            print(f"\nNothing half-finished. Next surah in priority order: {nxt}")
            print(f"      NEXT: python scripts/tafsir_passages.py outline --surah {nxt}")
        else:
            print("\nPriority list exhausted — pick any remaining surah.")
    if paused:
        print("\n*** PAUSED — stop here. ***")
    return 0


# ------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=("status", "pause", "resume", "outline",
                                    "bundles", "apply", "validate"))
    ap.add_argument("--surah", type=int,
                    help="required for every command except status/pause/resume")
    ap.add_argument("--reason", default="", help="pause: why")
    ap.add_argument("--drafts", nargs="*", default=[],
                    help="apply: draft JSON globs (default: _tafsir/surah_N/draft_*.json)")
    args = ap.parse_args()

    if args.cmd == "status":
        return cmd_status(args.surah)
    if args.cmd == "pause":
        return cmd_pause(args.reason)
    if args.cmd == "resume":
        return cmd_resume()
    if not args.surah:
        ap.error(f"--surah is required for `{args.cmd}`")

    if args.cmd == "outline":
        return cmd_outline(args.surah)
    if args.cmd == "bundles":
        return cmd_bundles(args.surah)
    if args.cmd == "apply":
        return cmd_apply(args.surah, args.drafts)
    return cmd_validate(args.surah)


if __name__ == "__main__":
    sys.exit(main())
