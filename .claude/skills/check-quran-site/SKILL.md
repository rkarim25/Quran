---
name: check-quran-site
description: Assesses user AI notes, audits Quran site health, verifies audio recitation integrity (Mishary Alafasy Arabic + Ibrahim Walk English), and evaluates/improves the quality of Quran translations, transliterations, tafsir, Asbāb al-Nuzūl (occasions of revelation), and reading features on rkarim25.github.io/Quran. Use whenever the user asks to "check quran site", "check quran", "quran site health", "assess quran notes", or invokes /check-quran-site.
---

# Check Quran Site — AI Health & Quality Skill

This skill allows any AI assistant (Antigravity, Claude Code, OpenAI Codex, Cursor, ChatGPT, etc.) in any chat window to fully understand, audit, maintain, and develop the Holy Quran study site.

- **Live URL:** [https://rkarim25.github.io/Quran/](https://rkarim25.github.io/Quran/#/)
- **Repository Location:** `C:\Users\Reza Karim\OneDrive\Quran-Project`
- **Remote:** `https://github.com/rkarim25/Quran` (branch `main`, deployed via GitHub Actions Pages)
- **Primary Learner & User:** Reza Karim (senior professional, valuing concise, high-impact insights, authentic classical scholarship, respectful reverent tone, and zero time wasted on fluff or mechanical repetition).

---

## 1. Quick Telemetry & Health Audit

Always start any inspection or maintenance session by executing the automated health audit:

```bash
# Node.js comprehensive audit (syntax checks, CDN health, data integrity, AI notes)
node scripts/check-site.js

# Or Python equivalent
python scripts/check_quran_site.py
```

To audit specific exported user notes:
```bash
node scripts/check-site.js --notes=path/to/notes.json
```

### Automated Checks Performed:
1. **Frontend Syntax:** Verifies `docs/reader.js`, `docs/audio-player.js`, `docs/print.js`, `docs/sw.js`, `docs/github-sync.js`, `docs/firebase-sync.js`.
2. **Build Placeholder:** Ensures `__BUILD_ID__` appears exactly 2 times in `docs/index.html`.
3. **Service Worker Audio Bypass:** Verifies all 4 streaming audio CDNs are listed in `NETWORK_ONLY_HOSTS` in `docs/sw.js`.
4. **Recitation CDNs:** Checks HTTP 200 connectivity for EveryAyah & Verses (Mishary Alafasy), EveryAyah & Islamic Network (Ibrahim Walk), and QuranCDN word audio.
5. **Data Completeness:** Verifies AI translation coverage (6,236 / 6,236 verses across 114 surahs) and passage tafsir (114 / 114 surahs).
6. **Theological Invariant:** Checks zero standalone "God" in translations and tafsir samples (strictly "Allah").
7. **Pending AI Notes:** Scans for reflections flagged `forAi: true` or `#ai`.

---

## 2. Core Site Systems & Architecture

### A. Reading Layouts & Navigation
- **Verse View (Sentence Mode):** Ayah-by-ayah reading with Arabic text, transliteration, English translation, and interactive study drawer.
- **Word-by-Word View (WBW Mode):** Interactive grid of word chips showing Arabic, transliteration, and English meaning with single-tap audio per word.
- **Book View (Paragraph Mode):** Flowing physical-book layout with thematic paragraphing, inline ayah markers, and synchronized recitation.
- **Fluid Responsive Canvas:** Horizontally adaptive layout (`--page-max-width: min(1560px, 96vw)`, `--reading-text-max-width: min(100%, 1180px)`) with mobile-optimized font scaling.

### B. Authentic Audio Recitation & Narration Engine (`docs/audio-player.js`)
- **Arabic Recitation:** Strictly **Mishary Rashid Alafasy**:
  - Primary: `https://everyayah.com/data/Alafasy_128kbps/{SSS}{AAA}.mp3`
  - Fallback: `https://verses.quran.com/Alafasy/mp3/{SSS}{AAA}.mp3`
- **English Studio Narration:** Strictly authentic human studio recording by **Ibrahim Walk** (Saheeh International, 192kbps MP3):
  - Primary: `https://everyayah.com/data/English/Sahih_Intnl_Ibrahim_Walk_192kbps/{SSS}{AAA}.mp3`
  - Fallback: `https://cdn.islamic.network/quran/audio/192/en.walk/{globalAyahNum}.mp3`
  - **Zero Robotic TTS:** Browser speech synthesis is NEVER used for recitation.
- **Display Synchronization:**
  - In Book View: Plays Arabic paragraph recitation $\to$ plays Ibrahim Walk English narration for each ayah in paragraph $\to$ auto-advances.
  - In Verse View: Plays Arabic ayah $\to$ plays Ibrahim Walk English translation $\to$ auto-advances.
- **Word Tooltip Pinpoint Start-Listen:**
  - Hovering/clicking any word in WBW or Verse mode displays the word meaning, word pronunciation audio, and a **`▶ Start Listen`** button that starts continuous recitation from that exact verse.
- **Service Worker Cache Exemption:** Streaming audio hosts (`everyayah.com`, `verses.quran.com`, `audio.qurancdn.com`, `cdn.islamic.network`) must ALWAYS remain in `NETWORK_ONLY_HOSTS` in `docs/sw.js`.

### C. Asbāb al-Nuzūl (Occasions of Revelation) Light Bulb System
- **Button Indicator:** `💡 Background` (`.asbab-bulb-btn`) rendered next to translation on verses with authentic historical context.
- **Data Source:** `docs/data/asbab-nuzul.json` (1,186 ayah-level entries across 85 surahs).
- **Interactive Micro-Card:** Clicking the bulb expands an in-place micro-card explaining the specific historical event, question, or situation during which the verse was revealed, with citation (Al-Wahidi, Ibn Kathir, Sahih al-Bukhari, Sahih Muslim) and a direct link to the study panel.
- **Content Quality Standard:** Must provide *crucial new context* that English translation alone cannot achieve. Avoid superficial repetition or paraphrasing of the translation.

### D. User Reflections & Note Pen Indicator (`✎ Note`)
- **Pen Badge Indicator:** An emerald badge (`.note-pen-btn`) automatically renders beside `💡 Background` in Verse view, WBW view, and Book view on any verse where the user has written a note.
- **Instant Edit:** Clicking `✎ Note` immediately opens the Tadabbur editor for that verse.
- **Floating Tadabbur Launcher (`#tadabbur-fab` ✎):** Draggable floating pen button on all reader pages with dual modes:
  1. `✎ Personal Reflection`: Personal thoughts, reflections, and insights.
  2. `🤖 Addressed to AI`: Flagged for AI review (`forAi: true`, `target: "ai"`).
- **AI Notes Management (`#/tadabbur`):**
  - Filterable via `[🤖 For AI (N)]` chip.
  - **"📋 Copy AI Notes"** button generates a complete markdown prompt ready for pasting into any AI model.
  - Synced across devices via Firebase / Firestore (`users/{uid}/data/data`) and GitHub sync.

### E. Synchronized Cross-Language Verse Highlighting
- **Bi-Directional Highlighting:** Highlighting an Arabic verse automatically highlights its English & AI translation counterparts and transliteration in sync. Highlighting an English verse automatically highlights the Arabic verse.
- **Multi-Mode Support:** Works seamlessly across Verse View, WBW View, and Book View.
- **Persistent Storage:** Highlights persist in `localStorage` (`quran-highlights`) and sync to cloud storage.
- **Floating Verse Action Popup:** Selecting text in an ayah with mouse or finger displays a non-intrusive floating pill:
  - `[🖍 Highlight]`: Toggles synchronized highlight on/off.
  - `[✎ Note]`: Opens or creates personal reflection note.
  - `[▶ Listen]`: Starts continuous recitation from that ayah.

---

## 3. Non-Negotiable Religious & Creed Invariants

1. **Never AI-Generate Hadith:** Cite a hadith ONLY if it appears in the covered ayah's own verified source texts (`## Tafsir Ibn Kathir` or `## Maarif ul Quran`). Name the collection exactly as the source names it. Never invent or complete an isnad, wording, or grading.
2. **Grounding in Sources:** Ground all tafsir and translation claims in the passage's verified source files on disk (`Quran-obs/Surah_N/Ayah_M.md` and `docs/data/passage_tafsir/`). Never hallucinate from model memory. Writing less is always the correct trade.
3. **Creed:** Mainstream Ahl al-Sunnah wal-Jama'ah. Affirm divine attributes as the Salaf did without takyif (asking how) or ta'til (denial).
4. **Theological Phrasing:** Always use **"Allah"**, never a standalone "God". Always include the honorific **ﷺ** after the Prophet.

---

## 4. Source-of-Truth & Data Flow Rules

```
Quran-obs/Surah_N/Ayah_M.md      <- SOURCE OF TRUTH for text & translations. Edit this.
        |
        |  python scripts/build_site.py
        v
docs/data/surah_N.json           <- BUILD OUTPUT. Never edit by hand!
```

### Static Data Files (Edit directly):
- `docs/data/ai_wbw/*` — Word-by-word linguistics (49 MB, 114 surahs)
- `docs/data/passage_tafsir/*` — Thematic passage tafsir (114 surahs)
- `docs/data/asbab-nuzul.json` — Occasions of revelation
- `docs/data/duas.json`, `docs/data/timeline.json`, `docs/data/hadith_index.json`
- `docs/data/mushaf/*` — High-fidelity Hafs Mushaf pages

### Frontmatter Parsing Rule:
Always parse YAML frontmatter using a real YAML parser (like `yaml.safe_load` in Python). Single-line regexes truncate multiline translation fields.

---

## 5. Standard Development & Deployment Workflow

When making changes to the site:

```bash
# 1. Implement edits in docs/ (for frontend) or Quran-obs/ (for text)
# 2. If text was modified, rebuild surah data:
python scripts/build_site.py --surah N

# 3. Check JavaScript syntax:
node -c docs/reader.js
node -c docs/audio-player.js

# 4. Check __BUILD_ID__ invariant:
git grep -c "__BUILD_ID__" docs/index.html    # MUST output exactly 2

# 5. Run full health suite:
node scripts/check-site.js                    # MUST output 17 Passed, 0 Failed

# 6. Bump cache busters:
#    - docs/index.html: update reader.js?v=XX and reader.css?v=YY
#    - docs/sw.js: update VERSION = "YYYY-MM-DDx"

# 7. Commit & push to main:
git add docs/reader.js docs/reader.css docs/index.html docs/sw.js
git commit -m "Your descriptive message"
git push origin main

# 8. Verify live deployment:
gh run list --limit 1
# Or watch the active run:
gh run watch <run_id>
```

---

## 6. Multi-AI Skill Locations

This skill is mirrored across all AI development directories:
- **Antigravity (Global):** `C:\Users\Reza Karim\.gemini\config\skills\check-quran-site\SKILL.md`
- **Agents Standard (Project):** `C:\Users\Reza Karim\OneDrive\Quran-Project\.agents\skills\check-quran-site\SKILL.md`
- **Claude Code (Project):** `C:\Users\Reza Karim\OneDrive\Quran-Project\.claude\skills\check-quran-site\SKILL.md`
- **Arabic Workspace:** `C:\Users\Reza Karim\OneDrive\Arabic\Self learn\.agents\skills\check-quran-site\SKILL.md`
