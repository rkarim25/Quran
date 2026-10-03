---
name: check-quran-site
description: Assesses user AI notes, audits Quran site health, verifies audio recitation integrity (Mishary Alafasy Arabic + Ibrahim Walk English), and evaluates/improves the quality of Quran translations, transliterations, and tafsir on rkarim25.github.io/Quran. Use whenever the user asks to "check quran site", "check quran", "quran site health", "assess quran notes", or invokes /check-quran-site.
---

# Check Quran Site — AI Health & Quality Skill

This skill allows any AI assistant (Antigravity, Claude, Codex, Cursor, ChatGPT) to assess the health of the Holy Quran study site ([rkarim25.github.io/Quran](https://rkarim25.github.io/Quran/#/)), triage and act upon user notes addressed to AI, and continuously refine translation, transliteration, tafsir, and audio recitation.

---

## 1. Quick Start / Automated Telemetry

Always begin by running the automated audit script from `C:\Users\Reza Karim\OneDrive\Quran-Project`:

```bash
# Node.js comprehensive audit (syntax, CDNs, data, invariant checks)
node scripts/check-site.js

# Or Python equivalent
python scripts/check_quran_site.py
```

If the user has provided specific notes or exported them:
```bash
node scripts/check-site.js --notes=path/to/notes.json
```

---

## 2. The 5 Core Assessment Pillars

### Pillar A: User AI Notes (Hovering Note System)
In the reader, users can tap the floating pen button (`#tadabbur-fab` ✎) on any verse and choose **"🤖 Addressed to AI"** (or view them in `#/tadabbur`).
- **Where notes live:**
  - `localStorage` key `quran-tadabbur-notes`
  - Synced via Firebase / Firestore at `users/{uid}/data/data`
  - Local export / sync bundle in `docs/sync/user-data.json`
  - Markdown prompt copied via the site's **"📋 Copy AI Notes"** button.
- **Triage Protocol:**
  1. 📝 **Translation:** Compare target verse with Saheeh International, Arberry, Pickthall, and classical lexicons (*Lisan al-Arab*). Source of truth is `Quran-obs/Surah_N/Ayah_M.md`.
  2. 🔤 **Transliteration:** Check Uthmani script and Hafs phonology. Ensure standard academic diacritics:
     - Long vowels: `ā`, `ī`, `ū`
     - Emphatic consonants: `ḥ`, `ṣ`, `ḍ`, `ṭ`, `ẓ`
     - Hamzah: `’` (apostrophe), Ayn: `‘` (reversed apostrophe).
  3. 📖 **Tafsir:** Cross-reference *Tafsir Ibn Kathir*, *Ma'arif al-Qur'an*, *Al-Qurtubi*, *Al-Tabari*. Follow Ahl al-Sunnah principles.
  4. 🐞 **Site / Technical Bug:** Test UI, audio player, or layout on desktop & mobile viewports.

### Pillar B: Non-Negotiable Religious & Creed Invariants
1. **Never AI-generate Hadith:** Cite a hadith ONLY if it appears in the passage's own `## Tafsir Ibn Kathir` or `## Maarif ul Quran` source bundle. Name the collection exactly as the source names it. Never invent or complete an isnad, wording, or grading.
2. **Grounding:** Ground everything in the passage's own sources on disk — never from model memory.
3. **Creed:** Mainstream Ahl al-Sunnah wal-Jama'ah. Affirm divine attributes as the Salaf did without takyif (asking how) or ta'til (denial).
4. **Theological Phrasing:** Always use **"Allah"**, never a standalone "God". Always include the honorific **ﷺ** after the Prophet.

### Pillar C: Audio Recitation & Studio Narration Invariants
1. **Arabic Recitation:** Strictly **Mishary Rashid Alafasy**:
   - Primary: `https://everyayah.com/data/Alafasy_128kbps/{SSS}{AAA}.mp3`
   - Fallback: `https://verses.quran.com/Alafasy/mp3/{SSS}{AAA}.mp3`
2. **English Narration:** Strictly authentic human studio recording by **Ibrahim Walk** (Saheeh International, 192kbps MP3):
   - Primary: `https://everyayah.com/data/English/Sahih_Intnl_Ibrahim_Walk_192kbps/{SSS}{AAA}.mp3`
   - Fallback: `https://cdn.islamic.network/quran/audio/192/en.walk/{globalAyahNum}.mp3`
   - **Zero mechanical TTS:** Never substitute robotic browser speech synthesis.
3. **Display Synchronization:**
   - **Book View (Paragraphs):** Plays Arabic recitation for chunk $\to$ plays Ibrahim Walk human narration for chunk $\to$ auto-advances.
   - **Verse View (Sentences):** Plays Arabic recitation for ayah $\to$ plays Ibrahim Walk human narration for ayah $\to$ auto-advances.

### Pillar D: Pipeline & Source-of-Truth Invariants
- `Quran-obs/Surah_N/Ayah_M.md` is the source of truth for text, translations, and notes.
- `docs/data/surah/surah_*.json` is compiled build output — never edit by hand; run `python scripts/build_site.py --surah N`.
- `docs/index.html` holds a one-way `__BUILD_ID__` placeholder. Must always have exactly 2 occurrences (`git grep -c "__BUILD_ID__" docs/index.html` -> 2).
- `docs/sw.js`: Bypasses all streaming audio CDNs in `NETWORK_ONLY_HOSTS`.

### Pillar E: Translation & Tafsir Improvement Audits
- Check verse count: exactly 6,236 verses across 114 surahs.
- Validate translations: `python scripts/validate_ai_translations.py` (must pass 6,236 / 6,236).
- Validate WBW: `python scripts/validate_wbw.py --surah N`.
- Validate Tafsir: `python scripts/tafsir_passages.py validate --surah N`.

---

## 3. Standard Execution Workflow

```
1. Run Health Check:
   node scripts/check-site.js

2. Read Pending AI Notes:
   Parse notes tagged #ai or forAi: true from user-data.json, notes.json, or user prompt.

3. Implement Improvements / Bug Fixes:
   - For translation/tafsir: edit Quran-obs/ or passage_tafsir/, rebuild with python scripts/build_site.py
   - For audio/UI: edit docs/audio-player.js, docs/reader.js, docs/reader.css

4. Verify Invariants:
   - node -c docs/*.js
   - git grep -c "__BUILD_ID__" docs/index.html  (must be 2)
   - node scripts/check-site.js

5. Cache Busting:
   - Bump VERSION in docs/sw.js
   - Bump script/css ?v= queries in docs/index.html

6. Commit & Deploy:
   git add ...
   git commit -m "..."
   git push origin main
   gh run list --limit 1
```

---

## 4. Multi-AI Compatibility Note

This skill is designed to work uniformly across:
- **Google Antigravity:** Triggered via `/check-quran-site` or "check quran site".
- **Claude Code:** Located in `.claude/skills/check-quran-site/SKILL.md`.
- **Agents Standard (OpenAI Codex, Cursor, etc.):** Located in `.agents/skills/check-quran-site/SKILL.md`.
