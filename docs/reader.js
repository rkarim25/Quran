const cache = { index: null, surahs: {}, pristine: {}, aiWbw: {} };
const LS = {
  lastRead: "quran-last-read",
  recentReads: "quran-recent-reads",
  bookmarks: "quran-bookmarks",
  prefs: "quran-prefs",
  myWork: "quran-my-work",
  ayahEdits: (s, a) => `quran-${s}-${a}`,
};

const RECENT_READS_MAX = 5;
const RECORD_DEBOUNCE_MS = 4000;

let canSync = false;
let scrollLock = false;
let saveTimer = null;
let recordTimer = null;
let pendingRecord = null;
let visibleAyah = null;
let observer = null;
let selectedAyah = null;
let currentSurah = null;
let expandedAyah = null;

const DEFAULT_PREFS = {
  readMode: "translation",
  showTransliteration: false,
  layoutMode: "verse",
  fontScale: 1,
  transScale: 1,
  wordMode: "standard",
  activePanel: "reflection",
  theme: "light",
  bookContent: { arabic: true, translit: false, translation: true, aiTranslation: false, aiTafsir: false, ibnKathir: false, maarif: false },
};

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.prefs) || "{}");
    const merged = { ...DEFAULT_PREFS, ...raw };
    if (!raw.readMode) {
      if (raw.showAiTranslation) merged.readMode = "ai";
      else if (raw.showTranslation === false) merged.readMode = "arabic";
    }
    if (!["arabic", "translation", "ai"].includes(merged.readMode)) merged.readMode = "translation";
    if (!["verse", "book"].includes(merged.layoutMode)) merged.layoutMode = "verse";
    merged.bookContent = { ...DEFAULT_PREFS.bookContent, ...(raw.bookContent || {}) };
    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

const prefs = loadPrefs();

function savePrefs() {
  prefs.updatedAt = Date.now();
  localStorage.setItem(LS.prefs, JSON.stringify(prefs));
  QuranFirebaseSync?.schedulePush();
}

const THEMES = ["light", "sepia", "night"];
function applyTheme() {
  const t = THEMES.includes(prefs.theme) ? prefs.theme : "light";
  if (t === "light") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = t === "night" ? "☾" : t === "sepia" ? "❖" : "◐";
}
applyTheme();
document.getElementById("theme-toggle")?.addEventListener("click", () => {
  prefs.theme = THEMES[(THEMES.indexOf(prefs.theme) + 1) % THEMES.length] || "light";
  savePrefs();
  applyTheme();
});

function migrateLegacyLastRead() {
  if (localStorage.getItem(LS.recentReads)) return;
  try {
    const legacy = JSON.parse(localStorage.getItem(LS.lastRead) || "null");
    if (legacy?.surah && legacy?.ayah) {
      localStorage.setItem(
        LS.recentReads,
        JSON.stringify([{ surah: legacy.surah, ayah: legacy.ayah, at: legacy.at || Date.now() }])
      );
    }
  } catch (_) {}
}

function getRecentReads() {
  migrateLegacyLastRead();
  try {
    return JSON.parse(localStorage.getItem(LS.recentReads) || "[]");
  } catch {
    return [];
  }
}

function getLastReadForSurah(surah) {
  return getRecentReads().find((r) => r.surah === surah) || null;
}

function getLastRead() {
  const reads = getRecentReads();
  return reads.length ? reads[0] : null;
}

function persistRecentReads(list) {
  localStorage.setItem(LS.recentReads, JSON.stringify(list));
  QuranFirebaseSync?.schedulePush();
}

function recordReading(surah, ayah, at = Date.now()) {
  let list = getRecentReads().filter((r) => r.surah !== surah);
  list.unshift({ surah, ayah, at });
  list = list.slice(0, RECENT_READS_MAX);
  persistRecentReads(list);
  pendingRecord = null;
}

function scheduleRecordReading(surah, ayah) {
  visibleAyah = ayah;
  pendingRecord = { surah, ayah };
  clearTimeout(recordTimer);
  recordTimer = setTimeout(flushRecordReading, RECORD_DEBOUNCE_MS);
}

function flushRecordReading() {
  clearTimeout(recordTimer);
  if (pendingRecord) recordReading(pendingRecord.surah, pendingRecord.ayah);
}

function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(LS.bookmarks) || "[]");
  } catch {
    return [];
  }
}

function isBookmarked(surah, ayah) {
  return getBookmarks().some((b) => b.surah === surah && b.ayah === ayah);
}

function toggleBookmark(surah, ayah, surahName, snippet) {
  let list = getBookmarks();
  const i = list.findIndex((b) => b.surah === surah && b.ayah === ayah);
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ surah, ayah, surahName, snippet: snippet.slice(0, 80), at: Date.now() });
  localStorage.setItem(LS.bookmarks, JSON.stringify(list));
  QuranFirebaseSync?.schedulePush();
  return i < 0;
}

function isLocalDev() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

async function checkSync() {
  const badge = document.getElementById("sync-badge");
  if (!isLocalDev()) {
    canSync = false;
    return;
  }
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      canSync = true;
      if (badge && !QuranFirebaseSync?.isSignedIn?.()) {
        badge.hidden = false;
        badge.textContent = "Local sync";
        badge.title = "Edits save to markdown via serve.py";
        badge.classList.remove("readonly", "syncing", "offline", "synced", "error");
        badge.classList.add("local-sync");
      }
      return;
    }
  } catch (_) {}
  canSync = false;
}

function getMyWork() {
  try {
    return JSON.parse(localStorage.getItem(LS.myWork) || "{}");
  } catch {
    return {};
  }
}

function workKey(surah, ayah) {
  return `${surah}:${ayah}`;
}

function hasTadabbur(data) {
  return !!(data.personal_reflections && data.personal_reflections.trim());
}

function hasMeaningEdits(original, edited) {
  if (!original || !edited) return false;
  if ((edited.translation || "") !== (original.translation || "")) return true;
  const ow = original.word_by_word || {};
  const ew = edited.word_by_word || {};
  for (const k of new Set([...Object.keys(ow), ...Object.keys(ew)])) {
    if ((ow[k]?.translation || "") !== (ew[k]?.translation || "")) return true;
  }
  return false;
}

function meaningEditSummary(original, edited) {
  const parts = [];
  if ((edited.translation || "") !== (original.translation || "")) {
    const t = edited.translation.trim();
    parts.push(t.length > 72 ? `${t.slice(0, 72)}…` : t);
  }
  const ow = original.word_by_word || {};
  const ew = edited.word_by_word || {};
  for (const k of Object.keys(ew).sort((a, b) => +a - +b)) {
    if ((ow[k]?.translation || "") !== (ew[k]?.translation || "")) {
      const label = ew[k].transliteration || cleanArabic(ew[k].arabic);
      parts.push(`${label}: ${ew[k].translation}`);
    }
  }
  return parts.slice(0, 2).join(" · ");
}

function recordMyWork(surahId, ayahNum, edited, surahName) {
  const original = getOriginalAyah(surahId, ayahNum);
  if (!original) return;
  const work = getMyWork();
  const key = workKey(surahId, ayahNum);
  const tadabbur = hasTadabbur(edited);
  const meanings = hasMeaningEdits(original, edited);

  if (!tadabbur && !meanings) {
    delete work[key];
  } else {
    work[key] = {
      surah: surahId,
      ayah: ayahNum,
      surahName,
      tadabbur,
      meanings,
      tadabburSnippet: tadabbur ? edited.personal_reflections.trim().slice(0, 140) : "",
      meaningSnippet: meanings ? meaningEditSummary(original, edited) : "",
      at: Date.now(),
    };
  }
  localStorage.setItem(LS.myWork, JSON.stringify(work));
}

function getMyWorkList(kind) {
  return Object.values(getMyWork())
    .filter((e) => e[kind])
    .sort((a, b) => b.at - a.at);
}

function getOriginalAyah(surahId, ayahNum) {
  const pristine = cache.pristine[surahId];
  if (pristine) return pristine.ayahs.find((a) => a.ayah === ayahNum);
  return cache.surahs[surahId]?.ayahs.find((a) => a.ayah === ayahNum);
}

async function rebuildMyWorkIndex() {
  const index = await loadIndex();
  const names = Object.fromEntries(index.surahs.map((s) => [s.id, s.translated_name]));
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const m = key?.match(/^quran-(\d+)-(\d+)$/);
    if (!m) continue;
    const surah = +m[1];
    const ayah = +m[2];
    try {
      const edited = JSON.parse(localStorage.getItem(key));
      await loadSurah(surah);
      const original = getOriginalAyah(surah, ayah);
      if (original) recordMyWork(surah, ayah, edited, names[surah] || `Surah ${surah}`);
    } catch (_) {}
  }
}

