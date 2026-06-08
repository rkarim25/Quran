"""Build concise AI tafsir from classical commentary (Ibn Kathir, Maarif ul Quran)."""

from __future__ import annotations

import re

from tafsir_summary import (
    FATIHA_DIALOGUE,
    GEM_PATTERNS,
    REVELATION,
    _clean_text,
    _compose,
    _find_fatiha_dialogue,
    _find_revelation_sentence,
    _find_term_definition,
    _is_bad_sentence,
    _key_terms,
    _normalize,
    _prepare_tafsir,
    _rank_sentences,
    _sentences,
    _truncate_at_sentence,
)

MAX_AI_TAFSIR_CHARS = 900
MIN_AI_TAFSIR_CHARS = 120

COLLECTION_MARKERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"Al-Bukhari", re.I), "Sahih al-Bukhari"),
    (re.compile(r"\bMuslim\b", re.I), "Sahih Muslim"),
    (re.compile(r"Imam Ahmad|Ahmad recorded", re.I), "Musnad Ahmad"),
    (re.compile(r"At-Tirmidhi|Tirmidhi", re.I), "Jami' at-Tirmidhi"),
    (re.compile(r"Abu Dawud", re.I), "Sunan Abi Dawud"),
    (re.compile(r"Ibn Majah", re.I), "Sunan Ibn Majah"),
    (re.compile(r"An-Nasa'i|Nasa'i", re.I), "Sunan an-Nasa'i"),
    (re.compile(r"Al-Hakim|Hakim", re.I), "al-Mustadrak"),
    (re.compile(r"Ibn Hibban|Hibban", re.I), "Sahih Ibn Hibban"),
    (re.compile(r"authentic Hadith|authentic hadith|Hasan Sahih", re.I), "authentic hadith"),
]

SCHOLAR_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"Ibn ['']Abbas said", re.I), "Ibn 'Abbas"),
    (re.compile(r"Mujahid said", re.I), "Mujahid"),
    (re.compile(r"Qatadah said", re.I), "Qatadah"),
    (re.compile(r"Ikrimah said", re.I), "Ikrimah"),
    (re.compile(r"Sa'id bin Jubayr said", re.I), "Sa'id ibn Jubayr"),
    (re.compile(r"Ad-Dahhak said", re.I), "Ad-Dahhak"),
    (re.compile(r"Al-Hasan Al-Basri said", re.I), "Al-Hasan al-Basri"),
    (re.compile(r"As-Suddi said", re.I), "As-Suddi"),
    (re.compile(r"Ata' said", re.I), "Ata'"),
    (re.compile(r"Az-Zuhri said", re.I), "Az-Zuhri"),
]

HADITH_TRIGGER = re.compile(
    r"(?:Imam Ahmad|Al-Bukhari|Muslim|At-Tirmidhi|Abu Dawud|Ibn Majah|An-Nasa'i|Al-Hakim|"
    r"authentic Hadith|Allah's Messenger|The Prophet ﷺ|Messenger of Allah ﷺ|"
    r"recorded that|narrated that|collected)",
    re.I,
)

PROPHET_QUOTE = re.compile(
    r"(?:Allah's Messenger ﷺ|The Prophet ﷺ|Messenger of Allah ﷺ|the Prophet ﷺ)"
    r"(?: said,?|:)\s*['\"]?(.{25,420}?)(?:['\"]\.|['\"]|\.)(?:\s|$)",
    re.I | re.DOTALL,
)

