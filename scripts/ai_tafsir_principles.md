# AI Tafsir Principles — Concise Scholarly Commentary

AI Tafsir appears in the **Tafsir** tab of the study panel. It synthesizes classical scholarship for the modern reader without replacing Ibn Kathir or Maarif ul Quran (those remain available below).

## Purpose

Explain **what the ayah means**, **why it was revealed** (when known), **what classical scholars said**, and **relevant hadith** — in language a thoughtful reader can follow today.

## Structure (use these section headers)

1. **Context:** — Occasion of revelation (asbāb al-nuzūl) when available; omit if unknown.
2. **What this ayah teaches:** — Core meaning in 2–4 sentences. Explain Arabic concepts inline (Rahman, taqwa, deen, etc.) without flattening them.
3. **Classical tafsir:** — Ibn Kathir, Maarif ul Quran, and named scholars (Ibn ʿAbbās, Mujāhid, Qatādah, etc.). Attribute views clearly.
4. **From the Sunnah:** — Authentic hadith when present in source material. Name the collection (Bukhari, Muslim, Ahmad, Tirmidhi, etc.). Condense long narratives to the teaching; do not invent chains or wording.

## Rules

1. **Concise** — Target 400–750 characters total. Never exceed 900 characters.
2. **Faithful** — Stay within the consensus of the classical sources provided. Do not introduce modern ideologies or disputed opinions as fact.
3. **Hadith** — Only cite hadith found in Ibn Kathir / Maarif text. Format: teaching + (Collection). Never fabricate isnād.
4. **Scholars** — When Ibn Kathir quotes a companion or tābiʿī, name them: "Ibn ʿAbbās said…", "Mujāhid explained…"
5. **No repetition** — Do not paste the English translation as the tafsir. Do not copy Ibn Kathir verbatim at length.
6. **Tone** — Clear, respectful, educational. Not preachy, not academic jargon.
7. **Allah and the Prophet** — Use *Allah*; use ﷺ after the Prophet's titles.
8. **Legal / narrative ayahs** — State the ruling or story clearly; note if application differed among schools only when the source does.

## Output format

Sidecar JSON per surah (`docs/data/ai_tafsir/surah_N.json`):

```json
{
  "surah": 1,
  "ayahs": {
    "1": "**What this ayah teaches:** ...\n\n**Classical tafsir:** ...\n\n**From the Sunnah:** ... (Bukhari)",
    "2": "..."
  }
}
```

Every ayah in the surah must be present. Keys are ayah numbers as strings.