function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (!parts.length) return { view: "home" };
  if (parts[0] === "bookmarks") return { view: "bookmarks" };
  if (parts[0] === "tadabbur") return { view: "tadabbur" };
  if (parts[0] === "edits") return { view: "edits" };
  if (parts.length === 1) return { view: "surah", surah: +parts[0], ayah: null };
  const study = parts[2] === "study";
  return { view: "surah", surah: +parts[0], ayah: +parts[1], study };
}

const DATA_VERSION = "21";

async function loadIndex() {
  if (!cache.index) cache.index = await (await fetch(`data/index.json?v=${DATA_VERSION}`)).json();
  return cache.index;
}

async function loadSurah(n) {
  if (!cache.surahs[n]) {
    const data = await (await fetch(`data/surah_${n}.json?v=${DATA_VERSION}`)).json();
    cache.surahs[n] = data;
    cache.pristine[n] = JSON.parse(JSON.stringify(data));
  }
  return cache.surahs[n];
}

// AI word-by-word analysis (loaded on demand; null if not generated yet)
async function loadAiWbw(n) {
  if (cache.aiWbw[n] === undefined) {
    try {
      const res = await fetch(`data/ai_wbw/surah_${n}.json?v=${DATA_VERSION}`);
      cache.aiWbw[n] = res.ok ? await res.json() : null;
    } catch (_) {
      cache.aiWbw[n] = null;
    }
  }
  return cache.aiWbw[n];
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function cleanArabic(text) {
  if (!text) return "";
  return text
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/[\u200e\u200f\ufeff\u061c]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ayahMarkerHtml(num, { end = false, inline = false } = {}) {
  const cls = [end ? "ayah-end" : "ayah-marker", inline ? "inline-ayah-marker" : ""].filter(Boolean).join(" ");
  const label = `Ayah ${num}`;
  return `<span class="${cls}" ${end || inline ? `aria-label="${label}"` : ""}>
    <span class="rosette" aria-hidden="true">
      <svg viewBox="0 0 40 40" class="rosette-svg" focusable="false">
        <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
        <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.35"/>
      </svg>
      <span class="rosette-num">${num}</span>
    </span>
  </span>`;
}

function ornament() {
  return `<div class="ornament-line" aria-hidden="true"><span>✦</span></div>`;
}

function revelationLabel(place) {
  return place === "makkah" ? "Makkah" : "Madinah";
}

function md(text) {
  if (!text) return "";
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>")
    .replace(/<p><\/p>/g, "");
}

function setBreadcrumb(html) {
  document.getElementById("breadcrumb").innerHTML = html;
}

function orderedWords(wbw) {
  if (!wbw) return [];
  return Object.keys(wbw).sort((a, b) => +a - +b).map((k) => ({ key: k, ...wbw[k] }));
}

function mergeLocalEdits(ayah, surahId) {
  const merged = { ...ayah, word_by_word: { ...ayah.word_by_word } };
  if (!canSync) {
    const local = localStorage.getItem(LS.ayahEdits(surahId, ayah.ayah));
    if (local) Object.assign(merged, JSON.parse(local));
  }
  return merged;
}

function renderArabicWords(ayah, surahId) {
  const words = orderedWords(ayah.word_by_word);
  if (!words.length) return esc(cleanArabic(ayah.arabic));
  return words
    .map(
      (w) =>
        `<span class="q-word" data-s="${surahId}" data-a="${ayah.ayah}" data-i="${w.key}" tabindex="0">${esc(cleanArabic(w.arabic))}</span>`
    )
    .join(" ");
}

function renderAyahTransliteration(ayah) {
  const words = orderedWords(ayah.word_by_word);
  if (!words.length) return "";
  return words
    .map((w) => (w.transliteration || "").trim())
    .filter(Boolean)
    .join(" ");
}

function displayTranslation(ayah) {
  if (prefs.readMode === "arabic") return { text: "", mode: "none" };
  if (prefs.readMode === "ai" && ayah.ai_translation) {
    return { text: ayah.ai_translation, mode: "ai" };
  }
  const standard = ayah.translation || ayah.qf_translation || "";
  if (prefs.readMode === "ai" || prefs.readMode === "translation") {
    const text = prefs.readMode === "ai" ? ayah.ai_translation || standard : standard;
    return { text, mode: prefs.readMode === "ai" ? "ai" : "standard" };
  }
  return { text: standard, mode: "standard" };
}

function transliterationHtml(ayah) {
  if (!prefs.showTransliteration) return "";
  const text = renderAyahTransliteration(ayah);
  if (!text) return "";
  return `<p class="transliteration-text">${esc(text)}</p>`;
}

function translationBlockHtml(ayah, { inline = false } = {}) {
  const { text: transText, mode: transMode } = displayTranslation(ayah);
  if (prefs.readMode === "arabic" || !transText) return "";
  const tag = inline ? "span" : "div";
  const cls = inline ? "book-trans-seg" : `translation-block ${transMode === "ai" ? "ai-mode" : ""}`;
  return `<${tag} class="${cls}">
        ${transMode === "ai" ? `<span class="translation-badge">AI Translation</span>` : ""}
        <p class="translation-text">${esc(transText)}</p>
        ${!inline && transMode === "standard" ? `<button type="button" class="translation-edit-btn" data-action="edit-translation" title="Edit translation" aria-label="Edit translation">✎</button>` : ""}
      </${tag}>`;
}

function ayahBlock(data, ayah, surahId) {
  const a = mergeLocalEdits(ayah, surahId);
  const bookmarked = isBookmarked(surahId, ayah.ayah);
  const hasReflection = !!(a.personal_reflections && a.personal_reflections.trim());
  return `
    <article class="ayah-block" id="ayah-${surahId}-${ayah.ayah}" data-surah="${surahId}" data-ayah="${ayah.ayah}">
      <div class="ayah-meta">
        <button type="button" class="ayah-marker-btn" data-action="select" aria-label="Ayah ${ayah.ayah}">
          ${ayahMarkerHtml(ayah.ayah)}
        </button>
        <div class="ayah-actions">
          <button type="button" class="icon-btn bookmark-btn ${bookmarked ? "active" : ""}" data-action="bookmark" aria-label="${bookmarked ? "Remove bookmark" : "Bookmark"}" title="${bookmarked ? "Remove bookmark" : "Bookmark"}">
            <span class="icon-star">${bookmarked ? "✦" : "✧"}</span>
          </button>
          <button type="button" class="icon-btn study-btn ${hasReflection ? "has-note" : ""}" data-action="study" aria-label="Study and reflect" title="Tadabbur · Tafsir">
            <span class="icon-study">${hasReflection ? "✎" : "☰"}</span>
          </button>
        </div>
      </div>
      <div class="arabic-block">
        <p class="arabic-text">${renderArabicWords(a, surahId)}${ayahMarkerHtml(ayah.ayah, { end: true })}</p>
        ${transliterationHtml(a)}
      </div>
      ${translationBlockHtml(a)}
    </article>`;
}

function bookAyahSpan(ayah, surahId) {
  const a = mergeLocalEdits(ayah, surahId);
  return `<span class="book-ayah" id="ayah-${surahId}-${ayah.ayah}" data-surah="${surahId}" data-ayah="${ayah.ayah}" title="Ayah ${ayah.ayah} — click for tafsir">
      ${renderArabicWords(a, surahId)}${ayahMarkerHtml(ayah.ayah, { end: true })}
    </span>`;
}

function bookTafsirBlock(ayah, surahId) {
  const c = prefs.bookContent || {};
  const m = mergeLocalEdits(ayah, surahId);
  let inner = "";
  if (c.aiTafsir && m.ai_tafsir) inner += `<div class="bt-block"><span class="bt-label">AI Tafsir</span><div class="bt-body">${md(m.ai_tafsir)}</div></div>`;
  if (c.ibnKathir && m.tafsir_ibn_kathir) inner += `<div class="bt-block"><span class="bt-label">Ibn Kathir</span><div class="bt-body">${md(m.tafsir_ibn_kathir)}</div></div>`;
  if (c.maarif && m.maarif_ul_quran) inner += `<div class="bt-block"><span class="bt-label">Maarif ul Quran</span><div class="bt-body">${md(m.maarif_ul_quran)}</div></div>`;
  if (!inner) return "";
  return `<div class="book-tafsir-ayah" data-ayah="${ayah.ayah}"><span class="bt-ayah-num">Ayah ${ayah.ayah}</span>${inner}</div>`;
}

function bookViewHtml(data, surahId) {
  const c = prefs.bookContent || {};
  const sec = [];
  if (c.arabic) {
    const arabicFlow = data.ayahs.map((a) => bookAyahSpan(a, surahId)).join(" ");
    sec.push(`<section class="book-section book-arabic-section" aria-label="Arabic text"><p class="book-flow arabic-flow" dir="rtl">${arabicFlow}</p></section>`);
  }
  if (c.translit) {
    const f = data.ayahs.map((a) => { const t = renderAyahTransliteration(mergeLocalEdits(a, surahId)); return t ? `<span class="book-translit-seg" data-ayah="${a.ayah}">${esc(t)}</span>` : ""; }).filter(Boolean).join(" ");
    if (f) sec.push(`<section class="book-section book-translit-section" aria-label="Transliteration"><p class="book-flow translit-flow" dir="ltr">${f}</p></section>`);
  }
  if (c.translation) {
    const f = data.ayahs.map((a) => { const m = mergeLocalEdits(a, surahId); const t = m.translation || m.qf_translation || ""; return t ? `<span class="book-trans-seg" data-ayah="${a.ayah}">${ayahMarkerHtml(a.ayah, { inline: true })} ${esc(t)}</span>` : ""; }).filter(Boolean).join(" ");
    if (f) sec.push(`<section class="book-section book-translation-section" aria-label="Translation"><p class="book-flow translation-flow">${f}</p></section>`);
  }
  if (c.aiTranslation) {
    const f = data.ayahs.map((a) => { const m = mergeLocalEdits(a, surahId); const t = m.ai_translation || ""; return t ? `<span class="book-trans-seg" data-ayah="${a.ayah}">${ayahMarkerHtml(a.ayah, { inline: true })} ${esc(t)}</span>` : ""; }).filter(Boolean).join(" ");
    if (f) sec.push(`<section class="book-section book-translation-section ai-mode" aria-label="AI translation"><p class="book-flow translation-flow">${f}</p></section>`);
  }
  if (c.aiTafsir || c.ibnKathir || c.maarif) {
    const blocks = data.ayahs.map((a) => bookTafsirBlock(a, surahId)).filter(Boolean).join("");
    if (blocks) sec.push(`<section class="book-section book-tafsir-section" aria-label="Tafsir">${blocks}</section>`);
  }
  if (!sec.length) sec.push(`<p class="empty-note center">Choose at least one element in “Content”.</p>`);
  return `<div class="book-stream">${sec.join("")}<div id="book-study-slot" class="book-study-slot"></div></div>`;
}

function verseViewHtml(data, surahId) {
  return data.ayahs.map((a) => ayahBlock(data, a, surahId)).join("");
}

function renderAyahStreamHtml(data, surahId) {
  const inner = prefs.layoutMode === "book" ? bookViewHtml(data, surahId) : verseViewHtml(data, surahId);
  return `<div class="ayah-stream layout-${prefs.layoutMode}">${inner}</div>`;
}

function readerHintText() {
  if (prefs.readMode === "ai") {
    return "AI Translation explains concepts in context — Arabic terms like Rahman, taqwa, and deen are unpacked, not flattened.";
  }
  if (prefs.layoutMode === "book" && prefs.readMode === "arabic") {
    return "Continuous mushaf view — click any ayah for tafsir and tadabbur.";
  }
  if (prefs.layoutMode === "book") {
    return "Book view — flowing text like a printed edition · click an ayah for study.";
  }
  if (prefs.showTransliteration) {
    return "Transliteration below each ayah · hover a word for its meaning · ☰ for tafsir.";
  }
  if (prefs.readMode === "arabic") {
    return "Arabic only — hover a word for its meaning · ☰ to open tafsir and tadabbur.";
  }
  return "Hover a word for its meaning · ✎ to edit translation · ☰ to expand tadabbur & tafsir below";
}

function toolbarHtml(data, ayah, surahs = []) {
  const jumpOptions = data.ayahs
    .map((a) => `<option value="${a.ayah}" ${a.ayah === ayah ? "selected" : ""}>Ayah ${a.ayah}</option>`)
    .join("");
  const surahOptions = surahs
    .map((s) => `<option value="${s.id}" ${s.id === data.id ? "selected" : ""}>${s.id}. ${esc(s.name_simple)}</option>`)
    .join("");
  return `
      <div class="reader-toolbar sticky-toolbar">
        <div class="surah-progress-wrap">
          <div class="surah-progress" role="progressbar"><div class="surah-progress-bar" style="width:0"></div></div>
          <span class="surah-progress-label">Ayah ${ayah} of ${data.verses_count}</span>
        </div>
        <div class="toolbar-actions">
          <select id="surah-jump" class="select-input" aria-label="Jump to surah">${surahOptions}</select>
          <select id="ayah-jump" class="select-input" aria-label="Jump to ayah">${jumpOptions}</select>
          ${prefs.layoutMode === "verse" ? `<select id="read-mode" class="select-input" aria-label="Reading mode">
            <option value="arabic" ${prefs.readMode === "arabic" ? "selected" : ""}>Arabic only</option>
            <option value="translation" ${prefs.readMode === "translation" ? "selected" : ""}>Translation</option>
            <option value="ai" ${prefs.readMode === "ai" ? "selected" : ""}>AI Translation</option>
          </select>
          <button type="button" class="btn ${prefs.showTransliteration ? "active" : ""}" id="toggle-transliteration" title="Show romanized pronunciation">Transliteration</button>` : `<span class="content-menu-wrap">
            <button type="button" class="btn active" id="book-content-btn" title="Choose what to show in book view">Content ▾</button>
            <div class="content-menu" id="content-menu" hidden>${[["arabic","Arabic"],["translit","Transliteration"],["translation","Translation"],["aiTranslation","AI translation"],["aiTafsir","AI Tafsir"],["ibnKathir","Ibn Kathīr"],["maarif","Maʿārif ul Qurʼān"]].map(([k,lbl]) => `<label class="cm-item"><input type="checkbox" data-bc="${k}" ${prefs.bookContent[k] ? "checked" : ""}> ${lbl}</label>`).join("")}</div>
          </span>`}
          <button type="button" class="btn ${prefs.wordMode === "ai" ? "active" : ""}" id="toggle-wordmode" title="Hover any word for an AI grammar &amp; meaning breakdown">Word AI</button>
          <button type="button" class="btn ${prefs.layoutMode === "book" ? "active" : ""}" id="toggle-layout" title="Continuous text like a book">Book view</button>
          <span class="font-group"><span class="fg-label" dir="rtl">ع</span><button type="button" class="btn icon-only" id="font-smaller" title="Smaller Arabic">A−</button><button type="button" class="btn icon-only" id="font-larger" title="Larger Arabic">A+</button></span>
          <span class="font-group"><span class="fg-label">Aa</span><button type="button" class="btn icon-only" id="text-smaller" title="Smaller translation/transliteration">A−</button><button type="button" class="btn icon-only" id="text-larger" title="Larger translation/transliteration">A+</button></span>
        </div>
      </div>`;
}

async function saveAyah(data) {
  const payload = {
    arabic: data.arabic,
    translation: data.translation,
    word_by_word: data.word_by_word,
    context: data.context || "",
    tafsir_summary: data.tafsir_summary || "",
    tafsir_ibn_kathir: data.tafsir_ibn_kathir || "",
    maarif_ul_quran: data.maarif_ul_quran || "",
    personal_reflections: data.personal_reflections || "",
  };

  if (canSync) {
    const res = await fetch(`/api/ayah/${currentSurah.id}/${data.ayah}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Save failed");
    const updated = await res.json();
    const idx = currentSurah.ayahs.findIndex((a) => a.ayah === data.ayah);
    if (idx >= 0) {
      currentSurah.ayahs[idx] = { ...currentSurah.ayahs[idx], ...updated.ayah };
    }
    cache.surahs[currentSurah.id] = currentSurah;
    return;
  }
  payload.updatedAt = Date.now();
  localStorage.setItem(LS.ayahEdits(currentSurah.id, data.ayah), JSON.stringify(payload));
  QuranFirebaseSync?.schedulePush();
}

function showSaveStatus(msg, ok, el) {
  const target = el || document.querySelector(".save-status");
  if (!target) return;
  target.textContent = msg;
  const base = target.className.split(" ").find((c) => c.endsWith("-status")) || "save-status";
  target.className = base + (ok ? " ok" : ok === false ? " err" : "");
}

function getAyahData(surahId, ayahNum) {
  const raw = currentSurah.ayahs.find((a) => a.ayah === ayahNum);
  return raw ? mergeLocalEdits(raw, surahId) : null;
}

async function persistAyah(ayahData, statusEl) {
  if (!currentSurah || !ayahData) return;
  try {
    await saveAyah(ayahData);
    const idx = currentSurah.ayahs.findIndex((a) => a.ayah === ayahData.ayah);
    if (idx >= 0 && !canSync) {
      currentSurah.ayahs[idx] = {
        ...currentSurah.ayahs[idx],
        translation: ayahData.translation,
        word_by_word: ayahData.word_by_word,
        personal_reflections: ayahData.personal_reflections,
        context: ayahData.context,
      };
    }
    const saveMsg = canSync
      ? "Saved to markdown"
      : QuranFirebaseSync?.isSignedIn?.()
        ? "Saved · syncing"
        : "Saved locally";
    showSaveStatus(saveMsg, true, statusEl);
    recordMyWork(currentSurah.id, ayahData.ayah, ayahData, currentSurah.translated_name);
  } catch (e) {
    showSaveStatus("Save failed", false, statusEl);
    console.error(e);
  }
}

async function persistSelectedAyah() {
  if (!selectedAyah || !currentSurah) return;
  await persistAyah(selectedAyah);
}

function openTranslationEdit(articleEl) {
  const surahId = +articleEl.dataset.surah;
  const ayahNum = +articleEl.dataset.ayah;
  const ayah = getAyahData(surahId, ayahNum);
  if (!ayah) return;

  const block = articleEl.querySelector(".translation-block");
  if (!block || block.classList.contains("editing")) return;

  selectedAyah = ayah;
  block.classList.add("editing");
  block.innerHTML = `
    <label class="translation-edit-label">Edit ayah translation</label>
    <textarea class="translation-edit-input" rows="3"></textarea>
    <div class="translation-edit-actions">
      <button type="button" class="btn" data-action="cancel-translation">Cancel</button>
      <button type="button" class="btn active" data-action="save-translation">Save</button>
    </div>
    <div class="translation-save-status"></div>`;

  const input = block.querySelector(".translation-edit-input");
  input.value = ayah.translation || "";
  input.focus();
}

async function saveTranslationEdit(articleEl) {
  const surahId = +articleEl.dataset.surah;
  const ayahNum = +articleEl.dataset.ayah;
  const ayah = getAyahData(surahId, ayahNum);
  const input = articleEl.querySelector(".translation-edit-input");
  if (!ayah || !input) return;

  ayah.translation = input.value;
  selectedAyah = ayah;
  const statusEl = articleEl.querySelector(".translation-save-status");
  await persistAyah(ayah, statusEl);
  await refreshAyahBlock(surahId, ayahNum);
}

function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistSelectedAyah, 600);
}

function panelContent(ayah) {
  if (prefs.activePanel === "reflection") {
    return `<p class="panel-intro">Leave a personal note — what does this ayah move in your heart?</p>
      <textarea class="reflection-area" id="reflection-input" placeholder="Your tadabbur…"></textarea><div class="save-status"></div>`;
  }
  if (prefs.activePanel === "context") {
    return `<p class="panel-intro">When and why was this ayah revealed? Add the occasion of revelation (asbāb al-nuzūl).</p>
      <textarea class="reflection-area" id="context-input" placeholder="Revelation context…"></textarea><div class="save-status"></div>`;
  }
  if (prefs.activePanel === "tafsir") {
    let html = `<p class="panel-intro tafsir-intro">Concise commentary drawing on Ibn Kathir, Maarif ul Quran, classical scholars, and authenticated hadith.</p>`;
    if (ayah.qf_tafsir) {
      html += `<details open class="qf-tafsir-block"><summary class="qf-tafsir-summary">Ibn Kathir (Quran.com)</summary><div class="qf-tafsir-body">${md(ayah.qf_tafsir)}</div></details>`;
    }
    if (ayah.ai_tafsir) {
      html += `<details ${ayah.qf_tafsir ? "" : "open"} class="ai-tafsir-block"><summary class="ai-tafsir-summary">AI Tafsir</summary><div class="ai-tafsir-body">${md(ayah.ai_tafsir)}</div></details>`;
    }
    if (ayah.tafsir_ibn_kathir) html += `<details><summary>Ibn Kathir (full)</summary>${md(ayah.tafsir_ibn_kathir)}</details>`;
    if (ayah.maarif_ul_quran) html += `<details><summary>Maarif ul Quran</summary>${md(ayah.maarif_ul_quran)}</details>`;
    return html || `<p class="empty-note">No tafsir available.</p>`;
  }
  return "";
}

function studyPanelHtml(ayah) {
  const hasContext = !!(ayah.context && ayah.context.trim());
  return `
    <div class="study-panel">
      <div class="study-panel-head">
        <div class="panel-tabs">
          <button type="button" class="btn panel-tab ${prefs.activePanel === "reflection" ? "active" : ""}" data-panel="reflection">Tadabbur</button>
          <button type="button" class="btn panel-tab ${prefs.activePanel === "context" ? "active" : ""} ${hasContext ? "has-content" : ""}" data-panel="context">Context</button>
          <button type="button" class="btn panel-tab ${prefs.activePanel === "tafsir" ? "active" : ""}" data-panel="tafsir">Tafsir</button>
        </div>
        <button type="button" class="study-close-btn" data-action="close-study" aria-label="Close">×</button>
      </div>
      <div class="panel-body study-panel-body">${panelContent(ayah)}</div>
    </div>`;
}

function bindReflectionInput(block) {
  const input = block.querySelector("#reflection-input");
  if (!input) return;
  input.value = selectedAyah.personal_reflections || "";
  if (input.dataset.bound) return;
  input.dataset.bound = "1";
  input.addEventListener("input", () => {
    selectedAyah.personal_reflections = input.value;
    debouncedSave();
    block.querySelector(".study-btn")?.classList.toggle("has-note", !!input.value.trim());
  });
}

function bindContextInput(block) {
  const input = block.querySelector("#context-input");
  if (!input) return;
  input.value = selectedAyah.context || "";
  if (input.dataset.bound) return;
  input.dataset.bound = "1";
  input.addEventListener("input", () => {
    selectedAyah.context = input.value;
    debouncedSave();
    block.querySelector('.panel-tab[data-panel="context"]')?.classList.toggle("has-content", !!input.value.trim());
  });
}

function bindStudyPanelEvents(block) {
  const surahId = +block.dataset.surah;
  const ayahNum = +block.dataset.ayah;
  selectedAyah = getAyahData(surahId, ayahNum);

  block.querySelector('[data-action="close-study"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeStudyPanel();
  });

  bindReflectionInput(block);
  bindContextInput(block);

  block.querySelectorAll(".panel-tab").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      prefs.activePanel = btn.dataset.panel;
      savePrefs();
      block.querySelectorAll(".panel-tab").forEach((b) => b.classList.toggle("active", b === btn));
      block.querySelector(".study-panel-body").innerHTML = panelContent(selectedAyah);
      bindReflectionInput(block);
      bindContextInput(block);
    });
  });
}

function openStudyPanel(ayahNum) {
  if (expandedAyah === ayahNum) {
    closeStudyPanel();
    return;
  }
  closeStudyPanel();
  expandedAyah = ayahNum;
  selectedAyah = getAyahData(currentSurah.id, ayahNum);
  const block = document.getElementById(`ayah-${currentSurah.id}-${ayahNum}`);
  if (!block || !selectedAyah) return;

  if (prefs.layoutMode === "book" && block.classList.contains("book-ayah")) {
    document.querySelectorAll(".book-ayah").forEach((el) => el.classList.remove("active"));
    block.classList.add("active");
    const slot = document.getElementById("book-study-slot");
    if (slot) {
      slot.dataset.surah = currentSurah.id;
      slot.dataset.ayah = ayahNum;
      slot.innerHTML = studyPanelHtml(selectedAyah);
      bindStudyPanelEvents(slot);
      requestAnimationFrame(() => {
        slot.querySelector(".study-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
    return;
  }

  block.insertAdjacentHTML("beforeend", studyPanelHtml(selectedAyah));
  block.classList.add("expanded", "active");
  block.querySelector(".study-btn")?.classList.add("open");
  bindStudyPanelEvents(block);

  requestAnimationFrame(() => {
    block.querySelector(".study-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function closeStudyPanel() {
  expandedAyah = null;
  document.querySelectorAll(".study-panel").forEach((el) => el.remove());
  const bookSlot = document.getElementById("book-study-slot");
  if (bookSlot) bookSlot.innerHTML = "";
  document.querySelectorAll(".ayah-block").forEach((el) => {
    el.classList.remove("expanded");
    el.classList.remove("active");
  });
  document.querySelectorAll(".book-ayah").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".study-btn").forEach((btn) => btn.classList.remove("open"));
}

function hideTooltip() {
  document.getElementById("word-tooltip").hidden = true;
  document.querySelectorAll(".q-word.active").forEach((w) => w.classList.remove("active"));
}

function showWordTooltip(el, editing = false) {
  const tooltip = document.getElementById("word-tooltip");
  const surahId = +el.dataset.s;
  const ayahNum = +el.dataset.a;
  const key = el.dataset.i;

  if (!currentSurah || currentSurah.id !== surahId) return;
  const raw = currentSurah.ayahs.find((a) => a.ayah === ayahNum);
  if (!raw) return;
  const ayah = mergeLocalEdits(raw, surahId);
  const word = ayah.word_by_word[key];
  if (!word) return;

  selectedAyah = ayah;
  document.querySelectorAll(".q-word").forEach((w) => w.classList.remove("active"));
  el.classList.add("active");

  const rect = el.getBoundingClientRect();
  const aiData = cache.aiWbw[surahId];
  const ai = !editing && prefs.wordMode === "ai" && aiData && aiData[ayahNum] && aiData[ayahNum][key] ? aiData[ayahNum][key] : null;
  tooltip.hidden = false;
  tooltip.classList.toggle("ai", !!ai);

  if (editing) {
    tooltip.innerHTML = `<div class="wt-ar">${esc(word.arabic)}</div><div class="wt-tr">${esc(word.transliteration || "")}</div>
       <label class="wt-label">Meaning</label><input id="wt-meaning" />
       <div class="wt-actions"><button type="button" id="wt-cancel">Cancel</button><button type="button" class="primary" id="wt-save">Save</button></div>`;
  } else if (ai) {
    tooltip.innerHTML = `<div class="wt-ar">${esc(word.arabic)}</div>
       <div class="wt-tr">${esc(word.transliteration || "")}</div>
       <div class="wt-ai-meaning">${esc(ai.meaning || word.translation || "")}</div>
       ${ai.parts && ai.parts.length ? `<div class="wt-ai-parts">${ai.parts.map((p) => `<span class="wt-seg"><span class="wt-seg-ar" dir="rtl" lang="ar">${esc(p.ar || "")}</span><span class="wt-seg-en">${p.tr ? `<em>${esc(p.tr)}</em> — ` : ""}${esc(p.en || "")}</span></span>`).join("")}</div>` : ""}
       ${ai.grammar ? `<div class="wt-ai-grammar">${esc(ai.grammar)}</div>` : ""}
       ${ai.root ? `<div class="wt-ai-root">${esc(ai.root)}</div>` : ""}`;
  } else {
    tooltip.innerHTML = `<div class="wt-ar">${esc(word.arabic)}</div><div class="wt-tr">${esc(word.transliteration || "")}</div>
       <div class="wt-en">${esc(word.translation || "")}</div>
       ${prefs.wordMode === "ai" ? `<div class="wt-ai-pending">Detailed AI word analysis for this sūrah is being prepared.</div>` : ""}
       <div class="wt-actions"><button type="button" class="primary" id="wt-edit">Edit meaning</button></div>`;
  }

  const wMax = ai ? 360 : 280;
  tooltip.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - wMax)}px`;
  tooltip.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 160)}px`;

  if (editing) document.getElementById("wt-meaning").value = word.translation || "";
  tooltip.querySelector("#wt-edit")?.addEventListener("click", () => showWordTooltip(el, true));
  tooltip.querySelector("#wt-cancel")?.addEventListener("click", hideTooltip);
  tooltip.querySelector("#wt-save")?.addEventListener("click", async () => {
    selectedAyah.word_by_word[key].translation = document.getElementById("wt-meaning").value;
    hideTooltip();
    await persistSelectedAyah();
    refreshAyahBlock(surahId, ayahNum);
  });
}

async function refreshAyahStream(surahId, ayahNum) {
  const wasExpanded = expandedAyah === ayahNum;
  const data = await loadSurah(surahId);
  const stream = document.querySelector(".ayah-stream");
  if (!stream) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = renderAyahStreamHtml(data, surahId);
  stream.replaceWith(tmp.firstElementChild);
  bindSurahEvents();
  setupScrollObserver(surahId);
  if (wasExpanded) openStudyPanel(ayahNum);
}

async function refreshAyahBlock(surahId, ayahNum) {
  if (prefs.layoutMode === "book") {
    await refreshAyahStream(surahId, ayahNum);
    return;
  }
  const wasExpanded = expandedAyah === ayahNum;
  const data = await loadSurah(surahId);
  const ayah = data.ayahs.find((a) => a.ayah === ayahNum);
  const el = document.getElementById(`ayah-${surahId}-${ayahNum}`);
  if (el && ayah) {
    const tmp = document.createElement("div");
    tmp.innerHTML = ayahBlock(data, ayah, surahId);
    el.replaceWith(tmp.firstElementChild);
    bindSurahEvents();
    setupScrollObserver(surahId);
    if (wasExpanded) openStudyPanel(ayahNum);
  }
}

function setupScrollObserver(surahId) {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      if (scrollLock) return;
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const ayah = +visible.target.dataset.ayah;
      scheduleRecordReading(surahId, ayah);
      updateProgress(surahId, ayah);
      const newHash = `#/${surahId}/${ayah}`;
      if (location.hash !== newHash) {
        scrollLock = true;
        history.replaceState(null, "", newHash);
        scrollLock = false;
      }
    },
    { rootMargin: "-40% 0px -45% 0px", threshold: [0, 0.25, 0.5] }
  );
  const targets = prefs.layoutMode === "book"
    ? document.querySelectorAll(".book-ayah")
    : document.querySelectorAll(".ayah-block");
  targets.forEach((el) => observer.observe(el));
}

