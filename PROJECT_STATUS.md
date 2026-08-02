# PROJECT STATUS — single source of truth for any session

> **Purpose:** any chat/session can read this file and continue the work with zero
> context loss. **Update this file whenever a task's state changes.** Keep
> HANDOVER.md for session-specific handoffs; this file is the standing roadmap.

Last updated: 2026-08-02

## The site

- **Repo:** `C:/Users/Reza Karim/OneDrive/Quran-Project` — git, branch `main`, remote `github.com/rkarim25/Quran`.
- **Live:** https://rkarim25.github.io/Quran/#/ — GitHub Pages, deployed by `.github/workflows/pages.yml` on push to `main` (runs `scripts/build_site.py`, publishes `docs/`). PWA (`docs/sw.js`).
- **Source of truth for verse text/translations/tafsir = `Quran-obs/Surah_N/Ayah_M.md` frontmatter + sections.** `docs/data/surah_*.json` is build OUTPUT — never fix content there; the deploy rebuilds it from markdown.
- Static data NOT rebuilt by build_site: `docs/data/ai_wbw/*`, `duas.json`, `asbab_nuzul.json`, `hadith_index.json`, `hadith_map.json`, `people_*.json`, `timeline.json` — edits to these deploy directly.
- **Every data change:** bump `DATA_VERSION` in `docs/reader.js` (~line 330) AND `VERSION` in `docs/sw.js` (line 12), push, then verify on the LIVE url with a cache-bust (`?cb=<rand>`).
- **Hard rule (standing):** NEVER AI-generate hadith text, isnad, or gradings. Hadith/isnad must be extracted from real sources (the ayah's own Ibn Kathir / Maarif text, sunnah.com). If no authentic narration exists, say so / omit.

## Task board

### 1. 3× blink on page refresh — DONE (commit `9706fdc3`, 2026-07-31)
**Diagnosis:** NOT multiple document loads (verified live: exactly 1 navigation
per refresh; no `controllerchange` reload exists; build.json reload is guarded
to once/session). The blinks were **full re-renders for signed-in users**:
Firebase `onAuthStateChanged` pull → `onMerged` → `render()`, then `boot()`'s
own awaited pull → `render()` again, then `boot()`'s explicit `render()`.
**Fix:** render local content immediately (sync never delays first paint);
concurrent pulls coalesce to one in-flight promise; `onMerged` gets a
`changed` flag and skips re-render on no-op pulls; post-render sync failure
logs instead of nuking the app. reader.js v62, firebase-sync.js v29,
SW `2026-07-31a`. **Verified live** (build `9706fdc3` serving).

### 2. AI word-by-word — **COMPLETE: 114/114 surahs, all validate clean** (2026-08-02)
The 13 missing surahs (22, 23, 24, 29, 42, 47, 60, 70, 71, 72, 75, 76, 77) are
done. While finishing them, a full-corpus audit found and fixed **more than the
original gap**:
- **388 raw stub positions** in surahs 25, 64, 65, 66 — files were marked
  complete but held unanalysed `{ar,tr,gloss}` stubs, which had also poisoned the
  rebuilt form cache (312 corrupt entries, purged).
- **425 entirely missing positions** in surahs 33 (323) and 35 (102) — absent
  entries, invisible to a stub scan; only the full `validate_wbw.py` sweep
  caught them.
**Verification gate that should be re-run after any WBW change:** loop
`validate_wbw.py` over all 114 surahs — currently *all 114 pass*. A per-file
stub scan is NOT sufficient (it misses absent positions).
Process = `scripts/WBW_RUNBOOK.md` (global form cache; extract → Workflow
`scripts/workflows/ai_wbw_pipeline.js` → assemble → apply → validate → build →
commit). Cache `scripts/_forms/_wbw_cache.json` is git-ignored — rebuild first in
any new session: `python scripts/rebuild_wbw_cache.py` (now 18,642 forms).
The pipeline writes crash-safe `part_NNN.json` files into the surah dir; pass
`--analyses scripts/_forms/surah_N/part_*.json` to assemble_wbw.py. **After any
gap re-run, re-run `extract_forms.py` before assembling** — see the runbook's
"Gap re-runs" section (a stale `asm.json` snapshot silently drops analyses).

### 3. Hadith links for 8 surahs — DONE (deliberate conclusion, 2026-07-31)
Surahs **71, 72, 79, 94, 100, 103, 104, 106**: a strict re-extraction pass
(8 parallel agents, full raw Ibn Kathir English text per surah, marfu'-only +
named-collection-required rules) found **zero qualifying hadith in all 8** —
this is a verified conclusion, not an omission. The abridged Ibn Kathir either
quotes marfu' fragments with NO named collection (94: two prayer hadith marked
only "agreed-upon"; 71: family-ties/lifespan; 72 & 79: the Jibril "questioned
knows no more" fragment "recorded in the Sahih" without saying which; 100: the
dawn-raid practice) or contains only mawquf/Tabi'i/scholar material (103, 104,
106; 71's Bukhari idol report is Ibn Abbas's own statement). Old unsourced
entries in `scripts/_context_out/` for 71/72/79/94 were overwritten with honest
empties. `docs/data/*` unchanged — nothing qualified.
**Optional future follow-up (user to decide):** those known marfu' fragments do
exist in real collections; a sunnah.com extraction pass with exact references
could add them legitimately (extract-from-real-source, never from memory).

