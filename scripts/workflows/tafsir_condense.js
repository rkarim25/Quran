export const meta = {
  name: 'tafsir-condense',
  description: 'Tighten passage tafsir drafts that overshot the length guard (MAX_TAFSIR_CHARS in tafsir_passages.py). One agent per passage re-reads that passage\'s source bundle and its own draft, then cuts padding and repetition WITHOUT dropping any grounded point and WITHOUT adding anything new. Rewrites draft_<a>_<b>.json in place. args: {surah, dir, passages:[{start,end,target?}]}.',
  whenToUse: 'After `tafsir_passages.py validate` reports "<n> chars exceeds guard". Not part of the normal loop — only when drafting runs long.',
  phases: [
    { title: 'Condense', detail: 'One agent per over-length passage' },
    { title: 'Save', detail: 'Rewrite the draft file in place' },
  ],
}

let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) {} }
const surah = A && A.surah
const dir = A && A.dir
const passages = (A && A.passages) || []
const DEFAULT_TARGET = (A && A.target) || 16500
if (!surah || !dir || !passages.length) {
  log('Missing args {surah, dir, passages}; nothing to do.')
  return { error: 'no-args' }
}

const CONDENSE_SCHEMA = {
  type: 'object',
  properties: {
    tafsir: { type: 'string' },
    chars: { type: 'number' },
    what_was_cut: { type: 'array', items: { type: 'string' } },
  },
  required: ['tafsir'],
}

// Same non-negotiables as tafsir_draft.js — condensing must not become a
// licence to paraphrase a hadith loosely or drop an attribution.
const HARD_RULES = [
  `GROUNDING: every statement must still trace to the source bundle. Never add anything from your own memory of the Qur'an or of tafsir literature.`,
  `HADITH: do NOT add any hadith. Do not alter the wording, grading, or collection name of a hadith already present. If you cut a hadith, cut it whole — never leave a half-quoted narration or an attribution without its content.`,
  `CREED: mainstream Ahl al-Sunnah. Keep attributions of disputed views as attributions; never resolve a difference of opinion in order to save space.`,
  `LANGUAGE: always "Allah", never a standalone "God" (this includes glosses like "God-consciousness" — write "consciousness of Allah"). Honorific after the Prophet ﷺ.`,
].join('\n')

function condensePrompt(p) {
  const target = p.target || DEFAULT_TARGET
  return [
    `You are tightening an existing tafsir for sūrah ${surah}, ayat ${p.start}–${p.end}${p.title ? ` — "${p.title}"` : ''}. It is too long for the site's length guard and must come down to AT MOST ${target} characters.`,
    ``,
    `Read the current draft:`,
    `${dir}/draft_${p.start}_${p.end}.json`,
    ``,
    `And re-read the source bundle it was written from, so you can confirm that everything you keep is still grounded:`,
    `${dir}/src_${p.start}_${p.end}.md`,
    ``,
    `THIS IS AN EDIT, NOT A REWRITE. Preserve the voice, the structure, and every substantive point. Reduce length by removing:`,
    `  • restatement — the same idea said twice in different words, or a summary sentence that repeats the paragraph above it;`,
    `  • throat-clearing — "it is important to note that", "we should reflect on how", windups before the actual point;`,
    `  • over-elaborated examples where one clear example already carries the meaning;`,
    `  • adjective stacking and rhetorical flourishes that add warmth but no content.`,
    ``,
    `Do NOT achieve the target by deleting whole dimensions of the commentary — an occasion of revelation, a scholar's attributed view, a linguistic explanation, or a hadith the sources give are all content, not padding. If after genuine tightening you still cannot reach ${target} characters without cutting real content, cut the LEAST load-bearing content last and say so in what_was_cut.`,
    ``,
    HARD_RULES,
    ``,
    `FORMAT: keep it markdown, keep the sub-headings and bold lead-ins, keep the references to specific ayah numbers.`,
    ``,
    `Count the characters of your result and make sure it is at most ${target}. Return { tafsir: "<tightened markdown>", chars: <length>, what_was_cut: [...] }.`,
  ].join('\n')
}

phase('Condense')
log(`Condensing ${passages.length} over-length passage(s) in surah ${surah}`)

const results = await pipeline(
  passages,
  (p) => agent(condensePrompt(p), { label: `condense ${p.start}-${p.end}`, phase: 'Condense', schema: CONDENSE_SCHEMA }),
  async (r, p) => {
    if (!r || !r.tafsir) return null
    const payload = JSON.stringify({ start: p.start, end: p.end, title: p.title || '', tafsir: r.tafsir })
    await agent(
      `Overwrite "${dir}/draft_${p.start}_${p.end}.json" with this JSON using the Write tool, preserving the existing "title" value if the one below is empty. Reply ONLY the word "ok".\n${payload}`,
      { label: `save ${p.start}-${p.end}`, phase: 'Save' }
    )
    return { start: p.start, end: p.end, chars: r.tafsir.length, what_was_cut: r.what_was_cut || [] }
  },
)

const done = results.filter(Boolean)
const failed = passages.filter((p) => !done.some((d) => d.start === p.start && d.end === p.end))
log(`Condensed ${done.length}/${passages.length}${failed.length ? `; MISSING: ${failed.map((p) => `${p.start}-${p.end}`).join(', ')}` : ''}`)

return {
  surah,
  requested: passages.length,
  written: done.length,
  results: done,
  missing: failed.map((p) => ({ start: p.start, end: p.end })),
  dir,
}
