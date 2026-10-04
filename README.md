# Quran Study Site

An advanced, reverent study platform for the Holy Quran with authentic recitation, human studio English narration, word-by-word linguistics, verified occasions of revelation (Asbāb al-Nuzūl), personal reflections (Tadabbur), and synchronized cross-language study.

**Developing this project?** Start with [ARCHITECTURE.md](ARCHITECTURE.md) for data flow, pipelines, and religious invariants. AI agents should read [AGENTS.md](AGENTS.md) and use the `check-quran-site` skill.

**Live site:** [https://rkarim25.github.io/Quran/](https://rkarim25.github.io/Quran/#/)

---

## Key Features

- **Three Reading Perspectives:**
  - **Verse View (Sentence Mode):** Continuous scroll with Arabic Uthmani text, transliteration, English translation, and interactive study drawer.
  - **Word-by-Word View (WBW Mode):** Interactive grid of word cards with morphology, transliteration, meaning, and single-tap audio per word.
  - **Book View (Paragraph Mode):** Natural physical Mushaf layout with thematic paragraphing and inline ayah markers.
  - **Fluid Responsive Canvas:** Automatically expands horizontally across widescreen monitors while remaining beautifully optimized for mobile reading.

- **Authentic Studio Recitation & Narration:**
  - **Arabic Recitation:** Complete recitation by **Mishary Rashid Alafasy** (EveryAyah 128kbps stereo + Verses fallback).
  - **English Narration:** 100% human studio narration by **Ibrahim Walk** (Saheeh International, 192kbps MP3). Zero robotic TTS.
  - **Display Synchronized:** Plays paragraph blocks in Book View, verse-by-verse in Verse View.
  - **Pinpoint Start-Listen:** Hovering/clicking any word in WBW or Verse mode includes a **`▶ Start Listen`** button that starts continuous recitation from that exact ayah.

- **Asbāb al-Nuzūl (Occasions of Revelation) Light Bulb (`💡 Background`):**
  - High-impact historical context displayed directly beside translations for verses with authentic revelation background.
  - Micro-card popup explains why, when, and to whom verses were revealed (sourced from Al-Wahidi, Ibn Kathir, Sahih al-Bukhari, Sahih Muslim) without repeating the translation.

- **User Reflection Pen Badges (`✎ Note`):**
  - Ayahs with personal reflections automatically display an emerald pen button beside the translation, allowing instant viewing and editing.
  - Draggable floating pen button (`#tadabbur-fab` ✎) on all pages supports both personal tadabbur and notes addressed to AI (`🤖 Addressed to AI`).
  - In `#/tadabbur`, 1-click **"📋 Copy AI Notes"** generates a structured prompt for external AI tutors.

- **Synchronized Cross-Language Verse Highlighting:**
  - Highlighting an Arabic verse automatically highlights its English & AI translation counterparts and transliteration in sync (and vice-versa).
  - Works seamlessly across Verse View, WBW View, and Book View.
  - Persistent cloud sync via Firestore and GitHub.
  - Non-interruptive text selection popup: selecting any ayah text displays `[🖍 Highlight]`, `[✎ Note]`, and `[▶ Listen]`.

- **Linguistic & Tafsir Depth:**
  - Word-by-word hover cards with root lookups, forms, and transliteration.
  - Full thematic passage tafsir (114/114 surahs) grounded in classical authorities (*Tafsir Ibn Kathir*, *Ma'arif al-Qur'an*).

- **Offline & Cross-Device Sync:**
  - Progressive Web App (PWA) with smart service worker caching for offline reading.
  - Real-time cloud sync with Google Sign-in / Firestore and local Markdown write-back via `scripts/serve.py`.

---

## Local Development & Health Audit

```bash
# Automated health audit (syntax, CDNs, data completeness, AI notes)
node scripts/check-site.js

# Build JSON datasets from markdown
python scripts/build_site.py

# Local development server with markdown write-back
python scripts/serve.py
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080).

---

## Core Scripts & Tools

| Script | Purpose |
|--------|---------|
| `scripts/check-site.js` | Comprehensive site health, CDN connectivity, invariant checks & AI notes |
| `scripts/check_quran_site.py` | Python diagnostic tool for CI and AI agents |
| `scripts/build_site.py` | Compiles markdown sources into `docs/data/surah_*.json` |
| `scripts/serve.py` | Local development server with two-way markdown sync |
| `scripts/tafsir_passages.py` | Thematic passage tafsir pipeline and validator |
| `scripts/validate_wbw.py` | Word-by-word linguistic dataset validator across 114 surahs |

---

## Project Structure

```
Quran-obs/     Source ayah notes (Obsidian vault, source of truth)
docs/          GitHub Pages static site & vanilla JS frontend
  reader.js    Core application logic & UI controllers
  reader.css   Design system, themes, and responsive typography
  sw.js        Service worker & PWA cache controller
  data/        Published JSON datasets (surahs, tafsir, WBW, asbab)
scripts/       Python & Node.js build, audit, and data pipelines
.agents/       Agents standard skills (check-quran-site)
.claude/       Claude Code skills (check-quran-site, resume-ai-tafsir)
```
