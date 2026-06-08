#!/usr/bin/env python3
"""Post-process AI translations: fix forbidden flattening and expand letter ayahs."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AI_DIR = ROOT / "docs" / "data" / "ai_translations"
DATA_DIR = ROOT / "docs" / "data"

LETTER_AYAH = re.compile(
    r"^(?:Alif|Ain|Ha|Ta|Ya|Saad|Qaf|Kaaf|Laam|Meem|Noon|Haa|Sheen|Tha)[-\s\u2013\u2014]?"
    r"(?:Laam|Meem|Saad|Ra|Ha|Ya|Sin|Ain)?[-\s\u2013\u2014]?"
    r"(?:Meem|Sin|Ra|Ha|Ya|Ain)?\.?$",
    re.I,
)

LETTER_EXPANSION = (
    "These opening letters—known as the muqatta'at—are among the signs whose full meaning "
    "Allah kept with Himself. They open the surah by reminding the reader that this Book "
    "is from beyond human authorship: approach it with humility, not arrogance."
)


def fix_text(text: str) -> str:
    text = text.replace("God-consciousness", "Allah-consciousness")
    text = re.sub(r"\bMost Merciful\b", "the Rahim—whose special mercy is for believers in the Akhirah", text)
    text = re.sub(r"\bMost Gracious\b", "the Rahman—whose mercy covers all creation", text)
    text = re.sub(r"\bMost Compassionate\b", "the Rahman—whose mercy covers all creation", text)
    text = re.sub(r"\bdisbelievers\b", "those who reject the truth", text)
    text = re.sub(r"\bdisbeliever\b", "one who rejects the truth", text)
    text = re.sub(r"\bO disbelievers\b", "O you who reject the truth", text, flags=re.I)
    text = re.sub(
        r"\bmindful of Allah\b",
        "living with taqwa—Allah-consciousness",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\bBe mindful of Allah\b",
        "Live with taqwa—Allah-consciousness before Allah",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\bfor those mindful of Allah\b",
        "for those who live with taqwa—Allah-consciousness",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\bWhoever is mindful of Allah\b",
        "Whoever lives with taqwa—Allah-consciousness before Allah",
        text,
        flags=re.I,
    )
    return re.sub(r"  +", " ", text).strip()


def expand_letter_ayah(text: str, standard: str) -> str:
    t = text.strip()
    if len(t) >= 40:
        return text
    if LETTER_AYAH.match(t) or len(t) <= 20:
        return LETTER_EXPANSION
    return text


def main() -> int:
    fixed = 0
    for path in sorted(AI_DIR.glob("surah_*.json")):
        surah = int(path.stem.split("_")[1])
        data = json.loads(path.read_text(encoding="utf-8"))
        src_path = DATA_DIR / f"surah_{surah}.json"
        standards = {}
        if src_path.exists():
            src = json.loads(src_path.read_text(encoding="utf-8"))
            standards = {a["ayah"]: a.get("translation", "") for a in src["ayahs"]}

        changed = False
        for key, val in list(data.get("ayahs", {}).items()):
            new = fix_text(val)
            std = standards.get(int(key), "")
            new = expand_letter_ayah(new, std)
            if new != val:
                data["ayahs"][key] = new
                changed = True
                fixed += 1
        if changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Fixed {fixed} ayah entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
