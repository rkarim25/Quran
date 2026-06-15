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

Two modes:

  Legacy (no --cache): writes scripts/_forms/surah_N.json with the full forms
  list + ayahText + positions (used by the original per-surah workflow).

  Global cache (--cache PATH): the token-optimal mode for doing the whole Qur'an.
  A form already in the global cache (analysed by an earlier surah) is REUSED for
  free; only genuinely NEW forms are emitted for the AI, split into ready-to-run
  chunk files under scripts/_forms/surah_N/. A separate assembly sidecar
  (positions + cached entries) is written for assemble_wbw.py and never passes
  through an LLM, so word->analysis mapping cannot be corrupted.

Usage:
    python scripts/extract_forms.py --surah N [--ayahs 1,2,3]
    python scripts/extract_forms.py --surah N --cache scripts/_forms/_wbw_cache.json [--chunk 12]

Legacy output JSON (compact):
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
FORMS = ROOT / "scripts" / "_forms"

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


def build(surah: int, want: set[int] | None):
    """Return (forms, ayah_text, positions, keys) for a surah.

    forms:     [{id,ar,tr,gloss,ay}] one per unique normalized form (stable ids)
    positions: {ayah: {widx: formId}} every word position (off the LLM path)
    keys:      {formId: normKey} the dedup key for each form
    """
    src = json.loads((DATA / f"surah_{surah}.json").read_text(encoding="utf-8"))
    forms: list[dict] = []
    key_to_id: dict[str, int] = {}
    keys: dict[int, str] = {}
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
                keys[fid] = key
                forms.append({"id": fid, "ar": ar, "tr": w.get("transliteration", ""),
                              "gloss": w.get("translation", ""), "ay": an})
            positions[str(an)][str(widx)] = key_to_id[key]
    return forms, ayah_text, positions, keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--surah", type=int, required=True)
    ap.add_argument("--ayahs", default="", help="comma list; default = all ayat")
    ap.add_argument("--out", default="")
    ap.add_argument("--cache", default="", help="global form cache JSON (normKey->entry); enables cache mode")
    ap.add_argument("--chunk", type=int, default=24, help="new forms per chunk file (cache mode)")
    args = ap.parse_args()

    n = args.surah
    want = {int(x) for x in args.ayahs.split(",") if x.strip()} if args.ayahs.strip() else None
    forms, ayah_text, positions, keys = build(n, want)
    total_words = sum(len(p) for p in positions.values())

    if not args.cache:
        # ---- legacy single-file output (unchanged) ----
        out = {"surah": n, "forms": forms, "ayahText": ayah_text, "positions": positions}
        out_path = Path(args.out) if args.out else (FORMS / f"surah_{n}.json")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        pct = (100 * (1 - len(forms) / total_words)) if total_words else 0
        print(f"surah {n}: {len(positions)} ayat, {total_words} words, "
              f"{len(forms)} unique forms ({pct:.0f}% dedup) -> {out_path}")
        return 0

    # ---- global cache mode ----
    cache_path = Path(args.cache)
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

    new_forms, cached_entries, new_keys = [], {}, {}
    for f in forms:
        k = keys[f["id"]]
        if k in cache:
            cached_entries[str(f["id"])] = cache[k]
        else:
            new_forms.append({"id": f["id"], "ar": f["ar"], "tr": f["tr"], "gloss": f["gloss"]})
            new_keys[str(f["id"])] = k

    # Clear stale chunk/result/sidecar files but keep the dir itself — rmdir can
    # fail on Windows/OneDrive when sync holds a handle on the folder.
    sdir = FORMS / f"surah_{n}"
    sdir.mkdir(parents=True, exist_ok=True)
    for old in sdir.glob("chunk_*.json"):
        old.unlink(missing_ok=True)
    for old in sdir.glob("result*.json"):
        old.unlink(missing_ok=True)
    for name in ("asm.json", "chunk.json", "chunk_partial.json"):
        (sdir / name).unlink(missing_ok=True)

    chunk_paths = []
    for i in range(0, len(new_forms), args.chunk):
        cp = sdir / f"chunk_{i // args.chunk:04d}.json"
        cp.write_text(json.dumps(new_forms[i:i + args.chunk], ensure_ascii=False), encoding="utf-8")
        chunk_paths.append(cp)
    n_chunks = len(chunk_paths)

    # assembly sidecar — Python only, never seen by an LLM
    asm = {"surah": n, "positions": positions, "cached": cached_entries, "new_keys": new_keys}
    (sdir / "asm.json").write_text(json.dumps(asm, ensure_ascii=False), encoding="utf-8")

    dir_fwd = sdir.as_posix()
    reuse_pct = (100 * len(cached_entries) / len(forms)) if forms else 0
    print(f"surah {n}: {len(positions)} ayat, {total_words} words, {len(forms)} unique forms")
    print(f"  reused from cache: {len(cached_entries)} ({reuse_pct:.0f}%)   NEW to analyse: {len(new_forms)}")
    print(f"  chunks: {n_chunks}   dir: {dir_fwd}")
    print(f"  workflow args -> {{\"surah\": {n}, \"dir\": \"{dir_fwd}\", \"n_chunks\": {n_chunks}}}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
