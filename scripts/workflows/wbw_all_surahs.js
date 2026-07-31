export const meta = {
  name: 'wbw-all-surahs',
  description: 'Generate and commit AI word-by-word for remaining surahs (22-77 gaps). Sequential: one surah at a time. Pipeline writes parts to disk immediately; assembly merges+commits each before moving on. Safe to re-run — already-committed surahs are skipped.',
  phases: [
    { title: 'Check', detail: 'Identify which surahs still need processing' },
    { title: 'Draft', detail: 'Per-form analysis per chunk' },
    { title: 'Verify', detail: 'Adversarial morphology check' },
    { title: 'Finalize', detail: 'Resolve flagged issues; write parts to disk' },
    { title: 'Commit', detail: 'Merge parts, assemble, validate, commit, push' },
  ],
}

const ROOT = 'C:/Users/Reza Karim/OneDrive/Quran-Project'
const PIPELINE_PATH = `${ROOT}/scripts/workflows/ai_wbw_pipeline.js`

const NAMES = {
  22: 'Al-Hajj', 23: "Al-Mu'minun", 24: 'An-Nur', 25: 'Al-Furqan',
  26: "Ash-Shu'ara", 27: 'An-Naml', 28: 'Al-Qasas', 29: 'Al-Ankabut',
  30: 'Ar-Rum', 31: 'Luqman', 33: 'Al-Ahzab', 34: "Saba'", 35: 'Fatir',
  37: 'As-Saffat', 38: 'Sad', 39: 'Az-Zumar', 40: 'Ghafir',
  41: 'Fussilat', 42: 'Ash-Shura', 43: 'Az-Zukhruf', 45: 'Al-Jathiyah',
  46: 'Al-Ahqaf', 47: 'Muhammad', 48: 'Al-Fath', 49: 'Al-Hujurat',
  50: 'Qaf', 51: 'Adh-Dhariyat', 52: 'At-Tur', 53: 'An-Najm',
  54: 'Al-Qamar', 57: 'Al-Hadid', 58: 'Al-Mujadila', 59: 'Al-Hashr',
  60: 'Al-Mumtahana', 61: 'As-Saf', 62: "Al-Jumu'ah", 63: 'Al-Munafiqun',
  64: 'At-Taghabun', 65: 'At-Talaq', 66: 'At-Tahrim', 68: 'Al-Qalam',
  69: 'Al-Haqqah', 70: "Al-Ma'arij", 71: 'Nuh', 72: 'Al-Jinn',
  73: 'Al-Muzzammil', 74: 'Al-Muddaththir', 75: 'Al-Qiyamah',
  76: 'Al-Insan', 77: 'Al-Mursalat',
}

const ALL_MISSING = [
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  33, 34, 35, 37, 38, 39, 40, 41, 42, 43,
  45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
  57, 58, 59, 60, 61, 62, 63, 64, 65, 66,
  68, 69, 70, 71, 72, 73, 74, 75, 76, 77,
]

const PLAN = ALL_MISSING.map(n => ({
  surah: n,
  name: NAMES[n] || `Surah ${n}`,
  dir: `${ROOT}/scripts/_forms/surah_${n}`,
  n_chunks: {
    22:12,23:9,24:13,25:8,26:10,27:11,28:13,29:7,30:6,31:5,
    33:13,34:7,35:7,37:10,38:8,39:8,40:9,41:7,42:6,43:7,
    45:3,46:5,47:6,48:6,49:4,50:5,51:4,52:4,53:5,54:5,
    57:5,58:4,59:4,60:4,61:2,62:1,63:2,64:2,65:4,66:3,
    68:4,69:5,70:4,71:3,72:4,73:3,74:5,75:3,76:4,77:3,
  }[n],
}))

// ── Phase 0: find which surahs are already committed ──────────────────────────
phase('Check')
const SCHEMA_DONE = { type: 'object', properties: { done: { type: 'array', items: { type: 'integer' } } }, required: ['done'] }
const checkResult = await agent(
  `Run this command in "${ROOT}" and return the JSON it prints:\n\npython -c "import json,pathlib;d=pathlib.Path('docs/data/ai_wbw');missing={${ALL_MISSING.join(',')}};done=sorted(int(f.stem.split('_')[1]) for f in d.glob('surah_*.json') if int(f.stem.split('_')[1]) in missing);print(json.dumps({'done':done}))"`,
  { label: 'check-done', phase: 'Check', schema: SCHEMA_DONE }
)
const doneSet = new Set(checkResult ? checkResult.done : [])
const remaining = PLAN.filter(item => !doneSet.has(item.surah))
log(`Already committed: ${doneSet.size}. Remaining: ${remaining.length}`)

// ── Sequential loop: pipeline → disk-write → assemble → commit ────────────────
for (const item of remaining) {
  const { surah, name, dir, n_chunks } = item

  // Step 1: run pipeline (draft→verify→finalize→write parts to disk)
  log(`Starting surah ${surah} (${name}): ${n_chunks} chunks`)
  await workflow({ scriptPath: PIPELINE_PATH }, { surah, dir, n_chunks })

  // Step 2: merge parts + assemble + apply + validate + commit + push
  await agent(
    `Process surah ${surah} (${name}). Working dir: "${ROOT}". Run each step:

STEP 1 — Merge part files into result.json:
python -c "import json,pathlib;d=pathlib.Path('${dir}');parts=sorted(d.glob('part_*.json'),key=lambda p:int(p.stem.split('_')[1]));a=[];[a.extend(json.load(open(str(p),encoding='utf-8'))) for p in parts];json.dump({'surah':${surah},'processed':${n_chunks},'analysed':len(a),'analyses':a},open(str(d/'result.json'),'w',encoding='utf-8'),ensure_ascii=False);print('merged',len(a),'analyses')"

STEP 2 — Assemble:
python scripts/assemble_wbw.py --surah ${surah} --analyses "${dir}/result.json" --cache "scripts/_forms/_wbw_cache.json" --out "${dir}/chunk.json"

STEP 3 — Apply:
python scripts/apply_ai_wbw.py --surah ${surah} --input "${dir}/chunk.json"

STEP 4 — Validate:
python scripts/validate_wbw.py --surah ${surah}

STEP 5 — Commit and push:
git -C "${ROOT}" add "docs/data/ai_wbw/surah_${surah}.json"
git -C "${ROOT}" commit -m "wbw: surah ${surah} (${name}) — full AI word-by-word"
git -C "${ROOT}" push

Reply ONLY "OK ${surah}" on success, or the first error (no data dumps).`,
    { label: `commit-s${surah}`, phase: 'Commit' }
  )
  log(`Surah ${surah} done`)
}

return { total: ALL_MISSING.length, alreadyDone: doneSet.size, processed: remaining.length }
