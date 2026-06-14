export const meta = {
  name: 'ai-wbw-pipeline',
  description: 'Generate INTRINSIC per-word Qur\'anic analysis (core meaning, morphology split, plain-English grammar, root) for the NEW (uncached) surface forms of a surah. Each draft agent reads its own small chunk file (scripts/_forms/surah_<n>/chunk_NNNN.json from extract_forms.py --cache), so it scales to any surah. Analyses are strictly form-intrinsic (no per-verse framing) so the global cache can reuse each form everywhere it occurs. Adversarial morphology check on each chunk. args: {surah, dir, n_chunks, start?, count?}. Returns per-form analyses [{id, entry}]; reassembly + cache growth happen in Python (assemble_wbw.py) off the LLM path.',
  phases: [
    { title: 'Draft', detail: 'Per-form analysis, one agent per chunk file' },
    { title: 'Verify', detail: 'Adversarial morphology/grammar check (sonnet)' },
    { title: 'Finalize', detail: 'Resolve issues; emit validated per-form entries' },
  ],
}

// args: { surah, dir, n_chunks, start?, count? }
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) {} }
const surah = A && A.surah
const dir = A && A.dir
const nChunks = A && A.n_chunks
if (!surah || !dir || !nChunks) { log('Missing args {surah,dir,n_chunks}; nothing to do.'); return { error: 'no-args' } }
const start = (A && A.start) || 0
const count = (A && A.count) || (nChunks - start)

const pad = (i) => String(i).padStart(4, '0')
const chunkPaths = []
for (let i = start; i < start + count && i < nChunks; i++) chunkPaths.push(`${dir}/chunk_${pad(i)}.json`)

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

const FIELD_RULES = [
  `For EACH form return {id, meaning, parts, grammar, root}, using the SAME id from the file:`,
  `- meaning: a rich plain-English core meaning of the WORD ITSELF. Where there is no clean English equivalent (particles like inna/qad, or loaded terms like taqwa, deen, rabb), EXPLAIN the concept/function in a sentence rather than a one-word gloss.`,
  `- parts: the morphological breakdown — split the word into its pieces (prefix(es), stem, suffix/ending, attached pronouns), each { ar:<Arabic segment>, tr:<transliteration>, en:<plain-English gloss> }. e.g. bismi -> [bi "with", ism "name"]; wal-samāi -> [wa "by (oath)", l- "the", samā' "sky/heaven", -i "genitive ending"]. The segments MUST reconstruct the word.`,
  `- grammar: translate the GRAMMAR into everyday English — especially the ENDING: what does the final vowel/case/tense/person mark mean? e.g. "the -i ending is genitive: it typically links the word to a following noun ('… OF …') or follows a preposition/oath particle"; "the na- prefix means 'we'". Describe the GENERAL function the ending signals, not a role in one specific sentence. Be concrete; avoid jargon (or gloss it). The ending explanation MUST match the actual ending shown in the transliteration (-i vs -u vs -a vs -ī).`,
  `- root: the triliteral root with its core sense, e.g. "ر-ح-م (r-ḥ-m) — mercy". Use "—" for particles or proper names that have none.`,
].join('\n')

const INTRINSIC_RULE =
  `INTRINSIC ONLY: this one analysis is reused at EVERY place the exact form occurs across the whole Qur'an. Describe the word ITSELF — its inherent morphology and core sense. Do NOT reference a specific verse, surah, or position: never write "here", "in this verse", "this sūrah", "verse 1", or describe the role it plays in one particular sentence. The gloss given is only a hint to the sense.`

function draftPrompt(path) {
  return [
    `You are a precise scholar of Qur'anic Arabic morphology writing a per-word study aid for a Qur'an study web app. Plain English, accurate grammar, reverent tone.`,
    `Use the Read tool on EXACTLY this file (a small JSON array of forms [{id, ar, tr, gloss}]):`,
    path,
    `Analyse EACH form in that file.`,
    ``,
    INTRINSIC_RULE,
    ``,
    FIELD_RULES,
    ``,
    `HARD RULES: parts MUST reconstruct the word; the ending explanation MUST match the transliteration. Do NOT invent grammar. Use "Allah", never the standalone word "God". Concise but genuinely informative.`,
    `Return { words: [ {id, meaning, parts, grammar, root}, ... ] } covering EVERY id in the file.`,
  ].join('\n')
}

function verifyPrompt(path, draft) {
  return [
    `You are an ADVERSARIAL checker of an INTRINSIC per-word Arabic morphology analysis. Be strict. Check EACH word, id by id.`,
    `First use the Read tool on EXACTLY this file to see the source forms [{id, ar, tr, gloss}]:`,
    path,
    ``,
    `For each id verify: 1) the "parts" segments actually reconstruct the word; 2) the "grammar"/ending explanation matches the real ending in the transliteration (genitive -i, nominative -u, accusative -a, possessive -ī, verb person/form, etc.); 3) the "root" is correct; 4) the meaning is faithful and untranslatable concepts are actually explained; 5) it is INTRINSIC — flag any reference to a specific verse/surah/position ("here", "in this verse", verse numbers).`,
    `Flag every real error in "issues" as "id N: <what is wrong>". Default to flagging when uncertain. Set pass=false if ANY word has a substantive morphological/grammatical error or a non-intrinsic reference.`,
    ``,
    `DRAFT:`,
    JSON.stringify(draft.words, null, 1),
    ``,
    `Return the verdict object.`,
  ].join('\n')
}

function finalizePrompt(draft, verdict) {
  return [
    `Finalize this INTRINSIC per-word analysis. Resolve EVERY issue the checker raised; fix any inaccurate segmentation, ending, case, person, or root, and remove any reference to a specific verse/surah/position (keep it intrinsic to the form).`,
    `Keep the SAME ids and schema (id, meaning, parts:[{ar,tr,en}], grammar, root). Use "Allah", never standalone "God". Accurate, plain-English, concise but informative. Return EVERY id present in the draft.`,
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
log(`AI word-by-word (intrinsic, global-cache): surah ${surah}, chunks ${start}..${start + chunkPaths.length - 1} of ${nChunks}`)

const perChunk = await pipeline(
  chunkPaths,
  (path, _orig, i) => agent(draftPrompt(path), { label: `draft c${start + i}`, phase: 'Draft', schema: DRAFT_SCHEMA }),
  (draft, path, i) => agent(verifyPrompt(path, draft), { label: `verify c${start + i}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: FAST_MODEL })
      .then((verdict) => ({ draft, verdict })),
  (b, path, i) => agent(finalizePrompt(b.draft, b.verdict), { label: `finalize c${start + i}`, phase: 'Finalize', schema: FINAL_SCHEMA })
      .then((final) => {
        const dById = {}; for (const w of (b.draft.words || [])) dById[w.id] = w
        const fById = {}; for (const w of (final.words || [])) fById[w.id] = w
        const ids = new Set([...Object.keys(dById), ...Object.keys(fById)].map(Number))
        return [...ids].map((id) => {
          const w = fById[id] || dById[id]  // fall back to the draft if finalize dropped an id
          if (!w) return null
          return { id, entry: { meaning: w.meaning, parts: w.parts || [], grammar: w.grammar, root: w.root || '' } }
        }).filter(Boolean)
      }),
)

const analyses = perChunk.filter(Boolean).flat()
log(`Done: ${analyses.length} form analyses from ${chunkPaths.length} chunk(s). (assemble_wbw.py reports any unfilled positions.)`)
return { surah, start, count: chunkPaths.length, analysed: analyses.length, analyses }
