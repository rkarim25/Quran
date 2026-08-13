export const meta = {
  name: 'tafsir-draft',
  description: 'Draft passage-based AI tafsir for a surah. One agent per passage reads that passage\'s self-contained source bundle (scripts/_tafsir/surah_N/src_<a>_<b>.md, written by `python scripts/tafsir_passages.py bundles`) and writes tafsir for the whole ayah range. An adversarial grounding check verifies every claim and every hadith against that same bundle; flagged passages go to a finalize pass. Each passage is persisted as draft_<a>_<b>.json so a session limit never loses completed work. args: {surah, dir, passages:[{start,end,title}]}.',
  whenToUse: 'Step D of the passage-tafsir loop. See TAFSIR_PLAN.md / the resume-ai-tafsir skill.',
  phases: [
    { title: 'Draft', detail: 'One agent per passage, grounded in its source bundle' },
    { title: 'Verify', detail: 'Adversarial grounding + creed check' },
    { title: 'Finalize', detail: 'Resolve flagged issues, then persist each passage' },
  ],
}

let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) {} }
const surah = A && A.surah
const dir = A && A.dir
const all = (A && A.passages) || []
if (!surah || !dir || !all.length) {
  log('Missing args {surah, dir, passages}; nothing to do.')
  return { error: 'no-args' }
}
// Optional slice, so a big surah can be run in batches: {start_index, count}
const si = (A && A.start_index) || 0
const cnt = (A && A.count) || (all.length - si)
const passages = all.slice(si, si + cnt)

const FAST_MODEL = 'sonnet'
const DRAFT_SCHEMA = {
  type: 'object',
  properties: { tafsir: { type: 'string' }, sections_used: { type: 'array', items: { type: 'string' } } },
  required: ['tafsir'],
}
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    ungrounded_claims: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'issues'],
}
const FINAL_SCHEMA = {
  type: 'object',
  properties: { tafsir: { type: 'string' }, changes_made: { type: 'array', items: { type: 'string' } } },
  required: ['tafsir'],
}

const src = (p) => `${dir}/src_${p.start}_${p.end}.md`

// The non-negotiables, carried over from LAYERED_TAFSIR_RUNBOOK.md.
const HARD_RULES = [
  `GROUNDING: every statement must trace to the source bundle you were given. Never draw on your own memory of the Qur'an or of tafsir literature. If the sources do not support a point, leave it out.`,
  `HADITH: cite a hadith ONLY if it appears in that bundle, and name the collection exactly as the bundle names it. NEVER invent or complete an isnad, wording, or grading. If the bundle quotes the Prophet ﷺ without naming a collection, you may still convey the teaching but must NOT attribute it to a named collection. After drafting, re-read the bundle and drop any hadith you cannot find there.`,
  `CREED: mainstream Ahl al-Sunnah. Affirm the divine attributes as the Salaf did, without likening them to creation and without explaining them away. Where the scholars genuinely differed, attribute the views rather than presenting one as settled.`,
  `LANGUAGE: always "Allah", never a standalone "God". Place the honorific after the Prophet ﷺ. Reverent, warm, plain English — write for an intelligent adult who is not an Arabic specialist. Explain any technical term you use.`,
]. join('\n')

// The user's core requirement: depth follows the passage, not a fixed template.
const SHAPE = [
  `SHAPE OF THE TAFSIR — this is NOT a fixed template. Serve the passage.`,
  `Always open with: what this passage is about in one or two sentences, and what holds these ayat together as a unit.`,
  `Then go deep on whatever THIS passage actually needs. Judge that from the sources, and let one or two dimensions dominate rather than touching every base shallowly:`,
  `  • CONTEXT / SEERAH — when the sources give an occasion of revelation or a moment in the Prophet's ﷺ life that unlocks the passage, tell that story properly; it is often the single most illuminating thing.`,
  `  • LANGUAGE — when meaning turns on the Arabic, open up the key words: root sense, why this word and not a near-synonym, what a grammatical choice implies. Make the reader feel the word.`,
  `  • THE SCHOLARS — where classical commentary adds real depth, give it with attribution (Ibn Kathir, Maʿārif ul Qurʼān, or the named early authority the source cites).`,
  `  • FROM THE SUNNAH — hadith the sources themselves cite for these ayat.`,
  `  • LIVING IT — where the passage is practical, say concretely what it asks of a believer. Never moralise beyond what the passage supports.`,
  `Skip any dimension the passage does not call for. A passage of legal rulings and a passage of oaths about the Last Day should read very differently.`,
  ``,
  `FORMAT: markdown. Use bold lead-ins or short "## " sub-headings to guide the eye — the reader is scrolling on a phone. Refer to specific ayat by number ("In ayah 5 …") so the reader can follow along, since this covers a RANGE.`,
  `LENGTH: however long genuine helpfulness requires — do not pad, and do not truncate real scholarly depth to hit a target. A dense opening passage may run several thousand words; a short oath sequence may need far less.`,
  `HARD CEILING: 17000 characters. This is enforced downstream — anything longer is rejected and has to be cut, which costs more depth than writing tightly would have. Before returning, count your draft; if it exceeds 17000, cut repetition and rhetorical build-up until it fits rather than handing over an over-long draft.`,
].join('\n')

