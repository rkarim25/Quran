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
    "2:197": ["without taking enough supplies", "reliance on Allah"],
    "2:272": ["Disliked giving charity to their polytheist relatives", "allowed to give it"],
    "3:188": ["giving him an incorrect answer", "hid the correct news"],
    "3:195": ["family of Umm Salamah", "Migration"],
    "2:199": ["Al-Hums", "stand at 'Arafat"],
    "2:220": ["get spoiled", "joined their food and drink"],
    "5:101": ["Is it required every year?", "it would have become obligated"],
    "2:143": ["had died", "prayers of those Muslims were valid"],
    "2:158": ["Manat", "no one should abandon"],
    "2:187": ["Qays bin Sirmah", "lost consciousness"],
    "4:19": ["his male relatives", "prevent her from marriage"],
    "62:11": ["caravan", "only twelve men remained"],
    "5:43": ["two Jews who committed adultery", "stoning"],
    "24:61": ["too embarrassed to eat with the blind", "best morsels"],
    "33:53": ["why do you not screen them", "Ayah of Hijab"],
    "66:1": ["drink honey", "Maghafir"],
    "2:204": ["Al-Akhnas bin Shariq", "most quarrelsome"],
    "2:284": ["we cannot bear it", "We hear and we obey"],
    "2:115": ["The Jews were disturbed", "east and the west"],
    "2:144": ["face Bayt Al-Maqdis", "turn your faces"],
    "63:8": ["Zayd bin Arqam", "Feed your dog"],
    "9:80": ["gave him his shirt as a shroud", "exaggerate"],
    "5:33": ["'Ukl", "killed the shepherd"],
    "2:256": ["raise him as a Jew", "Banu An-Nadir"],
    "2:219": ["Give us a clear ruling regarding Al-Khamr", "4:43"],
    "20:114": ["move his tongue", "eagerness to memorize"],
    "47:20": ["hoping that Jihad would be legislated", "many of the people turned back"],
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