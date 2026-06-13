#!/usr/bin/env python3
"""Apply layered AI-tafsir for one surah into the markdown source, the sidecar,
and the built JSON the site serves.

Usage:
    python scripts/apply_layered_tafsir.py --surah N --input ayahs.json

`ayahs.json` maps ayah number (as string or int) -> rendered tafsir markdown,
e.g. {"1": "**Essence** ...\n\n**What it teaches** ...", "2": "..."}.
Only the ayahs present in the input are touched; everything else is preserved.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OBS = ROOT / "Quran-obs"
DATA = ROOT / "docs" / "data"

SECTION = re.compile(r"## AI Tafsir\s*\n.*?(?=\n## |\Z)", re.DOTALL)


LAYER_LABELS = ("Essence", "What it teaches", "The scholars", "From the Sunnah", "Reflection")


def normalize_rendered(text: str) -> str:
    """Normalize finalize format drift to the canonical layered format. Handles
    heading-style labels (## Essence / ## Essence.), bold labels carrying stray
    trailing punctuation (**Essence.** / **Essence:**), and strips any leading
    title/preamble so the entry starts at the first layer (**Essence**)."""
    text = text.strip()
    alt = "|".join(re.escape(l) for l in LAYER_LABELS)
    # heading-style label line -> bold label
    text = re.sub(rf"(?m)^[ \t]*#{{1,6}}[ \t]*({alt})[ \t]*[.:]?[ \t]*$", r"**\1**", text)
    # bold label carrying stray trailing punctuation -> clean bold label
    text = re.sub(rf"(?m)^([ \t]*)\*\*[ \t]*({alt})[ \t]*[.:][ \t]*\*\*", r"\1**\2**", text)
    i = text.find("**Essence**")
    if i > 0:
        text = text[i:].strip()
    return text


def upsert_ai_tafsir(text: str, content: str) -> str:
    """Replace the body of the `## AI Tafsir` section, preserving the rest."""
    block = "## AI Tafsir\n\n" + content.strip()
    if SECTION.search(text):
        return SECTION.sub(lambda m: block, text, count=1)
    pr = re.search(r"\n## Personal Reflections\s*\n", text)
    if pr:
        return text[: pr.start()].rstrip() + "\n\n" + block + "\n" + text[pr.start():]
    return text.rstrip() + "\n\n" + block + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--surah", type=int, required=True)
    ap.add_argument("--input", required=True, help="JSON: ayah number -> rendered markdown")
    args = ap.parse_args()
    surah = args.surah

    raw = json.loads(Path(args.input).read_text(encoding="utf-8"))
    finals = {int(k): normalize_rendered(str(v)) for k, v in raw.items() if str(v).strip()}
    if not finals:
        print("Nothing to apply (empty input).", file=sys.stderr)
        return 1

    # 1) Markdown source of truth.
    for ayah, text in sorted(finals.items()):
        p = OBS / f"Surah_{surah}" / f"Ayah_{ayah}.md"
        if not p.exists():
            print(f"WARN: missing {p}", file=sys.stderr)
            continue
        old = p.read_text(encoding="utf-8")
        new = upsert_ai_tafsir(old, text)
        if not new.endswith("\n"):
            new += "\n"
        if new != old:
            p.write_text(new, encoding="utf-8")

    # 2) Sidecar (docs/data/ai_tafsir/surah_N.json).
    sc = DATA / "ai_tafsir" / f"surah_{surah}.json"
    scd = json.loads(sc.read_text(encoding="utf-8")) if sc.exists() else {"surah": surah, "ayahs": {}}
    scd.setdefault("ayahs", {})
    for ayah, text in finals.items():
        scd["ayahs"][str(ayah)] = text
    sc.parent.mkdir(parents=True, exist_ok=True)
    sc.write_text(json.dumps(scd, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # 3) Built JSON the app fetches (docs/data/surah_N.json).
    bj = DATA / f"surah_{surah}.json"
    bjd = json.loads(bj.read_text(encoding="utf-8"))
    for ay in bjd.get("ayahs", []):
        if int(ay["ayah"]) in finals:
            ay["ai_tafsir"] = finals[int(ay["ayah"])]
    bj.write_text(json.dumps(bjd, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"Applied {len(finals)} ayah(s) to surah {surah}: {sorted(finals)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
