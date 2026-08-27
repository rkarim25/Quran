# CLAUDE.md — read before touching this repo

Quran study site. Static vanilla-JS front end + Python data pipeline, deployed to
GitHub Pages. **Full detail is in [ARCHITECTURE.md](ARCHITECTURE.md) — read it
before any non-trivial work.**

## Non-negotiable rules (religious integrity)

1. **Never AI-generate hadith.** Cite a hadith ONLY if it appears in the covered
   ayat's own `## Tafsir Ibn Kathir` / `## Maarif ul Quran` text, naming the
   collection exactly as that text names it. **Never invent or complete an isnad,
   wording, or grading.** If a source quotes the Prophet ﷺ without naming a
   collection, convey the teaching but do NOT attribute it to a named collection.
2. **Ground everything** in the passage's own source bundle — never from memory.
   An authentic, famous hadith is still a violation if it is not in *this
   passage's* sources. Saying less is always the correct trade.
3. **Creed:** mainstream Ahl al-Sunnah. Affirm the divine attributes as the Salaf
   did, without likening them to creation and without explaining them away.
   Attribute disputed views rather than settling them.
4. **Language:** always "Allah", never a standalone "God"; honorific after the
   Prophet ﷺ; reverent, warm, plain English.

## Facts that prevent the common mistakes

- **`Quran-obs/Surah_N/Ayah_M.md` is the source of truth.**
  `docs/data/surah_*.json` is build output — never hand-edit it; the deploy
  overwrites it. But `docs/data/ai_wbw/*`, `passage_tafsir/*`, `duas.json`,
  `asbab_nuzul.json`, `hadith_*.json`, `people_*.json`, `timeline.json`,
  `mushaf/*` are **static** and edited directly.
- **Every data change** bumps `DATA_VERSION` in `docs/reader.js` AND `VERSION` in
  `docs/sw.js`, then is verified on the **live URL with a cache-bust**
  (`?cb=<random>`), not localhost.
- **Validators are hard gates.** `python scripts/tafsir_passages.py validate
  --surah N` must exit 0 before publishing tafsir. Word-by-word changes require
  the full 114-surah `validate_wbw.py` loop — a per-file stub scan misses absent
  positions.
- **Parse frontmatter with a YAML parser.** Values wrap onto continuation lines
  (73% of translations do); a `^key:\s*(.*)$` regex silently truncates them.
- **`docs/index.html` holds a one-way `__BUILD_ID__` placeholder.** Confirm it is
  still present before committing that file (`grep -c "__BUILD_ID__"` -> 2).
- **`scripts/_tafsir/`, `scripts/_forms/`** are gitignored working state and hold
  the only copy of finished work until `apply` runs. Never delete mid-run.
- **Legacy — do not follow:** `scripts/LAYERED_TAFSIR_RUNBOOK.md` and the
  per-ayah layered-tafsir scripts describe a design that was discarded.

## Where to start

```bash
python scripts/tafsir_passages.py status   # tafsir state, derived from disk
python scripts/build_site.py --surah N     # rebuild one surah
python scripts/serve.py                    # local server with markdown write-back
```

Operating runbooks: `.claude/skills/resume-ai-tafsir/SKILL.md` (tafsir),
`scripts/WBW_RUNBOOK.md` (word-by-word). Live state and known issues:
ARCHITECTURE.md §8.
