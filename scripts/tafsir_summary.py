"""Build concise, educational tafsir summaries from full commentary text."""

from __future__ import annotations

import re

MAX_TAFSIR_SUMMARY_CHARS = 480

STOPWORDS = frozenset(
    """
    a an the and or but in on at to for of is are was were be been being
    with from by as that this these those it its he she they we you i
    his her their our your my not no so if when which who whom what
    all any each every both few more most other some such than then
    too very can will just into over after before about up out
    say said o prophet allah god verse ayah surah one two
    """.split()
)

HEADING_ONLY = re.compile(
    r"^The (?:Reason|Meaning|Virtue|Merits|Subject|Special|Names?|Title|Tafsir|Commentary|"
    r"Occasion|Period|Beginning|Love|Warning|Explanation|Merit|Story|Subject-matter|"
    r"Another Hadith|A Hadith)\b",
    re.I,
)

NARRATOR = re.compile(
    r"\b(?:Imam|Al-|At-|Ibn |Abu |Ahmad|Bukhari|Tirmidhi|Muslim|Hakim|Bayhaqi|Tabarani|"
    r"Qatadah|Mujahid|Ikrimah|Sa'id|Ibn Jurayj|Ibn Abi Hatim)\b",
    re.I,
)

EDUCATIONAL = (
    re.compile(r"\bthis means\b", re.I),
    re.compile(r"\bthat means\b", re.I),
    re.compile(r"\brefers to\b", re.I),
    re.compile(r"\bindicates?\b", re.I),
    re.compile(r"\bsignif(?:y|ies|icance)\b", re.I),
    re.compile(r"\bliterally\b", re.I),
    re.compile(r"\bin other words\b", re.I),
    re.compile(r"\bthe (?:word|term|name|phrase)\b", re.I),
    re.compile(r"\bbecause\b", re.I),
    re.compile(r"\btherefore\b", re.I),
    re.compile(r"\bso that\b", re.I),
    re.compile(r"\bteaches us\b", re.I),
    re.compile(r"\bthe lesson\b", re.I),
    re.compile(r"\b(?:describes|explains|highlights|warns against|condemns|emphasiz(?:e|es))\b", re.I),
    re.compile(r"\b(?:greatest|most important|central|key) (?:ayah|verse|theme|message)\b", re.I),
)

REVELATION = re.compile(
    r"(?:idolators?|pagans?|jews?|christians?|hypocrites?|disbelievers?|polytheists?)"
    r".{0,40}(?:said|asked|demanded|questioned)",
    re.I,
)

FATIHA_DIALOGUE = re.compile(
    r"\bWhen (?:the servant|he) says,.{10,80}Allah says,.{10,80}\.",
    re.I,
)


def _is_arabic_heavy(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return False
    arabic = sum(1 for ch in letters if "\u0600" <= ch <= "\u06FF")
    return arabic / len(letters) > 0.35


def _clean_text(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text.strip())
    text = re.sub(r"\*+", "", text)
    return text


def _paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]


