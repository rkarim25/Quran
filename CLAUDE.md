# CLAUDE.md — read before touching this repo

Quran study site. Static vanilla-JS front end + Python data pipeline, deployed to GitHub Pages. **Full detail is in [ARCHITECTURE.md](ARCHITECTURE.md) and [AGENTS.md](AGENTS.md) — read them before any non-trivial work.**

## Non-negotiable rules (religious integrity)

1. **Never AI-generate hadith.** Cite a hadith ONLY if it appears in the covered ayah's own `## Tafsir Ibn Kathir` / `## Maarif ul Quran` text, naming the collection exactly as that text names it. **Never invent or complete an isnad, wording, or grading.** If a source quotes the Prophet ﷺ without naming a collection, convey the teaching but do NOT attribute it to a named collection.
2. **Ground everything** in the passage's own source bundle on disk — never from memory. An authentic, famous hadith is still a violation if it is not in *this passage's* sources. Saying less is always the correct trade.
3. **Creed:** mainstream Ahl al-Sunnah. Affirm the divine attributes as the Salaf did, without likening them to creation and without explaining them away. Attribute disputed views rather than settling them.
4. **Language:** always "Allah", never a standalone "God"; honorific after the Prophet ﷺ; reverent, warm, plain English.

## Facts that prevent the common mistakes

- **`Quran-obs/Surah_N/Ayah_M.md` is the source of truth.** `docs/data/surah_*.json` is build output — never hand-edit it; the deploy overwrites it. But `docs/data/ai_wbw/*`, `passage_tafsir/*`, `duas.json`, `asbab-nuzul.json`, `hadith_*.json`, `people_*.json`, `timeline.json`, `mushaf/*` are **static** and edited directly.
- **Audio recitation invariants:**
  * Arabic strictly **Mishary Rashid Alafasy** (EveryAyah 128kbps stereo + Verses fallback).
  * English strictly authentic human studio recording by **Ibrahim Walk** (192kbps MP3 + Islamic Network fallback). Zero mechanical TTS.
  * Audio synchronizes with display mode: Book View plays paragraph blocks; Verse View plays ayah by ayah.
  * Word tooltip includes `▶ Start Listen` to begin continuous recitation from that exact ayah.
  * Streaming audio hosts must remain in `NETWORK_ONLY_HOSTS` in `docs/sw.js`.
- **Asbāb al-Nuzūl (Occasions of Revelation):**
  * Light bulb button (`💡 Background`) next to translation renders micro-card popup with verified historical context (`docs/data/asbab-nuzul.json`).
  * Must add *crucial context* that English translation alone cannot achieve; never duplicate the translation.
- **User Reflection Pen Badges (`✎ Note`):**
  * Ayahs with reflections automatically show an emerald `✎ Note` button next to `💡 Background` across all reading views.
  * Draggable floating launcher (`#tadabbur-fab`) on all views offers "Personal Reflection" vs "Addressed to AI".
  * Notes flagged for AI (`forAi: true`, `#ai`) can be copied as a prompt via "📋 Copy AI Notes" or assessed via the `check-quran-site` skill.
- **Synchronized Cross-Language Verse Highlighting:**
  * Highlighting Arabic auto-highlights English/AI translations and transliteration (and vice-versa) across Verse, WBW, and Book views.
  * Highlights persist in `localStorage` under `quran-highlights` and sync to Firestore.
  * Selecting text pops up `[🖍 Highlight]`, `[✎ Note]`, `[▶ Listen]`.
- **Every data change** bumps `reader.js?v=XX` and `reader.css?v=YY` in `docs/index.html` AND `VERSION` in `docs/sw.js`, then is verified on the **live URL with a cache-bust** (`?cb=<random>`), not localhost.
- **Validators are hard gates:** `node scripts/check-site.js` must exit 0 (17/17 tests). `python scripts/tafsir_passages.py validate --surah N` must exit 0 before publishing tafsir.
- **Parse frontmatter with a YAML parser.** Values wrap onto continuation lines (73% of translations do); a `^key:\s*(.*)$` regex silently truncates them.
- **`docs/index.html` holds a one-way `__BUILD_ID__` placeholder.** Confirm it is still present before committing that file (`git grep -c "__BUILD_ID__" docs/index.html` -> 2).

## Where to start

```bash
node scripts/check-site.js                 # full automated health & audio & notes audit
python scripts/tafsir_passages.py status   # tafsir state, derived from disk
python scripts/build_site.py --surah N     # rebuild one surah
python scripts/serve.py                    # local server with markdown write-back
```

Operating runbooks: `.claude/skills/check-quran-site/SKILL.md` (site audit & notes),
`.claude/skills/resume-ai-tafsir/SKILL.md` (tafsir),
`scripts/WBW_RUNBOOK.md` (word-by-word). Live state and known issues:
[ARCHITECTURE.md](ARCHITECTURE.md) §8.
