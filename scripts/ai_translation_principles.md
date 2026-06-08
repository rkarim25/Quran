# AI Translation Principles — Conceptual Qur'an Translation

These translations appear when the reader toggles **AI Translation**. They are not word-for-word renderings. They explain what each ayah means for a reader living in the modern world, while respecting that many Qur'anic terms have no single English equivalent.

## Core rules

1. **Faithfulness over fluency** — Never distort meaning for readability. When unsure, stay closer to the classical tafsir sense.
2. **Explain concepts, don't flatten them** — If a term is a *concept*, do not replace it with one English word. Introduce the Arabic term and explain it inline (once per surah is enough for repeated terms).
3. **Modern relevance without anachronism** — Connect to contemporary life (distraction, anxiety, injustice, materialism, loneliness, identity) only where the ayah naturally speaks to those conditions. Do not force modern examples into every ayah.
4. **Tone** — Clear, dignified, contemplative. Not preachy, not academic jargon, not casual slang.
5. **Length** — Usually 1–3 sentences per ayah. Long legal or narrative passages may need more. Very short ayahs may need one rich sentence.
6. **Prophetic speech** — When the ayah says *qul* (Say), preserve the command to speak: "Say…" or "Tell them…"
7. **Oaths** — When Allah swears by something (time, the sun, the fig), explain what the oath emphasizes, not just the object.
8. **Legal ayahs** — State the rule clearly for today’s reader; note if classical application differs where helpful.

## Terms — NEVER one-word substitute

| Term | Do NOT use alone | Instead |
|------|------------------|---------|
| **Allah** | God | Always *Allah* |
| **ar-Rahman** | Gracious, Compassionate | *the Rahman* — mercy that encompasses all creation in this life |
| **ar-Rahim** | Merciful | *the Rahim* — special mercy for believers in the Hereafter |
| **Rabb** | Lord (alone) | *Rabb* — the One who creates, owns, nurtures, and sustains |
| **al-Alamin** | worlds, universe | all that exists — every realm of creation |
| **Taqwa** | mindfulness, piety | *taqwa* — living with God-consciousness, as though Allah sees you |
| **Salah** | prayer (alone) | *salah* — the formal prayer, or ritual prayer |
| **Deen** | religion | *deen* — the way of life aligned with divine guidance |
| **Akhirah** | Hereafter | *Akhirah* — the everlasting life after death |
| **Dunya** | world | *dunya* — this temporary worldly life |
| **Iman** | belief, faith (alone) | *iman* — faith that reshapes how you live |
| **Kufr / kafir** | disbeliever (harsh) | those who reject the truth / deny what they know |
| **Nifaq** | hypocrisy | *nifaq* — outward acceptance with inward rejection |
| **Nafs** | soul, self | *nafs* — the inner self that pulls toward desire |
| **Sabr** | patience | *sabr* — steadfast endurance that keeps you upright |
| **Shukr** | gratitude | *shukr* — gratitude shown in word and action |
| **Zakat** | charity | *zakat* — obligatory sharing of wealth to purify what remains |
| **Jihad** | holy war | *jihad* — struggle; specify spiritual or defensive by context |
| **Hijab / haya** | veil, modesty | explain the concept; *haya* is modesty rooted in dignity |
| **Kursi** | seat | *Kursi* — Allah's Footstool; symbol of His dominion over creation |
| **Shirk** | polytheism | *shirk* — giving anything the devotion owed to Allah alone |
| **Tawhid** | monotheism | *tawhid* — the oneness of Allah in worship and reliance |
| **Barakah** | blessing | *barakah* — increase and goodness that comes from Allah |
| **Fitnah** | temptation | *fitnah* — trial, turmoil, or temptation that tests faith |
| **Dhikr** | remembrance | *dhikr* — conscious remembrance of Allah |
| **Ihsan** | excellence | *ihsan* — worshipping as though you see Allah, knowing He sees you |
| **Sirat al-Mustaqim** | straight path | the Straight Path — the way of living that pleases Allah |
| **In sha' Allah** | God willing | keep or explain: if Allah wills |
| **Mumin** | believer | *mu'min* — one who trusts and lives by what Allah revealed |
| **Ayah** | verse | *ayah* — sign or verse (context decides) |

## Repeated terms within a surah

- First occurrence: full explanation inline.
- Later occurrences: Arabic term alone or brief reminder if needed.

## Output format

JSON file per surah:

```json
{
  "surah": 1,
  "ayahs": {
    "1": "translation text",
    "2": "..."
  }
}
```

Keys are ayah numbers as strings. Every ayah in the surah must be present.