function updateProgress(surahId, ayah) {
  const data = cache.surahs[surahId];
  if (!data) return;
  const pct = Math.round((ayah / data.verses_count) * 100);
  const bar = document.querySelector(".surah-progress-bar");
  const label = document.querySelector(".surah-progress-label");
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = `Ayah ${ayah} of ${data.verses_count}`;
}

function scrollToAyah(surahId, ayah, smooth = true) {
  const el = document.getElementById(`ayah-${surahId}-${ayah}`);
  if (!el) return;
  scrollLock = true;
  el.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "center" });
  setTimeout(() => { scrollLock = false; }, smooth ? 800 : 50);
}

function bindSurahEvents() {
  document.querySelectorAll(".q-word").forEach((el) => {
    el.addEventListener("mouseenter", () => showWordTooltip(el));
    el.addEventListener("focus", () => showWordTooltip(el));
    el.addEventListener("mouseleave", () => {
      if (!document.getElementById("word-tooltip").querySelector("#wt-meaning")) hideTooltip();
    });
    el.addEventListener("click", (e) => { e.stopPropagation(); showWordTooltip(el); });
  });

  document.querySelectorAll(".ayah-block").forEach((block) => {
    block.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "edit-translation") {
        e.stopPropagation();
        openTranslationEdit(block);
        return;
      }
      if (action === "save-translation") {
        e.stopPropagation();
        saveTranslationEdit(block);
        return;
      }
      if (action === "cancel-translation") {
        e.stopPropagation();
        refreshAyahBlock(+block.dataset.surah, +block.dataset.ayah);
        return;
      }
      if (!action) return;
      const surahId = +block.dataset.surah;
      const ayahNum = +block.dataset.ayah;
      const ayah = getAyahData(surahId, ayahNum);
      if (!ayah) return;

      if (action === "bookmark") {
        const added = toggleBookmark(surahId, ayahNum, currentSurah.translated_name, ayah.translation);
        const btn = block.querySelector(".bookmark-btn");
        btn.classList.toggle("active", added);
        btn.querySelector(".icon-star").textContent = added ? "✦" : "✧";
        btn.title = added ? "Remove bookmark" : "Bookmark";
        btn.setAttribute("aria-label", added ? "Remove bookmark" : "Bookmark");
      } else if (action === "study" || action === "select") {
        openStudyPanel(ayahNum);
      }
    });

    block.querySelector(".translation-text")?.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      openTranslationEdit(block);
    });
  });

  document.querySelectorAll(".book-ayah").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".q-word")) return;
      openStudyPanel(+el.dataset.ayah);
    });
  });

  document.getElementById("read-mode")?.addEventListener("change", async (e) => {
    prefs.readMode = e.target.value;
    savePrefs();
    if (currentSurah) {
      await renderSurah(currentSurah, visibleAyah || getLastReadForSurah(currentSurah.id)?.ayah);
    }
  });

  document.getElementById("toggle-transliteration")?.addEventListener("click", async () => {
    prefs.showTransliteration = !prefs.showTransliteration;
    savePrefs();
    document.getElementById("toggle-transliteration")?.classList.toggle("active", prefs.showTransliteration);
    if (currentSurah) {
      await renderSurah(currentSurah, visibleAyah || getLastReadForSurah(currentSurah.id)?.ayah);
    }
  });

  document.getElementById("toggle-layout")?.addEventListener("click", async () => {
    prefs.layoutMode = prefs.layoutMode === "book" ? "verse" : "book";
    savePrefs();
    document.getElementById("toggle-layout")?.classList.toggle("active", prefs.layoutMode === "book");
    if (currentSurah) {
      await renderSurah(currentSurah, visibleAyah || getLastReadForSurah(currentSurah.id)?.ayah);
    }
  });

  document.getElementById("toggle-wordmode")?.addEventListener("click", async () => {
    prefs.wordMode = prefs.wordMode === "ai" ? "standard" : "ai";
    savePrefs();
    document.getElementById("toggle-wordmode")?.classList.toggle("active", prefs.wordMode === "ai");
    if (prefs.wordMode === "ai" && currentSurah) await loadAiWbw(currentSurah.id);
  });

  document.getElementById("font-smaller")?.addEventListener("click", () => setFontScale(prefs.fontScale - 0.08));
  document.getElementById("font-larger")?.addEventListener("click", () => setFontScale(prefs.fontScale + 0.08));
  document.getElementById("text-smaller")?.addEventListener("click", () => setTransScale(prefs.transScale - 0.08));
  document.getElementById("text-larger")?.addEventListener("click", () => setTransScale(prefs.transScale + 0.08));

  document.getElementById("surah-jump")?.addEventListener("change", (e) => {
    const sid = +e.target.value;
    if (sid && sid !== currentSurah.id) location.hash = `#/${sid}`;
  });

  document.getElementById("ayah-jump")?.addEventListener("change", (e) => {
    const ayah = +e.target.value;
    if (ayah) scrollToAyah(currentSurah.id, ayah);
  });
}

