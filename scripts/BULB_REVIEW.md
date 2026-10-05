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

## Batch 2 ? whole-Quran occasion scan (15 additions)

Scanned the `## Tafsir Ibn Kathir` section of every ayah file lacking a bulb
(6,065 files) for revelation-occasion markers; 835 matched, 321 strongly.
Each strong candidate was read against its translation and a bulb written only
where a concrete report changes how the verse is understood. Entries are under
45 words and cite only what the covered ayah's own source section says.

| Ayah | Explanatory gain |
|---|---|
| 2:115 | Answers the Jews' objection to the qiblah change; not a licence to pray in any direction. |
| 2:144 | Why the Prophet ? was looking to the sky: longing for Ibrahim's qiblah while commanded to face Jerusalem. |
| 2:204 | Al-Akhnas bin Shariq: the eloquent professing hypocrite behind the description. |
| 2:219 | First of three stages of wine prohibition, prompted by Umar's prayer for a clear ruling. |
| 2:256 | Ansar children raised among Banu An-Nadir; forbids forced conversion even of one's own children. |
| 2:284 | Companions' distress at accountability for inner thoughts; relief followed in 2:286. |
| 5:33 | The Ukl/Uraynah murder of the shepherd: the penalty targets treacherous banditry. |
| 5:43 | Jews had replaced stoning with flogging and sought a lenient verdict only. |
| 9:80 | "Seventy" is hyperbole; the Prophet ? had prayed over Ibn Ubayy and given his shirt. |
| 20:114 | The Prophet ? repeating with Jibril out of eagerness; Allah guarantees preservation. |
| 24:61 | Social embarrassment about eating with the disabled, which the verse removes. |
| 33:53 | Umar's request to screen the Prophet's wives confirmed by the Verse of Hijab. |
| 47:20 | Believers asked for a fighting surah; sick hearts recoiled when it came. |
| 63:8 | Ibn Ubayy's "fattened dog" remark reported by Zayd bin Arqam. |
| 66:1 | The honey and Maghafir episode behind the Prophet's oath. |

Rejected after reading: 5:90 (its Sa'd/wine quarrel is already implied by 5:91
and 2:219 covers the staged prohibition), 36:12 (Banu Salimah footsteps report
is a virtue narration, not an occasion), 18:9, 25:27, 58:20, 9:73, 54:47-55
(general commentary or already-covered neighbours), and 93:3, 108:2 (duplicates
of existing bulbs on 93:1 and 108:1). 186 ayah-specific bulbs after this batch.

This completes the systematic occasion screen of the whole Quran. Remaining
marker matches are general exegesis, repeated stories already covered, or
reports Ibn Kathir himself presents as weak or disputed; they were deliberately
not added.

## Remaining work

### Memory-nominated, locally verified additions

Memory was used only to nominate candidates; wording and collection names were
checked against each ayah's own Ibn Kathir section and its displayed AI translation.
No independent authentication or grading is claimed.

| Ayah | Additional understanding |
|---|---|
| 2:197 | Yemeni pilgrims' claim of reliance explains the practical command to carry supplies. |
| 2:272 | Hesitation to help polytheist relatives explains the connection between guidance and charity. |
| 3:188 | Concealing an answer while claiming credit explains the praise condemned here. |
| 3:195 | Umm Salamah's question about migration explains the explicit inclusion of women's deeds. |

Already covered and not duplicated: 8:1, 9:118, 18:23, 24:22, 58:1, 80:1.
5:67 was considered but deferred: avoid adding a protection claim without carefully
distinguishing preservation of the mission from immunity to every physical injury.
These additions do not complete the outstanding review of pre-existing bulbs.

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