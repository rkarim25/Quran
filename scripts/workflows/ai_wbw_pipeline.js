export const meta = {
  name: 'ai-wbw-pipeline',
  description: 'Generate detailed AI word-by-word analysis (meaning, morphology split, plain-English grammar, root), DEDUPLICATED by exact diacritized surface form, BATCHED ~12 forms per agent (to amortise per-agent overhead), with an adversarial morphology check. args: {surah}. Reads scripts/_forms/surah_<n>.json (from extract_forms.py). Returns per-form analyses [{id, entry}]; reassembly into ayahs is done in Python by assemble_wbw.py using the on-disk positions map (kept off the LLM path for correctness).',
  phases: [
    { title: 'Load', detail: 'Read the deduplicated forms file for the surah' },
    { title: 'Draft', detail: 'Per-form analysis, batched, grounded in sample ayat' },
    { title: 'Verify', detail: 'Adversarial morphology/grammar accuracy check (batched)' },
    { title: 'Finalize', detail: 'Resolve issues; output validated per-form entries' },
  ],
}

// args: { surah:<number> }
const FORMS_DIR = String.raw`C:\Users\Reza Karim\OneDrive\Quran-Project\scripts\_forms`
const CHUNK_SIZE = 12
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) {} }
const surah = A && A.surah
if (!surah) { log('No surah resolved; nothing to do.'); return { error: 'no-args' } }
const formsFile = `${FORMS_DIR}\\surah_${surah}.json`

const FAST_MODEL = 'sonnet'
const PART = { type: 'object', properties: { ar: { type: 'string' }, tr: { type: 'string' }, en: { type: 'string' } }, required: ['ar', 'en'] }
const WORD = { type: 'object', properties: {
  id: { type: 'integer' }, meaning: { type: 'string' }, parts: { type: 'array', items: PART }, grammar: { type: 'string' }, root: { type: 'string' },
}, required: ['id', 'meaning', 'parts', 'grammar'] }
const DRAFT_SCHEMA = { type: 'object', properties: { words: { type: 'array', items: WORD } }, required: ['words'] }
const VERDICT_SCHEMA = { type: 'object', properties: {
  pass: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' },
}, required: ['pass', 'issues'] }
const FINAL_SCHEMA = { type: 'object', properties: {
  words: { type: 'array', items: WORD }, changes_made: { type: 'array', items: { type: 'string' } },
}, required: ['words'] }
const BUNDLE_SCHEMA = { type: 'object', properties: {
  forms: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'integer' }, ar: { type: 'string' }, tr: { type: 'string' }, gloss: { type: 'string' }, ay: { type: 'integer' },
  }, required: ['id', 'ar', 'tr', 'ay'] } },
  ayahText: { type: 'object', additionalProperties: { type: 'object', properties: { a: { type: 'string' }, t: { type: 'string' } } } },
}, required: ['forms', 'ayahText'] }

phase('Load')
const bundle = await agent(
  [
    `Call Read on EXACTLY this file (small JSON) and return its contents as structured output, UNCHANGED:`,
    formsFile,
    `Return two fields: "forms" (the array exactly as in the file — every element, same order, same id/ar/tr/gloss/ay) and "ayahText" (the object exactly as in the file). Do not summarise, reorder, drop, or edit any element. You do NOT need the file's "positions" field.`,
  ].join('\n'),
  { label: 'load forms', phase: 'Load', schema: BUNDLE_SCHEMA },
)
const forms = (bundle && bundle.forms) || []
const ayahText = (bundle && bundle.ayahText) || {}
if (!forms.length) { log('Forms file empty or unreadable; nothing to do.'); return { error: 'no-forms', surah } }

const chunks = []
for (let i = 0; i < forms.length; i += CHUNK_SIZE) chunks.push(forms.slice(i, i + CHUNK_SIZE))

const FIELD_RULES = [
  `For EACH form return an object {id, meaning, parts, grammar, root}, using the SAME id given:`,
  `- meaning: a rich plain-English meaning (the core sense). Where there is NO clean English equivalent (particles like inna/qad, or loaded terms like taqwa, deen, rabb), EXPLAIN the concept/function in a sentence rather than a one-word gloss.`,
  `- parts: the morphological breakdown — split the word into its pieces (prefix(es), stem, suffix/ending, attached pronouns), each as { ar:<Arabic segment>, tr:<transliteration>, en:<plain-English gloss> }. e.g. bismi -> [bi "with", ism "name"]; wal-samāi -> [wa "by (oath)", l- "the", samā' "sky/heaven", -i "genitive ending"]. The segments MUST reconstruct the word.`,
  `- grammar: translate the GRAMMAR into everyday English — especially the ENDING: what does the final vowel/case/tense/person mark mean? e.g. "the -i ending is genitive: it links it to the next word ('Lord OF…') or follows the oath particle"; "the na- prefix means 'we'". Be concrete; avoid jargon (or gloss it). The ending explanation MUST match the actual ending shown in the transliteration (-i vs -u vs -a vs -ī).`,
  `- root: the triliteral root with its core sense, e.g. "ر-ح-م (r-ḥ-m) — mercy". Use "—" for particles or proper names that have none.`,
].join('\n')