function applyScales() {
  const d = document.documentElement.style;
  d.setProperty("--arabic-scale", prefs.fontScale);
  d.setProperty("--trans-scale", prefs.transScale);
}

function setFontScale(scale) {
  prefs.fontScale = Math.min(1.6, Math.max(0.8, scale));
  savePrefs();
  applyScales();
}

function setTransScale(scale) {
  prefs.transScale = Math.min(1.8, Math.max(0.8, scale));
  savePrefs();
  applyScales();
}

function normalizeSearch(text) {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0640\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[''`´]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0621-\u064a\s:/\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let searchIndex = null;
let searchIndexLoading = null;

async function ensureSearchIndex() {
  if (searchIndex) return searchIndex;
  if (!searchIndexLoading) {
    searchIndexLoading = fetch(`data/search-index.json?v=${DATA_VERSION}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((data) => {
        searchIndex = data.entries || [];
        return searchIndex;
      })
      .catch(() => {
        searchIndex = [];
        return searchIndex;
      });
  }
  return searchIndexLoading;
}

function levenshtein(a, b) {
  if (a.length > b.length) [a, b] = [b, a];
  if (!a.length) return b.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      curr.push(a[i] === b[j] ? prev[j] : 1 + Math.min(prev[j], prev[j + 1], curr[j]));
    }
    prev = curr;
  }
  return prev[b.length];
}

