export const meta = {
  name: 'layered-tafsir-pipeline',
  description: 'Draft, adversarially verify (hadith/creed/craft), and finalize layered AI-tafsir for given ayahs of a surah, grounded in classical sources',
  phases: [
    { title: 'Draft', detail: 'Synthesize layered tafsir per ayah from source markdown' },
    { title: 'Verify', detail: '3 adversarial lenses per draft: hadith grounding, creed, craft' },
    { title: 'Finalize', detail: 'Resolve reviewer issues; enforce concise length' },
  ],
}

// args: { surah: <number>, ayahs: <number[]> }
const VAULT = String.raw`C:\Users\Reza Karim\OneDrive\Quran-Project\Quran-obs`
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { /* leave as-is */ } }
const surah = A && A.surah
const ayahList = (A && A.ayahs) || []
if (!surah || !ayahList.length) {
  log('No surah/ayahs resolved from args; nothing to do. argsType=' + (typeof args))
  return { error: 'no-args', argsType: typeof args, argsValue: args }
}

const AYAHS = ayahList.map((a) => ({
  s: surah,
  a,
  ref: `${surah}:${a}`,
  file: `${VAULT}\\Surah_${surah}\\Ayah_${a}.md`,
}))

const HADITH_ITEM = { type: 'object', properties: { teaching: { type: 'string' }, collection: { type: 'string' }, source_quote: { type: 'string' } }, required: ['teaching', 'collection', 'source_quote'] }
const DRAFT_SCHEMA = { type: 'object', properties: {
  essence: { type: 'string' }, teaches: { type: 'string' }, scholars: { type: 'string' },
  sunnah: { type: 'array', items: HADITH_ITEM }, reflection: { type: 'string' },
  rendered: { type: 'string' }, grounding_note: { type: 'string' },
}, required: ['essence', 'teaches', 'scholars', 'sunnah', 'rendered', 'grounding_note'] }
const VERDICT_SCHEMA = { type: 'object', properties: {
  lens: { type: 'string' }, pass: { type: 'boolean' }, severity: { type: 'string', enum: ['none', 'minor', 'major'] },
  issues: { type: 'array', items: { type: 'string' } }, ungrounded_hadith: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' },
}, required: ['lens', 'pass', 'severity', 'issues', 'notes'] }
const FINAL_SCHEMA = { type: 'object', properties: {
  essence: { type: 'string' }, teaches: { type: 'string' }, scholars: { type: 'string' },
  sunnah: { type: 'array', items: HADITH_ITEM }, reflection: { type: 'string' },
  rendered: { type: 'string' }, char_count: { type: 'number' },
  changes_made: { type: 'array', items: { type: 'string' } }, unresolved: { type: 'array', items: { type: 'string' } },
}, required: ['essence', 'teaches', 'scholars', 'sunnah', 'rendered', 'changes_made', 'unresolved'] }

const LENSES = [
  { key: 'hadith', title: 'Hadith authenticity & grounding', needsSource: true, instruction: "For EVERY hadith in the draft, verify it actually appears in the source file's Ibn Kathir or Maarif ul Quran text for THIS ayah. Any hadith not present in the source is UNGROUNDED — flag it MAJOR and list it in ungrounded_hadith (fabrication risk). Verify the named collection matches the source. Confirm no isnad or wording was invented. Do NOT rely on your own memory of hadith — only the source file. The file may be large; read it fully (page with offset if truncated)." },
  { key: 'aqeedah', title: 'Creed (Ahl al-Sunnah) soundness', needsSource: false, instruction: "Flag anything that distorts Allah's names/attributes or the unseen, any anthropomorphism, any sectarian or disputed opinion stated as settled fact, or any claim outside mainstream Sunni creed. Identifications of groups/people must be attributed as the source attributes them, not stated as blanket judgements. Doctrinal errors = major; wording risks = minor." },
  { key: 'craft', title: 'Faithfulness to source + conciseness & power', needsSource: true, instruction: "Confirm the synthesis faithfully reflects the source's Ibn Kathir / Maarif without distortion or overreach (read the source). Then judge craft: is it CONCISE (rendered ~600-1100 chars, never over 1800), vivid, and non-repetitive? Does it avoid merely restating the translation? Flag padding, repetition across layers, vagueness, distortion, or flat writing." },
]

