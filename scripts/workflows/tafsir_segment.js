export const meta = {
  name: 'tafsir-segment',
  description: 'Segment a surah into thematically coherent PASSAGES for passage-based AI tafsir. Reads the compact outline written by `python scripts/tafsir_passages.py outline --surah N`, proposes contiguous ayah ranges that each hold one coherent theme, has an adversarial reviewer attack the boundaries, then writes scripts/_tafsir/surah_N/passages.json. args: {surah, dir, ayah_count}. Coverage is enforced afterwards in Python (tafsir_passages.py bundles) — this step only has to get the themes right.',
  whenToUse: 'Step B of the passage-tafsir loop. See TAFSIR_PLAN.md / the resume-ai-tafsir skill.',
  phases: [
    { title: 'Segment', detail: 'Propose thematic passage ranges from the surah outline' },
    { title: 'Review', detail: 'Adversarially attack the boundaries; merge/split as needed' },
    { title: 'Write', detail: 'Persist passages.json' },
  ],
}

let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) {} }
const surah = A && A.surah
const dir = A && A.dir
const ayahCount = A && A.ayah_count
if (!surah || !dir || !ayahCount) {
  log('Missing args {surah, dir, ayah_count}; nothing to do.')
  return { error: 'no-args' }
}

const outlinePath = `${dir}/outline.json`
const passagesPath = `${dir}/passages.json`

const PASSAGE = {
  type: 'object',
  properties: {
    start: { type: 'integer' },
    end: { type: 'integer' },
    title: { type: 'string' },
    why: { type: 'string' },
  },
  required: ['start', 'end', 'title'],
}
const SEG_SCHEMA = {
  type: 'object',
  properties: { passages: { type: 'array', items: PASSAGE } },
  required: ['passages'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    passages: { type: 'array', items: PASSAGE },
  },
  required: ['pass', 'issues', 'passages'],
}

// Passage-size guidance. Not a hard rule — a long narrative (Yusuf, the Cave)
// legitimately runs long, and a dense legal passage legitimately runs short.
const SIZING = [
  `Aim for passages that a reader can hold in mind at once: typically 3–12 ayat.`,
  `Go SHORTER when each ayah opens a distinct ruling or subject.`,
  `Go LONGER when ayat form one continuous narrative, oath sequence, or argument that would be mutilated by splitting.`,
  `A single ayah may stand alone ONLY if it is genuinely self-contained and weighty (e.g. Ayat al-Kursi, a standalone legal verse).`,
  `Never split mid-sentence, mid-story, or between a question and its answer.`,
  `Every ayah from 1 to ${ayahCount} must fall inside exactly one passage — contiguous, ascending, no gaps, no overlaps. The FIRST passage must start at 1 and the LAST must end at ${ayahCount}.`,
].join('\n')

function segmentPrompt() {
  return [
    `You are a scholar of the Qur'an segmenting sūrah ${surah} (${ayahCount} ayat) into thematically coherent PASSAGES for a study website.`,
    `A passage is a contiguous run of ayat that belong together — one movement of meaning, so tafsir written for the whole run reads naturally rather than repeating itself ayah by ayah.`,
    ``,
    `Use the Read tool on EXACTLY this file — a compact outline of the whole sūrah, one entry per ayah with its English translation:`,
    outlinePath,
    ``,
    `SIZING AND BOUNDARY RULES:`,
    SIZING,
    ``,
    `For EACH passage give:`,
    `- start, end: ayah numbers (inclusive)`,
    `- title: a short, concrete theme (4–9 words). Name what the passage is ABOUT, e.g. "The hypocrites' claim to belief" — not a vague label like "Various matters".`,
    `- why: one sentence on what holds these ayat together and why the boundary falls where it does.`,
    ``,
    `Work through the sūrah in order and cover it completely. Return { passages: [...] }.`,
  ].join('\n')
}

function reviewPrompt(seg) {
  return [
    `You are an ADVERSARIAL reviewer of a proposed passage segmentation of sūrah ${surah} (${ayahCount} ayat). Be strict and specific.`,
    `Read the sūrah outline first:`,
    outlinePath,
    ``,
    `Attack the proposal on these grounds:`,
    `1. COVERAGE: does it cover 1..${ayahCount} exactly once, ascending, no gaps or overlaps? (First starts at 1, last ends at ${ayahCount}.)`,
    `2. BAD BOUNDARIES: any passage that splits a continuous narrative, an oath sequence, a question from its answer, or a ruling from its exception.`,
    `3. INCOHERENT PASSAGES: any passage bundling unrelated subjects that a single tafsir could not treat without becoming a list.`,
    `4. SIZE: any passage so long a reader loses the thread, or so short it forces the per-ayah repetition this format exists to avoid.`,
    `5. TITLES: vague, generic, or inaccurate titles.`,
    ``,
    `List every real problem in "issues" as "ayat A-B: <what is wrong>". Then return the CORRECTED full segmentation in "passages" — the complete list covering 1..${ayahCount}, with your fixes applied. If the proposal is already sound, set pass=true, issues=[], and return it unchanged.`,
    ``,
    `PROPOSAL:`,
    JSON.stringify(seg.passages, null, 1),
  ].join('\n')
}

phase('Segment')
log(`Segmenting surah ${surah} (${ayahCount} ayat) into thematic passages`)
const seg = await agent(segmentPrompt(), { label: `segment s${surah}`, phase: 'Segment', schema: SEG_SCHEMA })
if (!seg || !seg.passages || !seg.passages.length) {
  log('Segmentation produced nothing.')
  return { error: 'no-segmentation' }
}
log(`Proposed ${seg.passages.length} passage(s)`)

phase('Review')
const review = await agent(reviewPrompt(seg), { label: `review s${surah}`, phase: 'Review', schema: REVIEW_SCHEMA })
let passages = seg.passages
if (review && Array.isArray(review.passages) && review.passages.length) {
  passages = review.passages
  const n = (review.issues || []).length
  log(n ? `Reviewer raised ${n} issue(s); using corrected segmentation (${passages.length} passages)`
        : `Reviewer passed the segmentation (${passages.length} passages)`)
} else {
  log('Reviewer returned nothing usable; keeping the original proposal.')
}

// Normalise + sort before persisting; Python re-checks coverage as a hard gate.
passages = passages
  .filter((p) => p && Number.isFinite(+p.start) && Number.isFinite(+p.end))
  .map((p) => ({ start: +p.start, end: +p.end, title: String(p.title || '').trim(), why: String(p.why || '').trim() }))
  .sort((a, b) => a.start - b.start)

phase('Write')
const payload = JSON.stringify({ surah, ayah_count: ayahCount, passages }, null, 1)
await agent(
  `Write this JSON to "${passagesPath}" using the Write tool. Reply ONLY the word "ok".\n${payload}`,
  { label: 'write passages', phase: 'Write' }
)
log(`Wrote ${passages.length} passage(s) to ${passagesPath}`)

return {
  surah,
  passage_count: passages.length,
  issues: (review && review.issues) || [],
  passages,
}
