# -*- coding: utf-8 -*-
"""Quality cleanup after the context extraction:
  1) Remove occasion entries contaminated with embedded Arabic (regex artifacts
     that grabbed ayah/section-header text instead of a real occasion).
  2) Drop hadith that have no named source/collection (unverifiable provenance,
     and they can't form a meaningful isnad tree), and unmap them.
Curated hadith (h001-h040) all have sources, so they are untouched."""
import json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
ab = json.loads((DATA / "asbab_nuzul.json").read_text(encoding="utf-8"))
hi = json.loads((DATA / "hadith_index.json").read_text(encoding="utf-8"))
hm = json.loads((DATA / "hadith_map.json").read_text(encoding="utf-8"))


def arcount(s):
    return sum(1 for c in (s or "") if "؀" <= c <= "ۿ")


# 1) purge Arabic-contaminated occasions
purged = [k for k, v in ab.items()
          if ":" in k and not k.startswith("__") and arcount(v.get("occasion", "")) > 10]
for k in purged:
    del ab[k]

# 2) drop hadith with no source; remove from the ayah->ids map
drop = {h for h, v in hi.items() if not (v.get("source") or "").strip()}
for h in drop:
    del hi[h]
for ay in list(hm.keys()):
    hm[ay] = [h for h in hm[ay] if h not in drop]
    if not hm[ay]:
        del hm[ay]

(DATA / "asbab_nuzul.json").write_text(json.dumps(ab, ensure_ascii=False, indent=2), encoding="utf-8")
(DATA / "hadith_index.json").write_text(json.dumps(hi, ensure_ascii=False, indent=2), encoding="utf-8")
(DATA / "hadith_map.json").write_text(json.dumps(hm, ensure_ascii=False, indent=2), encoding="utf-8")

occ = len([k for k in ab if ":" in k and not k.startswith("__")])
print(f"Purged {len(purged)} contaminated occasions; dropped {len(drop)} unsourced hadith.")
print(f"Remaining: {occ} occasions, {len(hi)} hadith, {len(hm)} mapped ayahs.")