function fuzzyTokenScore(token, haystack, words) {
  if (!token || token.length < 2) return 0;
  if (haystack.includes(token)) return 92;
  let best = 0;
  for (const w of words) {
    if (w.length < 2) continue;
    if (w === token) return 100;
    if (w.startsWith(token) || token.startsWith(w)) best = Math.max(best, 82);
    else if (w.includes(token) || token.includes(w)) best = Math.max(best, 72);
    else if (token.length >= 3 && w.length >= 3) {
      const dist = levenshtein(token, w);
      const maxLen = Math.max(token.length, w.length);
      const sim = 1 - dist / maxLen;
      if (sim >= 0.55) best = Math.max(best, Math.round(sim * 68));
    }
  }
  return best;
}

function scoreHaystack(nq, tokens, haystack) {
  if (!haystack) return 0;
  if (nq.length >= 3 && haystack.includes(nq)) return 96;
  const words = haystack.split(" ").filter(Boolean);
  if (!tokens.length) return 0;
  let total = 0;
  for (const token of tokens) {
    total += fuzzyTokenScore(token, haystack, words);
  }
  return total / tokens.length;
}

function scoreIndexEntry(entry, nq, tokens) {
  const [, , en, ar] = entry;
  return Math.max(scoreHaystack(nq, tokens, en), scoreHaystack(nq, tokens, ar));
}

