# Quran

A study website for the Holy Quran with English translation, word-by-word hover meanings, revelation context, and tafsir.

**Developing this project?** Start with [ARCHITECTURE.md](ARCHITECTURE.md) — how the
system works, its data flow, pipelines, and the invariants that must not be broken.

**Live site:** [https://rkarim25.github.io/Quran/](https://rkarim25.github.io/Quran/)

## Features

- **Continuous scroll** — read an entire surah by scrolling, like quran.com
- **Authentic Studio Recitation & Narration:**
  - Arabic: Complete recitation by **Mishary Rashid Alafasy**.
  - English: 100% human studio narration by **Ibrahim Walk** (Saheeh International, 192kbps). Zero robotic TTS.
  - Display Synchronized: Plays paragraph chunks in Book View, verse by verse in Verse View.
  - Word audio: Single tap human audio clips for every word.
- **Hovering Note System & AI Requests:**
  - Floating pen button (`✎`) on every page for personal reflection or notes addressed to AI.
  - Filter and review AI notes in `#/tadabbur` or copy as prompt for AI tutors.
- **Word hover** — hover any Arabic word for transliteration and meaning
- **Translation toggle** — show/hide English below each ayah
- **Continue reading** — your last ayah is remembered automatically
- **Bookmarks** — star any ayah and revisit from the Bookmarks page
- **Study drawer** — reflection, revelation context, and tafsir per ayah
- **Edit meanings** — click a word → Edit → saves back to your markdown files
- **Light theme** — warm, calm reading experience
- **Local & Cloud sync** — Google sign-in and Firestore cross-device synchronization

## Run locally with sync

```bash
node scripts/check-site.js    # Comprehensive site health, audio CDNs & AI notes audit
python scripts/build_site.py
python scripts/serve.py
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). The badge shows **Sync on** when edits save to markdown.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/check-site.js` | Full health, audio CDNs, translation coverage & user AI notes audit |
| `scripts/check_quran_site.py` | Python diagnostic tool for CI and AI agents |
| `scripts/build_site.py` | Build JSON data from markdown into `docs/data/` |
| `scripts/serve.py` | Local server with markdown sync API |
| `scripts/cleanup_context.py` | Remove generic context; keep ayah-specific only |
| `scripts/populate_tafsir_context.py` | Fetch and populate tafsir from API |

## Project structure

```
Quran-obs/     Source ayah notes (Obsidian vault, source of truth)
docs/          GitHub Pages website & vanilla JS frontend
scripts/       Build, serve, audit, and enrichment tools
.claude/       Claude Code skills (check-quran-site, resume-ai-tafsir)
.agents/       Agents standard skills (check-quran-site)
```

## Data sources

- Translations & word-by-word: Quran.com
- Tafsir: [spa5k/tafsir_api](https://github.com/spa5k/tafsir_api)