def _truncate_at_sentence(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    for sep in (". ", "! ", "? "):
        idx = truncated.rfind(sep)
        if idx > max_chars // 2:
            return truncated[: idx + 1].rstrip()
    return truncated.rstrip() + "…"


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", _clean_text(text)) if s.strip()]


def _prepare_tafsir(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"> \*In the Ibn Kathir source.*?\*", "", text, flags=re.DOTALL | re.I)
    text = re.sub(r"^> .+$", "", text, flags=re.MULTILINE)
    text = re.sub(
        r"\s+((?:The (?:Virtue|Meaning|Reason|Merits|Subject|Commentary|Explanation) of|The Story of|"
        r"A Hadith on|Another Hadith)[^\.!\?]{0,80}?)\s+(?=[A-Z\"'])",
        r". \1. ",
        text,
    )
    text = re.sub(r"\(\d{1,3}\)\s+(?=[A-Z])", ". ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _key_terms(translation: str, word_by_word: dict | None = None) -> list[str]:
    terms: list[str] = []
    if translation:
        words = re.findall(r"[A-Za-z]{4,}", translation.lower())
        terms.extend(w for w in words if w not in STOPWORDS)
    if word_by_word:
        for entry in word_by_word.values():
            if not isinstance(entry, dict):
                continue
            for field in ("translation", "transliteration"):
                val = (entry.get(field) or "").strip()
                if len(val) > 2:
                    terms.append(val.lower())
    seen: set[str] = set()
    out: list[str] = []
    for t in terms:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out[:14]


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower())


def _too_similar(a: str, b: str) -> bool:
    na, nb = _normalize(a), _normalize(b)
    if not na or not nb:
        return False
    shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
    return shorter in longer or longer.startswith(shorter[: min(len(shorter), 50)])


def _has_unbalanced_quotes(s: str) -> bool:
    return s.count('"') % 2 != 0


def _is_bad_sentence(s: str) -> bool:
    if not s or len(s) < 35:
        return True
    if _is_arabic_heavy(s) or re.search(r"[\u0600-\u06FF]", s):
        return True
    if HEADING_ONLY.match(s):
        return True
    if s.strip().startswith("("):
        return True
    if re.search(r"\)\.\)\(", s) or re.search(r"\)\.\)\(", s):
        return True
    if re.search(r"\(\d+\)\s*$", s) and len(s) < 130:
        return True
    if re.search(r"continues in \*\*Ayah|Ayah 6, where the full hadith", s, re.I):
        return True
    if re.search(r"\bTranslator\b", s):
        return True
    if _has_unbalanced_quotes(s):
        return True
    if re.search(r"\b(?:said|says|asked|replied),?\s*$", s, re.I):
        return True
    if re.search(r"\b(?:Reports differ|Similar was said|According to the well-known|more than one of the scholars)\b", s, re.I):
        return True
    if re.search(r"\bwhich is there in details in all books of Hadith\b", s, re.I):
        return True
    if len(re.findall(r"[A-Za-z]{3,}", s)) < 5:
        return True
    return False


def _is_translation_fragment(s: str, translation: str) -> bool:
    if not translation:
        return False
    ns, nt = _normalize(s), _normalize(translation)
    if len(ns) < 30:
        return False
    return ns in nt or nt in ns


def _score_sentence(s: str, ayah: int, terms: list[str], translation: str = "") -> float:
    if _is_bad_sentence(s):
        return -100.0
    if _is_translation_fragment(s, translation):
        return -50.0
    score = 0.0
    lower = s.lower()
    for pat in EDUCATIONAL:
        if pat.search(s):
            score += 12.0
    for t in terms:
        if t in lower:
            score += 8.0
    if re.search(rf"\bayah\s+{ayah}\b", s, re.I):
        score += 22.0
    if re.search(rf"\bverse\s+{ayah}\b", s, re.I):
        score += 20.0
    if re.search(rf"\({ayah}\.", s):
        score += 28.0
    if REVELATION.search(s):
        score += 16.0
    if FATIHA_DIALOGUE.search(s):
        score += 30.0
    if re.search(r"\bayat al-kursi\b|\bgreatest ayah\b|\bgreatest verse\b", s, re.I):
        score += 35.0
    if re.search(r"\) is (?:One|one|the|a|an)\b", s):
        score += 24.0
    if re.search(r"\bthis (?:ayah|verse) (?:means|teaches|declares|states|describes)\b", s, re.I):
        score += 26.0
    if NARRATOR.search(s) and not FATIHA_DIALOGUE.search(s):
        score -= 18.0
    if re.search(r"\b(?:recorded|narrated|reported) (?:from|that|by)\b", s, re.I):
        score -= 14.0
    n = len(s)
    if 70 <= n <= 340:
        score += 8.0
    elif n > 400:
        score -= 6.0
    return score


def _find_term_definition(text: str, terms: list[str]) -> str:
    for term in sorted(terms, key=len, reverse=True):
        if len(term) < 4:
            continue
        for s in _sentences(text):
            if term not in s.lower():
                continue
            if re.search(rf"\b{re.escape(term)}\b.{{0,30}}\bis\b", s, re.I):
                if not _is_bad_sentence(s):
                    return s
            if re.search(rf"\({re.escape(term.title())}\)\s+is\b", s, re.I):
                if not _is_bad_sentence(s):
                    return s
    return ""


GEM_PATTERNS = (
    re.compile(
        r"This is Ayat Al-Kursi.{10,220}?greatest Ayah in the Book of Allah\.'",
        re.I | re.DOTALL,
    ),
    re.compile(
        r"In this Surah, Allah swears an oath by the 'Time' and says that mankind is in a state of loss[^.]*\.",
        re.I | re.DOTALL,
    ),
    re.compile(
        r"The Day of Requital or the Day of Judgment is the Day appointed by Allah to recompense good or evil deeds\.",
        re.I,
    ),
)


def _extract_gems(text: str) -> list[str]:
    gems: list[str] = []
    for pat in GEM_PATTERNS:
        m = pat.search(text)
        if m:
            s = _clean_text(m.group(0))
            if not _is_bad_sentence(s) and not re.search(
                r"\b(?:Bukhari|Imam Ahmad|recorded this Hadith)\b", s, re.I
            ):
                gems.append(s)
    for m in re.finditer(
        r"((?:This is|In this (?:Surah|ayah)|This ayah|This verse).{35,280}?\.)\s+"
        r"(?:Imam|Allah's Messenger|Similar|The Prophet|Abu [A-Z]|Al-Bukhari|At-Tirmidhi|Muslim|Hakim)\b",
        text,
        re.I | re.DOTALL,
    ):
        s = _clean_text(m.group(1))
        if not _is_bad_sentence(s) and not re.search(
            r"\b(?:Bukhari|Imam Ahmad|recorded this Hadith)\b", s, re.I
        ):
            gems.append(s)
    return gems


def _find_fatiha_dialogue(text: str, ayah: int) -> str:
    markers = {
        2: r"praised Me|All praise is due to Allah|Al-Hamdu lillah",
        3: r"glorified Me|Most Gracious, the Most Merciful|Ar-Rahman",
        4: r"Master of the Day|Malik.*Judgment|related all matters to Me",
        5: r"acquire what he sought|between Me and My servant|You alone we worship",
        6: r"guided Me|Guide us.*straight path|straight path",
        7: r"gone astray|those who earned Your anger|path of those",
    }
    pat = markers.get(ayah)
    if not pat:
        return ""
    sents = _sentences(text)
    for i, s in enumerate(sents):
        window = " ".join(sents[i : i + 3])
        if re.search(pat, window, re.I) and re.search(r"Allah says", window, re.I):
            if not _is_bad_sentence(window):
                return _truncate_at_sentence(window, 420)
    return ""


def _find_revelation_sentence(text: str) -> str:
    for s in _sentences(text):
        if REVELATION.search(s) and "revealed" in s.lower():
            if not _is_bad_sentence(s):
                return re.sub(r"^Imam Ahmad recorded from [^,]+ that ", "", s, flags=re.I)
    for s in _sentences(text):
        if REVELATION.search(s) and not _is_bad_sentence(s):
            return s
    return ""


def _rank_sentences(text: str, ayah: int, terms: list[str], translation: str = "") -> list[tuple[float, str]]:
    ranked: list[tuple[float, str]] = []
    seen: set[str] = set()
    for s in _sentences(text):
        norm = _normalize(s)[:90]
        if norm in seen:
            continue
        score = _score_sentence(s, ayah, terms, translation)
        if score > 0:
            ranked.append((score, s))
            seen.add(norm)
    ranked.sort(key=lambda x: -x[0])
    return ranked


def _translation_lead(translation: str) -> str:
    t = _clean_text(translation.strip().strip('"').strip("'"))
    if not t:
        return ""
    first = _sentences(t)[0] if _sentences(t) else t
    return _truncate_at_sentence(first, 160)


def _compose(parts: list[str]) -> str:
    parts = [p.strip() for p in parts if p and p.strip()]
    if not parts:
        return ""
    text = " ".join(parts)
    text = re.sub(r"\s+", " ", text).strip()
    return _truncate_at_sentence(text, MAX_TAFSIR_SUMMARY_CHARS)


def build_educational_summary(
    ibn_text: str,
    maarif_text: str,
    *,
    surah: int = 0,
    ayah: int,
    translation: str = "",
    word_by_word: dict | None = None,
    verses_count: int = 1,
    exclude: set[str] | None = None,
) -> str:
    ibn_text = _prepare_tafsir(ibn_text)
    maarif_text = _prepare_tafsir(maarif_text)
    combined = f"{ibn_text}\n\n{maarif_text}".strip()
    terms = _key_terms(translation, word_by_word)
    excluded = {_normalize(x) for x in (exclude or set())}

    def ok(s: str) -> bool:
        return bool(s) and _normalize(s)[:100] not in excluded

    for gem in _extract_gems(combined):
        if ok(gem):
            return _compose([gem])

    # Special: Al-Fatiha dialogue hadith per ayah
    if surah == 1 and ayah <= 7:
        hit = _find_fatiha_dialogue(combined, ayah)
        if ok(hit):
            return _compose([hit])

    # Term definition (great for short surahs)
    definition = _find_term_definition(combined, terms)
    if ok(definition):
        return _compose([definition])

    # Rank all candidate sentences
    ranked: list[tuple[float, str]] = []
    for source in (ibn_text, maarif_text):
        ranked.extend(_rank_sentences(source, ayah, terms, translation))
    ranked.sort(key=lambda x: -x[0])

    # Strong picks: landmark ayahs, definitions, explicit commentary
    priority = [
        s
        for sc, s in ranked
        if ok(s)
        and (
            sc >= 30
            or re.search(r"\bayat al-kursi\b|\bgreatest ayah\b", s, re.I)
            or re.search(r"\bthis (?:ayah|verse|surah) (?:means|teaches|declares)\b", s, re.I)
        )
    ]
    if priority:
        return _compose(priority[:2])

    top = [s for sc, s in ranked if sc >= 18 and ok(s)]
    if top:
        return _compose(top[:2])

    # Tafsir often opens with an English rendering of the ayah — pair with insight, not fragment
    paras = _paragraphs(combined)
    if paras:
        opener = _clean_text(paras[0].replace("\n", " "))
        if (
            len(opener) > 90
            and not _is_arabic_heavy(opener)
            and not NARRATOR.search(opener)
            and not HEADING_ONLY.match(opener)
        ):
            insight = next((s for sc, s in ranked if sc >= 8 and ok(s)), "")
            if insight:
                return _compose([insight])
            if ok(opener) and not _is_bad_sentence(opener) and not _is_translation_fragment(opener, translation):
                return _compose([_truncate_at_sentence(opener, 380)])

    medium = [s for sc, s in ranked if sc >= 10 and ok(s)]
    if medium:
        return _compose(medium[:2])

    revelation = _find_revelation_sentence(combined)
    if ok(revelation) and ayah <= max(3, verses_count // 3):
        lead = _translation_lead(translation)
        if lead and not _normalize(lead).startswith(_normalize(revelation)[:40]):
            return _compose([revelation, lead])
        return _compose([revelation])

    lower_ranked = [s for _, s in ranked if ok(s)]
    if lower_ranked:
        return _compose(lower_ranked[:2])

    lead = _translation_lead(translation)
    if ok(lead):
        if ayah == 1:
            return _compose([f"This opening ayah declares: {lead}"])
        return _compose([lead])

    for para in _paragraphs(combined):
        cleaned = _clean_text(para.replace("\n", " "))
        if len(cleaned) > 60 and not _is_arabic_heavy(cleaned):
            s = _truncate_at_sentence(cleaned, 300)
            if ok(s) and not _is_bad_sentence(s):
                return s

    return ""


def combine_tafsir_summary(
    ibn_text: str,
    maarif_text: str,
    *,
    surah: int = 0,
    ayah: int = 1,
    translation: str = "",
    word_by_word: dict | None = None,
    verses_count: int = 1,
) -> str:
    return build_educational_summary(
        ibn_text,
        maarif_text,
        surah=surah,
        ayah=ayah,
        translation=translation,
        word_by_word=word_by_word,
        verses_count=verses_count,
    )
