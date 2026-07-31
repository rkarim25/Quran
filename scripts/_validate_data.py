import json
import sys

files = [
    "docs/data/people_index.json",
    "docs/data/people_hadith.json",
    "docs/data/hadith_index.json",
    "docs/data/hadith_map.json",
]
ok = True
for f in files:
    try:
        data = json.load(open(f, encoding="utf-8"))
        print(f"OK  {f}  ({len(data)} entries)")
    except Exception as e:
        print(f"ERR {f}: {e}")
        ok = False

# Check narrator_id cross-references
hi = json.load(open("docs/data/hadith_index.json", encoding="utf-8"))
pi = json.load(open("docs/data/people_index.json", encoding="utf-8"))
for hid, h in hi.items():
    nid = h.get("narrator_id")
    if nid and nid not in pi:
        print(f"MISSING person key '{nid}' referenced in hadith {hid}")
        ok = False

print("All OK" if ok else "ERRORS found")