function draftPrompt(item) {
  return [
    `You are a careful Sunni (Ahl al-Sunnah) Islamic-studies editor writing a CONCISE, POWERFUL, LAYERED tafsir for ${item.ref} for a Quran study web app. The standard is very high; aim to match or beat a polished hand-written entry.`,
    ``,
    `STEP 1 — Read the source. Call the Read tool on EXACTLY this absolute path (do not alter it):`,
    item.file,
    `It has YAML frontmatter (arabic, translation, word_by_word) and markdown sections such as "Tafsir Ibn Kathir", "Maarif ul Quran", "Context". The file MAY BE LARGE — read it fully (page with offset if the Read result is truncated) so you do not miss hadith or Maarif content.`,
    ``,
    `STEP 2 — Synthesize a layered tafsir grounded STRICTLY in that file. Hard rules:`,
    `- Base every claim on the file's Ibn Kathir / Maarif / Context text. Do NOT use your own memory of the Qur'an or hadith.`,
    `- Hadith: include ONLY hadith that appear in the source text. For each, copy the exact source sentence it came from into source_quote, and name the collection only as the source names it. Never invent isnad, wording, or grading. If the source has NO hadith for this ayah, return an EMPTY sunnah array — do not fabricate one.`,
    `- Creed: stay within mainstream Ahl al-Sunnah; attribute named scholars/companions (Ibn 'Abbas, Mujahid, Qatadah...) as the source does. For divine attributes, follow the Salaf method as the source presents it (affirm without likening or distorting).`,
    `- Voice: clear, reverent, vivid. Use "Allah"; put the honorific after the Prophet. Unpack Arabic terms (Rahman, taqwa, sabr, tawhid...) rather than flattening them.`,
    ``,
    `LENGTH: be genuinely concise. Target ~600-800 characters in "rendered"; NEVER exceed 1800. Cut anything that merely restates an earlier layer.`,
    ``,
    `LAYERS:`,
    `- essence: ONE sentence capturing the heart of the ayah.`,
    `- teaches: 1-3 sentences — meaning, key terms unpacked.`,
    `- scholars: classical commentary, attributed (Ibn Kathir / Maarif / named salaf).`,
    `- sunnah: the MOST relevant authentic hadith FROM THE SOURCE (0-2 items).`,
    `- reflection: ONE short line — how a believer carries this into life (in the source's spirit; no new factual claims).`,
    ``,
    `Also produce "rendered": display markdown in this exact shape, OMITTING any empty layer (omit the whole "From the Sunnah" line if sunnah is empty):`,
    `**Essence** <essence>`,
    ``,
    `**What it teaches** <teaches>`,
    ``,
    `**The scholars** <scholars>`,
    ``,
    `**From the Sunnah** <hadith teaching> (<Collection>)`,
    ``,
    `**Reflection** <reflection>`,
    ``,
    `Set grounding_note to one line: what you grounded the hadith on, or "no hadith in source".`,
    `Return ONLY the structured object.`,
  ].join('\n')
}

function verifyPrompt(item, draft, lens) {
  const parts = [
    `You are an ADVERSARIAL reviewer of a layered tafsir for ${item.ref}. Your lens: ${lens.title}.`,
    lens.instruction,
    ``,
    `DRAFT UNDER REVIEW:`,
    `---`,
    draft.rendered,
    `---`,
    `Hadith the writer claims, with the source quotes they attribute them to:`,
    JSON.stringify(draft.sunnah, null, 2),
  ]
  if (lens.needsSource) parts.push(``, `You MUST independently Read this exact file and check against it (do not rely on memory):`, item.file)
  parts.push(``, `Be strict and skeptical; default to flagging when uncertain. Set pass=false if there is ANY major issue. Put any hadith not actually found in the source into ungrounded_hadith (empty array if all grounded or not applicable). Return the verdict object with lens="${lens.key}".`)
  return parts.join('\n')
}

function finalizePrompt(item, draft, verdicts) {
  return [
    `You are finalizing the layered tafsir for ${item.ref}. Resolve EVERY issue the reviewers raised.`,
    `Re-read the source file if needed (Read tool, exact path; page through if large): ${item.file}`,
    `Grounding rules still apply: hadith only from the source; drop any hadith flagged as ungrounded; never fabricate.`,
    `LENGTH: keep "rendered" concise and powerful — target ~600-800 chars, HARD CAP 1800. Trim padding and cross-layer repetition while keeping the power.`,
    ``,
    `DRAFT:`,
    draft.rendered,
    ``,
    `REVIEWER VERDICTS:`,
    JSON.stringify(verdicts, null, 2),
    ``,
    `Produce the corrected FINAL layered tafsir (same layers + "rendered" markdown). Set char_count to rendered.length. List changes_made; list any unresolved concerns (empty array if none). Return the final object.`,
  ].join('\n')
}

phase('Draft')
log(`Layered tafsir (Opus + 3-reviewer): surah ${surah}, ayahs ${ayahList.join(', ')}`)

const results = await pipeline(
  AYAHS,
  (item) => agent(draftPrompt(item), { label: `draft ${item.ref}`, phase: 'Draft', schema: DRAFT_SCHEMA }),
  (draft, item) => parallel(LENSES.map((lens) => () =>
      agent(verifyPrompt(item, draft, lens), { label: `verify:${lens.key} ${item.ref}`, phase: 'Verify', schema: VERDICT_SCHEMA })
    )).then((verdicts) => ({ item, draft, verdicts: verdicts.filter(Boolean) })),
  (bundle, item) => agent(finalizePrompt(item, bundle.draft, bundle.verdicts), { label: `finalize ${item.ref}`, phase: 'Finalize', schema: FINAL_SCHEMA })
      .then((final) => ({ surah: item.s, ayah: item.a, final, verdicts: bundle.verdicts })),
)

return results.filter(Boolean).sort((x, y) => x.ayah - y.ayah)