CRAFTED: dict[tuple[int, int], str] = {
    (1, 1): (
        "**What this ayah teaches:** Every action of worth in Islam begins by calling on Allah "
        "and acknowledging ar-Rahman (mercy that embraces all creation in this life) and ar-Rahim "
        "(special mercy for those who turn to Him in the Akhirah).\n\n"
        "**Classical tafsir:** Ibn Kathir notes that opening with Allah's name teaches that no "
        "deed is valid without sincerity to Him alone. Maarif ul Quran explains that *Bismillah* "
        "is the key to every surah except at-Tawbah.\n\n"
        "**From the Sunnah:** The Prophet ﷺ said: \"Every important matter not begun with "
        "Bismillah remains deficient\" (reported in several collections)."
    ),
    (1, 2): (
        "**What this ayah teaches:** All praise—of every kind—belongs to Allah alone, the Rabb "
        "who creates, owns, nurtures, and sustains al-alamin (every realm of existence).\n\n"
        "**Classical tafsir:** In Salah, when the servant says *Al-hamdu lillahi Rabbil-alamin*, "
        "Allah responds: \"My servant has praised Me\" (hadith qudsi). Ibn Kathir: praise is "
        "recognition that every blessing flows from Him.\n\n"
        "**From the Sunnah:** The dialogue between servant and Lord in al-Fatihah is reported "
        "in Sahih Muslim and Musnad Ahmad."
    ),
    (1, 3): (
        "**What this ayah teaches:** Allah names Himself ar-Rahman and ar-Rahim—two dimensions "
        "of mercy: universal compassion in the dunya and special nearness for believers in the Akhirah.\n\n"
        "**Classical tafsir:** When the servant says these names in prayer, Allah replies: "
        "\"My servant has glorified Me\" (hadith qudsi). Scholars note ar-Rahman is for all "
        "creation; ar-Rahim is especially for the people of iman.\n\n"
        "**From the Sunnah:** The Fatihah dialogue hadith (Muslim, Ahmad)."
    ),
    (1, 4): (
        "**What this ayah teaches:** Allah alone is Malik—absolute Sovereign—of Yawm ad-Din, "
        "the Day when every deed is weighed with perfect justice.\n\n"
        "**Classical tafsir:** Ibn Kathir: *Malik* and *Maalik* (Owner/Judge) are both recited "
        "authentically. Maarif: this ayah turns the heart from worldly masters to the One "
        "whose judgment is final.\n\n"
        "**From the Sunnah:** In the Fatihah dialogue, Allah says He has entrusted all affairs "
        "to Himself (Muslim)."
    ),
    (1, 5): (
        "**What this ayah teaches:** Worship (*ibadah*) and reliance (*isti'anah*) belong to "
        "Allah alone—not to wealth, status, fear of people, or self-reliance.\n\n"
        "**Classical tafsir:** Ibn Kathir: this is the heart of *tawhid al-uluhiyyah*. "
        "Between Allah and the servant is the covenant of exclusive devotion.\n\n"
        "**From the Sunnah:** \"You alone we worship; You alone we ask for help\" — Allah says: "
        "\"This is between Me and My servant, and for My servant is what he asks\" (Muslim)."
    ),
    (1, 6): (
        "**What this ayah teaches:** The believer asks for guidance to the Sirat al-Mustaqim—the "
        "straight way of living that pleases Allah—not the paths of confusion, anger, or neglect.\n\n"
        "**Classical tafsir:** Ibn Kathir: guidance here means steadfastness on truth after "
        "recognizing it. Maarif: it is a daily plea, because guidance is ongoing.\n\n"
        "**From the Sunnah:** Allah responds: \"This is for My servant, and My servant shall "
        "have what he asks\" (Muslim)."
    ),
    (1, 7): (
        "**What this ayah teaches:** The path of those Allah favoured (the prophets and truthful "
        "followers), not those who knew truth yet chose resentment, nor those who lost the way "
        "through heedlessness.\n\n"
        "**Classical tafsir:** Ibn Kathir identifies the two misguided groups as Jews (knowledge "
        "without practice) and Christians (practice without knowledge), per authentic reports. "
        "The safe path is that of the prophets and their steadfast followers.\n\n"
        "**From the Sunnah:** The Fatihah dialogue concludes with Allah granting what was asked "
        "(Muslim, Ahmad)."
    ),
    (2, 255): (
        "**What this ayah teaches:** Ayat al-Kursi declares Allah's absolute life, wakefulness, "
        "ownership of the heavens and earth, perfect knowledge, vast Kursi, and that no intercession "
        "occurs except by His permission.\n\n"
        "**Classical tafsir:** Ibn 'Abbas: the Kursi is the footstool; the Throne is vastly greater. "
        "Ibn Kathir: al-Hayy al-Qayyum means the Self-Sustaining who sustains all else.\n\n"
        "**From the Sunnah:** 'Ubayy ibn Ka'b said this is the greatest ayah in the Book of Allah "
        "(Musnad Ahmad, Sahih Muslim). Reciting it after each fard prayer is authentically reported. "
        "It is a protection by night (Bukhari)."
    ),
    (112, 1): (
        "**What this ayah teaches:** Allah commands the Prophet ﷺ to declare Allah's oneness: "
        "He neither begets nor is begotten—rejecting every form of shirk.\n\n"
        "**Classical tafsir:** Ibn Kathir: *qul* makes this a declaration to humanity. "
        "Maarif: al-Ikhlas negates lineage from Allah, the core of pagan and mistaken beliefs.\n\n"
        "**From the Sunnah:** Reciting al-Ikhlas equals one-third of the Qur'an in reward (Bukhari, Muslim)."
    ),
    (112, 2): (
        "**What this ayah teaches:** Allah as-Samad—the One all creation depends upon while "
        "He depends on none; the Eternal Refuge.\n\n"
        "**Classical tafsir:** Ibn Kathir and linguists: as-Samad is the Master sought in every "
        "need, without need Himself. Mujahid and others linked it to perfection in nobility and authority.\n\n"
        "**From the Sunnah:** Al-Ikhlas was sent as a match for one-third of the Qur'an (Bukhari)."
    ),
    (112, 3): (
        "**What this ayah teaches:** Allah was not born nor does He beget—no lineage, no "
        "offspring, no partnership in divinity.\n\n"
        "**Classical tafsir:** Ibn Kathir: this refutes claims that angels are Allah's daughters "
        "or that He took a son. Pure *tawhid* in Allah's essence.\n\n"
        "**From the Sunnah:** Whoever recites al-Ikhlas ten times, Allah builds a house in "
        "Paradise (Bukhari, Ahmad)."
    ),
    (112, 4): (
        "**What this ayah teaches:** Nothing is comparable to Allah—no image, partner, or created "
        "equal can stand beside Him.\n\n"
        "**Classical tafsir:** Ibn Kathir: the surah closes by negating any likeness. Maarif: "
        "this is the seal of pure monotheism.\n\n"
        "**From the Sunnah:** Al-Ikhlas completes the Qur'an's declaration of *tawhid*; "
        "reciting it before sleep brings protection (Bukhari)."
    ),
    (103, 1): (
        "**What this ayah teaches:** By al-'Asr (time), humanity is in loss—except those with "
        "iman, righteous deeds, mutual truth, and patient perseverance.\n\n"
        "**Classical tafsir:** Ibn Kathir: al-'Asr is the era of the Prophet ﷺ or time itself—"
        "every moment testifies that neglect is ruin. Imam al-Shafi'i said if people reflected "
        "only on this surah, it would suffice them.\n\n"
        "**From the Sunnah:** The Prophet ﷺ urged holding to this surah because it summarizes "
        "salvation (reported in tafsir literature)."
    ),
}


