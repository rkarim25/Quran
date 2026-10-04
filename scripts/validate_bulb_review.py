"""Validate the source-grounded concise background improvements."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, f"Duplicate JSON key: {key}"
        result[key] = value
    return result


bulbs = json.loads(
    (DATA / "asbab_nuzul.json").read_text(encoding="utf-8"),
    object_pairs_hook=unique_object,
)
evidence = {
    "2:199": ["Al-Hums", "stand at 'Arafat"],
    "2:220": ["get spoiled", "joined their food and drink"],
    "5:101": ["Is it required every year?", "it would have become obligated"],
    "2:143": ["had died", "prayers of those Muslims were valid"],
    "2:158": ["Manat", "no one should abandon"],
    "2:187": ["Qays bin Sirmah", "lost consciousness"],
    "4:19": ["his male relatives", "prevent her from marriage"],
    "62:11": ["caravan", "only twelve men remained"],
}
for key, entry in bulbs.items():
    if key.startswith("__"):
        continue
    surah, ayah = map(int, key.split(":"))
    surah_data = json.loads((DATA / f"surah_{surah}.json").read_text(encoding="utf-8"))
    assert any(v["ayah"] == ayah for v in surah_data["ayahs"]), key
    assert entry["occasion"].strip() and entry["source"].strip(), key
    assert entry["has_occasion"] is True, key

for key, phrases in evidence.items():
    surah, ayah = key.split(":")
    entry = bulbs[key]
    assert len(entry["occasion"].split()) <= 45, key
    assert len(entry["occasion"]) <= 360, f"Popup would truncate {key}"
    source = (ROOT / "Quran-obs" / f"Surah_{surah}" / f"Ayah_{ayah}.md").read_text(encoding="utf-8")
    classical = source.split("## Tafsir Ibn Kathir", 1)[1].split("\n## ", 1)[0]
    for phrase in phrases:
        assert phrase in classical, f"Missing source evidence for {key}: {phrase}"
    print(f"PASS {key}: concise, untruncated, source evidence present")

print("PASS: all bulb references and JSON keys valid")