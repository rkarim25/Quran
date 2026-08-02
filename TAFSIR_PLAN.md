# AI Tafsir redo — passage-based design (DRAFT for discussion)

> **Status: DRAFT — do NOT start generation.** The user wants to plan this in
> detail together first (their words, 2026-07-31). This doc captures the
> requirements, a proposed design, and the open questions to settle with the
> user. Any session picking this up: read this + `PROJECT_STATUS.md`, then
> discuss with the user before executing anything.

## What the user asked for (2026-07-31, verbatim intent)

1. **Per-ayah tafsir makes no sense** — tafsir should cover **chunks (passages)
   of related ayahs**, because meaning lives in the passage.
2. When the reader opens an ayah and asks for AI tafsir, it must be **clear
   which section/range the tafsir covers** — not implied to be about that one
   ayah alone.
3. Objective: **"everything you need to get a deeper understanding of the
   ayat."** Flexibly weighted per passage: sometimes seerah/context is the key,
   sometimes deep Arabic-language nuance, sometimes practical application.
   Depth follows the passage, not a fixed template.
4. Redo it **all together** (one coordinated effort, not the drip-feed
   scheduled routine that reached only 3:132).

## Current state (what exists)

- Old format: per-ayah 5-layer blocks (`Essence / What it teaches / The
  scholars / From the Sunnah / Reflection`) written into `## AI Tafsir` in
  each `Quran-obs/Surah_N/Ayah_M.md`; complete only through **surah 3:132**
  (`scripts/tafsir_progress.json`, format `layered-v1`).
- Reader shows `ay.ai_tafsir` per ayah in the study drawer (`docs/reader.js`
  ~line 1107, 1169) and in book view.
- Grounding sources per ayah are IN the md file already: `## Tafsir Ibn
  Kathir` + `## Maarif ul Quran` (+ `## Tafsir Summary`).
- Hard rules that carry over unchanged (`scripts/LAYERED_TAFSIR_RUNBOOK.md`):
  ground strictly in the ayah's own source file; hadith ONLY if present in
  that file's Ibn Kathir/Maarif text with collection named as the source names
  it; never invent isnad/wording/grading; mainstream Ahl al-Sunnah creed;
  "Allah" not standalone "God"; honorific after the Prophet ﷺ.

## Proposed design (to review with the user)

### Passage segmentation
Candidate strategies — **pick one with the user**:
- **A. Ibn Kathir's own blocks.** The source tafsir already groups ayahs
  (e.g. surah 79 = blocks 1–14, 15–26, 27–33, 34–46). Pros: segmentation is
  itself source-grounded, aligns perfectly with the grounding text; zero
  invented structure. Cons: blocks are sometimes long.
- **B. Classical rukūʿ divisions** (~556 sections). Pros: traditional,
  well-defined. Cons: not aligned with either source's commentary blocks.
- **C. AI-proposed thematic segmentation** with per-surah review. Pros: can
  be finer-grained. Cons: invented structure; more to verify.
- Recommendation: **A**, split overly long blocks at natural sub-themes when
  needed (splits noted in the passage title).

### Data model
- New static file per surah: `docs/data/ai_tafsir/surah_N.json`:
  `{ "passages": [ { "start": 1, "end": 5, "title": "<short passage theme>",
  "tafsir": "<markdown>" }, ... ] }` (every ayah covered by exactly one passage).
- Reader: ayah → passage lookup; the AI Tafsir block header shows e.g.
  **"This tafsir covers 2:1–5 · <theme>"**; same content shown from any ayah
  in the range. (Small `reader.js` change + CSS; keep old per-ayah field as
  fallback until cutover, then remove.)
- Source of truth: passage files are generated FROM the md sources; whether
  the passage text is also mirrored into the md files is an open question
  (leaning: no — passages span ayahs, md files are per-ayah; keep passage
  tafsir as its own static data like `ai_wbw`).

### Content shape (flexible, not a rigid template)
Always: 1–2 sentence **essence** of the passage + **why these ayahs belong
together**. Then whatever the passage genuinely needs, drawn from the sources:
- **Context/seerah** — when the sources give occasion/setting (asbab data can
  be cross-referenced from `asbab_nuzul.json` — same grounding rules).
- **Language** — key Arabic terms/nuances the sources unpack (can also lean on
  the intrinsic WBW analyses for morphology, clearly as language notes).
- **The scholars** — attributed classical commentary (Ibn Kathir / Maarif /
  named salaf) where it adds depth.
- **From the Sunnah** — only hadith present in the covered ayahs' source files,
  collection named as the source names it.
- **Living it** — practical application when the passage is practical.
Length: whatever genuine helpfulness requires; runaway guard ~4500 chars/passage.

### Pipeline (per surah)
1. **Segment**: derive passage ranges from the Ibn Kathir blocks in the md
   files (script, not LLM), human-reviewable JSON.
2. **Draft** (workflow): one agent per passage — reads ALL md files in the
   range, writes the passage tafsir.
3. **Verify** (adversarial): grounding check — every claim/hadith traceable to
   the source files; range coherence; creed rules; flags → finalize agent.
4. **Apply + validate**: scripts to write `docs/data/ai_tafsir/surah_N.json`,
   validate every ayah covered exactly once, all cited hadith present in
   sources (string-match spot checks).
5. Progress in `scripts/tafsir_progress.json` (new format `passage-v2`),
   commit in surah batches; bump DATA_VERSION + SW VERSION per push.

### Scale estimate
~6,236 ayahs → roughly 1,200–1,800 passages (Ibn Kathir blocks). At 3 agents
per passage worst-case this is a multi-session effort; the per-surah loop is
resumable at any point.

## Open questions for the user

1. Segmentation source: Ibn Kathir blocks (recommended) / rukūʿ / AI thematic?
2. Discard the existing per-ayah AI tafsir (1:1–3:132) once passages cover
   those surahs, or keep both visible during transition?
3. Should passage tafsir also appear in the printed/book view the way per-ayah
   tafsir does now?
4. Reading level/tone: keep the current reverent plain-English register?
5. Any surahs to prioritize first (e.g. ones the user is currently studying)?