def _identify_collection(text: str) -> str:
    found: list[str] = []
    for pat, name in COLLECTION_MARKERS:
        if pat.search(text) and name not in found:
            found.append(name)
    if not found:
        return ""
    return ", ".join(found[:2])


def _strip_narrator_chain(text: str) -> str:
    text = re.sub(
        r"^(?:Imam Ahmad|Al-Bukhari|Muslim|At-Tirmidhi|Abu Dawud|Ibn Majah|An-Nasa'i|Al-Hakim)"
        r"[^.]{0,120}?(?:said,?|recorded,?|collected,?|narrated,?)\s*",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"^[^.]{0,80}?\bsaid that\b\s*", "", text, flags=re.I)
    return text.strip()


def _condense_hadith_paragraph(para: str) -> str:
    para = _clean_text(para)
    if len(para) < 40:
        return ""

    collection = _identify_collection(para)
    quote = ""
    m = PROPHET_QUOTE.search(para)
    if m:
        quote = _clean_text(m.group(1))
    else:
        m2 = re.search(
            r"(?:greatest Ayah|Ayat Al-Kursi|one-third of the Qur'an|"
            r"between Me and My servant|My servant has praised Me|"
            r"protection|deficient|intercede|Paradise)[^.]{10,200}\.",
            para,
            re.I,
        )
        if m2:
            quote = _clean_text(m2.group(0))
        else:
            sents = [s for s in _sentences(para) if not _is_bad_sentence(s)]
            for s in sents:
                if HADITH_TRIGGER.search(s) and len(s) > 50:
                    quote = s
                    break

    if not quote:
        return ""

    quote = _strip_narrator_chain(quote)
    quote = re.sub(r"\s+", " ", quote).strip()
    quote = _truncate_at_sentence(quote, 260)
    if collection:
        return f"{quote} ({collection})"
    return quote


