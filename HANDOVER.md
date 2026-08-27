# HANDOVER

**New to the repo? Read [ARCHITECTURE.md](ARCHITECTURE.md) first** — how the
system works, its invariants and its traps. [PROJECT_STATUS.md](PROJECT_STATUS.md)
is the standing roadmap and task history. This file carries only the "what to do
next" for the immediately following session.

Timestamp: 2026-08-27 · supersedes the 2026-08-02 handover (whose open task —
generating passage tafsir surah by surah — is now complete for all 114 surahs).

## State as of this handover

- **Passage tafsir: COMPLETE, 114/114**, all validate clean. The priority list is
  exhausted; there is no next surah to generate.
- **AI word-by-word: COMPLETE, 114/114**, all pass `validate_wbw.py`.
- Whole corpus re-validated clean at commit `da781099`.
- Working tree clean, `main` in sync with `origin/main`.

## One thing is unfinished, and it is not a code problem

**GitHub Pages deploys have been failing since ~2026-08-27 17:24.** The `build`
job succeeds and the artifact uploads; `deploy-pages` then sits in
`updating_pages` until its 10-minute timeout cancels it. Four consecutive runs
failed the same way.

Ruled out: the Node-24 action upgrade (v4 and v5 have identical timeout defaults,
and v5 deployed successfully once), artifact size (~155 MB deployed fine before),
and a stuck deployment blocking the queue. This looks like a GitHub-side stall.

**Effect: commit `da781099` is pushed but not live** — surah 6 still serves the
pre-fix text. No code change is needed; re-run when Pages recovers:

```bash
gh run list --limit 1 --json databaseId -q '.[0].databaseId' | xargs gh run rerun --failed
```

Then confirm the fix actually landed:

```bash
curl -s "https://rkarim25.github.io/Quran/data/passage_tafsir/surah_6.json?cb=$RANDOM" | grep -c "best of generations"   # expect 0
```

## Sensible next moves (owner to choose)

1. **Land the pending deploy** (above). Do this first.
2. **Semantic verification pass over the tafsir.** The 2026-08-27 audit of
   surahs 2–9 was mechanical: strong on quotation and hadith grounding, but it
   does not cover ungrounded *reasoning* — invented etymologies, misattributed
   glosses, over-reach that is not a quotation. Covering that means running the
   drafting pipeline's own adversarial verifier over already-published passages.
   It is a large agent fan-out, so it needs an explicit go-ahead.
3. **Cleanup.** Empty `docs/data/ai_tafsir/`; the legacy layered-tafsir scripts
   listed in ARCHITECTURE.md §6; and `Quran-obs/Surah_2/Ayah_126.md`, the one
   remaining file with discarded `## What it teaches` / `## The scholars` sections.
4. **Feature work.** ARCHITECTURE.md §10 has the end-to-end recipe.

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