function fuzzyScoreSurah(s, nq, tokens) {
  const exact = scoreSurah(s, nq);
  if (exact > 0) return exact;

  const fields = [
    normalizeSearch(s.name_simple),
    normalizeSearch(s.translated_name),
    normalizeSearch(s.name_arabic),
  ];
  let best = 0;
  for (const field of fields) {
    best = Math.max(best, scoreHaystack(nq, tokens, field));
    if (nq.length >= 3 && field.includes(nq)) best = Math.max(best, 88);
  }
  return best;
}

function parseReference(raw, surahs) {
  const q = raw.trim();
  if (!q) return null;

  let m = q.match(/^(\d{1,3})\s*[:\/\-]\s*(\d{1,3})$/);
  if (!m) m = q.match(/^(\d{1,3})\s+(\d{1,3})$/);
  if (m) {
    const surah = +m[1];
    const ayah = +m[2];
    const s = surahs.find((x) => x.id === surah);
    if (!s) return null;
    const validAyah = Math.min(Math.max(1, ayah), s.verses_count);
    return {
      surah,
      ayah: validAyah,
      label: `${s.name_simple} · Ayah ${validAyah}`,
      sub: `${s.translated_name} (${surah}:${validAyah})`,
      kind: "ref",
    };
  }

  m = q.match(/^(?:surah|sura|s)?\s*(\d{1,3})(?:\s*[:\/\-]\s*(\d{1,3}))?$/i);
  if (m) {
    const surah = +m[1];
    const ayah = m[2] ? +m[2] : 1;
    const s = surahs.find((x) => x.id === surah);
    if (!s) return null;
    const validAyah = Math.min(Math.max(1, ayah), s.verses_count);
    return {
      surah,
      ayah: validAyah,
      label: `${s.name_simple} · Ayah ${validAyah}`,
      sub: `${s.translated_name} (${surah}:${validAyah})`,
      kind: "ref",
    };
  }

  if (/^\d{1,3}$/.test(q)) {
    const surah = +q;
    const s = surahs.find((x) => x.id === surah);
    if (s) {
      return {
        surah,
        ayah: 1,
        label: `${s.id}. ${s.name_simple}`,
        sub: s.translated_name,
        kind: "ref",
      };
    }
  }

  return null;
}

function scoreSurah(s, nq) {
  if (!nq) return 0;
  const id = String(s.id);
  if (id === nq) return 120;

  const simple = normalizeSearch(s.name_simple);
  const english = normalizeSearch(s.translated_name);
  const arabic = normalizeSearch(s.name_arabic);

  if (simple === nq || english === nq) return 100;
  if (simple.startsWith(nq) || english.startsWith(nq)) return 85;
  if (arabic.includes(nq)) return 75;
  if (simple.includes(nq) || english.includes(nq)) return 60;

  const tokens = nq.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => english.includes(t) || simple.includes(t))) return 45;

  return 0;
}

function searchSurahs(surahs, query, limit = 6) {
  const nq = normalizeSearch(query);
  if (!nq) return [];
  const tokens = nq.split(" ").filter((t) => t.length >= 2);

  return surahs
    .map((s) => ({
      surah: s.id,
      ayah: 1,
      score: fuzzyScoreSurah(s, nq, tokens),
      kind: "surah",
      s,
    }))
    .filter((r) => r.score >= 40)
    .sort((a, b) => b.score - a.score || a.surah - b.surah)
    .slice(0, limit)
    .map(({ s, score, ...r }) => ({
      ...r,
      score,
      label: `${s.id}. ${s.name_simple}`,
      sub: s.translated_name,
      kindLabel: "Surah",
    }));
}