def _extract_hadith_snippets(ibn_text: str, maarif_text: str, max_items: int = 2) -> list[str]:
    combined = f"{ibn_text}\n\n{maarif_text}"
    snippets: list[str] = []
    seen: set[str] = set()

    for para in re.split(r"\n\s*\n", combined):
        if not HADITH_TRIGGER.search(para):
            continue
        condensed = _condense_hadith_paragraph(para)
        if not condensed or len(condensed) < 35:
            continue
        key = _normalize(condensed)[:80]
        if key in seen:
            continue
        seen.add(key)
        snippets.append(condensed)
        if len(snippets) >= max_items:
            break

    if not snippets:
        for gem in GEM_PATTERNS:
            m = gem.search(combined)
            if m:
                s = _condense_hadith_paragraph(m.group(0))
                if s and _normalize(s)[:80] not in seen:
                    snippets.append(s)
                    break

    return snippets[:max_items]


def _extract_scholar_views(ibn_text: str, maarif_text: str, max_items: int = 2) -> list[str]:
    views: list[str] = []
    seen: set[str] = set()
    for source in (ibn_text, maarif_text):
        for s in _sentences(source):
            if _is_bad_sentence(s) or len(s) < 45:
                continue
            for pat, name in SCHOLAR_PATTERNS:
                if pat.search(s):
                    key = _normalize(s)[:70]
                    if key not in seen:
                        seen.add(key)
                        views.append(_truncate_at_sentence(s, 300))
                    break
            if len(views) >= max_items:
                return views
    return views


