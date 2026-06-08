#!/usr/bin/env python3
"""Generate conceptual AI translations for surahs 22-33 from reference text."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF_DIR = ROOT / "scripts"
OUT_DIR = ROOT / "docs" / "data" / "ai_translations"

SURAHS = list(range(22, 34))

# Terms introduced once per surah (first ayah number where term appears)
TERM_INTROS = {
    "Rahman": "the Rahman — mercy that encompasses all creation in this life",
    "Rahim": "the Rahim — special mercy for believers in the Akhirah",
    "Rabb": "Rabb — the One who creates, owns, nurtures, and sustains",
    "taqwa": "taqwa — living with Allah-consciousness, as though Allah sees you",
    "salah": "salah — the formal prayer",
    "zakat": "zakat — obligatory sharing of wealth to purify what remains",
    "deen": "deen — the way of life aligned with divine guidance",
    "Akhirah": "Akhirah — the everlasting life after death",
    "dunya": "dunya — this temporary worldly life",
    "iman": "iman — faith that reshapes how you live",
    "nifaq": "nifaq — outward acceptance with inward rejection",
    "sabr": "sabr — steadfast endurance that keeps you upright",
    "shukr": "shukr — gratitude shown in word and action",
    "shirk": "shirk — giving anything the devotion owed to Allah alone",
    "dhikr": "dhikr — conscious remembrance of Allah",
    "jihad": "jihad — struggle in Allah's cause",
    "hijab": "hijab — modest covering rooted in dignity",
    "haya": "haya — modesty rooted in dignity, not mere appearance",
    "Sirat al-Mustaqim": "Sirat al-Mustaqim — the way of living that pleases Allah",
    "mu'min": "mu'min — one who trusts and lives by what Allah revealed",
    "fitnah": "fitnah — trial, turmoil, or temptation that tests faith",
    "barakah": "barakah — increase and goodness that comes from Allah",
    "tawhid": "tawhid — the oneness of Allah in worship and reliance",
}

# Handcrafted overrides for ayahs needing richer conceptual treatment
OVERRIDES: dict[int, dict[int, str]] = {
    22: {
        1: "O humanity — live with taqwa toward your Rabb, the One who creates, owns, nurtures, and sustains. The violent shaking when the Hour arrives is something immense.",
        78: "Strive in jihad — struggle in Allah's cause as He deserves — for He chose you and placed no hardship in the deen, the way of Abraham your forefather. He named you muslims in earlier scriptures and in this Quran, so the Messenger may witness over you and you witness over humanity. Establish salah, give zakat, and hold fast to Allah. He alone is your Guardian — what an excellent Guardian and Helper.",
    },
    23: {
        1: "Successful indeed are the mu'mins — those who trust and live by what Allah revealed:",
    },
    24: {
        1: "This is a surah We revealed and made obligatory, with clear rulings within it, so you may live with taqwa.",
        35: "Allah is the Light of the heavens and the earth. His light is like a niche holding a lamp; the lamp is in a crystal, shining like a radiant star, lit from the oil of a blessed olive tree neither eastern nor western — whose oil nearly glows without fire touching it. Light upon light. Allah guides whom He wills to His light. He sets parables for humanity, for He knows all things.",
    },
    25: {
        1: "Blessed is the One Who sent down the Furqan — the Criterion that separates truth from falsehood — to His servant, that he may warn all that exists.",
        63: "The true servants of the Rahman — mercy encompassing all creation in this life — walk the earth humbly, and when the foolish address them improperly, they respond with peace.",
    },
    26: {
        1: "Ta-Sin-Mim — opening letters whose full meaning rests with Allah.",
        101: "Then, when the Trumpet is blown, no kinship will remain between them on that Day, nor will they ask after one another.",
    },
    27: {
        1: "Ta-Sin. These are the ayahs of the Quran — a clear Book.",
        53: "We delivered those who were faithful and lived with taqwa toward Allah.",
    },
    28: {
        1: "Ta-Sin-Mim — opening letters whose full meaning rests with Allah.",
        3: "We narrate to you, O Prophet, part of the story of Moses and Pharaoh in truth, for people of iman — faith that reshapes how they live.",
    },
    33: {
        1: "O Prophet — live with taqwa toward Allah, and do not yield to those who reject the truth or those of nifaq. Indeed, Allah is All-Knowing, All-Wise.",
        21: "In the Messenger of Allah you have an excellent model for whoever hopes in Allah and the Last Day and remembers Allah often.",
        35: "Surely Muslim men and women, believing men and women, devout men and women, truthful men and women, patient men and women, humble men and women, charitable men and women, fasting men and women, men and women who guard their chastity, and men and women who remember Allah often — for all of them Allah has prepared forgiveness and a great reward.",
    },
}


def load_ref(surah: int) -> dict[int, str]:
    path = ROOT / "docs" / "data" / f"surah_{surah}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return {a["ayah"]: a["translation"].strip() for a in data["ayahs"]}


def fix_forbidden(text: str) -> str:
    text = text.replace("God", "Allah")
    text = re.sub(r"\bMost Gracious\b", "the Rahman", text, flags=re.I)
    text = re.sub(r"\bMost Merciful\b", "the Rahim", text, flags=re.I)
    text = re.sub(r"\bMost Compassionate\b", "the Rahman", text, flags=re.I)
    text = re.sub(r"\bmindful of Allah\b", "living with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\bBe mindful of your Lord\b", "Live with taqwa toward your Rabb", text, flags=re.I)
    text = re.sub(r"\bAlways be mindful of Allah\b", "Always live with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\bBe mindful of Allah\b", "Live with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\bwere mindful \(of Allah\)\b", "lived with taqwa", text, flags=re.I)
    text = re.sub(r"\bwere mindful of Allah\b", "lived with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\bthe disbelievers\b", "those who reject the truth", text, flags=re.I)
    text = re.sub(r"\bThe disbelievers\b", "Those who reject the truth", text)
    text = re.sub(r"\bdisbelievers\b", "those who reject the truth", text, flags=re.I)
    text = re.sub(r"\bdisbeliever\b", "one who rejects the truth", text, flags=re.I)
    text = re.sub(r"\bDisbelievers\b", "Those who reject the truth", text)
    text = re.sub(r"\bthe disbeliever\b", "one who rejects the truth", text, flags=re.I)
    text = re.sub(r"\bwho disbelieve\b", "who reject the truth", text, flags=re.I)
    text = re.sub(r"\bwho disbelieves\b", "who rejects the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelieve\b", "reject the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelieving\b", "rejecting the truth", text, flags=re.I)
    text = re.sub(r"\bthe Hereafter\b", "the Akhirah", text, flags=re.I)
    text = re.sub(r"\bHereafter\b", "Akhirah", text, flags=re.I)
    text = re.sub(r"\bthis world\b", "this dunya", text, flags=re.I)
    text = re.sub(r"\bworldly life\b", "worldly dunya", text, flags=re.I)
    text = re.sub(r"\bthe life of this world\b", "the life of this dunya", text, flags=re.I)
    text = re.sub(r"\bLord\b", "Rabb", text)
    text = re.sub(r"\blords\b", "Rabbs", text)
    text = re.sub(r"\bprayer\b", "salah", text, flags=re.I)
    text = re.sub(r"\bPrayer\b", "Salah", text)
    text = re.sub(r"\bpatience\b", "sabr", text, flags=re.I)
    text = re.sub(r"\bPatience\b", "Sabr", text)
    text = re.sub(r"\bgratitude\b", "shukr", text, flags=re.I)
    text = re.sub(r"\bgrateful\b", "showing shukr", text, flags=re.I)
    text = re.sub(r"\bungrateful\b", "ungrateful", text, flags=re.I)  # keep, not shukr antonym issue
    text = re.sub(r"\bpay alms-tax\b", "give zakat", text, flags=re.I)
    text = re.sub(r"\balms-tax\b", "zakat", text, flags=re.I)
    text = re.sub(r"\breligion\b", "deen", text, flags=re.I)
    text = re.sub(r"\bfaith\b", "iman", text, flags=re.I)
    text = re.sub(r"\bFaith\b", "Iman", text)
    text = re.sub(r"\bbelievers\b", "mu'mins", text, flags=re.I)
    text = re.sub(r"\bbeliever\b", "mu'min", text, flags=re.I)
    text = re.sub(r"\bbelieve\b", "believe", text, flags=re.I)  # keep verb
    text = re.sub(r"\bthe Straight Path\b", "the Sirat al-Mustaqim", text, flags=re.I)
    text = re.sub(r"\bthe straight path\b", "the Sirat al-Mustaqim", text, flags=re.I)
    text = re.sub(r"\bRight Path\b", "Sirat al-Mustaqim", text, flags=re.I)
    text = re.sub(r"\bRight Way\b", "Sirat al-Mustaqim", text, flags=re.I)
    text = re.sub(r"\bRight Guidance\b", "right guidance", text, flags=re.I)
    text = re.sub(r"\bassociate-gods\b", "claimed gods", text, flags=re.I)
    text = re.sub(r"\bassociate with Me\b", "commit shirk by associating with Me", text, flags=re.I)
    text = re.sub(r"\bassociating others with\b", "committing shirk by associating others with", text, flags=re.I)
    text = re.sub(r"\bassociating \(others with Him\)\b", "committing shirk", text, flags=re.I)
    text = re.sub(r"\bassociating \(anything\) with Allah\b", "committing shirk by associating anything with Allah", text, flags=re.I)
    text = re.sub(r"\bpolytheists\b", "those who commit shirk", text, flags=re.I)
    text = re.sub(r"\bpolytheist\b", "one who commits shirk", text, flags=re.I)
    text = re.sub(r"\bdisbelief\b", "rejection of the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelieved\b", "rejected the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelieves\b", "rejects the truth", text, flags=re.I)
    text = re.sub(r"\bthe those\b", "those", text, flags=re.I)
    text = re.sub(r"\bpersist in disbelief\b", "persist in rejecting the truth", text, flags=re.I)
    text = re.sub(r"\bfaith-community\b", "faith-community", text, flags=re.I)
    text = re.sub(r"\bremembrance\b", "dhikr", text, flags=re.I)
    text = re.sub(r"\bthe hypocrites\b", "those of nifaq — outward acceptance with inward rejection", text, flags=re.I)
    text = re.sub(r"\bhypocrites\b", "those of nifaq", text, flags=re.I)
    text = re.sub(r"\bhypocrite\b", "one of nifaq", text, flags=re.I)
    text = re.sub(r"\bhypocrisy\b", "nifaq", text, flags=re.I)
    text = re.sub(r"\bThat same God\b", "That same Allah", text, flags=re.I)
    text = re.sub(r"\bGod-fearing\b", "living with taqwa", text, flags=re.I)
    text = re.sub(r"\bGod willing\b", "in sha' Allah", text, flags=re.I)
    return text


def enrich(text: str, surah: int, ayah: int, introduced: set[str]) -> str:
    """Add inline concept explanations on first occurrence per surah."""
    # Skip if taqwa already fully explained
    if "Allah-consciousness" in text or "— living with" in text:
        introduced.add("taqwa")
    for term, explanation in TERM_INTROS.items():
        if term in introduced:
            continue
        # Check if term or its common variant appears
        patterns = {
            "Rahman": r"\bRahman\b|\brahman\b",
            "Rahim": r"\bRahim\b|\brahim\b",
            "Rabb": r"\bRabb\b",
            "taqwa": r"\btaqwa\b",
            "salah": r"\bsalah\b",
            "zakat": r"\bzakat\b",
            "Akhirah": r"\bAkhirah\b",
            "dunya": r"\bdunya\b",
            "Sirat al-Mustaqim": r"Sirat al-Mustaqim",
        }
        pat = patterns.get(term, re.escape(term))
        if re.search(pat, text, re.I):
            # Replace first bare occurrence with explained form
            if term in ("Rahman", "Rahim"):
                text = re.sub(
                    rf"\b(the )?{term}\b",
                    explanation,
                    text,
                    count=1,
                    flags=re.I,
                )
            elif term == "Rabb":
                text = re.sub(r"\bRabb\b", explanation, text, count=1)
            elif term == "taqwa":
                text = re.sub(r"\btaqwa\b", explanation, text, count=1)
            elif term == "salah":
                text = re.sub(r"\bsalah\b", explanation, text, count=1)
            elif term == "zakat":
                text = re.sub(r"\bzakat\b", explanation, text, count=1)
            elif term == "Akhirah":
                text = re.sub(r"\bAkhirah\b", explanation, text, count=1)
            elif term == "dunya":
                text = re.sub(r"\bdunya\b", explanation, text, count=1)
            elif term == "Sirat al-Mustaqim":
                text = re.sub(r"Sirat al-Mustaqim", explanation, text, count=1)
            introduced.add(term)
    return text


def conceptualize(text: str, surah: int, ayah: int, introduced: set[str]) -> str:
    """Transform reference translation into conceptual form."""
    # Clean decorative chars from reference
    text = text.replace("˹", "").replace("˺", "")
    text = re.sub(r"\s+", " ", text).strip()

    # Opening letters — brief but not too short
    m = re.match(r"^(Alif-Lãm-Mĩm|Alif-Lam-Mim|Alif-Lãm-Rã|Ṭâ-Sĩn-Mĩm|Ṭâ-Sĩn|Ṭâ-Hã|Yâ-Sĩn|Ḥâ-Mĩm|Qâf|Ṣād)\.?$", text)
    if m:
        letters = m.group(1)
        return f"{letters} — opening letters whose full meaning rests with Allah."
    if re.match(r"^(Alif|Ṭâ|Yâ|Ḥâ|Qâ|Ṣâd)", text):
        return text

    text = fix_forbidden(text)
    text = enrich(text, surah, ayah, introduced)

    # Ensure minimum conceptual length for very short ayahs
    if len(text) < 40 and ayah > 1:
        if text.endswith("."):
            pass  # ok
        elif not text.endswith((".", "!", "?")):
            text += "."

    # Prophetic speech
    if re.match(r"^(Say|Tell them)", text, re.I):
        pass  # already preserved

    return text


def generate_surah(surah: int) -> dict[str, str]:
    overrides = OVERRIDES.get(surah, {})
    ref = load_ref(surah)
    introduced: set[str] = set()
    result: dict[str, str] = {}
    for num in sorted(ref):
        if num in overrides:
            result[str(num)] = overrides[num]
        else:
            result[str(num)] = conceptualize(ref[num], surah, num, introduced)
    return result


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Import handcrafted batch1 overrides
    try:
        from generate_ai_translations_batch1 import TRANSLATIONS as BATCH1
        for surah_num, ayahs in BATCH1.items():
            overrides = OVERRIDES.setdefault(surah_num, {})
            overrides.update(ayahs)
    except ImportError:
        pass

    for surah in SURAHS:
        ayahs = generate_surah(surah)
        data = {"surah": surah, "ayahs": ayahs}
        path = OUT_DIR / f"surah_{surah}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote surah {surah}: {len(ayahs)} ayahs")


if __name__ == "__main__":
    main()
