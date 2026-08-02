# AI Tafsir redo — passage-based design (DECIDED, in progress)

> **Status: AGREED AND BUILDING.** All five open questions were answered by the
> user on 2026-08-02 (recorded below). The pipeline is built and surah 1 is
> published. To continue, use the **`resume-ai-tafsir` skill** — it holds the
> operational loop. This doc holds the *design and rationale*.

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

### Passage segmentation — DECIDED: AI thematic

**The user chose AI thematic, and measurement confirmed it was right.** My
initial recommendation (use Ibn Kathir's own commentary blocks) was wrong, and
the data killed it. Counting distinct Ibn Kathir blocks per surah in the md
sources:

| Surah | Ayat | Distinct Ibn Kathir blocks |
|---|---|---|
| 94 | 8 | **1** (whole surah) |
| 100 | 11 | **1** |
| 112 | 4 | **1** |
| 55 | 78 | 8 |
| 67 | 30 | 6 |
| 36 | 83 | 21 |
| 18 | 110 | 43 |
| **2** | **286** | **173** (≈1.65 ayat each — nearly per-ayah) |

So the abridgement is not a segmenter at all: it lumps short surahs into a
single block while splitting al-Baqarah almost per-ayah — reintroducing exactly
the per-ayah repetition this redo exists to remove. Rukūʿ divisions were
rejected for the same reason in reverse: they ignore where the commentary
actually breaks.

**Mitigating the "invented structure" risk** (the one real cost of AI thematic):
1. Segmentation is proposed by one agent, then **adversarially reviewed** by a
   second that attacks coverage, split narratives, incoherent bundles, size, and
   vague titles, and returns a corrected list.
2. `tafsir_passages.py bundles` is a **hard deterministic gate**: it refuses to
   proceed unless every ayah is covered exactly once, ascending, no gaps or
   overlaps.
3. `passages.json` is a small human-readable artifact — editable by hand before
   any drafting cost is incurred.

### Data model — BUILT
- `docs/data/passage_tafsir/surah_N.json`:
  `{ "surah": N, "format": "passage-v2", "passages": [ { "start", "end",
  "title", "tafsir" } ] }` — every ayah covered by exactly one passage.
- Static data like `ai_wbw`, **not** mirrored back into the md files (passages
  span ayahs; md files are per-ayah) and therefore not rebuilt by `build_site.py`.
- Reader: ayah → passage lookup, then a range badge plus a scope line —
  *"This tafsir covers ayat 1:1–4 — read as one passage"*. Rendered **once per
  passage, on its first ayah** in the inline and book views, so it never repeats
  under every ayah of the range. In the study panel (opened from one specific
  ayah) it shows wherever in the range you are, with the range stated, so it can
  never be mistaken for single-ayah commentary.
- Anyone who had the old per-ayah "AI Tafsir" toggle on is migrated to
  "Passage Tafsir" on first load, so commentary does not silently disappear.

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

## Decisions (user, 2026-08-02)

1. **Segmentation: AI thematic.** Confirmed by the block-count measurement above.
2. **Discard all of the old AI tafsir** — not kept side by side. The `## AI
   Tafsir` section was stripped from all 6,236 ayah files and the 114
   `docs/data/ai_tafsir` sidecars deleted (commit `e850982b`; recoverable from
   git history). Passage tafsir is a genuinely new section, not a patch of the old.
3. **Yes, it appears in the book and print/PDF views**, once per passage with its
   range label. Print checkbox is now "Passage Tafsir" (`pr-passage-tafsir`).
4. **Tone: keep the reverent plain-English register.**
5. **Priority: most-recited / memorized first** —
   `1 → 36 → 55 → 67 → 18 → 112, 113, 114 → 78–114 → 2 → 3 → rest`.
   Mirrored in `scripts/tafsir_progress.json` (`priority_order`).

## Status

- **Surah 1 done and live** — 2 passages (1–4, 5–7), validated, deployed.
  Split on the qudsi division of al-Fatiha, which the segmenter found unaided.
- Everything else pending. Continue with the **`resume-ai-tafsir` skill**.

### What the first run taught us

- **The adversarial fact-check earns its keep.** On surah 1 it caught the draft
  presenting two different narrations as one seamless quotation attributed to
  Muslim. Neither passage passed clean on the first attempt.
- **Length must follow the passage.** al-Fatiha 1–4 came in at ~13.5k chars and
  is not padded. The guard is 18k (runaway protection); `validate` prints the
  length spread so depth stays visible rather than silently capped.
- **Watch bundle size.** `bundles` prints each passage's source bundle size;
  al-Fatiha 5–7 was 230 KB because its Maʿārif commentary is unusually long.
  Above roughly 150 KB, split the passage — the drafting agent reads the whole
  bundle.
