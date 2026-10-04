# HANDOVER

**New to the repo? Read [ARCHITECTURE.md](ARCHITECTURE.md) first** — how the system works, its invariants, and its traps. [PROJECT_STATUS.md](PROJECT_STATUS.md) is the standing roadmap and task history. This file carries only the "what to do next" for the immediately following session.

Timestamp: 2026-10-04 · supersedes earlier handovers.

## State as of this handover

- **Asbāb al-Nuzūl (Occasions of Revelation) Light Bulb System:** Verified in-place `💡 Background` light bulb pills next to translations on verses with authentic historical context (`docs/data/asbab-nuzul.json`). Micro-cards show authentic concise revelation context (Al-Wahidi, Ibn Kathir, Bukhari, Muslim) without repeating the translation, and link directly to study drawer.
- **User Reflection Indicators & Note Pen Badges (`✎ Note`):** Emerald pen indicator badges automatically appear on ayahs with personal reflections across Verse, WBW, and Book views for 1-click opening and editing in Tadabbur drawer.
- **Synchronized Cross-Language Verse Highlighting:** Bi-directional verse highlighting in sync across Arabic, English, AI translation, transliteration, WBW, and Book views, persisted in `localStorage` under `quran-highlights` and synced to cloud.
- **Non-Interruptive Selection Popup:** Selecting text in an ayah pops up a floating pill with `[🖍 Highlight]`, `[✎ Note]`, and `[▶ Listen]`.
- **Authentic Recitation & Studio Narration:** Complete recitation by **Mishary Rashid Alafasy** (Arabic) and authentic human studio narration by **Ibrahim Walk** (English, 192kbps MP3). Synchronized across Book view (paragraph chunks) and Verse view (sentence by sentence). Word tooltips provide `▶ Start Listen` to begin continuous recitation from that exact ayah. Zero robotic TTS.
- **Multi-AI Skill & Telemetry (`check-quran-site`):** Comprehensive automated telemetry script `node scripts/check-site.js` passes all 17/17 tests (syntax, CDN health, data integrity, AI notes). Canonical skill `check-quran-site` is mirrored across Antigravity, Claude Code, Agents standard, and Arabic learning workspace.
- **All documentation synchronized:** `README.md`, `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `HANDOVER.md`, and all `SKILL.md` mirrors.
- **Passage tafsir:** COMPLETE, 114/114.
- **AI word-by-word:** COMPLETE, 114/114.

## Everything is landed and live

Latest deployment (commit `4b73879f`) built and deployed successfully via GitHub Actions Pages. Verified live at [https://rkarim25.github.io/Quran/](https://rkarim25.github.io/Quran/#/).

If a GitHub Pages deployment ever stalls in `updating_pages`, re-run the failed job rather than changing config:

```bash
gh run list --limit 1 --json databaseId -q '.[0].databaseId' | xargs gh run rerun --failed
```

## Sensible next moves (owner to choose)

1. **Continuous Asbāb al-Nuzūl curation:** Selectively expand Asbāb al-Nuzūl entries for additional surahs, strictly obeying the non-repetition quality rule (must convey crucial context the translation alone cannot).
2. **Semantic verification pass over the tafsir:** Run the drafting pipeline's adversarial verifier over published passages to catch ungrounded reasoning (requires user go-ahead).
3. **Repository cleanup:** Remove legacy layered-tafsir scripts (`scripts/LAYERED_TAFSIR_RUNBOOK.md`, etc.) and empty `docs/data/ai_tafsir/`.

## Traps worth re-reading before you touch anything

- **Word-by-word:** After any WBW change, run the full 114-surah `validate_wbw.py` loop. A per-file stub scan misses *absent* positions.
- **`docs/index.html`** holds a one-way `__BUILD_ID__` placeholder. Confirm it is still present before committing that file (`git grep -c "__BUILD_ID__" docs/index.html` -> 2).
- **Parse frontmatter with a YAML parser.** Values wrap onto continuation lines; a single-line regex silently truncates 73% of translations.
- **Never AI-generate Hadith text, isnad, or gradings.** Cite only if present in the ayah's own verified sources on disk.
