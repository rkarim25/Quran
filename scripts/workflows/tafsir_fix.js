export const meta = {
  name: 'tafsir-fix',
  description: 'Repair validator-flagged passage tafsir drafts in place: trim over-length passages and remove standalone "God" wording, without weakening grounding.',
  whenToUse: 'After `tafsir_passages.py validate` reports length-guard or standalone-God problems for drafted passages.',
  phases: [{ title: 'Fix', detail: 'one agent per flagged passage, edits its own draft file' }],
}

const a = typeof args === 'string' ? JSON.parse(args) : args
const surah = a.surah
const dir = a.dir
const items = a.items || []
log(`tafsir-fix: surah=${surah} items=${items.length} argsType=${typeof args}`)

phase('Fix')

const results = await parallel(items.map(it => () => agent(
`You are repairing an already-written passage tafsir for Surah ${surah}, ayat ${it.start}-${it.end}.

The draft file is: ${dir}/draft_${it.start}_${it.end}.json
It is JSON with keys: start, end, title, tafsir. Only the "tafsir" string may change.
The passage's source bundle (the ONLY permitted source of content) is: ${dir}/src_${it.start}_${it.end}.md

A validator flagged these problems:
${it.issues.map(i => '- ' + i).join('\n')}

Fix EXACTLY these problems and nothing else:

1. LENGTH (if flagged): the tafsir must end up UNDER 17600 characters.
   Achieve this ONLY by DELETING whole paragraphs or whole sub-sections that are the
   least essential — tangential asides, secondary variant reports, digressions, repeated
   restatements, or an over-long "living this" style closing. Prefer deleting a few large
   low-value paragraphs over many small edits.
   NEVER paraphrase, compress or reword surviving sentences to save space.
   NEVER delete or truncate: a hadith and its attribution, a named scholar's attributed
   view, the explanation of any ayah in the range, or any markdown heading whose section
   still has content. Every ayah in ${it.start}-${it.end} must still be explained.
   If you delete a paragraph that a heading introduced and nothing remains under that
   heading, delete the heading too.

2. STANDALONE 'God' (if flagged): the word "God" must not appear as a standalone word
   anywhere (this includes "God-fearing", "God-given", "God-conscious", "God forbid",
   and "the God who...").
   Replace with Allah-based phrasing that keeps the meaning: e.g. "consciousness of Allah",
   "the knowledge Allah gave him", "the One worthy of worship", "far be it from him".
   IMPORTANT: if the "God" sits inside quotation marks quoting a source, do NOT silently
   alter the words inside the quote. Instead drop the quotation marks and paraphrase the
   sentence as reported speech, so nothing is misquoted.
   The Arabic divine name is fine written as "Ilāh"/"al-Ḥakīm" with diacritics.

Rules that still bind you absolutely:
- NEVER add any new content, claim, hadith, isnad, grading or collection name. You are
  only deleting and rewording what is already there.
- NEVER add a collection name to an existing hadith.
- Always "Allah", never a standalone "God"; keep the honorific ﷺ after the Prophet.

Steps: Read the draft file. Make the edits. Write the file back as JSON with the SAME
keys (start, end, title, tafsir), UTF-8, ensure_ascii false. Then verify by re-reading it
that the JSON parses, that len(tafsir) < 17600 if length was flagged, and that the regex
\\bGod\\b no longer matches if God was flagged.

Return a short JSON object: {"range":"${it.start}-${it.end}","final_len":<int>,"deleted":["short label of each paragraph/section you removed"],"god_fixed":<true|false>}`,
  { label: `fix:${it.start}-${it.end}`, phase: 'Fix' }
)))

return { surah, requested: items.length, done: results.filter(Boolean).length }
