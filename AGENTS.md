# Antigravity & AI Agent Guidelines — Holy Quran Study Site

This document establishes the durable architecture, religious non-negotiables, audio engine rules, note & reflection systems, and multi-AI collaboration protocols for the Quran study site at [rkarim25.github.io/Quran](https://rkarim25.github.io/Quran/#/).

---

## 1. Core Mission & Design Principles

- **Primary Goal:** Deep contemplation (*tadabbur*) of the Holy Quran through authentic Arabic recitation, studio English narration, word-by-word linguistics, verified historical context (*Asbāb al-Nuzūl*), and classical commentary.
- **Audience:** Reza Karim (senior investment manager, prioritizing high quality, concise high-impact insight, zero maintenance, and reverent orthodox scholarship).
- **Synchronized Audio-Display:** Audio strictly conforms to the active reading mode:
  - **Book View (Paragraph Mode):** Mishary Alafasy Arabic paragraph recitation $\to$ Ibrahim Walk English studio narration for each ayah $\to$ auto-advance.
  - **Verse View (Sentence Mode):** Mishary Alafasy Arabic ayah recitation $\to$ Ibrahim Walk English studio narration $\to$ auto-advance.
- **Zero Friction:** Widescreen-adaptive canvas, instant audio prefetching, offline PWA caching for shell assets, non-interruptive text selection actions, and zero synthetic robotic voices.

---

## 2. Non-Negotiable Religious & Creed Invariants

1. **Never AI-Generate Hadith:** Cite a hadith ONLY if it appears in the covered ayah's own verified source texts (`## Tafsir Ibn Kathir` or `## Maarif ul Quran`). Name the collection exactly as the source names it. Never invent or complete an isnad, wording, or grading.
2. **Grounding in Sources:** Ground all commentary and translation claims in the passage's verified source files on disk (`Quran-obs/Surah_N/Ayah_M.md` and `docs/data/passage_tafsir/`). Never hallucinate from model memory. Writing less is always the correct trade.
3. **Creed:** Mainstream Ahl al-Sunnah wal-Jama'ah. Affirm divine attributes as the Salaf did, without takyif (asking how), without tamthil (likening to creation), and without ta'til (denial).
4. **Theological Phrasing:** Always use **"Allah"**, never a standalone "God". Always include the honorific **ﷺ** after the Prophet.

---

## 3. Audio Recitation & Narration Engine (`docs/audio-player.js`)

- **Arabic Recitation:** Strictly **Mishary Rashid Alafasy**:
  - Primary EveryAyah: `https://everyayah.com/data/Alafasy_128kbps/{SSS}{AAA}.mp3`
  - Fallback Verses: `https://verses.quran.com/Alafasy/mp3/{SSS}{AAA}.mp3`
- **English Studio Narration:** Strictly authentic human studio recording by **Ibrahim Walk** (Saheeh International, 192kbps stereo MP3):
  - Primary EveryAyah: `https://everyayah.com/data/English/Sahih_Intnl_Ibrahim_Walk_192kbps/{SSS}{AAA}.mp3`
  - Fallback Islamic Network: `https://cdn.islamic.network/quran/audio/192/en.walk/{globalAyahNum}.mp3`
  - **No Mechanical TTS:** Never replace authentic human narration with synthetic browser speech synthesis.
- **Word Audio:** QuranCDN clips: `https://audio.qurancdn.com/wbw/{SSS}_{AAA}_{WWW}.mp3`.
- **Word Tooltip Pinpoint Start-Listen:** Hovering/clicking any word in WBW or Verse mode includes a **`▶ Start Listen`** button that starts continuous recitation from that exact ayah.
- **Service Worker Invariant:** Streaming audio hosts (`everyayah.com`, `verses.quran.com`, `audio.qurancdn.com`, `cdn.islamic.network`) must ALWAYS remain in `NETWORK_ONLY_HOSTS` in `docs/sw.js` and bypassed in `fetch`.

---

## 4. Asbāb al-Nuzūl (Occasions of Revelation) Light Bulb (`💡 Background`)

- **Visual Badge:** An amber pill (`.asbab-bulb-btn`) rendered next to translations for verses with authentic revelation background in `docs/data/asbab-nuzul.json`.
- **Micro-Card Popup:** Clicking the bulb renders an in-place micro-card with the historical context, citations (Al-Wahidi, Ibn Kathir, Bukhari, Muslim), and a direct link to the study panel.
- **Content Standard:** Context must provide *crucial new understanding* that reading the translation alone cannot achieve. Never duplicate the verse translation or insert generic summaries.

---

## 5. User Reflections & Note Pen Badges (`✎ Note`)

- **Pen Indicator Badge:** An emerald pill (`.note-pen-btn`) automatically renders beside `💡 Background` across Verse, WBW, and Book views on any ayah where the user has recorded a reflection or note.
- **Instant Edit:** Clicking `✎ Note` immediately opens the Tadabbur editor for that ayah.
- **Dual-Mode Floating Launcher (`#tadabbur-fab` ✎):** Present on all pages:
  1. `✎ Personal Reflection`: Personal tadabbur and contemplative notes.
  2. `🤖 Addressed to AI`: Explicitly tagged for AI review (`forAi: true`, `target: "ai"`).
- **AI Notes Management (`#/tadabbur`):**
  - Filterable with `[🤖 For AI (N)]`.
  - 1-click **"📋 Copy AI Notes"** generates a formatted markdown prompt for AI models.
  - Synced across devices via Firebase / Firestore and GitHub sync.

---

## 6. Synchronized Cross-Language Verse Highlighting

- **Bi-Directional Highlighting:** Highlighting an Arabic verse automatically highlights its English & AI translation counterparts and transliteration in sync. Highlighting an English verse automatically highlights the Arabic verse.
- **Multi-Mode Support:** Synchronized across Verse View, WBW View, and Book View.
- **Persistent Storage:** Highlights persist in `localStorage` under `quran-highlights` and sync to Firestore.
- **Non-Interruptive Selection Popup:** Selecting any text in an ayah displays a floating pill:
  - `[🖍 Highlight]`: Toggles synchronized highlight on/off.
  - `[✎ Note]`: Opens or creates personal reflection note.
  - `[▶ Listen]`: Starts continuous recitation from that ayah.

---

## 7. Source-of-Truth & Build Invariants

```
Quran-obs/Surah_N/Ayah_M.md      <- SOURCE OF TRUTH for text & translations. Edit this.
        |
        |  python scripts/build_site.py
        v
docs/data/surah_N.json           <- BUILD OUTPUT. Never edit by hand!
```

- **Static Data Files (Edit directly):** `docs/data/ai_wbw/*`, `docs/data/passage_tafsir/*`, `docs/data/asbab-nuzul.json`, `docs/data/duas.json`, `docs/data/timeline.json`, `docs/data/mushaf/*`.
- **Frontmatter Parser Invariant:** Frontmatter multiline values wrap onto indented lines; always parse with a real YAML parser (like `yaml.safe_load`), never with single-line regexes.
- **Build Placeholder Invariant:** `docs/index.html` must contain exactly 2 occurrences of `__BUILD_ID__` (`git grep -c "__BUILD_ID__" docs/index.html` -> 2).
- **Syntax Gate:** All frontend JS files must pass `node -c docs/<file>.js`.

---

## 8. Multi-AI Collaboration & Verification Protocol

Any AI agent (Antigravity, Claude Code, OpenAI Codex, Cursor, ChatGPT) can check and maintain the site using the `check-quran-site` skill.

### CLI Health Audit:
```bash
# Comprehensive test suite (passes 17/17 tests)
node scripts/check-site.js
```

### Standard Deployment Order:
1. Make changes in `docs/` (frontend) or `Quran-obs/` (content).
2. If content changed: `python scripts/build_site.py --surah N`.
3. Verify syntax: `node -c docs/*.js`.
4. Run health suite: `node scripts/check-site.js`.
5. Bump cache busters: `reader.js?v=XX`, `reader.css?v=YY` in `docs/index.html`, and `VERSION` in `docs/sw.js`.
6. Commit & push: `git commit -m "..." && git push origin main`.
7. Verify deployment: `gh run list --limit 1` or `gh run watch <run_id>`.
