# Quran

A study website for the Holy Quran with English translation, word-by-word breakdown, revelation context, and tafsir from **Ibn Kathir** and **Maarif ul Quran**.

**Live site:** [https://rkarim25.github.io/Quran/](https://rkarim25.github.io/Quran/)

## Features

- All 114 surahs and 6,236 ayahs
- Arabic text with English translation
- Word-by-word breakdown (Arabic, transliteration, meaning)
- Revelation context for each ayah
- Combined tafsir summary
- Full tafsir from Ibn Kathir and Maarif ul Quran

## Project structure

```
Quran-obs/     Source ayah notes (Obsidian vault)
docs/          GitHub Pages website
scripts/       Build & data enrichment tools
```

## Build the site locally

```bash
python scripts/build_site.py
```

Then serve `docs/` with any static server, e.g.:

```bash
python -m http.server 8080 --directory docs
```

Open [http://localhost:8080](http://localhost:8080).

## Data sources

- Translations & word-by-word: Quran.com
- Tafsir: [spa5k/tafsir_api](https://github.com/spa5k/tafsir_api) (Ibn Kathir, Maarif ul Quran)
- Chapter metadata: Quran.com API
