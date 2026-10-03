# HANDOVER

**New to the repo? Read [ARCHITECTURE.md](ARCHITECTURE.md) first** — how the
system works, its invariants and its traps. [PROJECT_STATUS.md](PROJECT_STATUS.md)
is the standing roadmap and task history. This file carries only the "what to do
next" for the immediately following session.

Timestamp: 2026-10-03 · supersedes earlier handovers.

## State as of this handover

- **Full Audio Recitation & Studio Narration:** Complete recitation by **Mishary Rashid Alafasy** (Arabic) and authentic human studio narration by **Ibrahim Walk** (English, 192kbps MP3). Synchronized across Book view (paragraph chunks) and Verse view (sentence by sentence). Zero robotic TTS.
- **Hovering Note System & AI Requests:** The draggable hovering note button (`✎`) supports dual modes: "Personal Reflection" vs "Addressed to AI" (`forAi: true`, `target: "ai"`). In `#/tadabbur`, AI notes are filterable via `[🤖 For AI]`, and a 1-click **"📋 Copy AI Notes"** button generates a complete markdown prompt for AI models.
- **Skill & Telemetry (`check-quran-site`):** Dedicated cross-AI skill implemented in `.agents/skills/check-quran-site/`, `.claude/skills/check-quran-site/`, and global Antigravity config. Backed by `node scripts/check-site.js` and `python scripts/check_quran_site.py` (17/17 automated health checks passing).
- **All documentation updated:** `AGENTS.md` (root guidelines for all AI agents), `CLAUDE.md`, `ARCHITECTURE.md`, `README.md`, `HANDOVER.md`.
- **Passage tafsir:** COMPLETE, 114/114.
- **AI word-by-word:** COMPLETE, 114/114.

## Everything is landed and live

The Pages deploy failures seen earlier on 2026-08-27 have cleared. `deploy-pages`
had been stalling in `updating_pages` past its timeout for four consecutive runs;
it recovered on its own, and commit `da781099` deployed successfully. Verified
live: the ungrounded hadith removed at 6:4-11 no longer appears in
`data/passage_tafsir/surah_6.json`.

If the same stall recurs, re-run the failed job rather than changing config —
the cause was on GitHub's side, not in this repo:

```bash
gh run list --limit 1 --json databaseId -q '.[0].databaseId' | xargs gh run rerun --failed
```

## Sensible next moves (owner to choose)

1. **Semantic verification pass over the tafsir.** The 2026-08-27 audit of
   surahs 2–9 was mechanical: strong on quotation and hadith grounding, but it
   does not cover ungrounded *reasoning* — invented etymologies, misattributed
   glosses, over-reach that is not a quotation. Covering that means running the
   drafting pipeline's own adversarial verifier over already-published passages.
   It is a large agent fan-out, so it needs an explicit go-ahead.
2. **Cleanup.** Empty `docs/data/ai_tafsir/`; the legacy layered-tafsir scripts
   listed in ARCHITECTURE.md §6; and `Quran-obs/Surah_2/Ayah_126.md`, the one
   remaining file with discarded `## What it teaches` / `## The scholars` sections.
3. **Feature work.** ARCHITECTURE.md §10 has the end-to-end recipe.

## Traps worth re-reading before you touch anything

Full list in ARCHITECTURE.md; these are the ones that have actually bitten:

- **Word-by-word:** after any WBW change, run the full 114-surah
  `validate_wbw.py` loop. A per-file stub scan misses *absent* positions — that
  is how 425 missing entries in surahs 33 and 35 went unnoticed.
- **`docs/index.html`** holds a one-way `__BUILD_ID__` placeholder. It is now
  stamped only in CI, but check it is still there before committing that file.
- **Parse frontmatter with a YAML parser.** Values wrap onto continuation lines;
  a single-line regex silently truncated 73% of translations for the tafsir
  pipeline until it was fixed on 2026-08-27.
- **Validator flags are not automatically fabrications.** Check the source first —
  the OCR'd texts spell collection names oddly and sometimes name them only in
  Arabic script. Three of four flags in the last audit were false positives.
