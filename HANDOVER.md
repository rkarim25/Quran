# HANDOVER

**Read [PROJECT_STATUS.md](PROJECT_STATUS.md) first** — it is the standing
roadmap and single source of truth for what is done and what is pending.
This file only carries the "what to do next" for the immediately following
session.

Timestamp: 2026-08-02 (rev 2) · superseded the 2026-06-24 handover (whose open
task — the 3× blink on refresh — is now diagnosed, fixed, and verified live).

## Next session starts here

**Generate passage tafsir for the next surah.** Say "resume tafsir" (or invoke
the **`resume-ai-tafsir`** skill — it is installed at USER level, so it works
from any directory and any chat).

First command, always:

```bash
python scripts/tafsir_passages.py status
```

It derives state from disk and prints the exact next command. Next up:
**surah 36 (Yasin)**, then `55 → 67 → 18 → 112,113,114 → 78–114 → 2 → 3 → rest`.

Design and rationale, if you need the "why": `TAFSIR_PLAN.md`.

## State as of this handover

- Everything on `main` is pushed; working tree clean.
- AI word-by-word: **114/114 surahs, all pass `validate_wbw.py`.**
- Passage tafsir: pipeline built, **surah 1 live and validated**. Old per-ayah
  AI Tafsir discarded on the user's instruction (recoverable from git history).
- Blink fix, hadith coverage pass, repo hygiene: done — see PROJECT_STATUS.md.

It then works **surah after surah** in priority order, committing between each,
until paused or out of budget.

**If a session limit hits mid-run, nothing is lost.** Finished passages are
written to disk as they complete. Run `apply` and commit the partial result;
`scripts/tafsir_progress.json` then records `in_progress.<surah>.missing_ranges`,
and `status` next session names exactly what remains.

**To stop it:** say "pause ai tafsir" (or run
`python scripts/tafsir_passages.py pause`). The flag lives in the committed
progress file, so any later session sees PAUSED via `status` and will not restart
on its own. "resume tafsir" clears it and carries on.

## Two traps worth knowing

- **Word-by-word:** if you change WBW data, re-run the full 114-surah
  `validate_wbw.py` loop. A per-file stub scan misses *absent* positions —
  that is how 425 missing entries in surahs 33 and 35 went unnoticed.
- **Never run `python scripts/build_site.py` with no `--surah` and commit
  `docs/index.html` blindly.** It used to consume the `__BUILD_ID__`
  placeholder; that is now guarded to CI only, but check `index.html` still
  contains `__BUILD_ID__` before committing it.