function formLine(f) {
  const t = (ayahText[String(f.ay)] || {}).t || ''
  return `[id ${f.id}] ${f.ar}  | translit: ${f.tr} | gloss: ${f.gloss}${t ? ` | context ${surah}:${f.ay} "${t}"` : ''}`
}

function draftPrompt(chunk) {
  return [
    `You are a precise scholar of Qur'anic Arabic morphology writing a per-word study aid for a Qur'an study web app. Plain English, accurate grammar, reverent tone.`,
    `Analyse EACH of the following ${chunk.length} fully-diacritized Qur'anic surface forms. Each form is reused at every place it occurs, so give its intrinsic morphology and its core meaning.`,
    ``,
    ...chunk.map(formLine),
    ``,
    FIELD_RULES,
    ``,
    `HARD RULES: parts MUST reconstruct the word; the ending explanation MUST match the transliteration. Do NOT invent grammar. Use "Allah", never the standalone word "God". Concise but genuinely informative.`,
    `Return { words: [ {id, meaning, parts, grammar, root}, ... ] } covering EVERY id listed above.`,
  ].join('\n')
}

function verifyPrompt(chunk, draft) {
  return [
    `You are an ADVERSARIAL checker of a per-word Arabic morphology analysis. Be strict. Check EACH word in the draft, going id by id.`,
    `The words analysed (id | Arabic | translit | gloss):`,
    ...chunk.map((f) => `[id ${f.id}] ${f.ar} | ${f.tr} | ${f.gloss}`),
    ``,
    `For each word verify: 1) the "parts" segments actually reconstruct the word; 2) the "grammar"/ending explanation matches the real ending in the transliteration (genitive -i, nominative -u, accusative -a, possessive -ī, verb person/form, etc.); 3) the "root" is correct; 4) the meaning is faithful and untranslatable concepts are actually explained.`,
    `Flag every real error in "issues" as "id N: <what is wrong>". Default to flagging when uncertain. Set pass=false if ANY word has a substantive morphological/grammatical error.`,
    ``,
    `DRAFT:`,
    JSON.stringify(draft.words, null, 1),
    ``,
    `Return the verdict object.`,
  ].join('\n')
}

function finalizePrompt(chunk, draft, verdict) {
  return [
    `Finalize the per-word analysis for these ${chunk.length} words. Resolve EVERY issue the checker raised; fix any inaccurate segmentation, ending, case, person, or root. Leave correct entries as-is.`,
    `Keep the SAME ids and schema (id, meaning, parts:[{ar,tr,en}], grammar, root). Use "Allah", never standalone "God". Accurate, plain-English, concise but informative. Return EVERY id.`,
    ``,
    `DRAFT:`,
    JSON.stringify(draft.words, null, 1),
    ``,
    `CHECKER VERDICT:`,
    JSON.stringify(verdict, null, 1),
    ``,
    `Return { words:[ {id, meaning, parts, grammar, root}, ... ], changes_made:[...] } covering EVERY id.`,
  ].join('\n')
}

phase('Draft')
log(`AI word-by-word (dedup, batched x${CHUNK_SIZE}): surah ${surah}, ${forms.length} unique forms in ${chunks.length} chunk(s)`)

const perChunk = await pipeline(
  chunks,
  (chunk, _orig, i) => agent(draftPrompt(chunk), { label: `draft c${i}`, phase: 'Draft', schema: DRAFT_SCHEMA }),
  (draft, chunk, i) => agent(verifyPrompt(chunk, draft), { label: `verify c${i}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: FAST_MODEL })
      .then((verdict) => ({ draft, verdict })),
  (b, chunk, i) => agent(finalizePrompt(chunk, b.draft, b.verdict), { label: `finalize c${i}`, phase: 'Finalize', schema: FINAL_SCHEMA })
      .then((final) => {
        const dById = {}; for (const w of (b.draft.words || [])) dById[w.id] = w
        const fById = {}; for (const w of (final.words || [])) fById[w.id] = w
        return chunk.map((f) => {
          const w = fById[f.id] || dById[f.id]  // fall back to the draft if finalize dropped an id
          if (!w) return null
          return { id: f.id, entry: { meaning: w.meaning, parts: w.parts || [], grammar: w.grammar, root: w.root || '' } }
        }).filter(Boolean)
      }),
)

const analyses = perChunk.filter(Boolean).flat()
const seen = new Set(analyses.map((a) => a.id))
const failedIds = forms.filter((f) => !seen.has(f.id)).map((f) => f.tr || f.id)
if (failedIds.length) log(`WARNING: ${failedIds.length}/${forms.length} form(s) failed: ${failedIds.join(', ')}`)
else log(`All ${analyses.length} forms analysed.`)

return { surah, count: analyses.length, total: forms.length, analyses }