async function searchAyahs(surahs, query, limit = 10) {
  const nq = normalizeSearch(query);
  if (!nq || nq.length < 2) return [];
  const tokens = nq.split(" ").filter((t) => t.length >= 2);
  const index = await ensureSearchIndex();
  if (!index.length) return [];

  const FUZZY_MIN = 38;
  const hits = [];
  for (const entry of index) {
    const score = scoreIndexEntry(entry, nq, tokens);
    if (score < FUZZY_MIN) continue;
    const [surahId, ayah, , , snip] = entry;
    const s = surahs.find((x) => x.id === surahId);
    if (!s) continue;
    hits.push({
      surah: surahId,
      ayah,
      score,
      kind: "ayah",
      kindLabel: "Ayah",
      label: `${surahId}:${ayah} · ${s.name_simple}`,
      sub: snip || s.translated_name,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.surah - b.surah || a.ayah - b.ayah);
  return hits.slice(0, limit);
}

async function smartSearch(surahs, query, limit = 12) {
  const ref = parseReference(query, surahs);
  if (ref) return [{ ...ref, kindLabel: "Go to" }];

  const nq = normalizeSearch(query);
  if (!nq) return [];

  const [surahHits, ayahHits] = await Promise.all([
    Promise.resolve(searchSurahs(surahs, query, 5)),
    searchAyahs(surahs, query, 10),
  ]);

  const merged = [...surahHits, ...ayahHits]
    .sort((a, b) => b.score - a.score || a.surah - b.surah || (a.ayah || 1) - (b.ayah || 1));

  const seen = new Set();
  const out = [];
  for (const r of merged) {
    const key = r.kind === "surah" ? `s:${r.surah}` : `a:${r.surah}:${r.ayah}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

function goToSearchResult(result) {
  if (!result) return;
  location.hash = result.ayah ? `#/${result.surah}/${result.ayah}` : `#/${result.surah}`;
}

function renderSearchDropdown(results, activeIdx = 0) {
  const dropdown = document.getElementById("search-dropdown");
  if (!dropdown) return;
  if (!results.length) {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
    return;
  }
  dropdown.hidden = false;
  dropdown.innerHTML = results
    .map(
      (r, i) => `
    <button type="button" class="search-item ${i === activeIdx ? "active" : ""}" data-i="${i}">
      <span class="search-item-row">
        <span class="search-item-label">${esc(r.label)}</span>
        ${r.kindLabel ? `<span class="search-item-kind">${esc(r.kindLabel)}</span>` : ""}
      </span>
      <span class="search-item-sub">${esc(r.sub || "")}</span>
    </button>`
    )
    .join("");
}

function bindSmartSearch(surahs) {
  const input = document.getElementById("surah-search");
  const dropdown = document.getElementById("search-dropdown");
  if (!input || !dropdown) return;

  let results = [];
  let activeIdx = 0;
  let searchGen = 0;

  function filterGrid(q, hits) {
    const nq = normalizeSearch(q);
    document.querySelectorAll(".surah-card").forEach((card) => {
      if (!nq) {
        card.hidden = false;
        return;
      }
      const id = +card.querySelector(".surah-num")?.textContent;
      const inHits = hits.some((r) => r.surah === id);
      if (inHits) {
        card.hidden = false;
        return;
      }
      const s = surahs.find((x) => x.id === id);
      const tokens = nq.split(" ").filter((t) => t.length >= 2);
      card.hidden = !(s && fuzzyScoreSurah(s, nq, tokens) >= 40);
    });
  }

  async function update() {
    const q = input.value.trim();
    const gen = ++searchGen;
    if (q.length >= 2) {
      dropdown.hidden = false;
      dropdown.innerHTML = `<div class="search-loading">Searching…</div>`;
    }
    results = await smartSearch(surahs, q);
    if (gen !== searchGen) return;
    activeIdx = 0;
    renderSearchDropdown(results, activeIdx);
    filterGrid(q, results);
  }

  function pick(idx) {
    const r = results[idx];
    if (!r) return;
    input.value = r.sub ? `${r.label}` : r.label;
    dropdown.hidden = true;
    goToSearchResult(r);
  }

  input.addEventListener("input", update);

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!results.length) return;
      activeIdx = Math.min(activeIdx + 1, results.length - 1);
      renderSearchDropdown(results, activeIdx);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      renderSearchDropdown(results, activeIdx);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results.length) pick(activeIdx);
    } else if (e.key === "Escape") {
      dropdown.hidden = true;
      input.blur();
    }
  });

  dropdown.addEventListener("click", (e) => {
    const btn = e.target.closest(".search-item");
    if (!btn) return;
    pick(+btn.dataset.i);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) dropdown.hidden = true;
  });

  input.addEventListener("focus", () => {
    if (input.value.trim()) update();
  });

  ensureSearchIndex();
}

function resumeCardHtml(entry, surahs, { showLabel = false } = {}) {
  const s = surahs.find((x) => x.id === entry.surah);
  if (!s) return "";
  return `
    <a href="#/${entry.surah}/${entry.ayah}" class="resume-card">
      <span class="resume-icon" aria-hidden="true">۞</span>
      <span class="resume-body">
        ${showLabel ? `<span class="resume-label">Continue your reading</span>` : ""}
        <span class="resume-title">${esc(s.name_arabic)} · ${esc(s.translated_name)}</span>
        <span class="resume-meta">Ayah ${entry.ayah}</span>
      </span>
      <span class="resume-arrow" aria-hidden="true">←</span>
    </a>`;
}

function renderHome(surahs) {
  setBreadcrumb("");
  const recentReads = getRecentReads().slice(0, RECENT_READS_MAX);
  const bookmarks = getBookmarks().slice(0, 5);
  const tadabbur = getMyWorkList("tadabbur").slice(0, 3);
  const edits = getMyWorkList("meanings").slice(0, 3);

  const hasPersonal = bookmarks.length || tadabbur.length || edits.length;

  document.getElementById("app").innerHTML = `
    <div class="home-page">
      <header class="home-intro">
        <p class="home-bismillah" dir="rtl">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
      </header>
      ${recentReads.length ? `
      <section class="home-section resume-section">
        <h2 class="section-title">Continue your reading</h2>
        <div class="resume-list">${recentReads
          .map((entry, i) => resumeCardHtml(entry, surahs, { showLabel: i === 0 }))
          .join("")}</div>
      </section>` : ""}
      <div class="search-wrap home-search">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input type="search" id="surah-search" class="search-input" placeholder="mercy · رحم · 2:255 · Al-Baqarah…" autocomplete="off" spellcheck="false" enterkeyhint="go" />
        <div id="search-dropdown" class="search-dropdown" hidden role="listbox"></div>
      </div>
      <div class="surah-grid" id="surah-grid">${surahs.map((s) => surahCard(s)).join("")}</div>
      ${hasPersonal ? `
      <div class="home-personal">
        ${bookmarks.length ? `
        <section class="home-section home-section-compact">
          <h2 class="section-title">Saved ayahs</h2>
          <div class="bookmark-list compact">${bookmarks.map((b) => bookmarkRow(b)).join("")}</div>
          <a href="#/bookmarks" class="see-all">All bookmarks</a>
        </section>` : ""}
        ${tadabbur.length ? `
        <section class="home-section home-section-compact">
          <h2 class="section-title">My tadabbur</h2>
          <div class="bookmark-list compact">${tadabbur.map((e) => myWorkRow(e, { study: true })).join("")}</div>
          <a href="#/tadabbur" class="see-all">All tadabbur</a>
        </section>` : ""}
        ${edits.length ? `
        <section class="home-section home-section-compact">
          <h2 class="section-title">Edited meanings</h2>
          <div class="bookmark-list compact">${edits.map((e) => myWorkRow(e)).join("")}</div>
          <a href="#/edits" class="see-all">All edits</a>
        </section>` : ""}
      </div>` : ""}
    </div>`;

  bindSmartSearch(surahs);
}

function surahCard(s) {
  const place = revelationLabel(s.revelation_place);
  return `
    <a href="#/${s.id}" class="surah-card" data-search="${s.id} ${s.name_simple.toLowerCase()} ${s.translated_name.toLowerCase()} ${s.name_arabic}">
      <div class="surah-card-inner">
        <span class="surah-num">${s.id}</span>
        <span class="surah-ar" dir="rtl">${esc(s.name_arabic)}</span>
        <span class="surah-en">${esc(s.translated_name)}</span>
        <span class="surah-meta"><span class="place-tag ${s.revelation_place}">${place}</span> · ${s.verses_count}</span>
      </div>
    </a>`;
}

function bookmarkRow(b) {
  return `
    <a href="#/${b.surah}/${b.ayah}" class="bookmark-row">
      <span class="bookmark-ref">${esc(b.surahName || `Surah ${b.surah}`)} · ${b.ayah}</span>
      <span class="bookmark-snippet">${esc(b.snippet || "")}</span>
    </a>`;
}

function myWorkRow(entry, { study = false } = {}) {
  const href = study ? `#/${entry.surah}/${entry.ayah}/study` : `#/${entry.surah}/${entry.ayah}`;
  const snippet = study ? entry.tadabburSnippet : entry.meaningSnippet;
  return `
    <a href="${href}" class="bookmark-row my-work-row">
      <span class="bookmark-ref">${esc(entry.surahName || `Surah ${entry.surah}`)} · Ayah ${entry.ayah}</span>
      <span class="bookmark-snippet">${esc(snippet || "")}</span>
    </a>`;
}

function renderMyWorkPage({ title, subtitle, empty, kind, study = false }) {
  const list = getMyWorkList(kind);
  setBreadcrumb(`<a href="#/">Home</a> › ${esc(title)}`);
  document.getElementById("app").innerHTML = `
    <div class="hero compact">
      <h1 class="hero-title-sm">${esc(title)}</h1>
      ${ornament()}
      <p class="hero-subtitle">${list.length ? subtitle(list.length) : empty}</p>
    </div>
    ${list.length ? `<div class="bookmark-list">${list.map((e) => myWorkRow(e, { study })).join("")}</div>` : `<p class="empty-note center">${empty}</p>`}`;
}

function renderTadabbur() {
  renderMyWorkPage({
    title: "My Tadabbur",
    subtitle: (n) => `${n} personal note${n === 1 ? "" : "s"} from your reading`,
    empty: "Open any ayah, tap ☰, and write your tadabbur in the Tadabbur tab.",
    kind: "tadabbur",
    study: true,
  });
}

function renderEdits() {
  renderMyWorkPage({
    title: "Edited Meanings",
    subtitle: (n) => `${n} ayah${n === 1 ? "" : "s"} with your word or translation edits`,
    empty: "Hover a word to edit its meaning, or ✎ on the translation line.",
    kind: "meanings",
  });
}

