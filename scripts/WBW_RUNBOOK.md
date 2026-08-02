# AI word-by-word — generation runbook (surahs 2–77)

Hover word-by-word with a basic grammatical explanation, the same feature shipped
for **Al-Fatihah (1)** and **Juzʾ ʿAmma (78–114)**. Those 38 surahs are done.
This runbook covers the remaining **surahs 2–77** (76 surahs, ~75,092 word
positions) using a **global form cache** so each unique diacritized form is
analysed **once for the entire run** and reused everywhere it occurs.

## Why this is cheap (measured)

`python scripts/measure_wbw.py` — analyses needed for 2–77:

| Approach | Analyses | vs current |
|---|---|---|
| No dedup (per word) | 75,092 | — |
| Per-surah dedup (old pipeline) | 45,066 | — |
| **Global cache (this runbook)** | **~18,986** | **−58%** |

Each analysis = draft (Opus) → adversarial verify (Sonnet) → finalize (Opus).
Re-run `measure_wbw.py` any time for a fresh count.

## Data flow

```
extract_forms.py --cache   ->  scripts/_forms/surah_N/chunk_NNNN.json   (NEW forms only, ≤12 each)
                               scripts/_forms/surah_N/asm.json          (positions + cached entries; never sent to an LLM)
        |
        v
Workflow  ai-wbw-pipeline   ->  per-form analyses [{id, entry}]   (each draft agent Reads one chunk file)
        |                       intrinsic: a form's one analysis is reused at every occurrence
        v
assemble_wbw.py --cache     ->  chunk.json (every position filled = cached ∪ new)  + GROWS the global cache
        |
        v
apply_ai_wbw.py             ->  docs/data/ai_wbw/surah_N.json
        |
        v
validate_wbw.py  ->  build_site.py --surah N  ->  commit/push
```

Global cache: `scripts/_forms/_wbw_cache.json` (git-ignored, derived). It grows as
surahs complete. Rebuild it any time (e.g. new session, after `git pull`):

```
python scripts/rebuild_wbw_cache.py        # rebuilds from applied 2–77 ai_wbw data
```

The cache is seeded ONLY from 2–77 (intrinsic) work, not from the verse-contextual
Juzʾ ʿAmma/Fatiha entries (seeding from those would save only ~728 analyses and
read oddly out of context).

## Per-surah loop

For each surah N (the assistant drives this; the Workflow step is run via the
Workflow tool, not the shell):

```
# 1. Extract NEW forms (prints n_chunks + a ready-to-paste workflow args line)
python scripts/extract_forms.py --surah N --cache scripts/_forms/_wbw_cache.json

# 2. Run the workflow (assistant): Workflow tool, name "ai-wbw-pipeline",
#    args { "surah": N, "dir": "<dir from step 1>", "n_chunks": <C> }
#    Save the returned JSON to scripts/_forms/surah_N/result.json

# 3. Assemble (fills every position, grows the cache)
python scripts/assemble_wbw.py --surah N --analyses scripts/_forms/surah_N/result.json --cache scripts/_forms/_wbw_cache.json --out scripts/_forms/surah_N/chunk.json

# 4. Apply + validate
python scripts/apply_ai_wbw.py --surah N --input scripts/_forms/surah_N/chunk.json
python scripts/validate_wbw.py --surah N        # exit 0 = full coverage + schema OK

# 5. (batch a few surahs, then) publish
python scripts/build_site.py --surah N
git add docs/data/ai_wbw/surah_N.json docs/data/surah_N.json && git commit && git push
```

`assemble_wbw.py` prints any unfilled positions; `validate_wbw.py` is the final
gate (must be exit 0 before apply/commit).

The workflow now persists its analyses as crash-safe `part_NNN.json` files in
the surah dir (step 2 returns only a summary), so step 3 takes
`--analyses scripts/_forms/surah_N/part_*.json`.

### Gap re-runs — ALWAYS re-extract first

If a run dies part-way (session limit, 529) and you re-run only the missing
chunks with `args {..., "chunks":[4]}`:

1. The re-run's part files **restart at `part_000.json` and overwrite** the
   earlier ones. That is safe — every analysis already assembled once lives in
   the global cache — but it means the part files alone are no longer the full
   set.
2. **`asm.json` holds a snapshot of the cache taken at extraction time.**
   Analyses added to the cache since then are invisible to it, so assembling
   straight after a gap re-run silently drops them (surah 47 went 526/539 →
   436/539 this way).

So after any gap re-run, re-run `extract_forms.py --surah N --cache ...` before
assembling. It should report `NEW to analyse: 0`; then assemble fills 100%.

## Large surahs (2–9) — slice the workflow

Surah 2 alone is ~2,788 new forms (~233 chunks). To keep each workflow run and its
returned result modest, run it in slices of ≤50 chunks using the `start`/`count`
args, save each as `result_partK.json`, then assemble them together:

```
# run 1: args { surah:2, dir:..., n_chunks:233, start:0,  count:50 }  -> result_part0.json
# run 2: args { surah:2, dir:..., n_chunks:233, start:50, count:50 }  -> result_part1.json
#  ... until start+count >= n_chunks
python scripts/assemble_wbw.py --surah 2 --analyses scripts/_forms/surah_2/result_part*.json --cache scripts/_forms/_wbw_cache.json --out scripts/_forms/surah_2/chunk.json
```

`--analyses` accepts multiple files and merges them. New-form counts fall sharply
after the early surahs (3:~1,100, then mostly <600, many <150), so most surahs are
a single workflow run.

## Order

Any order is fine — the total unique-form count is the same. Numeric order (2,3,4,…)
gives natural commit batches and front-loads the cache (later surahs get cheaper).

## Quality

- **Intrinsic only.** Analyses describe the form itself (morphology, core meaning,
  ending/case/person, root) with no "in this verse / this surah" framing, so reuse
  across occurrences is correct. The verify agent flags any contextual leakage.
- Same entry schema as the done surahs: `{ meaning, parts:[{ar,tr,en}], grammar, root }`.
- `parts` must reconstruct the word; the ending explanation must match the
  transliteration — enforced in the prompt and checked adversarially.
