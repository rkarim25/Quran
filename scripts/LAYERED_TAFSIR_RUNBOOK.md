# Layered AI-Tafsir — format & build runbook

The **AI Tafsir** section uses a 5-layer format, synthesized **strictly from the
Ibn Kathir and Maarif ul Quran text already present in each
`Quran-obs/Surah_N/Ayah_M.md`**. Surah 1 (al-Fatiha) is the reference implementation.

## Format (markdown written into the `## AI Tafsir` section)

```
**Essence** <one sentence — the heart of the ayah>

**What it teaches** <1–3 sentences — meaning, key Arabic terms unpacked>

**The scholars** <classical commentary, attributed: Ibn Kathir / Maarif / named salaf>

**From the Sunnah** <most relevant hadith FROM THE SOURCE> (<Collection>)

**Reflection** <one short line — how a believer lives it>
```

- Omit **From the Sunnah** entirely if the source has no hadith for the ayah.
- Length: ~600–1100 characters (dense ayahs may run longer); hard cap ~2400 (a runaway guard; concision is judged by the craft reviewer).

## Hard rules (non-negotiable)

- **Ground everything** in the ayah's own source file. Never use outside memory.
- **Hadith:** include ONLY hadith that appear in that file's Ibn Kathir / Maarif text.
  Name the collection only as the source names it. Never invent isnād, wording, or
  grading. If the source has no hadith for the ayah, omit the Sunnah layer — do not
  fabricate one. After drafting, re-read the source and confirm every cited hadith
  is actually present; drop any that is not.
- **Creed:** mainstream Ahl al-Sunnah. Affirm divine attributes per the Salaf without
  likening or distorting them; attribute disputed views rather than stating them as
  settled fact.
- Use **"Allah"** (not a standalone "God"); place the honorific after the Prophet.

## Resumable build (used by the scheduled routine)

1. Progress marker: `scripts/tafsir_progress.json` → `{last_surah, last_ayah}`.
2. Each run processes the next contiguous chunk of ayahs (within a single surah)
   after the marker — keep chunks small (~10–15 ayahs) to stay under usage limits.
3. Apply: `python scripts/apply_layered_tafsir.py --surah N --input <ayah->text json>`
   (updates the markdown source, the sidecar, and `docs/data/surah_N.json`).
4. Validate: `python scripts/validate_ai_tafsir.py --surah N`.
5. Update the progress marker, then commit and push to `main`; GitHub Pages redeploys.
