# Background bulb review — verified deployment batch

## Scope and limits

Inventoried all 114 surahs and 164 original ayah-specific bulbs. Ran a
keyword-based background/context screen across all 114 passage-tafsir files.
This is a whole-Quran screening, **not** a completed line-by-line review of
all ayahs or authentication of all existing bulbs. No bulb is required merely
to give a surah coverage. Unchanged entries have not been certified.

## Editorial threshold

Add only a short historical fact or interpretive distinction substantially
beyond the translation. Prefer 25–45 words and a complete popup without
expansion. Verify claims in the covered ayah's own classical source section.
Do not label general commentary as an occasion of revelation. The current UI
does not distinguish these categories, so this batch adds only occasions.

## Verified changes

All paths below are relative to the repository root. Evidence is in each
file's `## Tafsir Ibn Kathir` section; translations were compared against the
corresponding built surah data.

| Ayah | Change | Source file | Evidence / explanatory gain |
|---|---|---|---|
| 2:143 | Add | Quran-obs/Surah_2/Ayah_143.md | Al-Bara's report: concern for Muslims who died before the qiblah changed; previous prayers remained valid. |
| 2:158 | Shorten and sharpen | Quran-obs/Surah_2/Ayah_158.md | Aishah corrects the inference that “no sin” makes omission permissible; hesitation arose from former Manat worship. |
| 2:187 | Add | Quran-obs/Surah_2/Ayah_187.md | Qays bin Sirmah fell asleep awaiting food and lost consciousness the following day; explains the relaxation of earlier restrictions. |
| 4:19 | Add | Quran-obs/Surah_4/Ayah_19.md | Ibn Abbas's report in Al-Bukhari explains relatives' control over a widow's marriage. |
| 62:11 | Add | Quran-obs/Surah_62/Ayah_11.md | Jabir's report identifies the caravan, Friday sermon, and twelve remaining men. |
| 2:199 | Add | Quran-obs/Surah_2/Ayah_199.md | Aishah's report in Al-Bukhari explains the Hums' separate pilgrimage practice and the command to stand at Arafat. |
| 2:220 | Add | Quran-obs/Surah_2/Ayah_220.md | Ibn Abbas's report explains separated meals and spoiled leftovers behind the permission to mix household provisions. |
| 5:101 | Add | Quran-obs/Surah_5/Ayah_101.md | Ali's report illustrates the risk of additional obligations through repeated questions about annual Hajj. No independent grading is asserted. |

Seven additions and one revision in total; 171 ayah-specific bulbs after this
batch. A further candidate concerning the necklace and purification at 4:43
was not added because that ayah already has a bulb and this batch avoids
overloading it. The 83:1 trading context was not selected: its explanatory
gain over the passage's explicit condemnation of short measure was weaker.

## Remaining work

- Complete human-readable, source-by-source review of every existing bulb.
- Evaluate further candidates without treating keyword matches as verification.
- Check repeated bulbs within a single story and reports presented more
  confidently than their classical sources warrant.
- Review the separate `__setting_*` surah introductions; these were not edited.
- If adding conceptual insights, introduce an explicit category and matching
  UI label rather than misclassifying them as occasions of revelation.

`python scripts/validate_bulb_review.py` checks JSON uniqueness, references,
the edited entries' size, and the continued presence of their source evidence.
It is a regression check, not an automated scholarly authenticity judgment.