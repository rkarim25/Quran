# Antigravity & AI Agent Guidelines — Holy Quran Study Site

This document establishes the durable architecture, religious non-negotiables, audio engine rules, hovering note protocols, and multi-AI collaboration guidelines for the Quran study site at [rkarim25.github.io/Quran](https://rkarim25.github.io/Quran/#/).

---

## 1. Core Mission & Design Principles

- **Primary Goal:** Enable deep contemplation (*tadabbur*) of the Holy Quran with high-fidelity Arabic recitation, human studio English narration, word-by-word linguistics, and classical commentary.
- **Display-Audio Synchronization:** Audio playback strictly conforms to the active reading layout:
  - **Book View (Paragraph Mode):** Mishary Alafasy Arabic recitation for paragraph $\to$ Ibrahim Walk English studio narration for paragraph $\to$ auto-advance.
  - **Verse View (Sentence Mode):** Mishary Alafasy Arabic recitation for ayah $\to$ Ibrahim Walk English studio narration for ayah $\to$ auto-advance.
- **Zero Friction:** Low latency, preloaded upcoming verses, responsive floating controls, offline service-worker caching for core app assets, and zero synthetic robotic voices.

---

## 2. Non-Negotiable Religious & Creed Invariants

1. **Never AI-Generate Hadith:** Cite a hadith ONLY if it appears in the passage's own `## Tafsir Ibn Kathir` or `## Maarif ul Quran` source bundle. Name the collection exactly as the source names it. Never invent or complete an isnad, wording, or grading.
2. **Grounding in Sources:** Ground all tafsir and translation claims in the passage's verified source files on disk (`Quran-obs/Surah_N/Ayah_M.md` and `passage_tafsir/`). Never hallucinate from model memory. Saying less is always the correct trade.
3. **Creed:** Mainstream Ahl al-Sunnah wal-Jama'ah. Affirm the divine attributes as the Salaf did, without takyif (asking how), without tamthil (likening to creation), and without ta'til (denial).
4. **Theological Phrasing:** Always use **"Allah"**, never a standalone "God". Always include the honorific **ﷺ** after the Prophet.

---

## 3. Audio Recitation Invariants

- **Arabic Recitation:** Strictly **Mishary Rashid Alafasy**:
  - Primary EveryAyah: `https://everyayah.com/data/Alafasy_128kbps/{SSS}{AAA}.mp3`
  - Fallback Verses: `https://verses.quran.com/Alafasy/mp3/{SSS}{AAA}.mp3`
- **English Translation Narration:** Strictly authentic human studio recording by **Ibrahim Walk** (Saheeh International, 192kbps stereo MP3):
  - Primary EveryAyah: `https://everyayah.com/data/English/Sahih_Intnl_Ibrahim_Walk_192kbps/{SSS}{AAA}.mp3`
  - Fallback Islamic Network: `https://cdn.islamic.network/quran/audio/192/en.walk/{globalAyahNum}.mp3`
  - **No Mechanical TTS:** Never replace authentic human narration with synthetic browser speech synthesis.
- **Word Audio:** QuranCDN word clips: `https://audio.qurancdn.com/wbw/{SSS}_{AAA}_{WWW}.mp3`.
- **Service Worker Rule:** Streaming audio hosts (`everyayah.com`, `verses.quran.com`, `audio.qurancdn.com`, `cdn.islamic.network`) must ALWAYS remain in `NETWORK_ONLY_HOSTS` in `docs/sw.js` and bypassed in `fetch`.

---

## 4. Hovering Note System & AI Requests

The reader includes a draggable floating pen button (`#tadabbur-fab` ✎) on every reading page.

### The Two Note Modes:
1. **Personal Reflection (`✎ Personal Reflection`):** Personal thoughts, reflections, and tadabbur notes.
2. **Addressed to AI (`🤖 Addressed to AI`):** Explicitly flagged for AI review and action (`forAi: true`, `target: "ai"`, `status: "open"`).
   - Quick categories: `[📝 Translation]`, `[🔤 Transliteration]`, `[📖 Tafsir]`, `[🐞 Site / Bug]`.
   - Filterable in `#/tadabbur` via `[🤖 For AI (N)]` chip.
   - 1-click **"📋 Copy AI Notes"** button generates a formatted markdown prompt for instant pasting into any AI model.
   - Synchronized across devices via Firebase / Firestore and GitHub sync.

---

## 5. Automated Health Audit & `check-quran-site` Skill

Any AI agent can check and maintain the site using the `check-quran-site` skill.

### CLI Health Suite:
```bash
# Full test suite (Syntax, Audio CDNs, Data Completeness, AI Notes)
node scripts/check-site.js

# Or Python equivalent
python scripts/check_quran_site.py
```

### Verification Invariants:
- All frontend JS files must pass `node -c docs/<file>.js`.
- `docs/index.html` must contain exactly 2 occurrences of `__BUILD_ID__`:
  ```bash
  git grep -c "__BUILD_ID__" docs/index.html  # must output 2
  ```
- All data changes must bump `VERSION` in `docs/sw.js` and query strings in `docs/index.html`.
- Run `python scripts/tafsir_passages.py validate --surah N` before publishing any tafsir.
- Run `python scripts/validate_ai_translations.py` to confirm 6,236 / 6,236 translated ayahs.

---

## 6. Multi-AI Collaboration Protocol

- **Antigravity:** Global skill at `C:\Users\Reza Karim\.gemini\config\skills\check-quran-site\SKILL.md`.
- **Claude Code:** Project skill at `.claude/skills/check-quran-site/SKILL.md`.
- **Agents Standard (Codex, Cursor, etc.):** Project skill at `.agents/skills/check-quran-site/SKILL.md`.
- **Source of Truth:** Markdown files in `Quran-obs/` are the source of truth. Build outputs in `docs/data/surah/` are generated via `python scripts/build_site.py`.
- **Deployment:** Push to `main` triggers GitHub Actions Pages workflow (`.github/workflows/pages.yml`). Always verify deployment with `gh run list`.
