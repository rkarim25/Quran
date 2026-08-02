# HANDOVER

**Read [PROJECT_STATUS.md](PROJECT_STATUS.md) first** — it is the standing
roadmap and single source of truth for what is done and what is pending.
This file only carries the "what to do next" for the immediately following
session.

Timestamp: 2026-08-02 · superseded the 2026-06-24 handover (whose open task —
the 3× blink on refresh — is now diagnosed, fixed, and verified live).

## Next session starts here

**Plan the AI-tafsir redo WITH the user before generating anything.**
`TAFSIR_PLAN.md` holds a draft design plus the user's stated requirements
(passage-based rather than per-ayah; the UI must show which ayah range a
tafsir covers; content depth follows what each passage needs — seerah,
language, or practical). It ends with 5 open questions the user needs to
answer — segmentation source, what to do with the existing 1:1–3:132
per-ayah tafsir, book-view treatment, tone, and priority surahs.
Do not start generation until those are settled.

## State as of this handover

- Everything on `main` is pushed; working tree clean.
- AI word-by-word: **114/114 surahs, all pass `validate_wbw.py`.**
- Blink fix, hadith coverage pass, and repo hygiene: done (details in
  PROJECT_STATUS.md).
- If you touch word-by-word data, re-run the full 114-surah
  `validate_wbw.py` loop — a per-file stub scan misses absent positions.