def _build_meaning(
    ibn_text: str,
    maarif_text: str,
    *,
    surah: int,
    ayah: int,
    translation: str,
    word_by_word: dict | None,
    verses_count: int,
) -> str:
    combined = f"{ibn_text}\n\n{maarif_text}".strip()
    terms = _key_terms(translation, word_by_word)

    if surah == 1 and ayah <= 7:
        hit = _find_fatiha_dialogue(combined, ayah)
        if hit:
            return _truncate_at_sentence(hit, 380)

    for gem_pat in GEM_PATTERNS:
        m = gem_pat.search(combined)
        if m:
            return _truncate_at_sentence(_clean_text(m.group(0)), 380)

    definition = _find_term_definition(combined, terms)
    if definition:
        return _truncate_at_sentence(definition, 380)

    ranked: list[tuple[float, str]] = []
    for source in (ibn_text, maarif_text):
        ranked.extend(_rank_sentences(source, ayah, terms, translation))
    ranked.sort(key=lambda x: -x[0])

    priority = [
        s
        for sc, s in ranked
        if sc >= 28
        or re.search(r"\bthis (?:ayah|verse|surah) (?:means|teaches|declares|states)\b", s, re.I)
        or re.search(r"\bayat al-kursi\b|\bgreatest ayah\b", s, re.I)
    ]
    if priority:
        return _truncate_at_sentence(" ".join(priority[:2]), 400)

    top = [s for sc, s in ranked if sc >= 16]
    if top:
        return _truncate_at_sentence(" ".join(top[:2]), 400)

    revelation = _find_revelation_sentence(combined)
    if revelation and ayah <= max(3, verses_count // 3):
        return _truncate_at_sentence(revelation, 350)

    if translation:
        lead = _truncate_at_sentence(_clean_text(translation), 200)
        insight = next((s for sc, s in ranked if sc >= 8), "")
        if insight:
            return _truncate_at_sentence(f"{insight}", 400)
        return f"This ayah declares: {lead}"

    lower = [s for _, s in ranked[:3]]
    if lower:
        return _truncate_at_sentence(" ".join(lower), 380)

    return ""


def _build_classical(
    scholar_views: list[str],
    ibn_text: str,
    maarif_text: str,
    ayah: int,
    translation: str,
) -> str:
    parts: list[str] = []
    if scholar_views:
        parts.append(" ".join(scholar_views[:2]))

    ranked_ik = _rank_sentences(ibn_text, ayah, [], translation)
    ranked_ma = _rank_sentences(maarif_text, ayah, [], translation)
    merged = sorted(ranked_ik + ranked_ma, key=lambda x: -x[0])

    for sc, s in merged:
        if sc < 14 or _is_bad_sentence(s):
            continue
        if re.search(r"\bIbn Kathir\b|\bMaarif\b", s, re.I):
            continue
        if any(_normalize(s)[:60] == _normalize(p)[:60] for p in parts):
            continue
        if re.search(r"\b(?:means|teaches|refers to|explains|indicates|scholars?)\b", s, re.I):
            parts.append(_truncate_at_sentence(s, 280))
            break

    if not parts:
        for sc, s in merged[:5]:
            if sc >= 10 and not _is_bad_sentence(s):
                parts.append(_truncate_at_sentence(s, 280))
                break

    if not parts:
        return "Ibn Kathir and Maarif ul Quran expand on the themes of this ayah in the full commentaries below."

    text = " ".join(parts[:2])
    if "Ibn Kathir" not in text and "Maarif" not in text:
        text = f"Ibn Kathir notes: {text}"
    return _truncate_at_sentence(text, 420)


def _build_context(context: str) -> str:
    if not context or not context.strip():
        return ""
    ctx = _clean_text(context.strip())
    ctx = re.sub(r"^Al-Fatihah was revealed.*?\n", "", ctx, flags=re.I)
    return _truncate_at_sentence(ctx, 220)


def _assemble(sections: list[tuple[str, str]]) -> str:
    parts = []
    for header, body in sections:
        body = body.strip()
        if body:
            parts.append(f"{header} {body}")
    text = "\n\n".join(parts)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > MAX_AI_TAFSIR_CHARS:
        text = _truncate_at_sentence(text, MAX_AI_TAFSIR_CHARS)
    return text


def build_ai_tafsir(
    ibn_text: str,
    maarif_text: str,
    *,
    context: str = "",
    surah: int = 0,
    ayah: int = 1,
    translation: str = "",
    word_by_word: dict | None = None,
    verses_count: int = 1,
) -> str:
    key = (surah, ayah)
    if key in CRAFTED:
        return CRAFTED[key]

    ibn_text = _prepare_tafsir(ibn_text)
    maarif_text = _prepare_tafsir(maarif_text)

    meaning = _build_meaning(
        ibn_text,
        maarif_text,
        surah=surah,
        ayah=ayah,
        translation=translation,
        word_by_word=word_by_word,
        verses_count=verses_count,
    )
    scholar_views = _extract_scholar_views(ibn_text, maarif_text)
    classical = _build_classical(scholar_views, ibn_text, maarif_text, ayah, translation)
    hadiths = _extract_hadith_snippets(ibn_text, maarif_text)
    ctx = _build_context(context)

    sections: list[tuple[str, str]] = []
    if ctx:
        sections.append(("**Context:**", ctx))
    if meaning:
        sections.append(("**What this ayah teaches:**", meaning))
    if classical:
        sections.append(("**Classical tafsir:**", classical))
    if hadiths:
        sections.append(("**From the Sunnah:**", " ".join(hadiths)))

    result = _assemble(sections)
    if len(result) < MIN_AI_TAFSIR_CHARS and meaning:
        result = _assemble([
            ("**What this ayah teaches:**", meaning),
            ("**Classical tafsir:**", classical or "See Ibn Kathir and Maarif ul Quran below."),
        ])
    return result
