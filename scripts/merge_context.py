# -*- coding: utf-8 -*-
"""Merge per-surah context extractions (scripts/_context_out/surah_N.json) into:
  - docs/data/asbab_nuzul.json   (occasion of revelation)
  - docs/data/hadith_index.json  (hadith + minimal isnad)
  - docs/data/hadith_map.json    (ayah -> [hadith ids])

Source of all content: Ibn Kathir's Tafsir (English), extracted faithfully by
subagents. We build a MINIMAL, truthful isnad — Prophet -> Companion -> Collection
— and never invent intermediate narrators (the English abridgement drops them).

Idempotent: a surah is merged once (tracked in scripts/context_progress.json).
Run again after new surah_N.json files appear; already-merged surahs are skipped.

Usage:
  python scripts/merge_context.py            # merge all un-merged surah files
  python scripts/merge_context.py --dry-run  # report only, write nothing
  python scripts/merge_context.py --surah 36 # merge one surah (must be un-merged)
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
OUT_DIR = ROOT / "scripts" / "_context_out"
PROGRESS = ROOT / "scripts" / "context_progress.json"

ASBAB = DATA / "asbab_nuzul.json"
HINDEX = DATA / "hadith_index.json"
HMAP = DATA / "hadith_map.json"
PEOPLE = DATA / "people_index.json"

SRC_LABEL = "As cited by Ibn Kathir, Tafsir al-Qur'an al-Adhim"


def load(p, default):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def is_arabic_heavy(text):
    """True if the text is mostly Arabic script — a sign of a regex extraction
    artifact that grabbed the ayah/bismillah instead of the English occasion."""
    letters = [c for c in (text or "") if c.isalpha()]
    if not letters:
        return False
    ar = sum(1 for c in letters if "؀" <= c <= "ۿ")
    return ar / len(letters) > 0.3


def next_hid_num(hindex):
    nums = [int(k[1:]) for k in hindex if k.startswith("h") and k[1:].isdigit()]
    # auto-extracted ids live at >=100 to stay clear of the curated h001..h040
    return max(nums + [99]) + 1


def build_isnad(h, people):
    chain = []
    if h.get("qudsi"):
        chain.append({"name": "Allah (Hadith Qudsi)", "type": "source"})
    chain.append({"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"})
    narrator = (h.get("narrator") or "").strip()
    if narrator:
        node = {"name": narrator, "type": "sahabi"}
        nid = (h.get("narrator_id") or "").strip()
        if nid and nid in people:          # only link if a real profile exists
            node["id"] = nid
        chain.append(node)
    src = (h.get("source") or "").strip()
    ref = (h.get("reference") or "").strip()
    if src:
        chain.append({"name": f"{src} · No. {ref}" if ref else src, "type": "book"})
    return chain


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--surah", type=int)
    args = ap.parse_args()

    asbab = load(ASBAB, {})
    hindex = load(HINDEX, {})
    hmap = load(HMAP, {})
    people = load(PEOPLE, {})
    progress = load(PROGRESS, {"merged_surahs": []})
    merged = set(progress.get("merged_surahs", []))

    files = sorted(OUT_DIR.glob("surah_*.json"), key=lambda p: int(p.stem.split("_")[1]))
    if args.surah:
        files = [f for f in files if int(f.stem.split("_")[1]) == args.surah]

    hid_n = next_hid_num(hindex)
    added_occ = added_had = skipped = purged = 0
    touched_surahs = []

    for f in files:
        n = int(f.stem.split("_")[1])
        if n in merged:
            skipped += 1
            continue
        rec = json.loads(f.read_text(encoding="utf-8"))

        # --- occasions ---
        # Purge contaminated regex artifacts (Arabic ayah/bismillah text) for this surah.
        for k in [k for k in asbab if k.startswith(f"{n}:") and is_arabic_heavy(asbab[k].get("occasion", ""))]:
            del asbab[k]
            purged += 1
        # Subagent extractions are clean & faithful — they are authoritative, so overwrite.
        for occ in rec.get("occasions", []):
            ayah = occ.get("ayah")
            text = (occ.get("occasion") or "").strip()
            if not ayah or not text or is_arabic_heavy(text):
                continue
            asbab[f"{n}:{ayah}"] = {"occasion": text, "source": SRC_LABEL, "has_occasion": True}
            added_occ += 1

        # --- hadith ---
        for h in rec.get("hadith", []):
            text = (h.get("text") or "").strip()
            ayahs = h.get("ayahs") or ([h["ayah"]] if h.get("ayah") else [])
            if not text or not ayahs:
                continue
            hid = f"h{hid_n}"
            hid_n += 1
            entry = {
                "id": hid,
                "narrator": (h.get("narrator") or "").strip(),
                "text": text,
                "source": (h.get("source") or "").strip(),
                "source_short": (h.get("source_short") or "").strip(),
                "book": (h.get("book") or "").strip(),
                "reference": (h.get("reference") or "").strip(),
                "grade": (h.get("grade") or "").strip(),
                "topic": (h.get("topic") or "").strip(),
                "isnad": build_isnad(h, people),
                "extracted": True,
            }
            nid = (h.get("narrator_id") or "").strip()
            if nid and nid in people:
                entry["narrator_id"] = nid
            hindex[hid] = entry
            for a in ayahs:
                hmap.setdefault(f"{n}:{a}", []).append(hid)
            added_had += 1

        merged.add(n)
        touched_surahs.append(n)

    print(f"Surahs newly merged: {sorted(touched_surahs)} (skipped {skipped} already done)")
    print(f"+{added_occ} occasions, +{added_had} hadith, purged {purged} contaminated occasions")

    if args.dry_run:
        print("DRY RUN — nothing written.")
        return

    ASBAB.write_text(json.dumps(asbab, ensure_ascii=False, indent=2), encoding="utf-8")
    HINDEX.write_text(json.dumps(hindex, ensure_ascii=False, indent=2), encoding="utf-8")
    HMAP.write_text(json.dumps(hmap, ensure_ascii=False, indent=2), encoding="utf-8")
    progress["merged_surahs"] = sorted(merged)
    PROGRESS.write_text(json.dumps(progress, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Written. Total: {len(asbab)} asbab keys, {len(hindex)} hadith, {len(hmap)} mapped ayahs.")
    print(f"Merged surahs so far: {len(merged)}/114")


if __name__ == "__main__":
    main()