### 4. Repo hygiene — DONE (2026-07-31)
`ai_wbw_pipeline.js` (crash-safe part files), `wbw_all_surahs.js`,
`_validate_data.py`, this doc and `.claude/launch.json` are committed;
one-off scratch helpers (`_check_*`, `_fix_*`, `_inspect_*`), regenerable
caches (`_canon_qpc.json`) and run logs (`generate_asbab_log.txt`) are
gitignored.

### 5. AI TAFSIR FULL REDO — NEXT MAJOR PROJECT (user request 2026-07-31)
User wants the layered AI tafsir redone **all together** (not the slow scheduled
trickle). Current state: layered-v1 format complete only through **surah 3:132**
(`scripts/tafsir_progress.json`); the rest is older/absent.
Format + hard rules: `scripts/LAYERED_TAFSIR_RUNBOOK.md` (5 layers: Essence /
What it teaches / The scholars / From the Sunnah / Reflection; grounded STRICTLY
in the ayah's own source file; hadith only if present in that file's Ibn
Kathir/Maarif text). Existing workflow: `scripts/workflows/layered_tafsir_pipeline.js`.
Apply: `scripts/apply_layered_tafsir.py` · validate: `scripts/validate_ai_tafsir.py`.
**User requirements (2026-07-31, plan in detail WITH the user before executing):**
- **Passage-based, not per-ayah:** tafsir should cover coherent thematic chunks
  (an ayah range), not isolated single ayahs — per-ayah repetition of the same
  passage context makes no sense.
- **Clear range attribution in the UI:** opening AI tafsir from any ayah must
  clearly show WHICH section/range the tafsir covers (e.g. "This tafsir covers
  2:1–5"), not imply it is about that one ayah.
- **Objective:** "everything you need to get a deeper understanding of the
  ayat" — flexibly drawing on seerah/context where that is the key, deep Arabic
  language nuance where that is the key, practical application where that fits.
  Depth follows what the passage needs, not a fixed template.
- Existing hard rules still apply (grounding, no invented hadith, creed —
  see `scripts/LAYERED_TAFSIR_RUNBOOK.md`).
**Plan doc to create: `TAFSIR_PLAN.md`** — passage segmentation strategy, data
model (range-keyed, ayah→range lookup), UI change, batching, verification,
progress tracking. DO NOT start generation before the plan is agreed with the user.

## Done (verified live) — for context

- Arabic glyph fix: entire Quran + word-by-word reconciled to canonical
  `qpc_uthmani_hafs`; markdown SOURCE fixed (commit `a0fc076f`), verified live.
- Occasions of revelation: all 114 surahs, 1,476 entries (`asbab_nuzul.json`).
- Isnad chains: 690/690 hadith in `hadith_index.json` have isnad.
- Duas page canonical text + green underline fix.
- Tadabbur quick-note launcher (commit `ffe1f388`).

## Key files quick-ref

| What | Where |
|---|---|
| Verse/translation/tafsir source | `Quran-obs/Surah_N/Ayah_M.md` |
| Build source→docs/data | `scripts/build_site.py` (+ `md_io.py`) |
| Reader app | `docs/reader.js` (DATA_VERSION ~330), `docs/index.html`, `docs/sw.js` (VERSION line 12) |
| WBW pipeline | `scripts/WBW_RUNBOOK.md`, `scripts/workflows/ai_wbw_pipeline.js`, `extract_forms.py`, `assemble_wbw.py`, `apply_ai_wbw.py`, `validate_wbw.py`, `rebuild_wbw_cache.py` |
| Tafsir pipeline | `scripts/LAYERED_TAFSIR_RUNBOOK.md`, `scripts/workflows/layered_tafsir_pipeline.js`, `apply_layered_tafsir.py`, `validate_ai_tafsir.py`, `tafsir_progress.json` |
| Context pipeline | `scripts/generate_asbab.py`, `add_isnad.py`, `merge_context.py` |