function draftPrompt(p) {
  return [
    `You are writing the tafsir for sūrah ${surah}, ayat ${p.start}–${p.end}${p.title ? ` — "${p.title}"` : ''}, for a Qur'an study website.`,
    `This tafsir covers the WHOLE range as one unit. Do not write ayah-by-ayah notes; write the passage's meaning as a connected whole, referring to individual ayat where useful.`,
    `The reader's goal: everything they need to understand these ayat more deeply.`,
    ``,
    `Use the Read tool on EXACTLY this file — a self-contained bundle of the source material (translations plus the Ibn Kathir and Maʿārif ul Qurʼān commentary) for these ayat:`,
    src(p),
    ``,
    HARD_RULES,
    ``,
    SHAPE,
    ``,
    `Return { tafsir: "<markdown>", sections_used: ["<which source sections you actually drew on>"] }.`,
  ].join('\n')
}

function verifyPrompt(p, draft) {
  return [
    `You are an ADVERSARIAL fact-checker for a passage of Qur'anic tafsir (sūrah ${surah}, ayat ${p.start}–${p.end}). Assume the writer over-reached; your job is to catch it. Be strict.`,
    `Use the Read tool on EXACTLY this file — the ONLY material the writer was permitted to use:`,
    src(p),
    ``,
    `Check, in order of seriousness:`,
    `1. FABRICATED HADITH — the worst failure. For every hadith or Prophetic saying in the draft: does it actually appear in the bundle? Is the collection named there, and named the same way? Flag ANY invented isnad, grading, wording, or a collection name the bundle does not give. When in doubt, flag it.`,
    `2. UNGROUNDED CLAIMS — historical assertions, occasions of revelation, attributions to named scholars, or linguistic claims that the bundle does not support. List each in "ungrounded_claims" quoting the offending phrase.`,
    `3. CREED — anything outside mainstream Ahl al-Sunnah; divine attributes likened to creation or explained away; a disputed view stated as settled fact.`,
    `4. RANGE FIDELITY — does it genuinely cover ayat ${p.start}–${p.end} as a unit, or does it drift onto other ayat / collapse into per-ayah notes?`,
    `5. STYLE — standalone "God" instead of "Allah"; missing honorific after the Prophet ﷺ; jargon left unexplained.`,
    ``,
    `Set pass=false if ANY hadith is questionable or ANY substantive claim is ungrounded. Record every problem in "issues" as "<category>: <specific problem>".`,
    ``,
    `DRAFT:`,
    draft.tafsir,
  ].join('\n')
}

function finalizePrompt(p, draft, verdict) {
  return [
    `Revise this tafsir for sūrah ${surah}, ayat ${p.start}–${p.end}, resolving EVERY issue the fact-checker raised.`,
    `Re-read the source bundle to confirm your fixes:`,
    src(p),
    ``,
    `Remove — do not soften — any hadith you cannot find in that bundle, and any claim it does not support. It is far better to say less than to say something unsupported.`,
    `Keep everything that was accurate; preserve the depth and warmth of the original.`,
    ``,
    HARD_RULES,
    ``,
    `FACT-CHECKER VERDICT:`,
    JSON.stringify(verdict, null, 1),
    ``,
    `DRAFT:`,
    draft.tafsir,
    ``,
    `Return { tafsir: "<corrected markdown>", changes_made: [...] }.`,
  ].join('\n')
}

// Drafting agents cannot count their own characters reliably and routinely
// overshoot. JS can, so the ceiling is enforced here rather than by asking
// nicely in the prompt. Deletion-only, so no ungrounded material can enter on
// a pass that exists purely to shorten.
const MAX_CHARS = 17400
function condensePrompt(p, text) {
  return [
    `Tighten this tafsir for sūrah ${surah}, ayat ${p.start}–${p.end}. It is ${text.length} characters and must come in under ${MAX_CHARS}. This is a COMPRESSION pass, not a rewrite.`,
    ``,
    `1. You may ONLY delete text, plus the minimal joins needed to keep sentences grammatical. Do NOT add claims, examples, attributions, or hadith. Nothing may enter the text that is not already in it.`,
    `2. NEVER drop or alter a hadith's collection name or an attribution to a named scholar (Ibn Kathir, Maʿārif ul Qurʼān, or a named early authority). If a hadith must go, drop it whole — never keep wording while losing its source, never keep a source while changing wording.`,
    `3. Cut in this order: points made twice, throat-clearing and transitions, restatements of what the ayah already says, rhetorical build-up. Preserve substance, scholarly depth, warmth, and the sub-heading structure.`,
    `4. Keep every ayah-number reference, the honorific ﷺ, and "Allah" — the word "God" must not appear standing alone.`,
    ``,
    `DRAFT:`,
    text,
    ``,
    `Return { tafsir: "<shortened markdown>" }. Count before returning; if still over ${MAX_CHARS}, cut more.`,
  ].join('\n')
}

