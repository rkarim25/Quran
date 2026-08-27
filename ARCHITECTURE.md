# ARCHITECTURE — how this project works

> **Audience:** any AI assistant or developer picking this project up cold.
> Read this file first, then the pointers in [Where the other docs fit](#where-the-other-docs-fit).
>
> - **Repo:** `C:/Users/Reza Karim/OneDrive/Quran-Project` · remote `github.com/rkarim25/Quran` · branch `main`
> - **Live:** https://rkarim25.github.io/Quran/
> - **Stack:** static site (vanilla JS, no framework, no bundler) + Python data pipeline + GitHub Pages
> - **Scale:** 114 surahs, 6,236 ayah markdown files, ~155 MB of published data

---

## 1. The rules that override everything

These are religious-integrity rules, not style preferences. They are the reason
the pipelines look the way they do. **They hold even when no other file is
available, and they outrank convenience, speed, and completeness.**

1. **Never AI-generate hadith.** A hadith may be cited ONLY if it appears in the
   covered ayat's own `## Tafsir Ibn Kathir` / `## Maarif ul Quran` text, and the
   collection must be named exactly as that text names it. **Never invent or
   complete an isnad, wording, or grading.** If a source quotes the Prophet ﷺ
   without naming a collection, the teaching may be conveyed but must NOT be
   attributed to a named collection. Fabricating a chain of narration is the one
   failure the project owner will not accept.
2. **Ground everything** in the passage's own source bundle — never from model
   memory of the Qur'an or of tafsir literature. If the sources do not support a
   point, leave it out. *Writing less is always the correct trade.*
3. **Creed:** mainstream Ahl al-Sunnah. Affirm the divine attributes as the Salaf
   did, without likening them to creation and without explaining them away.
   Attribute disputed views rather than settling them.
4. **Language:** always "Allah", never a standalone "God"; honorific after the
   Prophet ﷺ; reverent, warm, plain English.

Rule 2 is the one that catches people out. A hadith can be perfectly authentic
and universally known and still be a violation, because it was not in *this
passage's* source text. That exact case was found and removed at 6:4-11 in the
2026-08-27 audit.

---

## 2. The single most important structural fact

```
Quran-obs/Surah_N/Ayah_M.md      <- SOURCE OF TRUTH. Edit this.
        |
        |  scripts/build_site.py  (via scripts/md_io.py)
        v
docs/data/surah_N.json           <- BUILD OUTPUT. Never hand-edit.
```

**Never fix content in `docs/data/surah_*.json`.** The deploy rebuilds those from
markdown on every push, so hand edits are silently destroyed.

The exception, and it is a large one: several `docs/data/` files are **static
data that `build_site.py` does not rebuild**. Edits to these deploy directly and
*are* the source of truth for their content.

| Rebuilt from markdown | Static — edit directly |
|---|---|
| `surah_N.json`, `index.json` | `ai_wbw/*`, `passage_tafsir/*` |
| `search-index.json` (gitignored, built in CI) | `duas.json`, `asbab_nuzul.json` |
| `build.json` (gitignored, built in CI) | `hadith_index.json`, `hadith_map.json` |
| | `people_index.json`, `people_hadith.json` |
| | `timeline.json`, `juz.json`, `pages.json`, `mushaf/*` |

Those static files are produced by their own pipelines (§6), not by the site build.

---

## 3. Repository layout

```
Quran-obs/            114 x Surah_N/Ayah_M.md — the corpus (also an Obsidian vault)
docs/                 the published site (GitHub Pages serves this directory)
  index.html          app shell; contains the literal __BUILD_ID__ placeholder
  reader.js           the whole app (~170 KB, one file) — DATA_VERSION lives here
  reader.css          styling
  sw.js               service worker / PWA cache — VERSION lives here
  print.js            print + book view
  firebase-sync.js    optional cross-device sync (Firestore)
  firebase-config.js  Firebase project config
  github-sync.js      edit-to-GitHub path
  fonts/qcf2/         vendored QCF v2 mushaf page fonts (Juz Amma, p582-604)
  data/               all published JSON (see §2)
scripts/              Python pipeline + JS agent workflows
  build_site.py       markdown -> docs/data ; also stamps the build id
  md_io.py            ayah read/write (uses a real YAML parser)
  serve.py            local dev server WITH markdown write-back
  tafsir_passages.py  passage-tafsir pipeline (status/outline/bundles/apply/validate)
  workflows/*.js      multi-agent workflow scripts (used by the Workflow tool)
  _forms/ _tafsir/ _context_out/   gitignored working state
.github/workflows/pages.yml        CI: build + deploy to Pages
.claude/skills/resume-ai-tafsir/   the tafsir operating runbook
.claude/launch.json                dev-server config (python scripts/serve.py, port 8080)
```

### The ayah markdown schema

```markdown
---
arabic_ayat: <Uthmani Arabic text>
sentence_translation: <English translation>
word_by_word:
  1:
    arabic: <word>
    translation: <gloss>
    transliteration: <translit>
---

## Tafsir Summary
## Tafsir Ibn Kathir
## Maarif ul Quran
## AI Translation
## Personal Reflections
## Context              (present on a subset of ayat)
```

**YAML gotcha that has already bitten once.** Long values wrap onto indented
continuation lines: 73% of `sentence_translation` and 58% of `arabic_ayat` values
wrap. Any parser reading a frontmatter value with `^key:\s*(.*)$` gets only the
first line. `md_io.py` uses `yaml.safe_load` and is correct; `tafsir_passages.py`
used a single-line regex until 2026-08-27 and was silently feeding truncated ayat
to the tafsir agents — Ayat al-Kursi arrived at 71 of its 540 characters.
**If you write a new frontmatter reader, use a YAML parser.**

Note the two Arabic orthographies in play. The corpus stores Uthmani script
(`ٱللَّهَ`, alef wasla U+0671, superscript alef); tafsir prose usually quotes
Imlaei (`اللَّهَ`). Any tool comparing Arabic across the two must normalise to a
consonantal skeleton, or it will report false mismatches.

---

## 4. Build and deploy

### Local build

```bash
python scripts/build_site.py             # everything
python scripts/build_site.py --surah 36  # one surah — prefer this
```

### Deploy

Push to `main` -> `.github/workflows/pages.yml` -> `build_site.py` -> upload
`docs/` as a Pages artifact -> `deploy-pages`. There is no staging environment;
`main` is production.

Actions are pinned to majors that run natively on Node 24 (`checkout@v7`,
`setup-python@v7`, `upload-pages-artifact@v5`, `deploy-pages@v5`). Note that
`upload-artifact` never appears in the workflow directly — it arrives as a
transitive dependency of `upload-pages-artifact`, which is why a Node-20
deprecation warning could name a version you cannot find in the file.

### Cache versioning — required on every data change

Two counters must be bumped together, or users get stale content:

| File | Constant | Purpose |
|---|---|---|
| `docs/reader.js` (~line 338) | `DATA_VERSION` | query-string cache-bust on every `data/*.json` fetch |
| `docs/sw.js` (line 12) | `VERSION` | rolls the service-worker caches |

Then verify **on the live URL with a cache-bust**, never on localhost:

```bash
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "https://rkarim25.github.io/Quran/data/passage_tafsir/surah_36.json?cb=$RANDOM"
```

### The `__BUILD_ID__` trap

`docs/index.html` contains a literal `__BUILD_ID__` placeholder. `stamp_build()`
replaces it with the commit SHA — **but only when `GITHUB_SHA` is set**, i.e.
only in CI. The substitution is one-way: if a locally-stamped `index.html` were
ever committed, every future deploy would serve a stale baked-in build id and the
auto-update check would never fire again.

The guard makes this hard to trip now, but the habit is still worth keeping —
before committing `docs/index.html`:

```bash
grep -c "__BUILD_ID__" docs/index.html   # expect 2
```

---

## 5. The frontend

`docs/reader.js` is a single ~170 KB vanilla-JS file. No framework, no bundler,
no transpile — what is in the file is what ships. Keep it that way unless the
owner asks otherwise.

### Routing (hash-based)

```
#/                       home (surah list)
#/<surah>                surah, continuous scroll
#/<surah>/<ayah>         surah focused on an ayah
#/<surah>/<ayah>/study   opens the study drawer
#/bookmarks  #/tadabbur  #/edits  #/duas[/<id>]
```

### What the reader fetches

All fetches carry `?v=${DATA_VERSION}`:

`index.json` · `surah_N.json` · `passage_tafsir/surah_N.json` ·
`ai_wbw/surah_N.json` · `duas.json` · `timeline.json` · `hadith_index.json` ·
`hadith_map.json` · `asbab_nuzul.json` · `people_index.json` ·
`people_hadith.json` · `mushaf/index.json` · `mushaf/page_P.json` ·
`search-index.json`

### Sync — two independent mechanisms

- **`firebase-sync.js`** — optional cross-device sync to Firestore at
  `users/{uid}/data/data`, carrying `prefs`, `lastRead`, `recentReads`,
  `bookmarks`, `ayahEdits`. Rules in `firestore.rules`. Firebase endpoints and
  `build.json` are deliberately never intercepted by the service worker.
- **`scripts/serve.py`** — local dev server that accepts `PUT` and **writes edits
  back into the markdown**. This is what makes "Edit meanings" a real
  source-of-truth edit rather than a local-storage scribble. On GitHub Pages the
  site is read-only; run `serve.py` to get write-back.

```bash
python scripts/build_site.py && python scripts/serve.py   # http://127.0.0.1:8080
```

A past bug worth knowing, because the shape recurs: signed-in users saw a triple
re-render on refresh (auth pull -> render, boot pull -> render, boot render). The
fix was to render local content immediately, coalesce concurrent pulls, and skip
re-render on no-op pulls. Don't reintroduce a render on every sync event.

---

## 6. The AI content pipelines

Two large AI-generated datasets exist. Both are **complete**. Both follow the
same shape: deterministic extract -> multi-agent workflow -> apply ->
**validate as a hard gate** -> build -> bump versions -> commit -> verify live.

### Passage tafsir — COMPLETE, 114/114

One commentary per contiguous run of thematically related ayat, never per single
ayah, with the covered range always shown to the reader.

- **Runbook:** `.claude/skills/resume-ai-tafsir/SKILL.md` (git-backed, canonical)
- **Design rationale:** `TAFSIR_PLAN.md` — including *why* segmentation is AI
  thematic: Ibn Kathir's own block boundaries are unusable, being 1 block for all
  of surah 112 but 173 across surah 2.
- **Driver:** `scripts/tafsir_passages.py`
- **Output:** `docs/data/passage_tafsir/surah_N.json`
- **Progress:** `scripts/tafsir_progress.json` (committed — survives a fresh clone)

```bash
python scripts/tafsir_passages.py status            # ALWAYS first; derives state from disk
python scripts/tafsir_passages.py outline  --surah N
#   -> Workflow scripts/workflows/tafsir_segment.js
python scripts/tafsir_passages.py bundles  --surah N   # hard coverage gate
#   -> Workflow scripts/workflows/tafsir_draft.js
python scripts/tafsir_passages.py apply    --surah N
python scripts/tafsir_passages.py validate --surah N   # MUST exit 0
python scripts/build_site.py --surah N
```

Notes that save real time:

- `status` derives everything from disk, so it cannot go stale. It prints the
  exact next command, including ready-to-paste workflow args.
- `bundles` refuses to proceed unless segmentation covers `1..ayah_count` exactly
  once. If a bundle exceeds ~150 KB, split that passage by hand in
  `passages.json` and re-run — the drafting agent must read the whole bundle.
- **A session limit mid-run loses nothing.** Each passage is written to
  `draft_<a>_<b>.json` the moment it finishes. Run `apply`, commit the partial
  result, stop; `status` next session names exactly what is missing.
- `scripts/_tafsir/` is **gitignored working state** and is the only copy of
  finished passages until `apply` runs. Do not delete it mid-run.
- Pausing: `tafsir_passages.py pause --reason "..."`. The flag is committed, so a
  later session sees PAUSED and will not restart on its own.

The drafting workflow runs an adversarial grounding check on every passage and
sends flagged ones to a finalize pass. It genuinely catches things — across
surahs 70-77 it caught invented Arabic transliterations appended to real hadith,
a paraphrased hadith inside quotation marks, two distinct reports conflated into
one attribution, and an anthropomorphic description of Allah. Do not remove or
weaken that stage.

### AI word-by-word — COMPLETE, 114/114

- **Runbook:** `scripts/WBW_RUNBOOK.md`
- **Output:** `docs/data/ai_wbw/surah_N.json` (49 MB — the largest dataset)
- **Gate:** `validate_wbw.py` looped over all 114 surahs

**The trap:** a per-file stub scan is NOT sufficient. It catches unanalysed
`{ar,tr,gloss}` stubs but misses *absent positions* — which is how 425 missing
entries in surahs 33 and 35 went unnoticed. Always run the full 114-surah
validate loop after any WBW change. Also: after a gap re-run, re-run
`extract_forms.py` before assembling, or a stale `asm.json` silently drops
analyses.

The form cache `scripts/_forms/_wbw_cache.json` is gitignored; rebuild it first
in any new session with `python scripts/rebuild_wbw_cache.py` (~18,600 forms).

### Legacy — do not follow by mistake

The **per-ayah layered tafsir** design was discarded entirely on the owner's
instruction (commit `e850982b`, recoverable from git history). These files target
that dead design and must not be used for new tafsir work:

`scripts/LAYERED_TAFSIR_RUNBOOK.md` · `scripts/workflows/layered_tafsir_pipeline.js` ·
`scripts/apply_layered_tafsir.py` · `scripts/validate_ai_tafsir.py` ·
`scripts/generate_ai_tafsir.py` · `scripts/ai_tafsir_builder.py`

`docs/data/ai_tafsir/` is empty and `reader.js` no longer references it.

---

## 7. Verification gates

Nothing ships without the relevant gate passing.

```bash
# passage tafsir — coverage, empty/oversized passages, standalone "God", and
# every hadith collection named in the tafsir must be named in the covered
# ayat's own source text
python scripts/tafsir_passages.py validate --surah N

# whole corpus (a few minutes)
for n in $(seq 1 114); do python scripts/tafsir_passages.py validate --surah $n || echo "FAIL $n"; done

python scripts/validate_wbw.py --surah N     # word-by-word
python scripts/_validate_data.py             # general data integrity
```

### About the hadith-grounding check

`tafsir_passages.py` holds two alias tables, `COLLECTION_ALIASES` and
`ARABIC_ALIASES`, because the OCR'd sources spell collection names
inconsistently (`Bukhri`, `Abmad`, `Baihagi`, `Alhmad`, `Abu Dad`) or name a
collection **only in Arabic script** (`الحاکم`, `البیھقی`).

Read the comments there before touching them. The reasoning is deliberate:
flagging a *correctly grounded* citation is the more dangerous failure, because
it pushes toward deleting true attributions. **Only add a variant after
confirming it in the source text itself** — and when the validator flags a
hadith, check the source before assuming fabrication. In the 2026-08-27 audit,
three of four flags were false positives of exactly this kind.

---

## 8. Current state

- **Passage tafsir:** 114/114 published and validated.
- **AI word-by-word:** 114/114, all pass `validate_wbw.py`.
- **Occasions of revelation** (`asbab_nuzul.json`): 1,186 ayah-level entries
  spanning 85 surahs, plus one `__setting_*` context group per surah (114).
- **Isnad chains:** 690/690 hadith in `hadith_index.json` carry an isnad.
- **Whole corpus validates clean** as of commit `da781099`.

### Known issues

- **GitHub Pages deploys have been failing since ~2026-08-27 17:24.** The `build`
  job succeeds and the artifact uploads; `deploy-pages` then sits in
  `updating_pages` until its 10-minute timeout cancels it. Ruled out: the action
  upgrade (v4 and v5 have identical timeout defaults, and v5 deployed
  successfully once), artifact size (~155 MB deployed fine before), and a stuck
  deployment blocking the queue. This looks like a GitHub-side stall. **Effect:
  commit `da781099` is pushed but not live.** Re-run when Pages recovers:

  ```bash
  gh run list --limit 1 --json databaseId -q '.[0].databaseId' | xargs gh run rerun --failed
  ```

- **Unverified dimension.** The 2026-08-27 audit of surahs 2-9 was mechanical —
  strong on quotation and hadith grounding, but it does **not** cover semantic
  over-reach (invented etymologies, misattributed glosses, ungrounded reasoning
  that is not a quotation). Covering that needs the drafting pipeline's own
  adversarial verification pass, which is a large agent fan-out and needs the
  owner's go-ahead.
- **Cleanup candidates:** empty `docs/data/ai_tafsir/`; the legacy layered-tafsir
  scripts in §6; and `Quran-obs/Surah_2/Ayah_126.md`, the one remaining file
  still carrying discarded `## What it teaches` / `## The scholars` sections.

---

## 9. Working conventions

- **Commit style:** imperative subject, then a body explaining *why* and what was
  verified. The tafsir commits are the model — they record what the adversarial
  checker caught and what the validator returned.
- **Scratch scripts** use an underscore prefix (`_check_*.py`, `_fix_*.py`,
  `_inspect_*.py`) and are gitignored by convention. Keep one-offs out of git.
- **Don't commit** `docs/data/search-index.json` or `docs/build.json` — CI builds them.
- **Windows / Git Bash note:** Bash's `/tmp` is not the path Windows Python
  resolves from `/tmp`. Use an absolute Windows-style path when handing a temp
  file from a shell heredoc to `python`. Long heredocs in this environment are
  also fragile — write large files with an editor tool rather than `cat <<EOF`.

---

## 10. Adding a feature end-to-end

Worked example — surfacing a new per-ayah field in the reader:

1. **Add it to the source.** New frontmatter key or `## Section` in
   `Quran-obs/Surah_N/Ayah_M.md`. If it is AI-generated content, it is bound by §1.
2. **Teach the reader to parse it.** `scripts/md_io.py` -> `read_ayah()` /
   `to_json_ayah()`. Use the YAML parser; do not hand-roll frontmatter regexes.
3. **Emit it.** `scripts/build_site.py` -> `build_surah()` puts it in
   `docs/data/surah_N.json`.
4. **Render it.** `docs/reader.js` — find the analogous render function
   (`renderAyahStreamHtml`, `renderContextPanel`, ...) and follow its shape.
5. **Bump** `DATA_VERSION` in `reader.js` and `VERSION` in `sw.js`.
6. **Validate**, build the affected surahs, commit, push.
7. **Verify on the live URL with a cache-bust** — not localhost.

If the feature involves generating religious content at scale, model it on the
existing pipelines: a deterministic extract step, an agent workflow, a Python
`apply`, and a **validator that exits non-zero** — and write the validator before
generating anything.

---

## Where the other docs fit

| Doc | What it is | Trust |
|---|---|---|
| **ARCHITECTURE.md** (this file) | How the system works | Current |
| `PROJECT_STATUS.md` | Standing roadmap + task board, with detailed diagnosis notes on past bugs | Current for history; §8 here is the live state |
| `HANDOVER.md` | "What to do next" for the following session only | Rewritten each handover |
| `TAFSIR_PLAN.md` | Why passage tafsir is designed as it is | Current design rationale |
| `.claude/skills/resume-ai-tafsir/SKILL.md` | The tafsir operating loop | Canonical, git-backed |
| `scripts/WBW_RUNBOOK.md` | The word-by-word loop | Canonical |
| `README.md` | Short public-facing overview | Current, deliberately shallow |
| `docs/SYNC_SETUP.md` | Firebase sync setup | As written |
| `scripts/LAYERED_TAFSIR_RUNBOOK.md` | **Legacy — discarded design** | Do not follow |
