# PROJECT STATUS — standing roadmap and task history

> **Read [ARCHITECTURE.md](ARCHITECTURE.md) first** if you are new to the repo —
> it covers how the system works: data flow, pipelines, invariants and traps.
> This file is the complement: what has been done, why, and what is pending.
> **Update it whenever a task's state changes.** `HANDOVER.md` carries only the
> next-session handoff.

Last updated: 2026-08-27 (passage tafsir COMPLETE, 114/114; CI moved off Node 20;
quality pass on surahs 2-9)

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

### 5. AI TAFSIR REDO — **COMPLETE: 114/114 surahs published and validated** (2026-08-27)
**Continue with the `resume-ai-tafsir` skill** (`.claude/skills/`), which holds
the operational loop. Design + rationale: `TAFSIR_PLAN.md`.
- All five design questions answered by the user 2026-08-02. Segmentation is
  **AI thematic** (Ibn Kathir's own blocks measured out as unusable: 1 block for
  all of surah 94/100/112 but 173 across surah 2's 286 ayat).
- Old per-ayah AI Tafsir **discarded entirely** — stripped from all 6,236 md
  files, sidecars deleted (commit `e850982b`, recoverable from git history).
- New section: `docs/data/passage_tafsir/surah_N.json`, shown with a range badge
  and scope line in the study drawer, inline, book and print views.
- **All 114 surahs published and validated.** The priority order
  (`1 → 36 → 55 → 67 → 18 → 112,113,114 → 78–114 → 2 → 3 → rest`) is exhausted.
- 2026-08-27 quality pass on surahs 2–9: fixed a frontmatter truncation bug that
  had been feeding cut-off ayat to the drafting agents, and removed one
  ungrounded hadith at 6:4-11. Details in ARCHITECTURE.md §8.
- Verification gate: `python scripts/tafsir_passages.py validate --surah N`
  must exit 0 (coverage + hadith grounding + creed/style checks).

<details><summary>Original request (2026-07-31) — kept for context</summary>
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
</details>

## Done (verified live) — for context

- Arabic glyph fix: entire Quran + word-by-word reconciled to canonical
  `qpc_uthmani_hafs`; markdown SOURCE fixed (commit `a0fc076f`), verified live.
- Occasions of revelation (`asbab_nuzul.json`). Verified on disk 2026-08-27:
  1,186 ayah-level entries across 85 surahs + one `__setting_*` context group
  per surah (114). (An earlier note here said "all 114 surahs, 1,476 entries";
  that does not match the current file.)
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