phase('Draft')
log(`Passage tafsir: surah ${surah}, ${passages.length} passage(s)${si ? ` (from index ${si})` : ''}`)

const results = await pipeline(
  passages,
  (p) => agent(draftPrompt(p), { label: `draft ${p.start}-${p.end}`, phase: 'Draft', schema: DRAFT_SCHEMA }),
  (draft, p) => {
    if (!draft || !draft.tafsir) return { draft: null, verdict: null }
    return agent(verifyPrompt(p, draft), { label: `verify ${p.start}-${p.end}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: FAST_MODEL })
      .then((verdict) => ({ draft, verdict }))
  },
  async (b, p) => {
    if (!b || !b.draft || !b.draft.tafsir) return null   // dropped; re-run this passage later
    const clean = b.verdict && b.verdict.pass === true
      && (!b.verdict.issues || !b.verdict.issues.length)
      && (!b.verdict.ungrounded_claims || !b.verdict.ungrounded_claims.length)
    let text = b.draft.tafsir
    if (!clean) {
      const fin = await agent(finalizePrompt(p, b.draft, b.verdict), { label: `finalize ${p.start}-${p.end}`, phase: 'Finalize', schema: FINAL_SCHEMA })
      if (fin && fin.tafsir) text = fin.tafsir
    }
    // Enforce the ceiling here, where the length is actually measurable. Retry
    // once: a single condense pass sometimes still lands over.
    for (let attempt = 0; attempt < 2 && text.length > MAX_CHARS; attempt++) {
      const short = await agent(condensePrompt(p, text), { label: `condense ${p.start}-${p.end}`, phase: 'Finalize', schema: FINAL_SCHEMA })
      if (!short || !short.tafsir) break
      text = short.tafsir
    }
    // Persist immediately, one file per passage: a session limit mid-run then
    // costs only the passages still in flight, never the finished ones.
    const payload = JSON.stringify({ start: p.start, end: p.end, title: p.title || '', tafsir: text })
    const file = `${dir}/draft_${p.start}_${p.end}.json`
    // A save that silently no-ops loses the passage while the run still reports
    // success, so the write is confirmed by reading the file back. Retry once.
    let saved = false
    for (let attempt = 0; attempt < 2 && !saved; attempt++) {
      const reply = await agent(
        [
          `Write this JSON to "${file}" using the Write tool.`,
          `Then read that same file back with the Read tool to confirm it exists and parses.`,
          `Reply with ONLY the number of characters in the file's "tafsir" value — no words, no punctuation.`,
          payload,
        ].join('\n'),
        { label: `save ${p.start}-${p.end}`, phase: 'Finalize' }
      )
      const n = parseInt(String(reply || '').replace(/[^0-9]/g, ''), 10)
      saved = Number.isFinite(n) && Math.abs(n - text.length) <= 40
    }
    if (!saved) log(`SAVE UNCONFIRMED for ${p.start}-${p.end} — check the file exists before applying`)
    return { start: p.start, end: p.end, chars: text.length, verified: !!clean, over: text.length > MAX_CHARS, saved }
  },
)

const done = results.filter(Boolean)
const failed = passages.filter((p) => !done.some((d) => d.start === p.start && d.end === p.end))
log(`Drafted ${done.length}/${passages.length} passage(s)${failed.length ? `; MISSING: ${failed.map((p) => `${p.start}-${p.end}`).join(', ')}` : ''}`)
const stillOver = done.filter((d) => d.over)
if (stillOver.length) log(`STILL OVER ${MAX_CHARS} chars after condensing: ${stillOver.map((d) => `${d.start}-${d.end} (${d.chars})`).join(', ')}`)
const unconfirmed = done.filter((d) => !d.saved)
if (unconfirmed.length) log(`SAVE UNCONFIRMED: ${unconfirmed.map((d) => `${d.start}-${d.end}`).join(', ')} — verify on disk before applying`)

return {
  surah,
  requested: passages.length,
  written: done.length,
  clean_first_pass: done.filter((d) => d.verified).length,
  still_over_length: stillOver.map((d) => ({ start: d.start, end: d.end, chars: d.chars })),
  save_unconfirmed: unconfirmed.map((d) => ({ start: d.start, end: d.end })),
  missing: failed.map((p) => ({ start: p.start, end: p.end })),
  dir,
}
