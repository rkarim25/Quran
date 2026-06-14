#!/usr/bin/env python3
"""Extract deduplicated unique surface forms for one surah, for the AI wbw pipeline.

The Qur'an repeats heavily: ~77k tokens but only a few thousand unique fully
diacritized surface forms. This script groups every word position by its EXACT
diacritized form (keeping harakat so case/mood is preserved) so the pipeline can
analyse each unique form once and reuse it across every occurrence.

Normalization for the dedup KEY strips only marks that do NOT change the word's
morphology: Qur'anic recitation/annotation signs, honorifics, tatweel, bidi /
zero-width controls and spaces. Short vowels / tanwin / shadda / sukun (which
carry the grammatical ending) are KEPT, so e.g. rabbi/rabbu/rabba stay distinct.

Usage:
    python scripts/extract_forms.py --surah N [--ayahs 1,2,3] [--out path.json]

Output JSON (compact):
    { "surah": N,
      "forms": [ {"id":0,"ar":<arabic>,"tr":<translit>,"gloss":<source translation>,"ay":<sample ayah>} ],
      "ayahText": { "<ayah>": {"a":<arabic>,"t":<translation>} },
      "positions": { "<ayah>": { "<wordIdx>": <formId> } } }
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"

# Codepoint ranges (inclusive) of NON-morphological marks stripped for the dedup
# KEY. Pure-ASCII source (hex literals only) so it is auditable and stable.
# We deliberately KEEP harakat (U+064B-U+0652), superscript alef (U+0670) and
# hamza/maddah (U+0653-U+0655): those carry the grammatical ending, so
# rabbi / rabbu / rabba remain distinct forms.
_STRIP_RANGES = [
    (0x0610, 0x0617),  # honorific signs + small-high letter annotations (incl. U+0615 tah)
    (0x06D6, 0x06ED),  # Qur'anic recitation/pause signs, sajdah, ruku, small waw/yeh, etc.
    (0x0640, 0x0640),  # tatweel (kashida)
    (0x200B, 0x200F),  # ZWSP, ZWNJ, ZWJ, LRM, RLM
    (0x2066, 0x2069),  # bidi isolates (LRI, RLI, FSI, PDI)
    (0xFEFF, 0xFEFF),  # BOM / ZW no-break space
    (0x00A0, 0x00A0),  # no-break space
    (0x0020, 0x0020),  # space
]
_STRIP_SET = {cp for lo, hi in _STRIP_RANGES for cp in range(lo, hi + 1)}


def norm(s: str) -> str:
    return "".join(ch for ch in (s or "") if ord(ch) not in _STRIP_SET).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--surah", type=int, required=True)
    ap.add_argument("--ayahs", default="", help="comma list; default = all ayat")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    src = json.loads((DATA / f"surah_{args.surah}.json").read_text(encoding="utf-8"))
    want = {int(x) for x in args.ayahs.split(",") if x.strip()} if args.ayahs.strip() else None

    forms: list[dict] = []
    key_to_id: dict[str, int] = {}
    ayah_text: dict[str, dict] = {}
    positions: dict[str, dict] = {}

    for a in src["ayahs"]:
        an = a["ayah"]
        if want is not None and an not in want:
            continue
        ayah_text[str(an)] = {"a": a.get("arabic", ""), "t": a.get("translation", "")}
        positions[str(an)] = {}
        for widx, w in a.get("word_by_word", {}).items():
            ar = w.get("arabic", "")
            key = norm(ar)
            if not key:
                continue
            if key not in key_to_id:
                fid = len(forms)
                key_to_id[key] = fid
                forms.append({
                    "id": fid,
                    "ar": ar,
                    "tr": w.get("transliteration", ""),
                    "gloss": w.get("translation", ""),
                    "ay": an,
                })
            positions[str(an)][str(widx)] = key_to_id[key]

    total_words = sum(len(p) for p in positions.values())
    out = {"surah": args.surah, "forms": forms, "ayahText": ayah_text, "positions": positions}
    out_path = Path(args.out) if args.out else (ROOT / "scripts" / "_forms" / f"surah_{args.surah}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    pct = (100 * (1 - len(forms) / total_words)) if total_words else 0
    print(f"surah {args.surah}: {len(positions)} ayat, {total_words} words, "
          f"{len(forms)} unique forms ({pct:.0f}% dedup) -> {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
