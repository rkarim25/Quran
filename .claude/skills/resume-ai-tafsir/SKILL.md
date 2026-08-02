---
name: resume-ai-tafsir
description: Resume generating passage-based AI tafsir for the Quran site. Use when the user says "resume AI tafsir", "continue the tafsir", "do the next surah's tafsir", or names a surah to generate tafsir for. Covers the full loop — segment, bundle, draft, verify, apply, validate, build, commit — and knows which surah comes next.
---

# Resume AI tafsir (passage-based)

Generates **passage tafsir**: one commentary per contiguous run of thematically
related ayat, not per ayah. The reader is always told which range a tafsir
covers.

**Read `TAFSIR_PLAN.md` and `PROJECT_STATUS.md` first** if you have no context.

## Non-negotiable rules

These are not style preferences — breaking them corrupts the product.

1. **Never AI-generate hadith.** A hadith may only be cited if it appears in the
   covered ayat's own `## Tafsir Ibn Kathir` / `## Maarif ul Quran` text, with
   the collection named exactly as that text names it. Never invent or complete
   an isnad, wording, or grading. If the source quotes the Prophet ﷺ without
   naming a collection, the teaching may be conveyed but **not** attributed to a
   named collection.
2. **Ground everything** in the passage's own source bundle. Never from memory.
3. **Creed:** mainstream Ahl al-Sunnah; attribute disputed views rather than
   settling them.
4. **"Allah"**, never a standalone "God"; honorific after the Prophet ﷺ.

## Where things stand

- Progress marker: `scripts/tafsir_progress.json` (`format: passage-v2`,
  `completed_surahs: [...]`). **That list is the source of truth for what is done.**
- Published data: `docs/data/passage_tafsir/surah_N.json`.
- Working files (git-ignored): `scripts/_tafsir/surah_N/`.

### Surah priority order (user's choice, 2026-08-02: most-recited / memorized)

```
1 → 36 → 55 → 67 → 18 → 112, 113, 114 → 78–114 (Juz Amma) → 2 → 3 → then the rest
```

Pick the first surah in that order not already in `completed_surahs`, unless the
user names one.

## The loop (per surah N)

Run these in order. Each step gates the next — do not skip a validation.

```bash
python scripts/tafsir_passages.py outline --surah N
```

**Step 2 — segment** (Workflow tool, not the shell):
`scriptPath: scripts/workflows/tafsir_segment.js`
`args: {"surah": N, "dir": "<abs path to scripts/_tafsir/surah_N>", "ayah_count": <count>}`
Writes `passages.json`. Skim the returned passage list — the titles should read
like real themes, not filler.

```bash
python scripts/tafsir_passages.py bundles --surah N
```

This is a **hard gate**: it refuses to proceed unless the segmentation covers
1..ayah_count exactly once with no gaps or overlaps. It prints each bundle's
size. **If any bundle exceeds ~150 KB, split that passage** — the drafting agent
has to read the whole bundle. Edit `passages.json` by hand and re-run.

**Step 4 — draft** (Workflow tool):
`scriptPath: scripts/workflows/tafsir_draft.js`
`args: {"surah": N, "dir": "<abs path>", "passages": <the passages array>}`
For a surah with many passages, run in slices with `"start_index"` and
`"count"` (~12 passages per run) so a usage limit costs less. Each passage is
written to `draft_<a>_<b>.json` the moment it finishes, so completed work always
survives. Re-running only the missing ranges is safe.

```bash
python scripts/tafsir_passages.py apply --surah N
python scripts/tafsir_passages.py validate --surah N   # must exit 0
python scripts/build_site.py --surah N
```

`validate` checks coverage, empty/oversized passages, missing titles, standalone
"God", and — importantly — that every hadith collection named in the tafsir is
also named in the covered ayat's own source text.

**Step 6 — publish.** Update `completed_surahs` in
`scripts/tafsir_progress.json`, bump `DATA_VERSION` in `docs/reader.js` and
`VERSION` in `docs/sw.js`, commit, push, then verify on the live URL with a
cache-bust:
`https://rkarim25.github.io/Quran/?cb=<random>#/N`

## If something goes wrong

- **`bundles` reports gaps/overlaps** — the segmentation agent drifted. Edit
  `passages.json` directly; it is a small, readable file.
- **A passage is missing after `apply`** — its draft file was never written
  (usually a usage limit). Re-run step 4 with just that passage in `passages`.
- **`validate` flags an ungrounded hadith** — do not "fix" it by softening the
  wording. Re-run that passage's draft, or remove the citation.
- **The reader shows nothing** — passage tafsir is a per-surah fetch; confirm
  `docs/data/passage_tafsir/surah_N.json` exists and `DATA_VERSION` was bumped.
