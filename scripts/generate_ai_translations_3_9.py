#!/usr/bin/env python3
"""Generate and post-process conceptual AI translations for surahs 3-9."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
OUT = ROOT / "docs" / "data" / "ai_translations"
REFS = ROOT / "scripts" / "_ayah_refs"

HAND_CRAFTED: dict[tuple[int, int], str] = {
    (3, 1): "Alif-Lam-Mim.",
    (3, 2): "Allah—there is none worthy of worship except Him, the Ever-Living, the All-Sustaining.",
    (3, 15): (
        "Say: Shall I tell you what is better than worldly gains? For those who live with taqwa—awareness that Allah sees them—"
        "there are Gardens with their Rabb under which rivers flow, where they will remain forever, with purified spouses "
        "and Allah's pleasure. And Allah is All-Seeing of His servants."
    ),
    (5, 1): (
        "O you who have iman: honour your contracts. Lawful for you are grazing livestock, except what is announced to you; "
        "and hunting is forbidden while you are in ihram for pilgrimage. Surely Allah commands what He wills."
    ),
    (5, 3): (
        "Forbidden to you are carrion, blood, swine, what is slaughtered invoking any name other than Allah, "
        "what dies by strangling, beating, a fall, or goring, what a predator has begun to eat unless you slaughter it properly, "
        "and what is sacrificed on altars. You are also forbidden to divide by casting lots. That is grave wrongdoing. "
        "Today those who reject the truth have lost hope in your deen—the way of life aligned with divine guidance. "
        "So do not fear them; live with taqwa toward Me. Today I have perfected your deen for you, completed My favour upon you, "
        "and chosen Islam as your way. Whoever is driven by extreme hunger—not intending sin—Allah is All-Forgiving, the Rahim."
    ),
    (9, 1): (
        "A declaration of release from obligations—from Allah and His Messenger to those who associate partners with Allah, "
        "with whom you made treaties."
    ),
    (7, 2): (
        "This is a Book sent down to you—do not let anxiety into your heart regarding it—"
        "so with it you may warn, and as a reminder to those who have iman."
    ),
    (9, 5): (
        "When the sacred months have passed, fight those who broke their treaties wherever you find them, capture them, "
        "besiege them, and lie in wait at every point. But if they repent, establish salah—the formal ritual prayer—and pay "
        "zakat—obligatory sharing of wealth—then release them. Surely Allah is All-Forgiving, the Rahim."
    ),
}


def clean_brackets(text: str) -> str:
    text = re.sub(r"˹[^˺]*˺", "", text)
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r" +\.", ".", text)
    text = re.sub(r" ,", ",", text)
    return text.strip()


def replace_terms(text: str, state: dict[str, bool]) -> str:
    def first(key: str, short: str, long: str) -> str:
        if state.get(key):
            return short
        state[key] = True
        return long

    text = re.sub(r"\bGod\b", "Allah", text)
    text = re.sub(r"\bGod-consciousness\b", "awareness that Allah sees you", text, flags=re.I)
    text = re.sub(r"\bMost Gracious\b", first("Rahman", "the Rahman", "the Rahman—whose mercy in this life extends over every creature"), text, flags=re.I)
    text = re.sub(r"\bMost Merciful\b", first("Rahim", "the Rahim", "the Rahim—whose special mercy is reserved for believers in the Akhirah"), text, flags=re.I)
    text = re.sub(r"\bMost Compassionate\b", first("Rahman", "the Rahman", "the Rahman—whose mercy in this life extends over every creature"), text, flags=re.I)
    text = re.sub(r"\bthe disbelievers?\b", "those who reject the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelievers?\b", "those who reject the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelieve\b", "reject the truth", text, flags=re.I)
    text = re.sub(r"\bdisbelief\b", "rejection of the truth", text, flags=re.I)
    text = re.sub(r"\bmindful of Allah\b", first("taqwa", "living with taqwa toward Allah", "living with taqwa—awareness that Allah sees you—toward Allah"), text, flags=re.I)
    text = re.sub(r"\bBe mindful of Allah\b", "Live with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\bAnd be mindful of Allah\b", "And live with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\bestablish prayer\b", first("salah", "establish salah", "establish salah—the formal ritual prayer"), text, flags=re.I)
    text = re.sub(r"\bperform prayer\b", first("salah", "perform salah", "perform salah—the formal ritual prayer"), text, flags=re.I)
    text = re.sub(r"\bperform prayers\b", first("salah", "perform salah", "perform salah—the formal ritual prayer"), text, flags=re.I)
    text = re.sub(r"\bpay alms-tax\b", first("zakat", "pay zakat", "pay zakat—obligatory sharing of wealth to purify what remains"), text, flags=re.I)
    text = re.sub(r"\bO believers!\b", "O you who have iman!", text, flags=re.I)
    text = re.sub(r"\bthe believers\b", "those who have iman", text, flags=re.I)
    text = re.sub(r"\bbelievers\b", "those who have iman", text, flags=re.I)
    text = re.sub(r"\bthe Hereafter\b", first("Akhirah", "the Akhirah", "the Akhirah—the everlasting life after death"), text, flags=re.I)
    text = re.sub(r"\bthis world\b", first("dunya", "this dunya", "this dunya—this temporary worldly life"), text, flags=re.I)
    text = re.sub(r"\bworldly life\b", first("dunya", "worldly life", "life in the dunya—this temporary worldly existence"), text, flags=re.I)
    text = re.sub(r"\bLord\b", "Rabb", text)
    text = re.sub(r"\bpatience\b", first("sabr", "sabr", "sabr—steadfast endurance that keeps you upright"), text, flags=re.I)
    text = re.sub(r"\bpersevere\b", "practice sabr", text, flags=re.I)
    text = re.sub(r"\bgratitude\b", first("shukr", "shukr", "shukr—gratitude shown in word and deed"), text, flags=re.I)
    text = re.sub(r"\breligion\b", first("deen", "deen", "deen—the way of life aligned with divine guidance"), text, flags=re.I)
    text = re.sub(r"\bhypocrites\b", "those living in nifaq—outward acceptance with inward rejection", text, flags=re.I)
    text = re.sub(r"\bremembrance of Allah\b", first("dhikr", "dhikr of Allah", "dhikr—conscious remembrance of Allah"), text, flags=re.I)
    text = re.sub(r"\bStraight Path\b", "Sirat al-Mustaqim—the Straight Path that pleases Allah", text)
    text = re.sub(r"\bthe straight path\b", "the Sirat al-Mustaqim—the way of living that pleases Allah", text, flags=re.I)
    text = re.sub(r"\btrue believers\b", "true mu'minin—those who trust and live by what Allah revealed", text, flags=re.I)
    text = re.sub(r"\bFitnah\b", first("fitnah", "fitnah", "fitnah—a trial or turmoil that tests faith"), text)
    text = re.sub(r"\bfitnah\b", first("fitnah", "fitnah", "fitnah—a trial or turmoil that tests faith"), text)
    text = re.sub(r"\bGod-fearing\b", "those who live with taqwa", text, flags=re.I)
    text = re.sub(r"\bThose mindful\b", "Those who live with taqwa", text)
    text = re.sub(r"\bthose mindful\b", "those who live with taqwa", text, flags=re.I)
    text = re.sub(r"\bwho are mindful\b", "who live with taqwa", text, flags=re.I)
    text = re.sub(r"\bare mindful\b", "live with taqwa", text, flags=re.I)
    return text


def post_process(text: str) -> str:
    text = re.sub(r"\bbe taqwa\b", "live with taqwa", text, flags=re.I)
    text = re.sub(r"\bbe living with taqwa\b", "live with taqwa", text, flags=re.I)
    text = re.sub(r"\bO those who have iman\b", "O you who have iman", text)
    text = re.sub(r"\bthe mu'minin\b", "those who have iman", text)
    text = re.sub(r"\bmu'minin\b", "those who have iman", text)
    text = re.sub(r"\bAnd are chaste believing women\b", "And permissible for you in marriage are chaste women who have iman", text)
    text = re.sub(r"\bthe Standard \.", "the Furqan—the criterion to distinguish right from wrong.", text)
    text = re.sub(r"\brevealed the Standard\b", "revealed the Furqan—the criterion to distinguish right and wrong", text)
    text = re.sub(r"\bthe Giver\.", "the Bestower of mercy.", text)
    text = re.sub(r"\brejects the faith\b", "rejects iman", text, flags=re.I)
    text = re.sub(r"\bthe Giver \.", "the Bestower.", text)
    text = re.sub(r"\bthis —it", "these verses—it", text)
    text = re.sub(r"\bwith you ,", "with you,", text)
    text = re.sub(r"\bthe illiterate ,", "the unlettered,", text)
    text = re.sub(r"\byourselves \?", "yourselves to Allah?", text)
    text = re.sub(r"\bdeliver \.", "deliver the message.", text)
    text = re.sub(r"\bprotection ,", "protection,", text)
    text = re.sub(r"\bMessenger ,", "Messenger,", text)
    text = re.sub(r"\bHow \?", "How can that be?", text)
    text = re.sub(r"\bmindful \.", "taqwa.", text)
    text = re.sub(r"\bGod\b", "Allah", text)
    text = re.sub(r"\bdisbeliever", "those who reject the truth", text, flags=re.I)
    text = re.sub(r"\bmindful of Allah\b", "living with taqwa toward Allah", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    return text


def conceptualize(base: str, surah: int, ayah: int, state: dict[str, bool]) -> str:
    key = (surah, ayah)
    if key in HAND_CRAFTED:
        return HAND_CRAFTED[key]
    text = clean_brackets(base)
    text = replace_terms(text, state)
    text = post_process(text)
    return text


def merge_continuations(rows: list[dict]) -> list[dict]:
    """Merge source translations split across ayah boundaries."""
    merged: list[dict] = []
    carry = ""
    for row in rows:
        t = row["translation"].strip()
        if carry:
            t = carry + " " + t
            carry = ""
        # If this ayah ends mid-sentence, carry remainder logic handled by next starting lowercase
        merged.append({"ayah": row["ayah"], "translation": t})
    # Second pass: merge lowercase-start ayahs into previous
    fixed: list[dict] = []
    for row in merged:
        t = row["translation"]
        if fixed and t and t[0].islower():
            fixed[-1]["translation"] = fixed[-1]["translation"] + " " + t
        else:
            fixed.append(dict(row))
    return fixed


def split_for_ayahs(merged_rows: list[dict], original_rows: list[dict]) -> dict[int, str]:
    """Distribute merged text back to individual ayah numbers.

    When multiple original ayahs were merged, give the full merged text to the
    last ayah in the group and use bridging sentences for earlier ones.
    """
    orig_by_ayah = {r["ayah"]: r["translation"] for r in original_rows}
    result: dict[int, str] = {}
    i = 0
    while i < len(original_rows):
        ayah_num = original_rows[i]["ayah"]
        # Collect run of ayahs merged together
        j = i
        parts = [original_rows[i]["translation"].strip()]
        while j + 1 < len(original_rows):
            nxt = original_rows[j + 1]["translation"].strip()
            if nxt and nxt[0].islower():
                parts.append(nxt)
                j += 1
            else:
                break
        if len(parts) == 1:
            # find merged text
            for m in merged_rows:
                if m["ayah"] == ayah_num:
                    result[ayah_num] = m["translation"]
                    break
        else:
            full = clean_brackets(" ".join(parts))
            for ay in range(ayah_num, ayah_num + len(parts)):
                result[ay] = full
        i = j + 1
    return result


def generate_surah(surah: int) -> dict:
    ref_path = REFS / f"surah_{surah}_refs.json"
    rows = json.loads(ref_path.read_text(encoding="utf-8"))
    merged = merge_continuations(rows)
    distributed = split_for_ayahs(merged, rows)
    state: dict[str, bool] = {}
    ayahs: dict[str, str] = {}
    for row in rows:
        n = row["ayah"]
        base = distributed.get(n, row["translation"])
        ayahs[str(n)] = conceptualize(base, surah, n, state)
    return {"surah": surah, "ayahs": ayahs}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for n in range(3, 10):
        if n == 8:
            continue  # keep hand-crafted surah 8
        out = generate_surah(n)
        path = OUT / f"surah_{n}.json"
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote surah {n}: {len(out['ayahs'])} ayahs")


if __name__ == "__main__":
    main()
