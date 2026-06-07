# Quran

A study website for the Holy Quran with English translation, word-by-word hover meanings, revelation context, and tafsir.

**Live site:** [https://rkarim25.github.io/Quran/](https://rkarim25.github.io/Quran/)

## Features

- **Continuous scroll** — read an entire surah by scrolling, like quran.com
- **Word hover** — hover any Arabic word for transliteration and meaning
- **Translation toggle** — show/hide English below each ayah
- **Continue reading** — your last ayah is remembered automatically
- **Bookmarks** — star any ayah and revisit from the Bookmarks page
- **Study drawer** — reflection, revelation context, and tafsir per ayah
- **Edit meanings** — click a word → Edit → saves back to your markdown files
- **Light theme** — warm, calm reading experience
- **Local sync** — edits on the website update `Quran-obs/*.md` automatically

## Run locally with sync

```bash
python scripts/build_site.py
python scripts/serve.py
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). The badge shows **Sync on** when edits save to markdown.

On GitHub Pages the site is read-only; run `serve.py` locally to sync edits.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/build_site.py` | Build JSON data from markdown into `docs/data/` |
| `scripts/serve.py` | Local server with markdown sync API |
| `scripts/cleanup_context.py` | Remove generic context; keep ayah-specific only |
| `scripts/populate_tafsir_context.py` | Fetch and populate tafsir from API |

## Project structure

```
Quran-obs/     Source ayah notes (Obsidian vault)
docs/          GitHub Pages website
scripts/       Build, serve, and enrichment tools
```

## Data sources

- Translations & word-by-word: Quran.com
- Tafsir: [spa5k/tafsir_api](https://github.com/spa5k/tafsir_api)