function renderBookmarks() {
  setBreadcrumb(`<a href="#/">Home</a> › Bookmarks`);
  const list = getBookmarks();
  document.getElementById("app").innerHTML = `
    <div class="hero compact">
      <h1 class="hero-title-sm">Saved Ayahs</h1>
      ${ornament()}
      <p class="hero-subtitle">${list.length ? `${list.length} ayah${list.length === 1 ? "" : "s"} marked in your heart` : "Mark an ayah with ✧ while reading"}</p>
    </div>
    ${list.length ? `<div class="bookmark-list">${list.map((b, i) => `
      <div class="bookmark-item">
        <a href="#/${b.surah}/${b.ayah}" class="bookmark-row">
          <span class="bookmark-ref">${esc(b.surahName || `Surah ${b.surah}`)} · Ayah ${b.ayah}</span>
          <span class="bookmark-snippet">${esc(b.snippet || "")}</span>
        </a>
        <button type="button" class="icon-btn remove-bookmark" data-i="${i}" title="Remove">×</button>
      </div>`).join("")}</div>` : `<p class="empty-note center">Star an ayah while reading to bookmark it here.</p>`}`;

  document.querySelectorAll(".remove-bookmark").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = getBookmarks();
      list.splice(+btn.dataset.i, 1);
      localStorage.setItem(LS.bookmarks, JSON.stringify(list));
      QuranFirebaseSync?.schedulePush();
      renderBookmarks();
    });
  });
}

async function renderSurah(data, targetAyah, openStudy = false) {
  currentSurah = data;
  loadAiWbw(data.id);
  const lastForSurah = getLastReadForSurah(data.id);
  if (!targetAyah && lastForSurah) targetAyah = lastForSurah.ayah;
  const ayah = targetAyah || 1;
  visibleAyah = ayah;
  const surahList = (await loadIndex()).surahs;

  setBreadcrumb(`<a href="#/">Home</a> › ${esc(data.translated_name)}`);

  const prevSurah = data.id > 1 ? `<a class="nav-btn" href="#/${data.id - 1}">← ${data.id - 1}</a>` : `<span class="nav-btn disabled">←</span>`;
  const nextSurah = data.id < 114 ? `<a class="nav-btn" href="#/${data.id + 1}">${data.id + 1} →</a>` : `<span class="nav-btn disabled">→</span>`;

  document.getElementById("app").innerHTML = `
    <div class="surah-reader mode-${prefs.readMode} layout-${prefs.layoutMode}">
      <header class="surah-opener">
        <div class="surah-opener-arch" aria-hidden="true"></div>
        <span class="surah-index">${data.id}</span>
        <h1 class="surah-title" dir="rtl">${esc(data.name_arabic)}</h1>
        <p class="surah-subtitle">${esc(data.translated_name)}</p>
        <div class="surah-badges">
          <span class="badge place ${data.revelation_place}">${revelationLabel(data.revelation_place)}</span>
          <span class="badge">${data.verses_count} ayahs</span>
        </div>
        ${ornament()}
      </header>
      ${toolbarHtml(data, ayah, surahList)}
      <p class="reader-hint">${readerHintText()}</p>
      <div class="mushaf-sheet">
        ${renderAyahStreamHtml(data, data.id)}
      </div>
      <nav class="surah-nav" aria-label="Surah navigation">${prevSurah}<span class="nav-label">${data.id} / 114</span>${nextSurah}</nav>
    </div>`;

  applyScales();
  bindSurahEvents();
  setupScrollObserver(data.id);
  updateProgress(data.id, ayah);
  requestAnimationFrame(() => {
    scrollToAyah(data.id, ayah, false);
    if (openStudy) {
      prefs.activePanel = "reflection";
      savePrefs();
      openStudyPanel(ayah);
    }
  });
}

document.addEventListener("click", (e) => {
  const tooltip = document.getElementById("word-tooltip");
  if (tooltip.hidden) return;
  if (!tooltip.contains(e.target) && !e.target.classList.contains("q-word")) hideTooltip();
});

document.addEventListener("click", (e) => {
  if (e.target.closest && e.target.closest("#book-content-btn")) {
    e.stopPropagation();
    const m = document.getElementById("content-menu");
    if (m) m.hidden = !m.hidden;
    return;
  }
  const menu = document.getElementById("content-menu");
  if (menu && !menu.hidden && !(e.target.closest && e.target.closest(".content-menu-wrap"))) menu.hidden = true;
});

document.addEventListener("change", (e) => {
  const cb = e.target.closest && e.target.closest("#content-menu input[data-bc]");
  if (cb) {
    prefs.bookContent[cb.dataset.bc] = cb.checked;
    savePrefs();
    if (currentSurah) refreshAyahStream(currentSurah.id);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  const r = route();
  if (r.view !== "surah" || !currentSurah) return;
  const currentAyah =
    visibleAyah || r.ayah || getLastReadForSurah(currentSurah.id)?.ayah || 1;
  if (e.key === "ArrowDown" || e.key === "j") {
    e.preventDefault();
    const next = Math.min(currentAyah + 1, currentSurah.verses_count);
    scrollToAyah(currentSurah.id, next);
  } else if (e.key === "ArrowUp" || e.key === "k") {
    e.preventDefault();
    const prev = Math.max(currentAyah - 1, 1);
    scrollToAyah(currentSurah.id, prev);
  } else if (e.key === "Escape") closeStudyPanel();
});

async function render() {
  if (scrollLock) return;
  const r = route();
  const leavingSurah =
    currentSurah && (r.view !== "surah" || r.surah !== currentSurah.id);
  if (leavingSurah) flushRecordReading();
  hideTooltip();
  closeStudyPanel();
  try {
    if (r.view === "home") {
      currentSurah = null;
      selectedAyah = null;
      renderHome((await loadIndex()).surahs);
    } else if (r.view === "bookmarks") {
      currentSurah = null;
      renderBookmarks();
    } else if (r.view === "tadabbur") {
      currentSurah = null;
      renderTadabbur();
    } else if (r.view === "edits") {
      currentSurah = null;
      renderEdits();
    } else if (r.view === "surah") {
      const sameSurah = currentSurah?.id === r.surah;
      if (sameSurah && r.ayah && !r.study) {
        scrollToAyah(r.surah, r.ayah);
        return;
      }
      selectedAyah = null;
      await renderSurah(await loadSurah(r.surah), r.ayah, r.study);
    }
  } catch (err) {
    document.getElementById("app").innerHTML = `<p class="loading">Failed to load.</p>`;
    console.error(err);
  }
}

function showBootError(err) {
  console.error(err);
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML = `<p class="loading">Failed to load. <button type="button" class="btn" onclick="location.reload()">Retry</button></p>`;
  }
}

function reloadPrefsFromStorage() {
  Object.assign(prefs, loadPrefs());
  applyScales();
}

function applyPrefsToToolbarIfPresent() {
  applyScales();
  const readMode = document.getElementById("read-mode");
  if (readMode) readMode.value = prefs.readMode;
  const translit = document.getElementById("toggle-transliteration");
  if (translit) translit.classList.toggle("active", prefs.showTransliteration);
  const layout = document.getElementById("toggle-layout");
  if (layout) layout.classList.toggle("active", prefs.layoutMode === "book");
  const reader = document.querySelector(".surah-reader");
  if (reader) {
    reader.classList.remove("mode-arabic", "mode-translation", "mode-ai", "layout-verse", "layout-book");
    reader.classList.add(`mode-${prefs.readMode}`, `layout-${prefs.layoutMode}`);
  }
}

function handleSyncMerged({ source = "pull" } = {}) {
  reloadPrefsFromStorage();
  rebuildMyWorkIndex().catch((err) => console.warn("My-work index rebuild failed", err));

  // Background push — page already shows local data; never re-render.
  if (source === "push") return;

  const r = route();
  if (r.view === "surah" && currentSurah) {
    applyPrefsToToolbarIfPresent();
    return;
  }

  if (!scrollLock) render();
}

async function boot() {
  try {
    const syncOptions = {
      lsKeys: LS,
      ayahEditsKey: LS.ayahEdits,
      onMerged: handleSyncMerged,
    };

    QuranGitHubSync?.init(syncOptions);
    await QuranFirebaseSync?.init(syncOptions);

    await checkSync();
    if (QuranFirebaseSync?.isSignedIn?.()) {
      await QuranFirebaseSync.pullAndMerge();
      reloadPrefsFromStorage();
    }

    render();
    rebuildMyWorkIndex().catch((err) => console.warn("My-work index rebuild failed", err));
  } catch (err) {
    showBootError(err);
  }
}

window.addEventListener("error", (e) => showBootError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showBootError(e.reason));

boot();
window.addEventListener("hashchange", render);

/* Floating scroll-to-top button (added enhancement) */
(function () {
  function init() {
    if (document.getElementById("to-top")) return;
    var btn = document.createElement("button");
    btn.id = "to-top";
    btn.type = "button";
    btn.setAttribute("aria-label", "Scroll to top");
    btn.textContent = "↑";
    btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    document.body.appendChild(btn);
    window.addEventListener("scroll", function () {
      btn.classList.toggle("show", window.scrollY > 400);
    }, { passive: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
