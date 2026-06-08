#!/usr/bin/env python3
"""Generate conceptual AI translations for surahs 10-12, 15-18, 20-21."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "data" / "ai_translations"

# Skip manually crafted surahs
SKIP = {13, 14, 19}
SURAHS = [n for n in range(10, 22) if n not in SKIP]

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
    "sabr": "sabr — steadfast endurance that keeps you upright",
    "shukr": "shukr — gratitude shown in word and action",
    "shirk": "shirk — giving anything the devotion owed to Allah alone",
    "dhikr": "dhikr — conscious remembrance of Allah",
    "Sirat al-Mustaqim": "Sirat al-Mustaqim — the way of living that pleases Allah",
    "mu'min": "mu'min — one who trusts and lives by what Allah revealed",
    "fitnah": "fitnah — trial, turmoil, or temptation that tests faith",
}

OVERRIDES: dict[int, dict[int, str]] = {
    10: {
        1: "Alif-Lam-Ra. These are the ayahs of the Book rich in wisdom.",
        3: "Surely your Rabb is Allah who created the heavens and earth in six days, then settled upon the Throne, conducting every affair. None can intercede except by His permission. That is Allah—your Rabb, so worship Him alone. Will you not then live with taqwa?",
        6: "Surely in the alternation of night and day, and in what Allah created in the heavens and earth, are signs for people who live with taqwa — Allah-consciousness, as though Allah sees you.",
        9: "Surely those who believe and do good, their Rabb will guide them to Paradise through their faith. Rivers will flow beneath their feet in the Gardens of Bliss.",
        10: "There their call will be: Glory be to You, O Allah! Their greeting will be: Peace! And their closing words will be: All praise belongs to Allah—Rabb of all that exists.",
        25: "Allah invites to the Home of Peace and guides whomever He wills to the Straight Path — the way of living that pleases Allah.",
        57: "O humanity, guidance has come from your Rabb — the One who creates, owns, nurtures, and sustains. A cure for what is in the hearts, guidance and mercy for those who have iman.",
        109: "Follow what is revealed to you, and be patient until Allah judges. He is the Best of judges.",
    },
    11: {
        1: "Alif-Lam-Ra. This is a Book whose ayahs are perfected, then explained in detail from One who is All-Wise, All-Aware.",
        7: "He it is who created the heavens and earth in six days, then settled upon the Throne. He knows what enters the earth and what emerges from it, what descends from the sky and what ascends to it. He is with you wherever you are — and Allah sees what you do.",
        56: "There is no moving creature on earth whose provision is not upon Allah. He knows its dwelling and its resting place. All is in a clear Record.",
        112: "So be steadfast as you were commanded — you and those who turned with you — and do not transgress. He sees what you do.",
    },
    12: {
        1: "Alif-Lam-Ra. These are the ayahs of the clear Book.",
        3: "We narrate to you, O Prophet, the best of stories through what We reveal to you in this Quran — though before it you were among those unaware.",
        53: "I do not claim my nafs — my inner self — is innocent. The nafs indeed commands evil, except those my Rabb has mercy upon. My Rabb is All-Forgiving, the Rahim.",
        87: "Indeed, the reward of the Akhirah — the everlasting life after death — is better for those who believe and live with taqwa.",
        111: "Until they know that you are a messenger from Allah, they will not cease doubting — though their knowledge of the Scripture should suffice as witness between you and them.",
    },
    15: {
        1: "Alif-Lam-Ra. These are the ayahs of the Book — the clear Quran.",
        2: "The day will come when those who rejected the truth will wish they had submitted to Allah.",
        9: "We certainly revealed the Reminder, and We will certainly preserve it.",
        26: "We created humanity from sounding clay, from moulded mud.",
        87: "We have certainly given you the seven oft-repeated verses and the great Quran.",
        98: "So glorify the praise of your Rabb and be among those who prostrate.",
        99: "And worship your Rabb until certainty comes to you.",
    },
    16: {
        1: "Allah's command is coming — do not seek to hurry it. Glory be to Him, high above what they associate with Him.",
        2: "He sends down the angels with revelation by His command to whomever He wills of His servants, saying: Warn humanity that none is worthy of worship except Me, so live with taqwa toward Me alone.",
        16: "He placed firm mountains on the earth so it does not shake with you, rivers and paths so you may find your way,",
        18: "If you tried to count Allah's blessings, you could never enumerate them. Humanity is truly unjust and ungrateful.",
        68: "Your Rabb inspired the bee: take homes in the mountains, trees, and what people build.",
        90: "Allah commands justice, excellence, and giving to relatives, and forbids immorality, wrongdoing, and oppression. He admonishes you so you may take heed.",
        125: "Call to the way of your Rabb with wisdom and fair preaching, and argue in the best manner. Your Rabb knows best who strays from His path and who is guided.",
        128: "Allah is with those who live with taqwa and those who do good.",
    },
    17: {
        1: "Glory be to the One who took His servant by night from the Sacred Mosque to the Farthest Mosque, whose surroundings We blessed, to show him Our signs. He alone is All-Hearing, All-Seeing.",
        7: "If you do good, you do good for yourselves. If you do evil, you do it against yourselves. When the second warning arrives, they will be humiliated and enter the mosque as they entered it the first time, destroying utterly whatever they conquer.",
        23: "Your Rabb has decreed that you worship none but Him, and show excellence to parents. If one or both reach old age with you, never say even 'uff' to them, nor rebuke them — speak to them with honour.",
        32: "Do not even approach unlawful intimacy. It is indecent and an evil path.",
        80: "Say: O my Rabb, grant me an entrance of truth and an exit of truth, and give me from Your presence a supporting authority.",
        111: "Say: Praise belongs to Allah, who has taken no son, has no partner in dominion, and needs no protector from humiliation. So glorify Him greatly.",
    },
    18: {
        1: "All praise belongs to Allah, who sent down upon His servant the Book and placed no crookedness in it.",
        10: "When the young men took refuge in the cave and said: Our Rabb, grant us mercy from Yourself and guide us rightly through our ordeal.",
        29: "Say: The truth is from your Rabb — so whoever wills, let them believe; and whoever wills, let them reject the truth. We have prepared for wrongdoers a Fire whose walls will surround them.",
        46: "Wealth and children are the adornment of this dunya — this temporary worldly life. But lasting good deeds are better with your Rabb in reward and in hope.",
        83: "They ask you about Dhu'l-Qarnayn. Say: I will relate to you something worth remembering.",
        110: "Say: I am only a human like you, to whom it has been revealed that your Allah is One Allah. Whoever hopes to meet his Rabb, let them do good deeds and associate none in worship with his Rabb.",
    },
    20: {
        1: "Ta-Ha.",
        2: "We have not sent down the Quran to you to cause you distress,",
        14: "Surely I am Allah. There is none worthy of worship except Me. So worship Me and establish salah for My remembrance.",
        25: "Moses said: My Rabb, expand my chest for me, ease my task for me,",
        26: "and untie the knot from my tongue so they may understand my speech.",
        46: "Do not let those who reject the truth grieve you. We know what they conceal and what they declare.",
        130: "So bear with sabr — steadfast endurance that keeps you upright — over what they say, and glorify the praise of your Rabb before sunrise and before sunset, and during parts of the night, and at the ends of the day, so you may be content.",
        135: "Say: Each waits — so wait. You will soon know who is on the Straight Path and who is guided.",
    },
    21: {
        1: "The people's reckoning draws near, yet they turn away heedlessly.",
        30: "Do those who reject the truth not see that the heavens and earth were once one mass, then We split them apart? We made every living thing from water. Will they not then believe?",
        35: "Every soul will taste death. We test you with evil and good as fitnah — trial that tests faith — and to Us you will be returned.",
        47: "We will set up scales of justice on the Day of Resurrection, so no soul will be wronged in the least. Even if it is the weight of a mustard seed, We will bring it forth. We are sufficient as reckoners.",
        87: "And to Dhu'l-Nun, when he went off in anger and thought We would not restrict him — he cried out in the darkness: There is none worthy of worship except You. Glory be to You. I was among the wrongdoers.",
        107: "We sent you only as mercy to all that exists — every realm of creation.",
        112: "Say: My Rabb, judge with truth. Our Rabb is the Rahman — mercy encompassing all creation in this life — whose help is sought against what you describe.",
    },
}


def load_ref(surah: int) -> dict[int, str]:
    path = ROOT / "docs" / "data" / f"surah_{surah}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return {a["ayah"]: a["translation"].strip() for a in data["ayahs"]}


def fix_forbidden(text: str) -> str:
    text = text.replace("God", "Allah")
    text = re.sub(r"\bGod-consciousness\b", "Allah-consciousness", text, flags=re.I)
    text = re.sub(r"\bMost Gracious\b", "the Rahman", text, flags=re.I)
    text = re.sub(r"\bMost Merciful\b", "the Rahim", text, flags=re.I)
    text = re.sub(r"\bMost Compassionate\b", "the Rahman", text, flags=re.I)
    text = re.sub(r"\bmindful of Allah\b", "living with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\bBe mindful of Allah\b", "Live with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\bAlways be mindful of Allah\b", "Always live with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\bBe mindful of your Lord\b", "Live with taqwa toward your Rabb", text, flags=re.I)
    text = re.sub(r"\bthe disbelievers\b", "those who reject the truth", text, flags=re.I)
    text = re.sub(r"\bThe disbelievers\b", "Those who reject the truth", text)
    text = re.sub(r"\bdisbelievers\b", "those who reject the truth", text, flags=re.I)
    text = re.sub(r"\bdisbeliever\b", "one who rejects the truth", text, flags=re.I)
    text = re.sub(r"\bDisbelievers\b", "Those who reject the truth", text)
    text = re.sub(r"\bwho disbelieve\b", "who reject the truth", text, flags=re.I)
    text = re.sub(r"\bwho disbelieves\b", "who rejects the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelieve\b", "reject the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelieving\b", "rejecting the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelief\b", "rejection of the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelieved\b", "rejected the truth", text, flags=re.I)
    text = re.sub(r"\bthe Hereafter\b", "the Akhirah", text, flags=re.I)
    text = re.sub(r"\bHereafter\b", "Akhirah", text, flags=re.I)
    text = re.sub(r"\bthis world\b", "this dunya", text, flags=re.I)
    text = re.sub(r"\bworldly life\b", "worldly dunya", text, flags=re.I)
    text = re.sub(r"\bthe life of this world\b", "the life of this dunya", text, flags=re.I)
    text = re.sub(r"\bLord\b", "Rabb", text)
    text = re.sub(r"\blords\b", "Rabbs", text)
    text = re.sub(r"\bestablish prayer\b", "establish salah", text, flags=re.I)
    text = re.sub(r"\bperform prayer\b", "perform salah", text, flags=re.I)
    text = re.sub(r"\bprayer\b", "salah", text, flags=re.I)
    text = re.sub(r"\bPrayer\b", "Salah", text)
    text = re.sub(r"\bpatience\b", "sabr", text, flags=re.I)
    text = re.sub(r"\bPatience\b", "Sabr", text)
    text = re.sub(r"\bgratitude\b", "shukr", text, flags=re.I)
    text = re.sub(r"\bgrateful\b", "showing shukr", text, flags=re.I)
    text = re.sub(r"\bpay alms-tax\b", "give zakat", text, flags=re.I)
    text = re.sub(r"\balms-tax\b", "zakat", text, flags=re.I)
    text = re.sub(r"\breligion\b", "deen", text, flags=re.I)
    text = re.sub(r"\bthe Straight Path\b", "the Sirat al-Mustaqim", text, flags=re.I)
    text = re.sub(r"\bthe straight path\b", "the Sirat al-Mustaqim", text, flags=re.I)
    text = re.sub(r"\bRight Path\b", "Sirat al-Mustaqim", text, flags=re.I)
    text = re.sub(r"\bremembrance\b", "dhikr", text, flags=re.I)
    text = re.sub(r"\bthe hypocrites\b", "those of nifaq — outward acceptance with inward rejection", text, flags=re.I)
    text = re.sub(r"\bhypocrites\b", "those of nifaq", text, flags=re.I)
    text = re.sub(r"\bGod-fearing\b", "living with taqwa", text, flags=re.I)
    text = re.sub(r"\bGod willing\b", "in sha' Allah", text, flags=re.I)
    text = re.sub(r"\bthe those\b", "those", text, flags=re.I)
    return text


def enrich(text: str, introduced: set[str]) -> str:
    if "Allah-consciousness" in text or "— living with" in text:
        introduced.add("taqwa")
    for term, explanation in TERM_INTROS.items():
        if term in introduced:
            continue
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
            "iman": r"\biman\b",
            "sabr": r"\bsabr\b",
            "shukr": r"\bshukr\b",
            "shirk": r"\bshirk\b",
            "dhikr": r"\bdhikr\b",
            "mu'min": r"\bmu'min\b",
            "fitnah": r"\bfitnah\b",
            "deen": r"\bdeen\b",
        }
        pat = patterns.get(term, re.escape(term))
        if re.search(pat, text, re.I):
            if term in ("Rahman", "Rahim"):
                text = re.sub(rf"\b(the )?{term}\b", explanation, text, count=1, flags=re.I)
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
            elif term == "iman":
                text = re.sub(r"\biman\b", explanation, text, count=1)
            elif term == "sabr":
                text = re.sub(r"\bsabr\b", explanation, text, count=1)
            elif term == "shukr":
                text = re.sub(r"\bshukr\b", explanation, text, count=1)
            elif term == "shirk":
                text = re.sub(r"\bshirk\b", explanation, text, count=1)
            elif term == "dhikr":
                text = re.sub(r"\bdhikr\b", explanation, text, count=1)
            elif term == "mu'min":
                text = re.sub(r"\bmu'min\b", explanation, text, count=1)
            elif term == "fitnah":
                text = re.sub(r"\bfitnah\b", explanation, text, count=1)
            elif term == "deen":
                text = re.sub(r"\bdeen\b", explanation, text, count=1)
            introduced.add(term)
    return text


def post_process(text: str) -> str:
    text = re.sub(r"\bmindful\b", "living with taqwa", text, flags=re.I)
    text = re.sub(r"\bbe mindful\b", "live with taqwa", text, flags=re.I)
    text = re.sub(r"\bGod\b", "Allah", text)
    text = re.sub(r",\.", ".", text)
    text = re.sub(r"\.,", ".", text)
    text = re.sub(r"\s+\.", ".", text)
    text = re.sub(r"\s+,", ",", text)
    text = re.sub(r"\.([\u201d\"'])\.$", r".\1", text)
    text = re.sub(r"\bthe those\b", "those", text, flags=re.I)
    text = re.sub(r"\bdisbeliever", "one who rejects the truth", text, flags=re.I)
    text = re.sub(r"\bno god worthy\b", "none worthy of worship", text, flags=re.I)
    text = re.sub(r"\bno god other\b", "none other worthy of worship", text, flags=re.I)
    text = re.sub(r"\bany god besides\b", "anything besides Allah worthy of worship", text, flags=re.I)
    text = re.sub(r"\bany other god\b", "anything else besides Allah", text, flags=re.I)
    text = re.sub(r"\bset up any other god\b", "commit shirk by setting up anything else", text, flags=re.I)
    text = re.sub(r"\btheir salah — the formal prayer will be\b", "their call will be", text)
    text = re.sub(r"\bclosing salah will be\b", "closing words will be", text)
    text = re.sub(r"\bworldly dunya — this temporary worldly life\b", "this dunya — this temporary worldly life", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def conceptualize(text: str, surah: int, ayah: int, introduced: set[str]) -> str:
    text = text.replace("˹", "").replace("˺", "")
    text = re.sub(r"\s+", " ", text).strip()

    m = re.match(
        r"^(Alif-Lãm-Mĩm|Alif-Lam-Mim|Alif-Lãm-Rã|Alif-Lãm-Ra|Kãf-Ha-Ya-.*?|Ṭâ-Sĩn-Mĩm|Ṭâ-Sĩn|Ṭâ-Hã|Ta-Ha|Yâ-Sĩn|Ḥâ-Mĩm|Qâf|Ṣād)\.?$",
        text,
    )
    if m:
        letters = m.group(1)
        if letters in ("Ta-Ha", "Ṭâ-Ha"):
            return f"{letters}."
        return f"{letters} — opening letters whose full meaning rests with Allah."

    text = fix_forbidden(text)
    text = enrich(text, introduced)
    text = post_process(text)

    if not text.endswith((".", "!", "?", "—", "\"", "\u201d", "\u2019", "'")):
        text += "."

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
    for surah in SURAHS:
        ayahs = generate_surah(surah)
        path = OUT_DIR / f"surah_{surah}.json"
        path.write_text(json.dumps({"surah": surah, "ayahs": ayahs}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote surah {surah}: {len(ayahs)} ayahs")


if __name__ == "__main__":
    main()
