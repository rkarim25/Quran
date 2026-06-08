const cache = { index: null, surahs: {}, pristine: {} };
const LS = {
  lastRead: "quran-last-read",
  bookmarks: "quran-bookmarks",
  prefs: "quran-prefs",
  myWork: "quran-my-work",
  ayahEdits: (s, a) => `quran-${s}-${a}`,
};

let canSync = false;
let scrollLock = false;
let saveTimer = null;
let observer = null;
let selectedAyah = null;
let currentSurah = null;
let expandedAyah = null;

const DEFAULT_PREFS = {
  readMode: "translation",
  showTransliteration: false,
  layoutMode: "verse",
  fontScale: 1,
  activePanel: "reflection",
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
    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

const prefs = loadPrefs();

function savePrefs() {
  prefs.updatedAt = Date.now();
  localStorage.setItem(LS.prefs, JSON.stringify(prefs));
  QuranGitHubSync?.schedulePush();
}

function getLastRead() {
  try {
    return JSON.parse(localStorage.getItem(LS.lastRead) || "null");
  } catch {
    return null;
  }
}

function saveLastRead(surah, ayah) {
  localStorage.setItem(LS.lastRead, JSON.stringify({ surah, ayah, at: Date.now() }));
  QuranGitHubSync?.schedulePush();
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
  QuranGitHubSync?.schedulePush();
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
      if (badge && !QuranGitHubSync?.isEnabled()) {
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

const DATA_VERSION = "20";

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
  if (prefs.readMode === "ai" || prefs.readMode === "translation") {
    return { text: ayah.translation || "", mode: prefs.readMode === "ai" ? "ai" : "standard" };
  }
  return { text: ayah.translation || "", mode: "standard" };
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

function bookViewHtml(data, surahId) {
  const arabicFlow = data.ayahs.map((a) => bookAyahSpan(a, surahId)).join(" ");
  const translitFlow = prefs.showTransliteration
    ? data.ayahs
        .map((a) => {
          const text = renderAyahTransliteration(mergeLocalEdits(a, surahId));
          return text ? `<span class="book-translit-seg" data-ayah="${a.ayah}">${esc(text)}</span>` : "";
        })
        .filter(Boolean)
        .join(" ")
    : "";
  const showTrans = prefs.readMode !== "arabic";
  const transFlow = showTrans
    ? data.ayahs
        .map((a) => {
          const merged = mergeLocalEdits(a, surahId);
          const { text, mode } = displayTranslation(merged);
          if (!text) return "";
          return `<span class="book-trans-seg" data-ayah="${a.ayah}">${ayahMarkerHtml(a.ayah, { inline: true })} ${esc(text)}</span>`;
        })
        .filter(Boolean)
        .join(" ")
    : "";

  return `
    <div class="book-stream">
      <section class="book-section book-arabic-section" aria-label="Arabic text">
        <p class="book-flow arabic-flow" dir="rtl">${arabicFlow}</p>
      </section>
      ${translitFlow ? `<section class="book-section book-translit-section" aria-label="Transliteration">
        <p class="book-flow translit-flow" dir="ltr">${translitFlow}</p>
      </section>` : ""}
      ${transFlow ? `<section class="book-section book-translation-section ${prefs.readMode === "ai" ? "ai-mode" : ""}" aria-label="Translation">
        <p class="book-flow translation-flow">${transFlow}</p>
      </section>` : ""}
      <div id="book-study-slot" class="book-study-slot"></div>
    </div>`;
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

function toolbarHtml(data, ayah) {
  const jumpOptions = data.ayahs
    .map((a) => `<option value="${a.ayah}" ${a.ayah === ayah ? "selected" : ""}>Ayah ${a.ayah}</option>`)
    .join("");
  return `
      <div class="reader-toolbar sticky-toolbar">
        <div class="surah-progress-wrap">
          <div class="surah-progress" role="progressbar"><div class="surah-progress-bar" style="width:0"></div></div>
          <span class="surah-progress-label">Ayah ${ayah} of ${data.verses_count}</span>
        </div>
        <div class="toolbar-actions">
          <select id="ayah-jump" class="select-input" aria-label="Jump to ayah">${jumpOptions}</select>
          <select id="read-mode" class="select-input" aria-label="Reading mode">
            <option value="arabic" ${prefs.readMode === "arabic" ? "selected" : ""}>Arabic only</option>
            <option value="translation" ${prefs.readMode === "translation" ? "selected" : ""}>Translation</option>
            <option value="ai" ${prefs.readMode === "ai" ? "selected" : ""}>AI Translation</option>
          </select>
          <button type="button" class="btn ${prefs.showTransliteration ? "active" : ""}" id="toggle-transliteration" title="Show romanized pronunciation">Transliteration</button>
          <button type="button" class="btn ${prefs.layoutMode === "book" ? "active" : ""}" id="toggle-layout" title="Continuous text like a book">Book view</button>
          <button type="button" class="btn icon-only" id="font-smaller" title="Smaller text">A−</button>
          <button type="button" class="btn icon-only" id="font-larger" title="Larger text">A+</button>
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
  QuranGitHubSync?.schedulePush();
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
      : QuranGitHubSync?.isEnabled()
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
    if (ayah.ai_tafsir) {
      html += `<details open class="ai-tafsir-block"><summary class="ai-tafsir-summary">AI Tafsir</summary><div class="ai-tafsir-body">${md(ayah.ai_tafsir)}</div></details>`;
    }
    if (ayah.tafsir_summary) html += `<details><summary>Tafsir Summary</summary>${md(ayah.tafsir_summary)}</details>`;
    if (ayah.tafsir_ibn_kathir) html += `<details><summary>Ibn Kathir</summary>${md(ayah.tafsir_ibn_kathir)}</details>`;
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
  tooltip.hidden = false;
  tooltip.innerHTML = editing
    ? `<div class="wt-ar">${esc(word.arabic)}</div><div class="wt-tr">${esc(word.transliteration || "")}</div>
       <label class="wt-label">Meaning</label><input id="wt-meaning" />
       <div class="wt-actions"><button type="button" id="wt-cancel">Cancel</button><button type="button" class="primary" id="wt-save">Save</button></div>`
    : `<div class="wt-ar">${esc(word.arabic)}</div><div class="wt-tr">${esc(word.transliteration || "")}</div>
       <div class="wt-en">${esc(word.translation || "")}</div>
       <div class="wt-actions"><button type="button" class="primary" id="wt-edit">Edit meaning</button></div>`;

  tooltip.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - 280)}px`;
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
      saveLastRead(surahId, ayah);
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
    if (currentSurah) await renderSurah(currentSurah, getLastRead()?.ayah);
  });

  document.getElementById("toggle-transliteration")?.addEventListener("click", async () => {
    prefs.showTransliteration = !prefs.showTransliteration;
    savePrefs();
    document.getElementById("toggle-transliteration")?.classList.toggle("active", prefs.showTransliteration);
    if (currentSurah) await renderSurah(currentSurah, getLastRead()?.ayah);
  });

  document.getElementById("toggle-layout")?.addEventListener("click", async () => {
    prefs.layoutMode = prefs.layoutMode === "book" ? "verse" : "book";
    savePrefs();
    document.getElementById("toggle-layout")?.classList.toggle("active", prefs.layoutMode === "book");
    if (currentSurah) await renderSurah(currentSurah, getLastRead()?.ayah);
  });

  document.getElementById("font-smaller")?.addEventListener("click", () => setFontScale(prefs.fontScale - 0.08));
  document.getElementById("font-larger")?.addEventListener("click", () => setFontScale(prefs.fontScale + 0.08));

  document.getElementById("ayah-jump")?.addEventListener("change", (e) => {
    const ayah = +e.target.value;
    if (ayah) scrollToAyah(currentSurah.id, ayah);
  });
}

function setFontScale(scale) {
  prefs.fontScale = Math.min(1.4, Math.max(0.85, scale));
  savePrefs();
  document.documentElement.style.setProperty("--arabic-scale", prefs.fontScale);
}

function normalizeSearch(text) {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0640\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9\u0621-\u064a\s:/\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function searchSurahs(surahs, query, limit = 8) {
  const ref = parseReference(query, surahs);
  if (ref) return [ref];

  const nq = normalizeSearch(query);
  if (!nq) return [];

  return surahs
    .map((s) => ({ surah: s.id, ayah: 1, score: scoreSurah(s, nq), kind: "surah", s }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.surah - b.surah)
    .slice(0, limit)
    .map(({ s, ...r }) => ({
      ...r,
      label: `${s.id}. ${s.name_simple}`,
      sub: s.translated_name,
    }));
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
      <span class="search-item-label">${esc(r.label)}</span>
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

  function filterGrid(q) {
    const nq = normalizeSearch(q);
    document.querySelectorAll(".surah-card").forEach((card) => {
      if (!nq) {
        card.hidden = false;
        return;
      }
      const id = card.querySelector(".surah-num")?.textContent;
      const s = surahs.find((x) => String(x.id) === id);
      card.hidden = !(s && scoreSurah(s, nq) > 0);
    });
  }

  function update() {
    const q = input.value.trim();
    results = searchSurahs(surahs, q);
    activeIdx = 0;
    renderSearchDropdown(results, activeIdx);
    filterGrid(q);
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
}

function renderHome(surahs) {
  setBreadcrumb("");
  const last = getLastRead();
  const bookmarks = getBookmarks().slice(0, 5);
  const tadabbur = getMyWorkList("tadabbur").slice(0, 3);
  const edits = getMyWorkList("meanings").slice(0, 3);
  const lastSurah = last ? surahs.find((s) => s.id === last.surah) : null;

  document.getElementById("app").innerHTML = `
    ${last && lastSurah ? `
    <a href="#/${last.surah}/${last.ayah}" class="resume-card">
      <span class="resume-icon" aria-hidden="true">۞</span>
      <span class="resume-body">
        <span class="resume-label">Continue your reading</span>
        <span class="resume-title">${esc(lastSurah.name_arabic)} · ${esc(lastSurah.translated_name)}</span>
        <span class="resume-meta">Ayah ${last.ayah}</span>
      </span>
      <span class="resume-arrow" aria-hidden="true">←</span>
    </a>` : ""}
    ${bookmarks.length ? `
    <section class="home-section">
      <h2 class="section-title">Saved ayahs</h2>
      <div class="bookmark-list compact">${bookmarks.map((b) => bookmarkRow(b)).join("")}</div>
      <a href="#/bookmarks" class="see-all">All bookmarks</a>
    </section>` : ""}
    ${tadabbur.length ? `
    <section class="home-section">
      <h2 class="section-title">My tadabbur</h2>
      <div class="bookmark-list compact">${tadabbur.map((e) => myWorkRow(e, { study: true })).join("")}</div>
      <a href="#/tadabbur" class="see-all">All tadabbur</a>
    </section>` : ""}
    ${edits.length ? `
    <section class="home-section">
      <h2 class="section-title">Edited meanings</h2>
      <div class="bookmark-list compact">${edits.map((e) => myWorkRow(e)).join("")}</div>
      <a href="#/edits" class="see-all">All edits</a>
    </section>` : ""}
    <div class="hero">
      <div class="hero-arch" aria-hidden="true"></div>
      <p class="hero-bismillah" dir="rtl">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
      <h1 class="hero-title" dir="rtl">القرآن الكريم</h1>
      ${ornament()}
      <p class="hero-subtitle">Recite, reflect, and let your heart find rest in His words</p>
      <p class="hero-hadith">“The best of you are those who learn the Qur'an and teach it.”</p>
    </div>
    <div class="search-wrap">
      <span class="search-icon" aria-hidden="true">⌕</span>
      <input type="search" id="surah-search" class="search-input" placeholder="2:15 · Al-Baqarah · The Cow · البقرة…" autocomplete="off" spellcheck="false" enterkeyhint="go" />
      <div id="search-dropdown" class="search-dropdown" hidden role="listbox"></div>
    </div>
    <div class="surah-grid" id="surah-grid">${surahs.map((s) => surahCard(s)).join("")}</div>`;

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
      QuranGitHubSync?.schedulePush();
      renderBookmarks();
    });
  });
}

async function renderSurah(data, targetAyah, openStudy = false) {
  currentSurah = data;
  const last = getLastRead();
  if (!targetAyah && last?.surah === data.id) targetAyah = last.ayah;
  const ayah = targetAyah || 1;
  saveLastRead(data.id, ayah);

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
      ${toolbarHtml(data, ayah)}
      <p class="reader-hint">${readerHintText()}</p>
      <div class="mushaf-sheet">
        ${renderAyahStreamHtml(data, data.id)}
      </div>
      <nav class="surah-nav" aria-label="Surah navigation">${prevSurah}<span class="nav-label">${data.id} / 114</span>${nextSurah}</nav>
    </div>`;

  document.documentElement.style.setProperty("--arabic-scale", prefs.fontScale);
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

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  const r = route();
  if (r.view !== "surah" || !currentSurah) return;
  const last = getLastRead();
  if (!last) return;
  if (e.key === "ArrowDown" || e.key === "j") {
    e.preventDefault();
    const next = Math.min(last.ayah + 1, currentSurah.verses_count);
    scrollToAyah(currentSurah.id, next);
  } else if (e.key === "ArrowUp" || e.key === "k") {
    e.preventDefault();
    const prev = Math.max(last.ayah - 1, 1);
    scrollToAyah(currentSurah.id, prev);
  } else if (e.key === "Escape") closeStudyPanel();
});

async function render() {
  if (scrollLock) return;
  hideTooltip();
  closeStudyPanel();
  const r = route();
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
  document.documentElement.style.setProperty("--arabic-scale", prefs.fontScale);
}

async function boot() {
  try {
    QuranGitHubSync?.init({
      lsKeys: LS,
      ayahEditsKey: LS.ayahEdits,
      onMerged: () => {
        reloadPrefsFromStorage();
        rebuildMyWorkIndex().catch((err) => console.warn("My-work index rebuild failed", err));
        if (!scrollLock) render();
      },
    });

    await checkSync();
    if (QuranGitHubSync?.isEnabled()) {
      await QuranGitHubSync.pullAndMerge();
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
