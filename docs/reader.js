const cache = { index: null, surahs: {}, pristine: {}, aiWbw: {}, passageTafsir: {}, timeline: null, hadithIndex: null, hadithMap: null, asbabNuzul: null, people: null, peopleHadith: null, duas: null };
const LS = {
  lastRead: "quran-last-read",
  recentReads: "quran-recent-reads",
  bookmarks: "quran-bookmarks",
  prefs: "quran-prefs",
  myWork: "quran-my-work",
  tadabburNotes: "quran-tadabbur-notes",
  tadabburFab: "quran-tadabbur-fab",
  ayahEdits: (s, a) => `quran-${s}-${a}`,
};

const RECENT_READS_MAX = 5;
const RECORD_DEBOUNCE_MS = 4000;

let canSync = false;
let scrollLock = false;
let lastHashUpdate = 0; // throttles history.replaceState (mobile browsers rate-limit it)
let saveTimer = null;
let recordTimer = null;
let pendingRecord = null;
let visibleAyah = null;
let observer = null;
let selectedAyah = null;
let currentSurah = null;
let expandedAyah = null;
let booted = false; // true once the app has rendered; gates the fatal-error overlay

// Surah → first juz it appears in (index 0 unused; 1-indexed).
const SURAH_JUZ = [0,1,1,3,4,6,7,8,9,10,11,11,12,13,13,14,14,15,15,16,16,17,17,18,18,18,19,19,20,20,21,21,21,21,22,22,22,23,23,23,24,24,25,25,25,25,26,26,26,26,26,26,27,27,27,27,27,27,28,28,28,28,28,28,28,28,28,29,29,29,29,29,29,29,29,29,29,29,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30];

// Juz N -> { s: surah, a: ayah } where that juz begins (standard Hafs divisions).
const JUZ_START = {
  1:{s:1,a:1}, 2:{s:2,a:142}, 3:{s:2,a:253}, 4:{s:3,a:93}, 5:{s:4,a:24},
  6:{s:4,a:148}, 7:{s:5,a:82}, 8:{s:6,a:111}, 9:{s:7,a:88}, 10:{s:8,a:41},
  11:{s:9,a:93}, 12:{s:11,a:6}, 13:{s:12,a:53}, 14:{s:15,a:1}, 15:{s:17,a:1},
  16:{s:18,a:75}, 17:{s:21,a:1}, 18:{s:23,a:1}, 19:{s:25,a:21}, 20:{s:27,a:56},
  21:{s:29,a:46}, 22:{s:33,a:31}, 23:{s:36,a:28}, 24:{s:39,a:32}, 25:{s:41,a:47},
  26:{s:46,a:1}, 27:{s:51,a:31}, 28:{s:58,a:1}, 29:{s:67,a:1}, 30:{s:78,a:1}
};

const DEFAULT_PREFS = {
  readMode: "translation",
  showTransliteration: false,
  layoutMode: "verse",
  fontScale: 1,
  transScale: 1,
  wordMode: "standard",
  activePanel: "reflection",
  activeContextTab: "occasion",
  theme: "light",
  bookContent: { arabic: true, translit: false, translation: true, aiTranslation: false, passageTafsir: false, ibnKathir: false, maarif: false },
  // Tadabbur + tafsir shown inline under every ayah of the whole view (verse/wbw).
  studyShow: { tadabbur: false, passageTafsir: false, ibnKathir: false, maarif: false },
  editView: "mine",
  editsFilter: { wordEdit: true, transEdit: true, tadabbur: true },
  homeView: "surah",
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
    if (!["verse", "book", "mushaf", "wbw"].includes(merged.layoutMode)) merged.layoutMode = "verse";
    if (!["mine", "original", "both", "none"].includes(merged.editView)) merged.editView = "mine";
    merged.editsFilter = { ...DEFAULT_PREFS.editsFilter, ...(raw.editsFilter || {}) };
    merged.bookContent = { ...DEFAULT_PREFS.bookContent, ...(raw.bookContent || {}) };
    merged.studyShow = { ...DEFAULT_PREFS.studyShow, ...(raw.studyShow || {}) };
    // Book's tafsir toggles moved into the shared studyShow group — carry them over.
    for (const k of ["passageTafsir", "ibnKathir", "maarif"]) {
      if (merged.bookContent?.[k] && raw.studyShow?.[k] === undefined) merged.studyShow[k] = true;
    }
    // Per-ayah "AI Tafsir" became passage-based "Passage Tafsir"; carry the
    // saved toggle across so anyone who had it on keeps commentary showing.
    for (const group of ["studyShow", "bookContent"]) {
      if (raw[group]?.aiTafsir && raw[group]?.passageTafsir === undefined) merged[group].passageTafsir = true;
      delete merged[group].aiTafsir;
    }
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
  const transEdit = (edited.translation || "") !== (original.translation || "");
  const ow = original.word_by_word || {}, ew = edited.word_by_word || {};
  let wordEdit = false;
  for (const k of new Set([...Object.keys(ow), ...Object.keys(ew)])) {
    if ((ow[k]?.translation || "") !== (ew[k]?.translation || "")) { wordEdit = true; break; }
  }
  const meanings = transEdit || wordEdit;

  if (!tadabbur && !meanings) {
    delete work[key];
  } else {
    work[key] = {
      surah: surahId,
      ayah: ayahNum,
      surahName,
      tadabbur,
      meanings,
      transEdit,
      wordEdit,
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
  if (parts[0] === "duas") return { view: "duas", id: parts[1] || null };
  if (parts.length === 1) return { view: "surah", surah: +parts[0], ayah: null };
  const study = parts[2] === "study";
  return { view: "surah", surah: +parts[0], ayah: +parts[1], study };
}

const DATA_VERSION = "66";

async function loadIndex() {
  if (!cache.index) cache.index = await (await fetch(`data/index.json?v=${DATA_VERSION}`)).json();
  return cache.index;
}

async function loadDuas() {
  if (cache.duas === null) {
    try {
      cache.duas = await (await fetch(`data/duas.json?v=${DATA_VERSION}`)).json();
    } catch (_) {
      cache.duas = [];
    }
  }
  return cache.duas;
}

async function loadSurah(n) {
  if (!cache.surahs[n]) {
    const data = await (await fetch(`data/surah_${n}.json?v=${DATA_VERSION}`)).json();
    cache.surahs[n] = data;
    cache.pristine[n] = JSON.parse(JSON.stringify(data));
  }
  return cache.surahs[n];
}

// Passage tafsir: one entry per contiguous ayah RANGE, not per ayah.
// Loaded on demand; null if this surah has not been generated yet.
async function loadPassageTafsir(n) {
  if (cache.passageTafsir[n] === undefined) {
    try {
      const res = await fetch(`data/passage_tafsir/surah_${n}.json?v=${DATA_VERSION}`);
      cache.passageTafsir[n] = res.ok ? await res.json() : null;
    } catch (_) {
      cache.passageTafsir[n] = null;
    }
  }
  return cache.passageTafsir[n];
}

// The passage covering a given ayah, or null. Ranges never overlap
// (tafsir_passages.py enforces that at build time), so first match wins.
function passageFor(n, ayahNum) {
  const data = cache.passageTafsir[n];
  if (!data || !data.passages) return null;
  return data.passages.find((p) => ayahNum >= p.start && ayahNum <= p.end) || null;
}

// "2:1–5" — the range label that tells the reader what the tafsir covers.
function passageRangeLabel(n, p) {
  return p.start === p.end ? `${n}:${p.start}` : `${n}:${p.start}–${p.end}`;
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

async function loadTimeline() {
  if (!cache.timeline) {
    try {
      const res = await fetch(`data/timeline.json?v=${DATA_VERSION}`);
      cache.timeline = res.ok ? await res.json() : null;
    } catch (_) { cache.timeline = null; }
  }
  return cache.timeline;
}

async function loadHadithData() {
  if (!cache.hadithIndex) {
    try {
      const [idxRes, mapRes] = await Promise.all([
        fetch(`data/hadith_index.json?v=${DATA_VERSION}`),
        fetch(`data/hadith_map.json?v=${DATA_VERSION}`)
      ]);
      cache.hadithIndex = idxRes.ok ? await idxRes.json() : {};
      cache.hadithMap   = mapRes.ok ? await mapRes.json() : {};
    } catch (_) { cache.hadithIndex = {}; cache.hadithMap = {}; }
  }
}

async function loadAsbabNuzul() {
  if (cache.asbabNuzul === null) {
    try {
      const res = await fetch(`data/asbab_nuzul.json?v=${DATA_VERSION}`);
      cache.asbabNuzul = res.ok ? await res.json() : {};
    } catch (_) { cache.asbabNuzul = {}; }
  }
}

async function loadPeople() {
  if (cache.people === null) {
    try {
      const [pi, ph] = await Promise.all([
        fetch(`data/people_index.json?v=${DATA_VERSION}`).then(r => r.ok ? r.json() : {}),
        fetch(`data/people_hadith.json?v=${DATA_VERSION}`).then(r => r.ok ? r.json() : {}),
      ]);
      cache.people = pi;
      cache.peopleHadith = ph;
    } catch (_) { cache.people = {}; cache.peopleHadith = {}; }
  }
}

// ---- 15-line Madani mushaf view (QCF v2 page fonts, vendored for Juzʾ ʿAmma) ----
const MUSHAF = { index: null, pages: {}, fontPromises: {} };

function mushafAvailable(surahId) { return surahId >= 78 && surahId <= 114; }

async function loadMushafIndex() {
  if (!MUSHAF.index) {
    try { MUSHAF.index = await (await fetch(`data/mushaf/index.json?v=${DATA_VERSION}`)).json(); }
    catch (_) { MUSHAF.index = {}; }
  }
  return MUSHAF.index;
}

async function loadMushafPage(p) {
  if (MUSHAF.pages[p] === undefined) {
    try {
      const r = await fetch(`data/mushaf/page_${p}.json?v=${DATA_VERSION}`);
      MUSHAF.pages[p] = r.ok ? await r.json() : null;
    } catch (_) { MUSHAF.pages[p] = null; }
  }
  return MUSHAF.pages[p];
}

function ensureMushafFont(p) {
  if (!MUSHAF.fontPromises[p]) {
    const ff = new FontFace(`p${p}-v2`, `url('fonts/qcf2/p${p}.woff2')`, { display: "block" });
    document.fonts.add(ff);
    MUSHAF.fontPromises[p] = ff.load().then(() => true).catch(() => false);
  }
  return MUSHAF.fontPromises[p];
}

function mushafSurahMeta(s) {
  const list = (cache.index && cache.index.surahs) || [];
  return list.find((x) => x.id === +s) || null;
}

function mushafBannerHtml(s) {
  const m = mushafSurahMeta(s);
  const ar = m ? m.name_arabic : "";
  const en = m ? m.name_simple : `Sūrah ${s}`;
  return `<div class="mushaf-line mushaf-banner" role="separator" aria-label="Sūrah ${esc(en)}">
    <span class="mb-frame"><span class="mb-ar" dir="rtl">${esc(ar)}</span><span class="mb-en">${esc(en)}</span></span></div>`;
}

function mushafBasmalaHtml() {
  return `<div class="mushaf-line mushaf-basmala" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`;
}

function mushafWordLineHtml(words, page, opts = {}) {
  const inner = words.map((w) => `<span class="mw${w.t === "e" ? " end" : ""}" data-k="${w.k}">${w.c}</span>`).join("");
  return `<div class="mushaf-line mushaf-text${opts.center ? " center" : ""}" style="font-family:'p${page}-v2'">${inner}</div>`;
}

function renderMushafPageHtml(pageData) {
  const page = pageData.page;
  const lines = pageData.lines || {};
  ensureMushafFont(page);

  // first line of each surah that starts on this page (verse_key "S:1")
  const startLineOfSurah = {};
  // lines holding a surah's final ayah end-marker -> centre them (not justified)
  const lastLine = {};
  for (const [lno, ws] of Object.entries(lines)) {
    for (const w of ws) {
      const [s, a] = w.k.split(":");
      if (a === "1" && startLineOfSurah[s] === undefined) startLineOfSurah[s] = +lno;
      if (w.t === "e") {
        const meta = mushafSurahMeta(s);
        if (meta && +a === meta.verses_count) lastLine[+lno] = true;
      }
    }
  }
  const bannerAt = {}, basmalaAt = {};
  let preBanner = null; // surah header straddling from the previous page (banner line < 1)
  for (const [s, L] of Object.entries(startLineOfSurah)) {
    basmalaAt[L - 1] = s;
    if (L - 2 >= 1) bannerAt[L - 2] = s; else preBanner = s;
  }

  let rows = "";
  if (preBanner) rows += mushafBannerHtml(preBanner);
  for (let i = 1; i <= 15; i++) {
    if (bannerAt[i]) { rows += mushafBannerHtml(bannerAt[i]); continue; }
    if (basmalaAt[i]) { rows += mushafBasmalaHtml(); continue; }
    const ws = lines[i];
    rows += (ws && ws.length) ? mushafWordLineHtml(ws, page, { center: !!lastLine[i] })
                              : `<div class="mushaf-line blank"></div>`;
  }
  return `<section class="mushaf-page" data-page="${page}">
    <div class="mushaf-page-inner">${rows}</div>
    <div class="mushaf-page-num"><span>${page}</span></div>
  </section>`;
}

async function renderMushafInto(container, surahId) {
  if (!container) return;
  if (!mushafAvailable(surahId)) {
    container.innerHTML = `<div class="mushaf-unavailable">The 15-line mushaf view is currently available for Juzʾ ʿAmma (sūrahs 78–114).</div>`;
    return;
  }
  await loadIndex(); // surah names for the banners
  const idx = await loadMushafIndex();
  const pages = idx[String(surahId)] || [];
  if (!pages.length) { container.innerHTML = `<div class="mushaf-unavailable">Mushaf pages not found.</div>`; return; }
  const datas = await Promise.all(pages.map(loadMushafPage));
  const present = datas.filter(Boolean);
  container.innerHTML = present.map(renderMushafPageHtml).join("")
    || `<div class="mushaf-unavailable">Mushaf data unavailable.</div>`;
  // QCF per-page fonts have slightly different glyph metrics, so shrink the page
  // font just enough that the widest line fits with no overflow (uniformly across the sūrah).
  try { await Promise.all(present.map((d) => ensureMushafFont(d.page))); } catch (_) {}
  await fitMushafWhenReady(container, present.map((d) => d.page));
}

// Wait until the page fonts actually affect layout, then fit each page.
async function fitMushafWhenReady(container, pages) {
  for (let i = 0; i < 40; i++) {
    const l = container.querySelector(".mushaf-text");
    const ready = pages.every((p) => document.fonts.check(`32px 'p${p}-v2'`))
      && l && l.firstElementChild && l.firstElementChild.offsetWidth > 0;
    if (ready) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  fitMushafPages(container);
}

// QCF per-page fonts have different glyph metrics, so size EACH page so its
// widest (full) line fills ~98.5% of the width — matching the printed page.
function fitMushafPages(container) {
  container.querySelectorAll(".mushaf-page-inner").forEach((inner) => {
    let maxFill = 0;
    inner.querySelectorAll(".mushaf-text").forEach((l) => {
      let s = 0;
      for (const c of l.children) s += c.offsetWidth;
      const f = s / l.clientWidth;
      if (f > maxFill) maxFill = f;
    });
    if (maxFill <= 0.01) return;
    const cqw = Math.max(4.5, Math.min(8.5, (6.2 * 0.985) / maxFill)); // 6.2 = --qcf-size default
    inner.style.setProperty("--qcf-size", cqw.toFixed(3) + "cqw");
  });
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
    .replace(/[\u200b\u200e\u200f\ufeff\u061c]/g, "")
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

// Sajdah at-tilāwah — the 15 standard places of prostration (Tanzil / quran.com numbering).
// For a 14-count, drop "38:24" (Sūrah Ṣād, counted by Ḥanafīs but not Shāfiʿīs).
const SAJDAH = new Set(["7:206", "13:15", "16:50", "17:109", "19:58", "22:18", "22:77", "25:60", "27:26", "32:15", "38:24", "41:38", "53:62", "84:21", "96:19"]);
function isSajdah(surahId, ayahNum) {
  return SAJDAH.has(`${surahId}:${ayahNum}`);
}
function sajdahBannerHtml(surahId, ayahNum) {
  if (!isSajdah(surahId, ayahNum)) return "";
  return `<div class="sajdah-banner" role="note" title="Sajdah at-tilāwah — a place of prostration during recitation">
      <span class="sajdah-sym" aria-hidden="true">۩</span>
      <span class="sajdah-label">Sajdah · place of prostration</span>
    </div>`;
}
function sajdahInlineHtml(surahId, ayahNum) {
  if (!isSajdah(surahId, ayahNum)) return "";
  return ` <span class="sajdah-inline" title="Sajdah at-tilāwah — a place of prostration during recitation" aria-label="Sajdah, place of prostration">۩</span>`;
}

function ornament() {
  return `<div class="ornament-line" aria-hidden="true"><span>✦</span></div>`;
}

function revelationLabel(place) {
  return place === "makkah" ? "Makkah" : "Madinah";
}

// Inline formatting for one block of text (escaped first, so no HTML injection).
function mdInline(chunk) {
  return esc(chunk)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
}

function md(text) {
  if (!text) return "";
  // Blocks are separated by blank lines. Headings are pulled out so they render
  // as real headings rather than literal "## " inside a paragraph — passage
  // tafsir leans on them to break up a long passage on a phone.
  return String(text)
    .split(/\n{2,}/)
    .map((block) => {
      let b = block.trim();
      if (!b) return "";
      let out = "";
      const h = b.match(/^(#{1,4})\s+(.*)$/m);
      if (h && b.startsWith(h[0])) {
        const level = Math.min(Math.max(h[1].length, 2), 4); // never emit <h1>
        out += `<h${level}>${mdInline(h[2].trim())}</h${level}>`;
        b = b.slice(h[0].length).trim();
        if (!b) return out;
      }
      return out + `<p>${mdInline(b)}</p>`;
    })
    .join("")
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
  // "original" (and "none" = no edit version selected): show the pristine text,
  // ignoring the user's saved edits. Only "mine"/"both" surface the edits.
  if (prefs.editView !== "mine" && prefs.editView !== "both") return getOriginalAyah(surahId, ayah.ayah) || ayah;
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
  let origNote = "";
  if (!inline && prefs.editView === "both" && transMode === "standard" && currentSurah) {
    const orig = getOriginalAyah(currentSurah.id, ayah.ayah);
    const ot = orig && (orig.translation || orig.qf_translation || "");
    if (ot && ot !== transText) origNote = `<p class="translation-orig"><span class="orig-label">Original</span> ${esc(ot)}</p>`;
  }
  return `<${tag} class="${cls}">
        ${transMode === "ai" ? `<span class="translation-badge">AI Translation</span>` : ""}
        <p class="translation-text">${esc(transText)}</p>
        ${origNote}
        ${!inline && transMode === "standard" ? `<button type="button" class="translation-edit-btn" data-action="edit-translation" title="Edit translation" aria-label="Edit translation">✎</button>` : ""}
      </${tag}>`;
}

function toArabicNum(n) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

function ayahRailHtml(a, ayahNum, surahId) {
  const bookmarked = isBookmarked(surahId, ayahNum);
  const hasReflection = !!(a.personal_reflections && a.personal_reflections.trim());
  return `
      <div class="ayah-rail">
        <button type="button" class="ayah-num-stack" data-action="select" aria-label="Ayah ${ayahNum}" title="Ayah ${ayahNum}">
          <span class="ayn-en">${ayahNum}</span>
          <span class="ayn-ar" dir="rtl">${toArabicNum(ayahNum)}</span>
        </button>
        <button type="button" class="ayah-dot bookmark-btn ${bookmarked ? "active" : ""}" data-action="bookmark" aria-label="${bookmarked ? "Remove bookmark" : "Bookmark"}" title="${bookmarked ? "Remove bookmark" : "Bookmark"}"><span class="icon-star">${bookmarked ? "✦" : "✧"}</span></button>
        <button type="button" class="ayah-dot study-btn ${hasReflection ? "has-note" : ""}" data-action="study" aria-label="Study and reflect" title="Tadabbur · Tafsir"><span class="icon-study">${hasReflection ? "✎" : "☰"}</span></button>
      </div>`;
}

function ayahBlock(data, ayah, surahId) {
  const a = mergeLocalEdits(ayah, surahId);
  return `
    <article class="ayah-block" id="ayah-${surahId}-${ayah.ayah}" data-surah="${surahId}" data-ayah="${ayah.ayah}">
      ${ayahRailHtml(a, ayah.ayah, surahId)}
      <div class="ayah-body">
        <div class="arabic-block">
          <p class="arabic-text">${renderArabicWords(a, surahId)}</p>
          ${transliterationHtml(a)}
        </div>
        ${translationBlockHtml(a)}
        ${sajdahBannerHtml(surahId, ayah.ayah)}
        ${ayahExtrasHtml(a, surahId, ayah.ayah)}
      </div>
    </article>`;
}

// Word-by-word study layout: each word shown as a card (Arabic + transliteration + meaning).
function wbwAyahBlock(data, ayah, surahId) {
  const a = mergeLocalEdits(ayah, surahId);
  const words = orderedWords(a.word_by_word);
  const grid = words.length
    ? words.map((w) => `<span class="wbw-word">
          <span class="q-word wbw-ar" data-s="${surahId}" data-a="${ayah.ayah}" data-i="${w.key}" tabindex="0">${esc(cleanArabic(w.arabic))}</span>
          ${prefs.showTransliteration ? `<span class="wbw-tr">${esc(w.transliteration || "")}</span>` : ""}
          <span class="wbw-en">${esc(w.translation || "")}</span>
        </span>`).join("")
    : `<p class="arabic-text">${esc(cleanArabic(a.arabic))}</p>`;
  const { text: transText } = displayTranslation(a);
  return `
    <article class="ayah-block wbw-ayah" id="ayah-${surahId}-${ayah.ayah}" data-surah="${surahId}" data-ayah="${ayah.ayah}">
      ${ayahRailHtml(a, ayah.ayah, surahId)}
      <div class="ayah-body">
        <div class="wbw-grid" dir="rtl">${grid}</div>
        ${transText && prefs.readMode !== "arabic" ? `<p class="wbw-fulltrans">${esc(transText)}</p>` : ""}
        ${sajdahBannerHtml(surahId, ayah.ayah)}
        ${ayahExtrasHtml(a, surahId, ayah.ayah)}
      </div>
    </article>`;
}

function wbwViewHtml(data, surahId) {
  return data.ayahs.map((a) => wbwAyahBlock(data, a, surahId)).join("");
}

function bookAyahSpan(ayah, surahId) {
  const a = mergeLocalEdits(ayah, surahId);
  return `<span class="book-ayah" id="ayah-${surahId}-${ayah.ayah}" data-surah="${surahId}" data-ayah="${ayah.ayah}" title="Ayah ${ayah.ayah} — click for tafsir">
      ${renderArabicWords(a, surahId)}${ayahMarkerHtml(ayah.ayah, { end: true })}${sajdahInlineHtml(surahId, ayah.ayah)}
    </span>`;
}

// Per-ayah study extras for book view (tadabbur + tafsir), driven by studyShow
// + per-ayah overrides — the same model as verse/wbw.
function bookExtrasBlock(ayah, surahId) {
  const ayahN = ayah.ayah;
  const m = mergeLocalEdits(ayah, surahId);
  const parts = [];
  if (effectiveShow(surahId, ayahN, "tadabbur")) {
    parts.push(`<div class="ax-tadabbur"><div class="ax-label">Tadabbur</div><textarea class="ax-tadabbur-input" data-s="${surahId}" data-a="${ayahN}" rows="2" placeholder="Your tadabbur — what does this ayah move in your heart?">${esc(m.personal_reflections || "")}</textarea><div class="ax-save-status"></div></div>`);
  }
  if (effectiveShow(surahId, ayahN, "passageTafsir")) {
    // Once per passage, on its first ayah — not repeated under every ayah.
    const p = passageFor(surahId, ayahN);
    if (p && p.start === ayahN) parts.push(passageTafsirHtml(surahId, ayahN));
  }
  for (const key of ["ibnKathir", "maarif"]) {
    if (!effectiveShow(surahId, ayahN, key)) continue;
    const text = tafsirFieldFor(m, key);
    if (!text) continue;
    parts.push(`<details class="ax-tafsir" open><summary>${esc(STUDY_LABELS[key])}</summary><div class="ax-tafsir-body">${md(text)}</div></details>`);
  }
  if (!parts.length) return "";
  return `<div class="book-study-ayah" data-ayah="${ayahN}"><span class="bt-ayah-num">Ayah ${ayahN}</span>${parts.join("")}</div>`;
}

// Build the selected content sections (Arabic / translit / translation / AI / tafsir)
// for a given list of ayahs — used per chunk so Arabic and its meaning stay adjacent.
function bookSectionsFor(ayahs, surahId, c) {
  const sec = [];
  if (c.arabic) {
    const arabicFlow = ayahs.map((a) => bookAyahSpan(a, surahId)).join(" ");
    sec.push(`<section class="book-section book-arabic-section" aria-label="Arabic text"><p class="book-flow arabic-flow" dir="rtl">${arabicFlow}</p></section>`);
  }
  if (c.translit) {
    const f = ayahs.map((a) => { const t = renderAyahTransliteration(mergeLocalEdits(a, surahId)); return t ? `<span class="book-translit-seg" data-ayah="${a.ayah}">${esc(t)}${sajdahInlineHtml(surahId, a.ayah)}</span>` : ""; }).filter(Boolean).join(" ");
    if (f) sec.push(`<section class="book-section book-translit-section" aria-label="Transliteration"><p class="book-flow translit-flow" dir="ltr">${f}</p></section>`);
  }
  if (c.translation) {
    const f = ayahs.map((a) => { const m = mergeLocalEdits(a, surahId); const t = m.translation || m.qf_translation || ""; return t ? `<span class="book-trans-seg" data-ayah="${a.ayah}">${ayahMarkerHtml(a.ayah, { inline: true })} ${esc(t)}${sajdahInlineHtml(surahId, a.ayah)}</span>` : ""; }).filter(Boolean).join(" ");
    if (f) sec.push(`<section class="book-section book-translation-section" aria-label="Translation"><p class="book-flow translation-flow">${f}</p></section>`);
  }
  if (c.aiTranslation) {
    const f = ayahs.map((a) => { const m = mergeLocalEdits(a, surahId); const t = m.ai_translation || ""; return t ? `<span class="book-trans-seg" data-ayah="${a.ayah}">${ayahMarkerHtml(a.ayah, { inline: true })} ${esc(t)}${sajdahInlineHtml(surahId, a.ayah)}</span>` : ""; }).filter(Boolean).join(" ");
    if (f) sec.push(`<section class="book-section book-translation-section ai-mode" aria-label="AI translation"><p class="book-flow translation-flow">${f}</p></section>`);
  }
  const studyBlocks = ayahs.map((a) => bookExtrasBlock(a, surahId)).filter(Boolean).join("");
  if (studyBlocks) sec.push(`<section class="book-section book-tafsir-section" aria-label="Study">${studyBlocks}</section>`);
  return sec;
}

// Split ayahs into chunks of roughly equal reading length so each Arabic block
// sits right next to its own translation, instead of one wall of each.
function bookChunks(ayahs, surahId) {
  const TARGET = 520; // ~translation characters per chunk (≈ a short paragraph)
  const chunks = []; let cur = []; let len = 0;
  for (const a of ayahs) {
    const m = mergeLocalEdits(a, surahId);
    const t = m.translation || m.qf_translation || m.ai_translation || "";
    cur.push(a);
    len += (t.length || 60);
    if (len >= TARGET) { chunks.push(cur); cur = []; len = 0; }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

function bookViewHtml(data, surahId) {
  const c = prefs.bookContent || {};
  // Only interleave when there are 2+ parallel text columns to alternate; a single
  // column reads better as one continuous flow.
  const flowCount = (c.arabic ? 1 : 0) + (c.translit ? 1 : 0) + (c.translation ? 1 : 0) + (c.aiTranslation ? 1 : 0);
  const chunks = flowCount >= 2 ? bookChunks(data.ayahs, surahId) : [data.ayahs];
  const parts = [];
  for (const chunk of chunks) {
    const sec = bookSectionsFor(chunk, surahId, c);
    if (sec.length) parts.push(`<div class="book-chunk">${sec.join("")}</div>`);
  }
  if (!parts.length) parts.push(`<p class="empty-note center">Choose at least one element in “Content”.</p>`);
  return `<div class="book-stream">${parts.join("")}<div id="book-study-slot" class="book-study-slot"></div></div>`;
}

function verseViewHtml(data, surahId) {
  return data.ayahs.map((a) => ayahBlock(data, a, surahId)).join("");
}

function renderAyahStreamHtml(data, surahId) {
  if (prefs.layoutMode === "mushaf") {
    return `<div class="ayah-stream layout-mushaf"><div class="mushaf-loading">Loading mushaf…</div></div>`;
  }
  const inner = prefs.layoutMode === "book" ? bookViewHtml(data, surahId)
    : prefs.layoutMode === "wbw" ? wbwViewHtml(data, surahId)
    : verseViewHtml(data, surahId);
  return `<div class="ayah-stream layout-${prefs.layoutMode}">${inner}</div>`;
}

function readerHintText() {
  if (prefs.layoutMode === "wbw") {
    return "Word-by-word — each word with its meaning beneath · hover or tap a word for full grammar.";
  }
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

// Unified "Content ▾" box: gathers every per-view display option (reading mode,
// transliteration, book content, edit version) into one dropdown. The Word AI
// hover toggle stays a separate button. Returns "" when nothing applies (mushaf).
function contentMenuHtml(data) {
  const lm = prefs.layoutMode;
  const sections = [];
  if (lm === "verse" || lm === "wbw") {
    const rm = [["arabic", "Arabic only"], ["translation", "Translation"], ["ai", "AI Translation"]];
    sections.push(`<div class="cm-group"><div class="cm-group-label">Reading mode</div>${rm.map(([k, lbl]) => `<label class="cm-item"><input type="radio" name="cm-readmode" data-rm="${k}" ${prefs.readMode === k ? "checked" : ""}> ${lbl}</label>`).join("")}</div>`);
    sections.push(`<label class="cm-item"><input type="checkbox" data-translit ${prefs.showTransliteration ? "checked" : ""}> Transliteration</label>`);
  }
  if (lm === "book") {
    const bc = [["arabic", "Arabic"], ["translit", "Transliteration"], ["translation", "Translation"], ["aiTranslation", "AI translation"]];
    sections.push(`<div class="cm-group"><div class="cm-group-label">Show</div>${bc.map(([k, lbl]) => `<label class="cm-item"><input type="checkbox" data-bc="${k}" ${prefs.bookContent[k] ? "checked" : ""}> ${lbl}</label>`).join("")}</div>`);
  }
  if (lm !== "mushaf") {
    // Tadabbur + tafsir under every ayah (whole view); also toggleable per-ayah via ☰.
    const sx = STUDY_KEYS.map((k) => `<label class="cm-item"><input type="checkbox" data-sx="${k}" ${prefs.studyShow?.[k] ? "checked" : ""}> ${esc(STUDY_LABELS[k])}</label>`).join("");
    sections.push(`<div class="cm-group"><div class="cm-group-label">Study (whole view)</div>${sx}</div>`);
    const ev = [["mine", "My edits"], ["original", "Original"], ["both", "Both"]];
    sections.push(`<div class="cm-group"><div class="cm-group-label">Edit version</div>${ev.map(([k, lbl]) => `<label class="cm-item"><input type="radio" name="cm-editview" data-ev="${k}" ${prefs.editView === k ? "checked" : ""}> ${lbl}</label>`).join("")}</div>`);
  }
  if (!sections.length) return "";
  return `<span class="content-menu-wrap">
            <button type="button" class="btn active" id="content-btn" title="Choose what to show">Content ▾</button>
            <div class="content-menu" id="content-menu" hidden>${sections.join("")}</div>
          </span>`;
}

function toolbarHtml(data, ayah, surahs = []) {
  return `
      <div class="reader-toolbar sticky-toolbar">
        <div class="surah-progress-wrap">
          <div class="surah-progress" role="progressbar"><div class="surah-progress-bar" style="width:0"></div></div>
          <span class="surah-progress-label">Ayah ${ayah} of ${data.verses_count}</span>
        </div>
        <div class="toolbar-actions">
          <div class="jump-group">
            <div class="search-wrap reader-search-wrap reader-surah-wrap">
              <span class="search-icon" aria-hidden="true">⌕</span>
              <input type="search" id="reader-surah" class="search-input reader-search-input" placeholder="Sūrah…" autocomplete="off" spellcheck="false" enterkeyhint="go" aria-label="Search and jump to a sūrah" />
              <div id="reader-surah-dd" class="search-dropdown" hidden role="listbox"></div>
            </div>
            <div class="search-wrap reader-search-wrap reader-ayah-wrap">
              <span class="search-icon" aria-hidden="true">⌕</span>
              <input type="search" id="reader-ayah" class="search-input reader-search-input reader-ayah-input" placeholder="Ayah #…" inputmode="numeric" autocomplete="off" spellcheck="false" enterkeyhint="go" aria-label="Search and jump to an ayah in this sūrah" />
              <div id="reader-ayah-dd" class="search-dropdown" hidden role="listbox"></div>
            </div>
          </div>
          <select id="layout-select" class="select-input" aria-label="Reading layout" title="Reading layout">
            <option value="verse" ${prefs.layoutMode === "verse" ? "selected" : ""}>Verse</option>
            <option value="wbw" ${prefs.layoutMode === "wbw" ? "selected" : ""}>Word-by-word</option>
            <option value="book" ${prefs.layoutMode === "book" ? "selected" : ""}>Book</option>
            ${mushafAvailable(data.id) ? `<option value="mushaf" ${prefs.layoutMode === "mushaf" ? "selected" : ""}>Mushaf</option>` : ""}
          </select>
          ${contentMenuHtml(data)}
          <button type="button" class="btn ${prefs.wordMode === "ai" ? "active" : ""}" id="toggle-wordmode" title="Hover any word for an AI grammar &amp; meaning breakdown">Word AI</button>
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

// The ayah with the user's saved edits applied, independent of the current
// edit-version view — so saving a tadabbur note never overwrites word/translation
// edits with the originals (which getAyahData would, in "Original" view).
function ayahWithEdits(surahId, ayahNum) {
  const raw = currentSurah?.ayahs.find((a) => a.ayah === ayahNum);
  if (!raw) return null;
  const merged = { ...raw, word_by_word: { ...raw.word_by_word } };
  if (!canSync) {
    try {
      const local = JSON.parse(localStorage.getItem(LS.ayahEdits(surahId, ayahNum)) || "null");
      if (local) Object.assign(merged, local);
    } catch (_) {}
  }
  return merged;
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

// ---- Inline study extras (tadabbur + tafsir) shown under an ayah ----
// View-wide via prefs.studyShow (the Content box); per-ayah via ayahShow overrides
// (the ☰ menu). An ayah shows an extra if either is on.
const STUDY_KEYS = ["tadabbur", "passageTafsir", "ibnKathir", "maarif"];
const STUDY_LABELS = { tadabbur: "Tadabbur", passageTafsir: "Passage Tafsir", ibnKathir: "Ibn Kathīr", maarif: "Maʿārif ul Qurʼān" };
const ayahShow = {}; // "surah:ayah" -> { tadabbur, passageTafsir, ibnKathir, maarif } (session, additive)

function effectiveShow(surahId, ayahNum, key) {
  if (prefs.studyShow?.[key]) return true;
  return !!ayahShow[`${surahId}:${ayahNum}`]?.[key];
}
function anyEffectiveShow(surahId, ayahNum) {
  return STUDY_KEYS.some((k) => effectiveShow(surahId, ayahNum, k))
    || !!ayahShow[`${surahId}:${ayahNum}`]?.timeline
  || !!ayahShow[`${surahId}:${ayahNum}`]?.hadith;
}
function tafsirFieldFor(ay, key) {
  if (key === "ibnKathir") return ay.tafsir_ibn_kathir || ay.qf_tafsir;
  if (key === "maarif") return ay.maarif_ul_quran;
  return null;
}

// Passage tafsir covers a RANGE, so it must say so — otherwise a reader opening
// ayah 4 of a 1–7 passage would read it as commentary on ayah 4 alone. It is
// rendered once, on the first ayah of the range that is on screen.
function passageTafsirHtml(surahId, ayahNum) {
  const p = passageFor(surahId, ayahNum);
  if (!p || !p.tafsir) return "";
  const label = passageRangeLabel(surahId, p);
  const single = p.start === p.end;
  const scope = single
    ? `This tafsir covers ayah ${label}`
    : `This tafsir covers ayat ${label} — read as one passage`;
  return `<details class="ayah-extra ax-passage" open>
      <summary>Passage Tafsir<span class="ax-passage-range">${esc(label)}</span></summary>
      <div class="ax-passage-head">
        ${p.title ? `<div class="ax-passage-title">${esc(p.title)}</div>` : ""}
        <div class="ax-passage-scope">${esc(scope)}</div>
      </div>
      <div class="ax-tafsir-body">${md(p.tafsir)}</div>
    </details>`;
}

// The editable tadabbur + tafsir blocks rendered beneath an ayah.
function ayahExtrasHtml(ay, surahId, ayahNum) {
  if (!anyEffectiveShow(surahId, ayahNum)) return "";
  const blocks = [];
  if (effectiveShow(surahId, ayahNum, "tadabbur")) {
    blocks.push(`<div class="ayah-extra ax-tadabbur">
        <div class="ax-label">Tadabbur</div>
        <textarea class="ax-tadabbur-input" data-s="${surahId}" data-a="${ayahNum}" rows="2" placeholder="Your tadabbur — what does this ayah move in your heart?">${esc(ay.personal_reflections || "")}</textarea>
        <div class="ax-save-status"></div>
      </div>`);
  }
  if (effectiveShow(surahId, ayahNum, "passageTafsir")) {
    // Only on the passage's first ayah — repeating it under every ayah of the
    // range is exactly the noise the passage format exists to remove.
    const p = passageFor(surahId, ayahNum);
    if (p && p.start === ayahNum) blocks.push(passageTafsirHtml(surahId, ayahNum));
  }
  for (const key of ["ibnKathir", "maarif"]) {
    if (!effectiveShow(surahId, ayahNum, key)) continue;
    const text = tafsirFieldFor(ay, key);
    if (!text) continue;
    blocks.push(`<details class="ayah-extra ax-tafsir" open><summary>${esc(STUDY_LABELS[key])}</summary><div class="ax-tafsir-body">${md(text)}</div></details>`);
  }
  if (ayahShow[`${surahId}:${ayahNum}`]?.timeline) {
    blocks.push(`<div class="ayah-extra ax-timeline">${renderTimelinePanel()}</div>`);
  }
  if (ayahShow[`${surahId}:${ayahNum}`]?.hadith) {
    blocks.push(`<div class="ayah-extra ax-hadith">${renderContextPanel(surahId, ayahNum)}</div>`);
  }
  return blocks.length ? `<div class="ayah-extras">${blocks.join("")}</div>` : "";
}

// Per-ayah ☰ menu: the same study toggles as the Content box, scoped to one ayah.
function ayahStudyMenuHtml(surahId, ayahNum) {
  const items = STUDY_KEYS.map((k) => {
    const viewOn = !!prefs.studyShow?.[k];
    const on = effectiveShow(surahId, ayahNum, k);
    return `<label class="cm-item"><input type="checkbox" data-axs="${k}" ${on ? "checked" : ""} ${viewOn ? "disabled title='On for the whole view'" : ""}> ${esc(STUDY_LABELS[k])}</label>`;
  }).join("");
  const tlOn = !!ayahShow[`${surahId}:${ayahNum}`]?.timeline;
  const tlItem = `<label class="cm-item"><input type="checkbox" data-axs="timeline" ${tlOn ? "checked" : ""}> Timeline</label>`;
  const hdOn = !!ayahShow[`${surahId}:${ayahNum}`]?.hadith;
  const hdItem = `<label class="cm-item"><input type="checkbox" data-axs="hadith" ${hdOn ? "checked" : ""}> Context</label>`;
  return `<div class="ayah-study-menu"><div class="cm-group-label">Show for this ayah</div>${items}${tlItem}${hdItem}</div>`;
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
  if (prefs.activePanel === "timeline") return renderTimelinePanel();
  if (prefs.activePanel === "hadith") return renderContextPanel(currentSurah?.id, ayah?.ayah);
  if (prefs.activePanel === "tafsir") {
    let html = `<p class="panel-intro tafsir-intro">Commentary drawing on Ibn Kathir, Maarif ul Quran, classical scholars, and authenticated hadith.</p>`;
    // Opened from one ayah, so show the passage wherever in the range we are —
    // with the range stated, so it is never mistaken for single-ayah commentary.
    const p = currentSurah ? passageFor(currentSurah.id, ayah.ayah) : null;
    if (p && p.tafsir) {
      const label = passageRangeLabel(currentSurah.id, p);
      const scope = p.start === p.end
        ? `Covers ayah ${label}`
        : `Covers ayat ${label} — this commentary treats the whole passage`;
      html += `<details open class="passage-tafsir-block">
        <summary class="passage-tafsir-summary">Passage Tafsir<span class="pt-range">${esc(label)}</span></summary>
        <div class="pt-head">
          ${p.title ? `<div class="pt-title">${esc(p.title)}</div>` : ""}
          <div class="pt-scope">${esc(scope)}</div>
        </div>
        <div class="pt-body">${md(p.tafsir)}</div>
      </details>`;
    }
    if (ayah.qf_tafsir) {
      html += `<details class="qf-tafsir-block"><summary class="qf-tafsir-summary">Ibn Kathir (Quran.com)</summary><div class="qf-tafsir-body">${md(ayah.qf_tafsir)}</div></details>`;
    }
    if (ayah.tafsir_ibn_kathir) html += `<details><summary>Ibn Kathir (full)</summary>${md(ayah.tafsir_ibn_kathir)}</details>`;
    if (ayah.maarif_ul_quran) html += `<details><summary>Maarif ul Quran</summary>${md(ayah.maarif_ul_quran)}</details>`;
    return html || `<p class="empty-note">No tafsir available.</p>`;
  }
  return "";
}

function renderTimelinePanel() {
  const tl = cache.timeline;
  if (!tl) return '<p class="panel-intro">Timeline loading…</p>';
  const surahId = currentSurah?.id;
  if (!surahId) return '<p class="empty-note">No surah loaded.</p>';

  // attribute-safe escaper (esc() does not encode double-quotes)
  const ea = s => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const revOrder = tl.surah_revelation_order[String(surahId)] || 50;
  const yearPh = revOrder <= 86
    ? Math.max(1, Math.round(1 + (revOrder - 1) * 12 / 85))
    : Math.min(23, Math.round(14 + (revOrder - 87) * 9 / 27));

  const period = revOrder <= 33 ? "Early Mecca" : revOrder <= 55 ? "Middle Mecca" : revOrder <= 86 ? "Late Mecca" : "Medina";
  const yearLabel = yearPh <= 13
    ? `Year ${yearPh} of Prophethood · ${609 + yearPh} CE`
    : `${yearPh - 13} AH · ${609 + yearPh} CE`;

  // SVG geometry: viewBox 0 0 580 62, bar at y=20 h=8
  const BAR_W = 580;
  const EM_END = Math.round(6 / 22 * BAR_W);   // ~158 (end of early mecca, yr 7)
  const LM_END = Math.round(12 / 22 * BAR_W);  // ~316 (Hijra, yr 13)
  const yToX = y => Math.round((y - 1) / 22 * BAR_W);
  const thisX = Math.max(5, Math.min(BAR_W - 5, yToX(yearPh)));

  const TYPE_COLOR = { battle: "#b85c4a", ruling: "#1f6b52", revelation: "#9a8455", event: "#4a7c59" };
  const dots = tl.events.map(e => {
    const ex = yToX(e.year_ph);
    const col = TYPE_COLOR[e.type] || "#4a7c59";
    const r = e.type === "ruling" ? 5 : 4;
    const op = e.year_ph <= yearPh ? 1 : 0.3;
    return `<circle class="tl-evt-dot" cx="${ex}" cy="24" r="${r}" fill="${col}" opacity="${op}" data-label="${ea(e.label)}" data-year="${ea(e.year_label)}" data-short="${ea(e.short)}"/>`;
  }).join("\n    ");

  const svg = `<svg class="tl-svg" viewBox="0 0 580 62" xmlns="http://www.w3.org/2000/svg">
    <text x="${Math.round(EM_END / 2)}" y="12" text-anchor="middle" font-size="7.5" fill="#9a7a30" font-family="Inter,sans-serif">Early Mecca</text>
    <text x="${Math.round((EM_END + LM_END) / 2)}" y="12" text-anchor="middle" font-size="7.5" fill="#6b4f1a" font-family="Inter,sans-serif">Late Mecca</text>
    <text x="${Math.round((LM_END + BAR_W) / 2)}" y="12" text-anchor="middle" font-size="7.5" fill="#1f6b52" font-family="Inter,sans-serif">Medina</text>
    <rect x="0" y="16" width="${EM_END}" height="9" fill="#c4a96a" rx="2"/>
    <rect x="${EM_END}" y="16" width="${LM_END - EM_END}" height="9" fill="#8b6914" rx="2"/>
    <rect x="${LM_END}" y="16" width="${BAR_W - LM_END}" height="9" fill="#1f6b52" rx="2"/>
    ${dots}
    <line x1="${thisX}" y1="10" x2="${thisX}" y2="36" stroke="#9a8455" stroke-width="2" stroke-dasharray="4,3"/>
    <polygon points="${thisX - 5},36 ${thisX + 5},36 ${thisX},46" fill="#9a8455"/>
  </svg>`;

  const pastEvents = tl.events.filter(e => e.year_ph <= yearPh);
  const ctxEvent = pastEvents.length ? pastEvents[pastEvents.length - 1] : null;
  const typeClass = { battle: "tl-ev-battle", ruling: "tl-ev-ruling", revelation: "tl-ev-revelation", event: "tl-ev-event" };

  const fullListHtml = tl.events.map(e => {
    const past = e.year_ph <= yearPh;
    const isNow = ctxEvent && e.id === ctxEvent.id;
    const cls = `tl-ev-row ${past ? (typeClass[e.type] || "tl-ev-event") : "tl-ev-coming"}${isNow ? " tl-ev-now" : ""}`;
    return `<div class="${cls}" data-evid="${ea(e.id)}"><div class="tl-ev-timeline-col"><div class="tl-ev-vline${past ? " past" : ""}"></div><div class="tl-ev-node${isNow ? " now" : (past ? " past" : "")}"></div></div><div class="tl-ev-text"><div class="tl-ev-name">${esc(e.label)}</div><div class="tl-ev-yr">${esc(e.year_label)}</div></div><span class="tl-ev-arrow">›</span></div>`;
  }).join("");

  const rulingBadges = tl.rulings.map(r => {
    const on = r.year_ph <= yearPh;
    return `<span class="tl-ruling ${on ? "tl-r-on" : "tl-r-off"}" title="${ea(r.description)}">${r.icon} ${esc(r.label)}${on ? "" : '<span class="tl-r-not"> not yet</span>'}</span>`;
  }).join(" ");

  return `<div class="tl-panel">
    <div class="tl-hdr"><span class="tl-period-tag">${period}</span><span class="tl-year-tag">${yearLabel}</span></div>
    <div class="tl-svg-wrap"><div class="tl-tip" id="tl-tt"></div>${svg}</div>
    ${ctxEvent ? `<div class="tl-ctx tl-ctx-click" data-evid="${ea(ctxEvent.id)}"><div class="tl-ctx-lbl">When this was being revealed <em class="tl-ctx-hint">— tap for full account</em></div><p class="tl-ctx-txt">${esc(ctxEvent.short)}</p></div>` : ""}
    <div class="tl-rulings-sec"><div class="tl-sec-hd">Rulings in effect at this point</div><div class="tl-rulings-row">${rulingBadges}</div></div>
    <div class="tl-sec-hd" style="margin-top:0.5rem">Full chronology — tap any event for detail</div>
    <div class="tl-full-list">${fullListHtml}</div>
    <div class="tl-detail" id="tl-detail" style="display:none"></div>
  </div>`;
}

function renderHadithTab(surahId, ayahNum) {
  const idx = cache.hadithIndex;
  const map = cache.hadithMap;
  if (!idx || !map) return '<p class="panel-intro">Hadith loading…</p>';

  const ids = (map[`${surahId}:${ayahNum}`] || []).filter(id => idx[id]);
  if (!ids.length) return '<p class="empty-note">No related hadith recorded for this ayah yet.</p>';

  const GRADE_CLS = { Sahih: "hg-sahih", Hasan: "hg-hasan", "Hasan Sahih": "hg-hasan", Daif: "hg-daif" };
  const cards = ids.map(id => {
    const h = idx[id];
    const gc = GRADE_CLS[h.grade] || "hg-other";
    const personLink = h.narrator_id
      ? `<button class="people-link" data-person="${h.narrator_id}"><strong>${esc(h.narrator)}</strong></button>`
      : `<strong>${esc(h.narrator)}</strong>`;
    return `<div class="hadith-card">
      <div class="hadith-narrator">Narrated by ${personLink}</div>
      <blockquote class="hadith-text">${esc(h.text)}</blockquote>
      <div class="hadith-meta">
        <span class="hadith-source">${esc(h.source)}</span>
        <span class="hadith-grade ${gc}">${esc(h.grade)}</span>
        ${h.reference ? `<span class="hadith-ref">No. ${esc(h.reference)}</span>` : ""}
      </div>
      ${h.topic ? `<div class="hadith-topic">${esc(h.topic)}</div>` : ""}
    </div>`;
  }).join("");

  return `<div class="hadith-section">
    <p class="panel-intro">${ids.length} hadith related to this verse</p>
    ${cards}
  </div>`;
}

function renderOccasionTab(surahId, ayahNum) {
  if (cache.asbabNuzul === null) return '<p class="panel-intro">Loading occasion data…</p>';

  const key = `${surahId}:${ayahNum}`;
  const entry = cache.asbabNuzul[key];
  const surahSetting = cache.asbabNuzul[`__setting_${surahId}`];
  const revPlace = currentSurah?.revelation_place === "madinah" ? "Madinah" : "Makkah";
  const settingLabel = surahSetting?.label || revPlace;
  const settingContext = surahSetting?.context || "";

  let html = "";

  if (entry?.has_occasion && entry.occasion) {
    html += `<div class="occ-card">
      <div class="occ-hd">OCCASION OF REVELATION <span class="occ-badge">(ASBAB AL-NUZUL)</span></div>
      <p class="occ-text">${esc(entry.occasion)}</p>
    </div>`;
  }

  html += `<div class="hist-card">
    <div class="occ-hd">HISTORICAL SETTING · ${esc(settingLabel)}</div>
    ${settingContext ? `<p class="occ-text">${esc(settingContext)}</p>` : ""}
  </div>`;

  const source = entry?.source || (surahSetting ? "Ibn Kathir, Tafsir al-Quran al-Adhim" : null);
  if (source) html += `<p class="occ-source">Source: ${esc(source)}</p>`;

  return html;
}

function renderIsnadSvg(h) {
  const chain = h.isnad || [];
  if (!chain.length) return "";
  const W = 320, NH = 46, VGAP = 62, PAD = 12;
  const totalH = PAD + chain.length * NH + (chain.length - 1) * (VGAP - NH) + PAD;
  const TYPE = {
    source:     { bg: "#92400e", text: "#fff", badge: "DIVINE SOURCE" },
    prophet:    { bg: "#1f6b52", text: "#fff", badge: "PROPHET" },
    sahabi:     { bg: "#1a5c7a", text: "#fff", badge: "COMPANION" },
    tabi:       { bg: "#1e3a8a", text: "#fff", badge: "TABI'I" },
    muhaddith:  { bg: "#4c1d95", text: "#fff", badge: "SCHOLAR" },
    book:       { bg: "#78350f", text: "#fff", badge: "RECORDED IN" },
  };
  const CX = W / 2;
  let els = [];
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const y = PAD + i * VGAP;
    const { bg, text, badge } = TYPE[node.type] || TYPE.tabi;
    if (i > 0) {
      const prevBottom = PAD + (i - 1) * VGAP + NH;
      els.push(`<line x1="${CX}" y1="${prevBottom}" x2="${CX}" y2="${y}" stroke="#c4a96a" stroke-width="1.5" stroke-dasharray="4 3"/>`);
      els.push(`<polygon points="${CX},${y} ${CX-5},${y-8} ${CX+5},${y-8}" fill="#c4a96a"/>`);
    }
    const label = node.name.length > 48 ? node.name.slice(0,46) + "…" : node.name;
    const clickable = !!node.id;
    els.push(
      clickable
        ? `<g class="isnad-node" data-person="${node.id}" tabindex="0" role="button" aria-label="${node.name}">`
        : `<g class="isnad-node">`,
      `<rect x="${PAD}" y="${y}" width="${W - PAD*2}" height="${NH}" rx="7" fill="${bg}"/>`,
      `<text x="${CX}" y="${y + 14}" text-anchor="middle" font-size="7.5" fill="${text}" opacity="0.72" font-family="'JetBrains Mono',monospace" letter-spacing="0.08em">${badge}</text>`,
      `<text x="${CX}" y="${y + 33}" text-anchor="middle" font-size="12" fill="${text}" font-weight="600" font-family="system-ui,sans-serif">${esc(label)}</text>`,
      `</g>`
    );
  }
  return `<svg viewBox="0 0 ${W} ${totalH}" xmlns="http://www.w3.org/2000/svg" class="isnad-svg">${els.join("")}</svg>`;
}

function renderIsnadTreeTab(surahId, ayahNum) {
  const ids = (cache.hadithMap?.[`${surahId}:${ayahNum}`] || []).filter(id => cache.hadithIndex?.[id]);
  if (!ids.length) return '<p class="empty-note">No hadith recorded for this ayah.</p>';
  const blocks = ids.map(id => {
    const h = cache.hadithIndex[id];
    const svg = renderIsnadSvg(h);
    if (!svg) return "";
    return `<div class="isnad-block">
      <div class="isnad-source-hd">${esc(h.source_short || h.source)} · ${esc(h.reference || "")} · <span class="isnad-topic">${esc(h.topic || "")}</span></div>
      ${svg}
    </div>`;
  }).filter(Boolean).join("");
  return blocks || '<p class="empty-note">Isnad chains coming soon.</p>';
}

function renderPeopleNetworkTab(person) {
  const rels = person.relationships || [];
  if (!rels.length) return '<p class="empty-note">No relationship data recorded.</p>';
  const W = 300, H = 300, CX = W/2, CY = H/2;
  const RC = 32, RN = 20, ORBIT = 102;
  const REL_COLORS = { spouse:"#c4a96a", child:"#1f6b52", parent:"#1a7a6a", cousin:"#2563eb", companion:"#5b21b6", friend:"#78350f", teacher:"#1e40af", student:"#166534" };
  const centerColor = peopleAvatarColor(person.id);
  const centerInitial = (person.name || "?").replace(/[^A-Za-z]/g,"")[0] || "?";
  const step = (2 * Math.PI) / rels.length;
  let els = [];
  const nodes = rels.map((r, i) => {
    const angle = i * step - Math.PI/2;
    return { r, nx: CX + Math.cos(angle)*ORBIT, ny: CY + Math.sin(angle)*ORBIT, color: REL_COLORS[r.type] || "#888" };
  });
  // Lines
  for (const n of nodes) {
    const dx = n.nx - CX, dy = n.ny - CY, dist = Math.sqrt(dx*dx+dy*dy);
    els.push(`<line x1="${(CX+(dx/dist)*RC).toFixed(1)}" y1="${(CY+(dy/dist)*RC).toFixed(1)}" x2="${(n.nx-(dx/dist)*RN).toFixed(1)}" y2="${(n.ny-(dy/dist)*RN).toFixed(1)}" stroke="${n.color}" stroke-width="1.5" opacity="0.45"/>`);
  }
  // Center
  els.push(`<circle cx="${CX}" cy="${CY}" r="${RC}" fill="${centerColor}"/>`);
  els.push(`<text x="${CX}" y="${CY+6}" text-anchor="middle" font-size="15" fill="white" font-weight="700">${esc(centerInitial)}</text>`);
  // Outer nodes
  for (const n of nodes) {
    const linked = cache.people?.[n.r.id];
    const init = linked ? (linked.name||"?").replace(/[^A-Za-z]/g,"")[0] : "?";
    const nodeColor = linked ? peopleAvatarColor(n.r.id) : "#aaa";
    els.push(
      linked ? `<g class="isnad-node" data-person="${n.r.id}" tabindex="0" role="button" aria-label="${linked.name}">` : `<g class="isnad-node">`,
      `<circle cx="${n.nx.toFixed(1)}" cy="${n.ny.toFixed(1)}" r="${RN}" fill="${nodeColor}"/>`,
      `<text x="${n.nx.toFixed(1)}" y="${(n.ny+5).toFixed(1)}" text-anchor="middle" font-size="10" fill="white" font-weight="700">${esc(init)}</text>`,
      `</g>`
    );
    const nameShort = (linked?.name || n.r.label || "?").replace(/ \(RA\)| ﷺ/g,"").split(" ").slice(0,2).join(" ");
    els.push(`<text x="${n.nx.toFixed(1)}" y="${(n.ny+RN+13).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="currentColor" opacity="0.75">${esc(nameShort)}</text>`);
  }
  const legendEntries = [...new Set(rels.map(r => r.type))].map(t =>
    `<span class="pnet-leg"><span class="pnet-dot" style="background:${REL_COLORS[t]||"#888"}"></span>${t}</span>`
  ).join("");
  return `<div class="pnetwork">
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="network-svg">${els.join("")}</svg>
    <div class="pnetwork-legend">${legendEntries}</div>
  </div>`;
}

function ctxTabContent(tab, surahId, ayahNum) {
  if (tab === "occasion") return renderOccasionTab(surahId, ayahNum);
  if (tab === "hadith")   return renderHadithTab(surahId, ayahNum);
  if (tab === "isnad")    return renderIsnadTreeTab(surahId, ayahNum);
  return '<p class="empty-note" style="padding:16px 0">Coming soon.</p>';
}

function renderContextPanel(surahId, ayahNum) {
  const hdCount = (cache.hadithMap?.[`${surahId}:${ayahNum}`] || []).filter(id => cache.hadithIndex?.[id]).length;
  const active = prefs.activeContextTab || "occasion";
  const tabs = [
    { id: "occasion", label: "Occasion" },
    { id: "hadith",  label: `Hadith${hdCount ? ` (${hdCount})` : ""}` },
    { id: "isnad",   label: "Isnad Tree" },
  ];
  const tabBar = tabs.map(t =>
    `<button type="button" class="ctx-tab${active === t.id ? " active" : ""}" data-ctx="${t.id}">${t.label}</button>`
  ).join("");
  return `<div class="ctx-panel" data-surah="${surahId}" data-ayah="${ayahNum}">
    <div class="ctx-tabs">${tabBar}</div>
    <div class="ctx-body">${ctxTabContent(active, surahId, ayahNum)}</div>
  </div>`;
}

function bindContextPanelEvents(container) {
  const panel = container.classList?.contains("ctx-panel") ? container : container.querySelector(".ctx-panel");
  if (!panel) return;
  const surahId = +(panel.dataset.surah || currentSurah?.id);
  const ayahNum = +(panel.dataset.ayah || selectedAyah?.ayah);

  const initBody = panel.querySelector(".ctx-body");
  if (initBody) bindPeopleLinks(initBody);

  panel.querySelectorAll(".ctx-tab").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const tab = btn.dataset.ctx;
      if (tab === "occasion" && cache.asbabNuzul === null) await loadAsbabNuzul();
      if ((tab === "hadith" || tab === "isnad") && !cache.hadithIndex) {
        const body = panel.querySelector(".ctx-body");
        if (body) body.innerHTML = '<p class="panel-intro">Loading…</p>';
        await loadHadithData();
      }
      prefs.activeContextTab = tab;
      savePrefs();
      panel.querySelectorAll(".ctx-tab").forEach(b => b.classList.toggle("active", b === btn));
      const body = panel.querySelector(".ctx-body");
      if (body) {
        body.innerHTML = ctxTabContent(tab, surahId, ayahNum);
        bindPeopleLinks(body);
      }
    });
  });
}

// ---- People card modal ----

function peopleAvatarColor(id) {
  const colors = ["#1a7a4a","#b45309","#1d4ed8","#6d28d9","#9d174d","#065f46","#92400e"];
  let h = 0;
  for (const c of id) h = ((h * 31) + c.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

function renderPeopleBioTab(person) {
  const facts = [
    ["Full Name", person.full_name],
    ["Kunya", person.kunya],
    ["Title",    person.title],
    ["Died",     person.death],
    ["Tribe",    person.tribe],
  ].filter(([, v]) => v);
  return `<div class="pbio">
    <p class="pbio-text">${esc(person.bio || "")}</p>
    <div class="pbio-facts">${facts.map(([l, v]) =>
      `<div class="pbio-fact"><span class="pfl">${esc(l)}</span><span class="pfv">${esc(v)}</span></div>`
    ).join("")}</div>
  </div>`;
}

function renderPeopleRelTab(person) {
  const rels = person.relationships || [];
  if (!rels.length) return '<p class="empty-note">No relationship data recorded.</p>';
  const TYPE_LABELS = {
    spouse: "Spouse", child: "Children", parent: "Parents",
    sibling: "Siblings", cousin: "Cousins", teacher: "Teachers",
    student: "Students", friend: "Friends", companion: "Companions",
  };
  const grouped = {};
  for (const r of rels) {
    const g = TYPE_LABELS[r.type] || "Other";
    (grouped[g] = grouped[g] || []).push(r);
  }
  return Object.entries(grouped).map(([label, items]) =>
    `<div class="prel-group">
      <div class="prel-label">${esc(label)}</div>
      ${items.map(r => {
        const linked = cache.people?.[r.id];
        return `<div class="prel-item">
          ${linked
            ? `<button class="people-link prel-name" data-person="${r.id}">${esc(linked.name)}</button>`
            : `<span class="prel-name">${esc(r.label)}</span>`
          }
          ${r.label && linked ? `<span class="prel-note">${esc(r.label)}</span>` : ""}
        </div>`;
      }).join("")}
    </div>`
  ).join("");
}

function renderPeopleHadithTab(person) {
  const ph = cache.peopleHadith?.[person.id] || {};
  const idx = cache.hadithIndex || {};
  const narrated = (ph.narrated || []).filter(id => idx[id]);
  const about    = (ph.about    || []).filter(id => idx[id]);
  const GRADE_CLS = { Sahih: "hg-sahih", Hasan: "hg-hasan", "Hasan Sahih": "hg-hasan", Daif: "hg-daif" };
  const card = id => {
    const h = idx[id];
    const gc = GRADE_CLS[h.grade] || "hg-other";
    return `<div class="hadith-card">
      <blockquote class="hadith-text">${esc(h.text)}</blockquote>
      <div class="hadith-meta">
        <span class="hadith-source">${esc(h.source)}</span>
        <span class="hadith-grade ${gc}">${esc(h.grade)}</span>
        ${h.reference ? `<span class="hadith-ref">No. ${esc(h.reference)}</span>` : ""}
      </div>
      ${h.topic ? `<div class="hadith-topic">${esc(h.topic)}</div>` : ""}
    </div>`;
  };
  return `<div class="phadith">
    <div class="phadith-stats">
      <div class="phadith-stat"><span class="phs-n">${narrated.length}</span><span class="phs-l">In This Collection</span></div>
      <div class="phadith-stat"><span class="phs-n">${about.length}</span><span class="phs-l">Mentioned In</span></div>
    </div>
    ${narrated.length ? `<div class="phadith-section">
      <div class="phadith-hd">NARRATED BY ${esc(person.name.replace(/ \(RA\)| ﷺ/g,"").toUpperCase())}</div>
      ${narrated.map(card).join("")}
    </div>` : ""}
    ${about.length ? `<div class="phadith-section">
      <div class="phadith-hd">MENTIONED IN HADITH</div>
      ${about.map(card).join("")}
    </div>` : ""}
    ${!narrated.length && !about.length ? '<p class="empty-note">No hadith from this collection linked yet.</p>' : ""}
  </div>`;
}

function renderPeopleTabContent(tab, person) {
  if (tab === "biography")     return renderPeopleBioTab(person);
  if (tab === "relationships") return renderPeopleRelTab(person);
  if (tab === "network")       return renderPeopleNetworkTab(person);
  if (tab === "hadith")        return renderPeopleHadithTab(person);
  return '<p class="empty-note" style="padding:16px 0">Coming soon.</p>';
}

function renderPeopleModal(person, activeTab = "biography") {
  const initial = (person.name || "?").replace(/[^A-Za-z]/g, "")[0] || "?";
  const color   = peopleAvatarColor(person.id);
  const tagHtml = (person.tags || []).map(t =>
    `<span class="ptag">${esc(t.replace(/-/g," ").toUpperCase())}</span>`
  ).join("") +
    (person.death ? `<span class="ptag">${esc("D. " + person.death.split("·")[0].trim())}</span>` : "") +
    (person.tribe ? `<span class="ptag">${esc(person.tribe.split("(")[0].trim())}</span>` : "");
  const TABS = [
    { id: "biography",     label: "Biography" },
    { id: "relationships", label: "Relationships" },
    { id: "network",       label: "Network" },
    { id: "hadith",        label: "Hadith" },
    { id: "in-quran",      label: "In Quran" },
  ];
  const tabBar = TABS.map(t =>
    `<button class="ptab${activeTab === t.id ? " active" : ""}" data-ptab="${t.id}">${t.label}</button>`
  ).join("");
  return `<div class="people-modal" role="dialog" aria-modal="true" data-person-id="${person.id}">
    <button class="people-close" aria-label="Close">&times;</button>
    <div class="people-header">
      <div class="people-avatar" style="background:${color}">${esc(initial)}</div>
      <div class="people-htext">
        <div class="people-name">${esc(person.name)}</div>
        ${person.kunya ? `<div class="people-kunya">${esc(person.kunya)}</div>` : ""}
        <div class="people-tags">${tagHtml}</div>
      </div>
    </div>
    <div class="people-tabs">${tabBar}</div>
    <div class="people-body">${renderPeopleTabContent(activeTab, person)}</div>
  </div>`;
}

function openPeopleModal(personId) {
  const existing = document.getElementById("people-modal");
  if (existing) existing.remove();
  const person = cache.people?.[personId];
  if (!person) return;
  const overlay = document.createElement("div");
  overlay.id = "people-modal";
  overlay.className = "people-overlay";
  overlay.innerHTML = renderPeopleModal(person);
  document.body.appendChild(overlay);
  bindPeopleCardEvents(overlay, person);
  requestAnimationFrame(() => overlay.classList.add("open"));
}

function closePeopleModal() {
  const m = document.getElementById("people-modal");
  if (!m) return;
  m.classList.remove("open");
  setTimeout(() => m.remove(), 200);
}

function bindPeopleCardEvents(overlay, person) {
  overlay.addEventListener("click", e => { if (e.target === overlay) closePeopleModal(); });
  overlay.querySelector(".people-close")?.addEventListener("click", closePeopleModal);
  const modal = overlay.querySelector(".people-modal");
  const onKey = e => {
    if (e.key === "Escape") { closePeopleModal(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);
  modal.querySelectorAll(".ptab").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const tab = btn.dataset.ptab;
      modal.querySelectorAll(".ptab").forEach(b => b.classList.toggle("active", b === btn));
      const body = modal.querySelector(".people-body");
      if (body) { body.innerHTML = renderPeopleTabContent(tab, person); bindPeopleLinks(body); }
    });
  });
  const body = modal.querySelector(".people-body");
  if (body) bindPeopleLinks(body);
}

function bindPeopleLinks(container) {
  container.querySelectorAll("[data-person]").forEach(el => {
    el.addEventListener("click", async e => {
      e.stopPropagation();
      const id = el.dataset.person;
      if (cache.people === null) await loadPeople();
      openPeopleModal(id);
    });
  });
}

function bindTimelineEvents(block) {
  const tip = block.querySelector("#tl-tt");
  if (tip) {
    block.querySelectorAll(".tl-evt-dot").forEach(dot => {
      dot.addEventListener("mouseenter", () => {
        tip.innerHTML = `<strong>${esc(dot.dataset.label)}</strong><em>${esc(dot.dataset.year)}</em>${esc(dot.dataset.short)}`;
        tip.style.opacity = "1";
      });
      dot.addEventListener("mousemove", e => {
        const wrap = block.querySelector(".tl-svg-wrap")?.getBoundingClientRect();
        if (!wrap) return;
        tip.style.left = (e.clientX - wrap.left + 10) + "px";
        tip.style.top = Math.max(0, e.clientY - wrap.top - 64) + "px";
      });
      dot.addEventListener("mouseleave", () => { tip.style.opacity = "0"; });
    });
  }

  const detail = block.querySelector("#tl-detail");
  const tl = cache.timeline;
  if (!detail || !tl) return;

  const TC = { battle: "tl-dt-battle", ruling: "tl-dt-ruling", revelation: "tl-dt-revelation", event: "tl-dt-event" };

  function showEventDetail(evid) {
    const ev = tl.events.find(e => e.id === evid) || tl.rulings?.find(r => r.id === evid);
    if (!ev) return;
    detail.innerHTML = `
      <div class="tl-dt-hd">
        <span class="tl-dt-badge ${TC[ev.type] || "tl-dt-event"}">${ev.type || "ruling"}</span>
        <span class="tl-dt-yr">${esc(ev.year_label || "")}</span>
        <button class="tl-dt-close" aria-label="Close">✕</button>
      </div>
      <div class="tl-dt-title">${esc(ev.label)}</div>
      <p class="tl-dt-short">${esc(ev.short || ev.description || "")}</p>
      ${ev.description && ev.description !== ev.short ? `<p class="tl-dt-body">${esc(ev.description)}</p>` : ""}
    `;
    detail.style.display = "block";
    detail.querySelector(".tl-dt-close").addEventListener("click", () => { detail.style.display = "none"; });
  }

  block.querySelectorAll("[data-evid]").forEach(el => {
    el.addEventListener("click", () => showEventDetail(el.dataset.evid));
  });
}

function studyPanelHtml(ayah) {
  // Context tab removed for now — to be revamped and reinstated later. The
  // panelContent("context") branch and bindContextInput are kept for that.
  if (prefs.activePanel === "context") prefs.activePanel = "reflection";
  return `
    <div class="study-panel">
      <div class="study-panel-head">
        <div class="panel-tabs">
          <button type="button" class="btn panel-tab ${prefs.activePanel === "reflection" ? "active" : ""}" data-panel="reflection">Tadabbur</button>
          <button type="button" class="btn panel-tab ${prefs.activePanel === "tafsir" ? "active" : ""}" data-panel="tafsir">Tafsir</button>
          <button type="button" class="btn panel-tab ${prefs.activePanel === "timeline" ? "active" : ""}" data-panel="timeline">Timeline</button>
          <button type="button" class="btn panel-tab ${prefs.activePanel === "hadith" ? "active" : ""}" data-panel="hadith">Context</button>
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
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      prefs.activePanel = btn.dataset.panel;
      savePrefs();
      block.querySelectorAll(".panel-tab").forEach((b) => b.classList.toggle("active", b === btn));
      if (btn.dataset.panel === "timeline" && !cache.timeline) {
        block.querySelector(".study-panel-body").innerHTML = '<p class="panel-intro">Loading timeline…</p>';
        await loadTimeline();
      }
      if (btn.dataset.panel === "hadith" && (!cache.hadithIndex || cache.asbabNuzul === null)) {
        block.querySelector(".study-panel-body").innerHTML = '<p class="panel-intro">Loading context…</p>';
        await Promise.all([
          !cache.hadithIndex ? loadHadithData() : Promise.resolve(),
          cache.asbabNuzul === null ? loadAsbabNuzul() : Promise.resolve(),
        ]);
      }
      if (btn.dataset.panel === "tafsir" && currentSurah) {
        await loadPassageTafsir(currentSurah.id);
      }
      block.querySelector(".study-panel-body").innerHTML = panelContent(selectedAyah);
      bindReflectionInput(block);
      bindContextInput(block);
      bindTimelineEvents(block);
      bindContextPanelEvents(block);
    });
  });
  if (prefs.activePanel === "timeline" && !cache.timeline) {
    loadTimeline().then(() => {
      const body = block.querySelector(".study-panel-body");
      if (body) { body.innerHTML = panelContent(selectedAyah); bindTimelineEvents(block); }
    });
  } else {
    bindTimelineEvents(block);
  }
  if (prefs.activePanel === "hadith" && (!cache.hadithIndex || cache.asbabNuzul === null)) {
    const body = block.querySelector(".study-panel-body");
    if (body) body.innerHTML = '<p class="panel-intro">Loading context…</p>';
    Promise.all([
      !cache.hadithIndex ? loadHadithData() : Promise.resolve(),
      cache.asbabNuzul === null ? loadAsbabNuzul() : Promise.resolve(),
    ]).then(() => {
      const b = block.querySelector(".study-panel-body");
      if (b) { b.innerHTML = panelContent(selectedAyah); bindContextPanelEvents(block); bindTimelineEvents(block); }
    });
  }
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

  // Verse / word-by-word: a per-ayah study menu (same toggles as the Content box,
  // scoped to this ayah). Toggling reveals the inline tadabbur/tafsir below.
  const host = block.querySelector(".ayah-body") || block;
  host.insertAdjacentHTML("beforeend", `<div class="ayah-study-menu-wrap">${ayahStudyMenuHtml(currentSurah.id, ayahNum)}</div>`);
  block.classList.add("expanded", "active");
  block.querySelector(".study-btn")?.classList.add("open");

  requestAnimationFrame(() => {
    block.querySelector(".ayah-study-menu-wrap")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

// Re-render just one ayah's inline extras (after a per-ayah toggle), keeping the menu open.
function refreshAyahExtras(surahId, ayahNum) {
  const block = document.getElementById(`ayah-${surahId}-${ayahNum}`);
  if (!block) return;
  const body = block.querySelector(".ayah-body") || block;
  const raw = currentSurah?.ayahs.find((a) => a.ayah === ayahNum);
  const html = raw ? ayahExtrasHtml(mergeLocalEdits(raw, surahId), surahId, ayahNum) : "";
  const existing = body.querySelector(".ayah-extras");
  if (existing) {
    if (html) existing.outerHTML = html; else existing.remove();
  } else if (html) {
    const menu = body.querySelector(".ayah-study-menu-wrap");
    if (menu) menu.insertAdjacentHTML("beforebegin", html);
    else body.insertAdjacentHTML("beforeend", html);
  }
}

function closeStudyPanel() {
  expandedAyah = null;
  document.querySelectorAll(".study-panel, .ayah-study-menu-wrap").forEach((el) => el.remove());
  const bookSlot = document.getElementById("book-study-slot");
  if (bookSlot) bookSlot.innerHTML = "";
  document.querySelectorAll(".ayah-block").forEach((el) => {
    el.classList.remove("expanded");
    el.classList.remove("active");
  });
  document.querySelectorAll(".book-ayah").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".study-btn").forEach((btn) => btn.classList.remove("open"));
}

let wtPinned = false, wtHideTimer = null;
function hideTooltip() {
  const t = document.getElementById("word-tooltip");
  t.hidden = true;
  t.classList.remove("pinned");
  wtPinned = false;
  document.querySelectorAll(".q-word.active").forEach((w) => w.classList.remove("active"));
}

// Recitation (waqf) marks + disjoined-letter openings — explained in the word
// tooltip. Arabic cursive shaping can't be split to make the tiny mark its own
// target, so tapping/hovering the word that carries the mark surfaces its meaning.
const WAQF_MARKS = {
  "ۖ": ["ۖ", "Pause permissible, but continuing is preferable (ṣalī)."],
  "ۗ": ["ۗ", "Pausing is preferable here, though continuing is allowed (qilī)."],
  "ۘ": ["ۘ", "Compulsory pause (lāzim) — not stopping can distort the meaning."],
  "ۙ": ["ۙ", "Do not pause here (lā) — the meaning runs on to what follows."],
  "ۚ": ["ۚ", "Permissible pause (jāʾiz) — you may stop or continue."],
  "ۛ": ["ۛ", "Muʿānaqah — stop at one of the two marked places, never both."],
  "ۜ": ["ۜ", "Saktah — a brief pause without taking a new breath."],
};
const MUQATTA_SURAHS = new Set([2, 3, 7, 10, 11, 12, 13, 14, 15, 19, 20, 26, 27, 28, 29, 30, 31, 32, 36, 38, 40, 41, 42, 43, 44, 45, 46, 50, 68]);
function symbolNotesHtml(arabic, surahId, ayahNum, key) {
  const items = [];
  const seen = new Set();
  for (const ch of (arabic || "")) {
    if (WAQF_MARKS[ch] && !seen.has(ch)) {
      seen.add(ch);
      items.push(`<div class="wt-symbol"><span class="wt-symbol-mark" dir="rtl" lang="ar">◌${WAQF_MARKS[ch][0]}</span><span class="wt-symbol-desc">${esc(WAQF_MARKS[ch][1])}</span></div>`);
    }
  }
  if (ayahNum === 1 && key === "1" && MUQATTA_SURAHS.has(surahId)) {
    items.push(`<div class="wt-symbol"><span class="wt-symbol-mark">✦</span><span class="wt-symbol-desc">Muqaṭṭaʿāt — the “disjoined letters.” Allah opens this sūrah with detached Arabic letters; their full meaning rests with Allah, and they underscore that the Qurʾān is composed from these very letters.</span></div>`);
  }
  return items.length ? `<div class="wt-symbols"><div class="wt-symbols-label">Recitation marks</div>${items.join("")}</div>` : "";
}

function showWordTooltip(el, opts = {}) {
  const o = (typeof opts === "boolean") ? { editing: opts } : (opts || {});
  const editing = !!o.editing;
  const pin = !!o.pin || editing;
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
  const symbolHtml = symbolNotesHtml(word.arabic, surahId, ayahNum, key);
  let origMeaning = "";
  if (prefs.editView === "both") {
    const ow = getOriginalAyah(surahId, ayahNum)?.word_by_word?.[key];
    if (ow && (ow.translation || "") && (ow.translation || "") !== (word.translation || ""))
      origMeaning = `<div class="wt-orig"><span class="orig-label">Original</span> ${esc(ow.translation)}</div>`;
  }

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
       ${ai.root ? `<div class="wt-ai-root">${esc(ai.root)}</div>` : ""}${symbolHtml}`;
  } else {
    tooltip.innerHTML = `<div class="wt-ar">${esc(word.arabic)}</div><div class="wt-tr">${esc(word.transliteration || "")}</div>
       <div class="wt-en">${esc(word.translation || "")}</div>
       ${origMeaning}
       ${prefs.wordMode === "ai" ? `<div class="wt-ai-pending">Detailed AI word analysis for this sūrah is being prepared.</div>` : ""}
       ${symbolHtml}
       <div class="wt-actions"><button type="button" class="primary" id="wt-edit">Edit meaning</button></div>`;
  }

  tooltip.classList.toggle("pinned", pin);
  if (pin) tooltip.insertAdjacentHTML("afterbegin", `<button type="button" class="wt-close" aria-label="Close">×</button>`);
  wtPinned = pin;

  // Position fully within the viewport; flip above the word if it would overflow below.
  const m = 8;
  const ttW = tooltip.offsetWidth, ttH = tooltip.offsetHeight;
  const left = Math.min(Math.max(m, rect.left), Math.max(m, window.innerWidth - ttW - m));
  let top = rect.bottom + m;
  if (top + ttH > window.innerHeight - m) {
    const above = rect.top - ttH - m;
    top = above >= m ? above : Math.max(m, window.innerHeight - ttH - m);
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;

  if (editing) document.getElementById("wt-meaning").value = word.translation || "";
  tooltip.querySelector(".wt-close")?.addEventListener("click", hideTooltip);
  tooltip.querySelector("#wt-edit")?.addEventListener("click", () => showWordTooltip(el, { editing: true, pin: true }));
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
        // Throttle: mobile browsers rate-limit replaceState (~100/30s) and throw
        // once exceeded. The try/finally guarantees scrollLock is released even if
        // it does throw — otherwise a stuck lock makes render() ignore all later
        // navigation ("can't change sūrah / go home").
        const now = Date.now();
        if (now - lastHashUpdate >= 350) {
          lastHashUpdate = now;
          scrollLock = true;
          try { history.replaceState(null, "", newHash); } catch (_) {} finally { scrollLock = false; }
        }
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
    el.addEventListener("mouseenter", () => { clearTimeout(wtHideTimer); if (!wtPinned) showWordTooltip(el); });
    el.addEventListener("focus", () => { clearTimeout(wtHideTimer); if (!wtPinned) showWordTooltip(el); });
    el.addEventListener("mouseleave", () => {
      if (wtPinned || document.getElementById("word-tooltip").querySelector("#wt-meaning")) return;
      wtHideTimer = setTimeout(hideTooltip, 220);
    });
    el.addEventListener("click", (e) => { e.stopPropagation(); clearTimeout(wtHideTimer); showWordTooltip(el, { pin: true }); });
  });
  const _wt = document.getElementById("word-tooltip");
  if (_wt && !_wt.dataset.hoverBound) {
    _wt.dataset.hoverBound = "1";
    _wt.addEventListener("mouseenter", () => clearTimeout(wtHideTimer));
    _wt.addEventListener("mouseleave", () => { if (!wtPinned) wtHideTimer = setTimeout(hideTooltip, 220); });
  }

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


  document.getElementById("layout-select")?.addEventListener("change", async (e) => {
    prefs.layoutMode = e.target.value;
    savePrefs();
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

// Concept / Islamic-term search: typing an idea also matches the words the
// translations actually use for it (and transliterated terms map to English),
// so "charity" finds zakat/alms/feeding the poor, "salah" finds prayer, etc.
const SEARCH_CONCEPTS = [
  ["patience", "patient perseverance persevere steadfast endure sabr"],
  ["gratitude", "grateful thankful thanks shukr"],
  ["charity", "alms zakat sadaqah spend in the cause give to the poor needy feed the poor"],
  ["prayer", "pray salah salat prostrate bow worship"],
  ["fasting", "fast sawm ramadan abstain"],
  ["pilgrimage", "hajj umrah kaaba sacred house"],
  ["forgiveness", "forgive pardon forgiving overlook absolve"],
  ["mercy", "merciful compassion compassionate rahman rahim grace"],
  ["repentance", "repent turn to allah tawbah seek forgiveness"],
  ["piety", "pious god conscious mindful of allah fear of allah taqwa righteous"],
  ["trust", "rely reliance tawakkul put your trust depend"],
  ["faith", "believe believers belief iman conviction"],
  ["paradise", "garden gardens jannah heaven rivers flow"],
  ["hell", "fire hellfire blaze jahannam torment"],
  ["death", "die dying perish mortal soul taken"],
  ["resurrection", "raised day of judgment day of reckoning hereafter akhirah reckoning"],
  ["knowledge", "know learned wisdom understand reflect ponder think"],
  ["justice", "just fair fairness equity oppression wrongdoing"],
  ["honesty", "truth truthful honest sincere trustworthy"],
  ["parents", "mother father kindness to parents family"],
  ["orphans", "orphan needy"],
  ["wealth", "riches money provision sustenance rizq spending"],
  ["anger", "angry wrath rage restrain anger"],
  ["humility", "humble modest lower your wing meek"],
  ["pride", "arrogance arrogant haughty boast conceit"],
  ["guidance", "guide guided straight path right path hidayah astray"],
  ["creation", "create created heavens and the earth made formed"],
  ["prophets", "prophet messenger apostle sent warner"],
  ["angels", "angel gabriel jibril"],
  ["satan", "devil shaytan iblis whisper tempt"],
  ["sin", "sins sinful transgress evil deeds wrongdoing immoral"],
  ["righteousness", "good deeds righteous deeds virtue upright good"],
  ["heart", "hearts inner self breast soul"],
  ["marriage", "marry wives spouse husband wife"],
  ["fear", "afraid awe dread fearful"],
  ["hope", "hopeful despair not expect mercy"],
  ["love", "loves beloved affection"],
  ["oneness", "one god no god but oneness tawhid associate partners idol worship none worthy"],
  ["quran", "book revelation scripture verses recite reading"],
  ["struggle", "strive struggle fight in the cause jihad strive hard"],
  ["israel", "children of israel moses musa"],
  ["jesus", "isa son of mary messiah"],
  ["light", "nur illuminate darkness"],
  ["healing", "heal cure shifa remedy"],
  ["oaths", "swear oath promise covenant pledge"],
];
const CONCEPT_LOOKUP = (() => {
  const m = new Map();
  for (const [key, syns] of SEARCH_CONCEPTS) {
    const all = normalizeSearch(`${key} ${syns}`);
    for (const t of new Set([key, ...syns.split(/\s+/)])) {
      const nt = normalizeSearch(t);
      if (nt.length >= 3 && !m.has(nt)) m.set(nt, all);
    }
  }
  return m;
})();

// Returns the literal query plus, when it names a known concept, that concept's
// related-terms string — each scored independently (best match wins).
function expandSearchTerms(nq) {
  const terms = [nq];
  if (CONCEPT_LOOKUP.has(nq)) terms.push(CONCEPT_LOOKUP.get(nq));
  else {
    for (const tok of nq.split(" ")) {
      if (CONCEPT_LOOKUP.has(tok)) { terms.push(CONCEPT_LOOKUP.get(tok)); break; }
    }
  }
  return terms.map((t) => ({ t, tokens: t.split(" ").filter((x) => x.length >= 2) }));
}

async function searchAyahs(surahs, query, limit = 10) {
  const nq = normalizeSearch(query);
  if (!nq || nq.length < 2) return [];
  const terms = expandSearchTerms(nq);
  const index = await ensureSearchIndex();
  if (!index.length) return [];

  const FUZZY_MIN = 38;
  const hits = [];
  for (const entry of index) {
    let score = 0;
    for (const { t, tokens } of terms) {
      const s = scoreIndexEntry(entry, t, tokens);
      if (s > score) score = s;
      if (score >= 96) break;
    }
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

  // Bind the outside-click closer once — re-binding every home render leaked a
  // listener (holding a detached dropdown) on each visit.
  if (!document.body.dataset.smartSearchDocBound) {
    document.body.dataset.smartSearchDocBound = "1";
    document.addEventListener("click", (e) => {
      if (e.target.closest(".search-wrap")) return;
      const dd = document.getElementById("search-dropdown");
      if (dd) dd.hidden = true;
    });
  }

  input.addEventListener("focus", () => {
    if (input.value.trim()) update();
  });

  ensureSearchIndex();
}

// Smart search for the reader toolbar: type a sūrah name, a reference (2:255),
// or a bare ayah number (jumps within the current sūrah).
// Two independent jump boxes — a sūrah picker and an ayah picker — each with its
// own filter + scrollable dropdown. The ayah box is keyed to the open sūrah
// (currentSurah); navigating via the sūrah box re-renders the toolbar, so the
// ayah box rebuilds itself for the new sūrah automatically.
function bindReaderSearch(surahs) {
  const makeCombo = ({ inputId, ddId, build, onPick }) => {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(ddId);
    if (!input || !dropdown) return;
    let results = [], activeIdx = 0;
    const render = () => {
      if (!results.length) { dropdown.hidden = true; dropdown.innerHTML = ""; return; }
      dropdown.hidden = false;
      dropdown.innerHTML = results.map((r, i) =>
        `<button type="button" class="search-item ${i === activeIdx ? "active" : ""}" data-i="${i}" role="option" aria-selected="${i === activeIdx}">
          <span class="search-item-row"><span class="search-item-label">${esc(r.label)}</span></span>
          ${r.sub ? `<span class="search-item-sub">${esc(r.sub)}</span>` : ""}
        </button>`).join("");
      const act = dropdown.querySelector(".search-item.active");
      if (act) act.scrollIntoView({ block: "nearest" });
    };
    const update = () => {
      results = build(input.value.trim());
      const found = results.findIndex((r) => r.active);
      activeIdx = found < 0 ? 0 : found;
      render();
    };
    const pick = (r) => { if (!r) return; dropdown.hidden = true; input.value = ""; onPick(r); };
    input.addEventListener("input", update);
    input.addEventListener("focus", () => {
      document.querySelectorAll(".reader-search-wrap .search-dropdown").forEach((dd) => { if (dd !== dropdown) dd.hidden = true; });
      update();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (results.length) { activeIdx = Math.min(activeIdx + 1, results.length - 1); render(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); render(); }
      else if (e.key === "Enter") { e.preventDefault(); if (results.length) pick(results[activeIdx]); }
      else if (e.key === "Escape") { dropdown.hidden = true; input.blur(); }
    });
    dropdown.addEventListener("click", (e) => { const b = e.target.closest(".search-item"); if (b) pick(results[+b.dataset.i]); });
  };

  // Sūrah box — filter all 114 by number or name (English / Arabic); pick navigates.
  makeCombo({
    inputId: "reader-surah", ddId: "reader-surah-dd",
    build: (q) => {
      const ql = q.toLowerCase();
      let list = surahs.filter((s) =>
        !q || String(s.id).startsWith(q) ||
        s.name_simple.toLowerCase().includes(ql) ||
        (s.translated_name || "").toLowerCase().includes(ql) ||
        (s.name_arabic || "").includes(q));
      if (/^\d+$/.test(q)) list = list.slice().sort((a, b) => (b.id === +q) - (a.id === +q) || a.id - b.id);
      return list.map((s) => ({ surah: s.id, label: `${s.id}. ${s.name_simple}`, sub: s.translated_name, active: !!currentSurah && s.id === currentSurah.id }));
    },
    onPick: (r) => goToSearchResult({ surah: r.surah }),
  });

  // Ayah box — list/filter the open sūrah's ayahs by number; pick jumps to it.
  makeCombo({
    inputId: "reader-ayah", ddId: "reader-ayah-dd",
    build: (q) => {
      if (!currentSurah) return [];
      let nums = [];
      for (let a = 1; a <= currentSurah.verses_count; a++) nums.push(a);
      if (q) nums = nums.filter((a) => String(a).includes(q)).sort((x, y) => (String(y) === q) - (String(x) === q));
      return nums.map((a) => ({ surah: currentSurah.id, ayah: a, label: `Ayah ${a}`, active: a === visibleAyah }));
    },
    onPick: (r) => { if (document.getElementById(`ayah-${r.surah}-${r.ayah}`)) scrollToAyah(r.surah, r.ayah); else goToSearchResult(r); },
  });

  if (!document.body.dataset.readerSearchDocBound) {
    document.body.dataset.readerSearchDocBound = "1";
    document.addEventListener("click", (e) => {
      if (e.target.closest(".reader-search-wrap")) return;
      document.querySelectorAll(".reader-search-wrap .search-dropdown").forEach((dd) => { dd.hidden = true; });
    });
  }
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
        <span class="resume-meta">Juz ${SURAH_JUZ[s.id] || ''} · Ayah ${entry.ayah}</span>
      </span>
      <span class="resume-arrow" aria-hidden="true">←</span>
    </a>`;
}

function juzGridHtml(surahs) {
  const byId = {};
  for (const s of surahs) byId[s.id] = s;
  const startsIn = {};
  for (const s of surahs) {
    const j = SURAH_JUZ[s.id] || 1;
    (startsIn[j] = startsIn[j] || []).push(s);
  }
  let html = "";
  for (let j = 1; j <= 30; j++) {
    const start = JUZ_START[j];
    const contS = start && start.a > 1 ? byId[start.s] : null;
    const cont = contS
      ? `<a href="#/${start.s}/${start.a}" class="juz-cont">\u21b3 continues ${esc(contS.translated_name)} \u00b7 from ${start.s}:${start.a}</a>`
      : "";
    const cards = (startsIn[j] || []).map(s => surahCard(s)).join("");
    html += `<div class="juz-group"><div class="juz-header">Juz ${j}</div>${cont}<div class="surah-grid juz-surah-grid">${cards}</div></div>`;
  }
  return html;
}

function bindHomeViewToggle(surahs) {
  document.querySelectorAll(".vt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      prefs.homeView = btn.dataset.view;
      savePrefs();
      document.querySelectorAll(".vt-btn").forEach(b => b.classList.toggle("active", b === btn));
      const sg = document.getElementById("surah-grid");
      const jg = document.getElementById("juz-grid");
      if (prefs.homeView === "surah") { sg.hidden = false; jg.hidden = true; }
      else { sg.hidden = true; jg.hidden = false; }
    });
  });
}

function renderHome(surahs) {
  setBreadcrumb("");
  const recentReads = getRecentReads().slice(0, RECENT_READS_MAX);
  const bookmarks = getBookmarks().slice(0, 5);
  const tadabbur = getMyWorkList("tadabbur").slice(0, 3);
  const edits = getMyWorkList("meanings").slice(0, 3);

  const hasPersonal = bookmarks.length || tadabbur.length || edits.length;
  const byJuz = prefs.homeView === "juz";

  document.getElementById("app").innerHTML = `
    <div class="home-page">
      <header class="home-intro">
        <p class="home-bismillah" dir="rtl">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
      </header>
      ${recentReads.length ? `
      <section class="home-section resume-section">
        <h2 class="section-title">Continue your reading</h2>
        <div class="resume-list">${recentReads
          .map((entry) => resumeCardHtml(entry, surahs))
          .join("")}</div>
      </section>` : ""}
      <div class="search-wrap home-search">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input type="search" id="surah-search" class="search-input" placeholder="mercy · رحم · 2:255 · Al-Baqarah…" autocomplete="off" spellcheck="false" enterkeyhint="go" />
        <div id="search-dropdown" class="search-dropdown" hidden role="listbox"></div>
      </div>
      <div class="view-toggle" role="group" aria-label="Surah or Juz view">
        <button class="vt-btn${byJuz ? "" : " active"}" data-view="surah">By Surah</button>
        <button class="vt-btn${byJuz ? " active" : ""}" data-view="juz">By Juz</button>
      </div>
      <div id="surah-grid" class="surah-grid"${byJuz ? " hidden" : ""}>${surahs.map((s) => surahCard(s)).join("")}</div>
      <div id="juz-grid"${byJuz ? "" : " hidden"}>${juzGridHtml(surahs)}</div>
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
  bindHomeViewToggle(surahs);
}

function surahCard(s) {
  const place = revelationLabel(s.revelation_place);
  return `
    <a href="#/${s.id}" class="surah-card" data-search="${s.id} ${s.name_simple.toLowerCase()} ${s.translated_name.toLowerCase()} ${s.name_arabic}">
      <div class="surah-card-inner">
        <span class="surah-num">${s.id}</span>
        <span class="surah-ar" dir="rtl">${esc(s.name_arabic)}</span>
        <span class="surah-en">${esc(s.translated_name)}</span>
        <span class="surah-meta"><span class="place-tag ${s.revelation_place}">${place}</span> · ${s.verses_count}v · Juz ${SURAH_JUZ[s.id] || ''}</span>
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

/* ===================== Tadabbur quick-note launcher ===================== */
function getTadabburNotes() {
  try { const v = JSON.parse(localStorage.getItem(LS.tadabburNotes) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; }
}
function saveTadabburNotes(list) {
  localStorage.setItem(LS.tadabburNotes, JSON.stringify(list));
  QuranFirebaseSync?.schedulePush?.();
}
function upsertTadabburNote(note) {
  const list = getTadabburNotes();
  const i = list.findIndex((n) => n.id === note.id);
  if (i >= 0) list[i] = note; else list.unshift(note);
  saveTadabburNotes(list);
}
function deleteTadabburNote(id) { saveTadabburNotes(getTadabburNotes().filter((n) => n.id !== id)); }
function allTadabburTags() { const s = new Set(); getTadabburNotes().forEach((n) => (n.tags || []).forEach((t) => s.add(t))); return [...s].sort(); }
function tdbClamp(n, lo, hi) { n = +n || 0; return Math.max(lo, Math.min(n, hi)); }
function tdbNewId() { return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function tdbVerseCount(surah) {
  if (currentSurah?.id === surah) return currentSurah.verses_count || 286;
  const s = (cache.index?.surahs || []).find((x) => x.id === surah);
  return (s && (s.verses_count || s.ayahs)) || 286;
}
function tdbRelTime(ts) {
  if (!ts) return "";
  const d = Date.now() - ts, min = Math.round(d / 60000);
  if (min < 1) return "just now";
  if (min < 60) return min + "m ago";
  const h = Math.round(min / 60); if (h < 24) return h + "h ago";
  const day = Math.round(h / 24); if (day < 30) return day + "d ago";
  return new Date(ts).toLocaleDateString();
}
function tdbToast(msg) {
  let t = document.getElementById("tdb-toast");
  if (!t) { t = document.createElement("div"); t.id = "tdb-toast"; t.className = "tdb-toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(tdbToast._t); tdbToast._t = setTimeout(() => t.classList.remove("show"), 1800);
}

let tadabburFabEl = null;
function updateTadabburFab() {
  const r = route();
  if (!(r.view === "surah" && currentSurah)) { if (tadabburFabEl) tadabburFabEl.style.display = "none"; return; }
  ensureTadabburFab();
  tadabburFabEl.style.display = "flex";
}
function ensureTadabburFab() {
  if (tadabburFabEl) return;
  const b = document.createElement("button");
  b.type = "button"; b.id = "tadabbur-fab"; b.className = "tadabbur-fab";
  b.setAttribute("aria-label", "Write a tadabbur reflection");
  b.title = "Tadabbur — write a reflection · drag to move";
  b.innerHTML = '<span aria-hidden="true">✎</span>';
  document.body.appendChild(b);
  tadabburFabEl = b;
  restoreFabPos(b);
  makeFabDraggable(b);
  window.addEventListener("resize", () => { if (tadabburFabEl && tadabburFabEl.style.display !== "none") restoreFabPos(tadabburFabEl); });
}
function restoreFabPos(b) {
  let pos = null; try { pos = JSON.parse(localStorage.getItem(LS.tadabburFab) || "null"); } catch (_) {}
  const S = 52, m = 14, W = window.innerWidth, H = window.innerHeight;
  b.style.left = (pos ? tdbClamp(pos.left, m, W - S - m) : (W - S - m)) + "px";
  b.style.top = (pos ? tdbClamp(pos.top, m, H - S - m) : (H - S - 116)) + "px";
}
function makeFabDraggable(b) {
  let sx, sy, bL, bT, moved, drag = false;
  b.addEventListener("pointerdown", (e) => { drag = true; moved = false; sx = e.clientX; sy = e.clientY; bL = parseInt(b.style.left) || 0; bT = parseInt(b.style.top) || 0; b.classList.add("drag"); try { b.setPointerCapture(e.pointerId); } catch (_) {} });
  b.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; const S = b.offsetWidth, m = 10, W = window.innerWidth, H = window.innerHeight; b.style.left = tdbClamp(bL + dx, m, W - S - m) + "px"; b.style.top = tdbClamp(bT + dy, m, H - S - m) + "px"; });
  b.addEventListener("pointerup", () => { if (!drag) return; drag = false; b.classList.remove("drag"); if (!moved) { openTadabburEditor({}); return; } const S = b.offsetWidth, m = 14, W = window.innerWidth, H = window.innerHeight; const cx = (parseInt(b.style.left) || 0) + S / 2; b.style.left = (cx > W / 2 ? W - S - m : m) + "px"; b.style.top = tdbClamp(parseInt(b.style.top) || 0, m, H - S - m) + "px"; localStorage.setItem(LS.tadabburFab, JSON.stringify({ left: parseInt(b.style.left) || 0, top: parseInt(b.style.top) || 0 })); });
}

let tdbEditorEl = null;
function closeTadabburEditor() { if (tdbEditorEl) { tdbEditorEl.remove(); tdbEditorEl = null; document.removeEventListener("keydown", tdbEditorEsc); } }
function tdbEditorEsc(e) { if (e.key === "Escape") closeTadabburEditor(); }
function openTadabburEditor(opts = {}) {
  closeTadabburEditor();
  const note = opts.noteId ? getTadabburNotes().find((n) => n.id === opts.noteId) : null;
  const surah = note ? note.surah : (opts.surah || currentSurah?.id);
  if (!surah) return;
  const surahName = note ? note.surahName : (currentSurah?.name_simple || `Surah ${surah}`);
  const vc = tdbVerseCount(surah);
  const startFrom = tdbClamp(note ? note.from : (opts.from || visibleAyah || 1), 1, vc);
  const startTo = tdbClamp(note ? note.to : (opts.to || startFrom), startFrom, vc);
  let tags = note ? [...(note.tags || [])] : [];

  const el = document.createElement("div");
  el.className = "tdb-backdrop";
  el.innerHTML = `
    <div class="tdb-panel" role="dialog" aria-modal="true" aria-label="Tadabbur reflection">
      <div class="tdb-top">
        <span class="tdb-brand" aria-hidden="true">✎</span>
        <span class="tdb-rng">
          <span class="tdb-rng-s">${esc(surahName)}</span>
          <span class="tdb-grp" data-role="from"><button type="button" class="tdb-mini" data-d="-1" aria-label="from minus">−</button><b class="tdb-val">${startFrom}</b><button type="button" class="tdb-mini" data-d="1" aria-label="from plus">+</button></span>
          <span class="tdb-dash">–</span>
          <span class="tdb-grp" data-role="to"><button type="button" class="tdb-mini" data-d="-1" aria-label="to minus">−</button><b class="tdb-val">${startTo}</b><button type="button" class="tdb-mini" data-d="1" aria-label="to plus">+</button></span>
        </span>
        <button type="button" class="tdb-x" data-close aria-label="Close">✕</button>
      </div>
      <textarea class="tdb-in" placeholder="Write your reflection…">${esc(note ? note.text : "")}</textarea>
      <div class="tdb-bottom">
        <div class="tdb-tagfield"><input type="text" class="tdb-taginput" placeholder="+ tag" autocomplete="off" aria-label="Add a tag"><div class="tdb-tagmenu" hidden></div></div>
        ${note ? `<button type="button" class="tdb-del" data-del aria-label="Delete reflection">\u{1F5D1}</button>` : ""}
        <button type="button" class="tdb-save" data-save>✓ Save</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  tdbEditorEl = el;
  document.addEventListener("keydown", tdbEditorEsc);
  el.addEventListener("mousedown", (e) => { if (e.target === el) closeTadabburEditor(); });
  el.querySelector("[data-close]").addEventListener("click", closeTadabburEditor);

  const fromV = el.querySelector("[data-role=from] .tdb-val"), toV = el.querySelector("[data-role=to] .tdb-val");
  el.querySelectorAll(".tdb-grp").forEach((g) => { const v = g.querySelector(".tdb-val"); g.querySelectorAll(".tdb-mini").forEach((btn) => btn.addEventListener("click", () => { v.textContent = tdbClamp(+v.textContent + (+btn.dataset.d), 1, vc); const a = +fromV.textContent, c = +toV.textContent; if (v === fromV && a > c) toV.textContent = a; if (v === toV && c < a) fromV.textContent = c; })); });

  const tagfield = el.querySelector(".tdb-tagfield"), taginput = el.querySelector(".tdb-taginput"), tagmenu = el.querySelector(".tdb-tagmenu");
  function chips() { tagfield.querySelectorAll(".tdb-chip").forEach((c) => c.remove()); tags.slice().reverse().forEach((t) => { const c = document.createElement("span"); c.className = "tdb-chip"; c.textContent = t; const x = document.createElement("button"); x.type = "button"; x.className = "tdb-chip-x"; x.textContent = "×"; x.setAttribute("aria-label", "remove " + t); x.addEventListener("click", () => { tags = tags.filter((s) => s !== t); chips(); menu(); taginput.focus(); }); c.appendChild(x); tagfield.insertBefore(c, taginput); }); }
  function addTag(t) { t = t.trim().toLowerCase(); if (!t || tags.includes(t)) return; tags.push(t); taginput.value = ""; chips(); menu(); taginput.focus(); }
  function menu() { const q = taginput.value.trim().toLowerCase(); const ex = allTadabburTags(); const opts = ex.filter((t) => !tags.includes(t) && t.includes(q)); let h = ""; if (q && !ex.includes(q) && !tags.includes(q)) h += `<div class="tdb-opt create" data-add="${esc(q)}">＋ Create “${esc(q)}”</div>`; opts.slice(0, 8).forEach((t) => { h += `<div class="tdb-opt" data-add="${esc(t)}">${esc(t)}</div>`; }); if (!h) { tagmenu.hidden = true; return; } tagmenu.innerHTML = h; tagmenu.hidden = false; tagmenu.querySelectorAll("[data-add]").forEach((o) => o.addEventListener("mousedown", (e) => { e.preventDefault(); addTag(o.getAttribute("data-add")); })); }
  taginput.addEventListener("focus", menu); taginput.addEventListener("input", menu);
  taginput.addEventListener("blur", () => setTimeout(() => { tagmenu.hidden = true; }, 150));
  taginput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); if (taginput.value.trim()) addTag(taginput.value.trim()); } });
  chips();

  const delB = el.querySelector("[data-del]");
  if (delB) delB.addEventListener("click", () => { deleteTadabburNote(note.id); closeTadabburEditor(); tdbToast("Reflection deleted"); if (route().view === "tadabbur") renderTadabbur(); });

  el.querySelector("[data-save]").addEventListener("click", () => {
    const text = el.querySelector(".tdb-in").value.trim();
    const a = tdbClamp(+fromV.textContent, 1, vc), b = tdbClamp(+toV.textContent, 1, vc);
    if (!text && !tags.length) { closeTadabburEditor(); return; }
    const now = Date.now();
    const saved = note
      ? { ...note, from: a, to: b, text, tags: [...tags], updated: now }
      : { id: tdbNewId(), surah, surahName, from: a, to: b, text, tags: [...tags], created: now, updated: now };
    upsertTadabburNote(saved);
    closeTadabburEditor();
    tdbToast("Reflection saved");
    if (route().view === "tadabbur") renderTadabbur();
  });
  setTimeout(() => { const ta = el.querySelector(".tdb-in"); if (ta) ta.focus(); }, 50);
}

let tadabburFilterTag = "";
let tadabburSearchQ = "";
function tadabburRangeLabel(n) { return n.from === n.to ? `Ayah ${n.from}` : `Ayahs ${n.from}–${n.to}`; }
function renderTadabbur() {
  setBreadcrumb(`<a href="#/">Home</a> › Tadabbur`);
  const app = document.getElementById("app");
  const notes = getTadabburNotes();
  const legacy = Object.values(getMyWork()).filter((e) => e.tadabbur).sort((a, b) => (b.at || 0) - (a.at || 0));
  const tags = allTadabburTags();
  if (tadabburFilterTag && !tags.includes(tadabburFilterTag)) tadabburFilterTag = "";
  const legacyRows = legacy.map((e) => `<a href="#/${e.surah}/${e.ayah}/study" class="bookmark-row my-work-row"><span class="bookmark-ref">${esc(e.surahName || ("Surah " + e.surah))} · Ayah ${e.ayah}</span><span class="bookmark-snippet">${esc(e.tadabburSnippet || "")}</span></a>`).join("");
  app.innerHTML = `
    <div class="hero compact"><h1 class="hero-title-sm">My Tadabbur</h1>${ornament()}
      <p class="hero-subtitle">${notes.length ? `${notes.length} reflection${notes.length === 1 ? "" : "s"} you’ve written` : "Your saved reflections appear here."}</p></div>
    ${notes.length ? `<div class="tdb-searchwrap"><span class="tdb-search-ic" aria-hidden="true">⌕</span><input type="search" id="tdb-search" class="tdb-search" placeholder="Search your reflections…" aria-label="Search reflections" value="${esc(tadabburSearchQ)}"></div>` : ""}
    <div id="tdb-filter"></div>
    <div id="tdb-results"></div>
    ${legacy.length ? `<div class="tdb-legacy"><div class="tdb-legacy-lab">Notes on individual ayahs</div><div class="bookmark-list">${legacyRows}</div></div>` : ""}`;
  function drawFilter() {
    const el = document.getElementById("tdb-filter");
    if (!tags.length) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="tdb-filter"><button type="button" class="tdb-fchip ${!tadabburFilterTag ? "active" : ""}" data-tag="">All</button>${tags.map((t) => `<button type="button" class="tdb-fchip ${tadabburFilterTag === t ? "active" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
    el.querySelectorAll(".tdb-fchip").forEach((b) => b.addEventListener("click", () => { tadabburFilterTag = b.dataset.tag; drawFilter(); drawResults(); }));
  }
  function drawResults() {
    const q = tadabburSearchQ.trim().toLowerCase();
    const filtered = notes.filter((n) => {
      const okT = !tadabburFilterTag || (n.tags || []).includes(tadabburFilterTag);
      const okQ = !q || (n.text || "").toLowerCase().includes(q) || (n.surahName || "").toLowerCase().includes(q) || (n.tags || []).join(" ").toLowerCase().includes(q);
      return okT && okQ;
    }).sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
    const el = document.getElementById("tdb-results");
    if (!filtered.length) { el.innerHTML = `<p class="empty-note center">${notes.length ? "No reflections match." : "Open a sūrah and tap the ✎ circle to write your first reflection."}</p>`; return; }
    el.innerHTML = `<div class="tdb-list">${filtered.map((n) => `<button type="button" class="tdb-note" data-id="${esc(n.id)}"><div class="tdb-note-head"><span class="tdb-note-ref">${esc(n.surahName || ("Surah " + n.surah))} · ${tadabburRangeLabel(n)}</span><span class="tdb-note-date">${esc(tdbRelTime(n.updated || n.created))}</span></div>${n.text ? `<div class="tdb-note-text">${esc(n.text.slice(0, 220))}${n.text.length > 220 ? "…" : ""}</div>` : ""}${(n.tags && n.tags.length) ? `<div class="tdb-note-tags">${n.tags.map((t) => `<span class="tdb-pill">${esc(t)}</span>`).join("")}</div>` : ""}</button>`).join("")}</div>`;
    el.querySelectorAll(".tdb-note").forEach((b) => b.addEventListener("click", () => openTadabburEditor({ noteId: b.dataset.id })));
  }
  const search = document.getElementById("tdb-search");
  if (search) search.addEventListener("input", () => { tadabburSearchQ = search.value; drawResults(); });
  drawFilter();
  drawResults();
}

function renderEdits() {
  setBreadcrumb(`<a href="#/">Home</a> › Edits`);
  const CATS = [{ key: "wordEdit", label: "Word-by-word" }, { key: "transEdit", label: "Translation" }, { key: "tadabbur", label: "Tadabbur" }];
  const LBL = { wordEdit: "Word", transEdit: "Translation", tadabbur: "Tadabbur" };
  const f = prefs.editsFilter || { wordEdit: true, transEdit: true, tadabbur: true };
  const catsOf = (e) => {
    const c = [];
    if (e.wordEdit ?? e.meanings) c.push("wordEdit");   // ?? falls back for legacy entries
    if (e.transEdit ?? e.meanings) c.push("transEdit");
    if (e.tadabbur) c.push("tadabbur");
    return c;
  };
  const all = Object.values(getMyWork())
    .map((e) => ({ e, cats: catsOf(e) }))
    .filter((x) => x.cats.some((c) => f[c]))
    .sort((a, b) => b.e.at - a.e.at);
  const chips = CATS.map((c) => `<button type="button" class="edit-chip ${f[c.key] ? "active" : ""}" data-cat="${c.key}">${c.label}</button>`).join("");
  const rows = all.map(({ e, cats }) => {
    const shown = cats.filter((c) => f[c]);
    const tags = shown.map((c) => `<span class="edit-tag">${LBL[c]}</span>`).join("");
    const onlyTadabbur = shown.length === 1 && shown[0] === "tadabbur";
    const snippet = onlyTadabbur || (!e.meaningSnippet && e.tadabburSnippet) ? e.tadabburSnippet : e.meaningSnippet;
    return `<a href="#/${e.surah}/${e.ayah}${onlyTadabbur ? "/study" : ""}" class="bookmark-row my-work-row">
        <span class="bookmark-ref">${esc(e.surahName || `Surah ${e.surah}`)} · Ayah ${e.ayah} ${tags}</span>
        <span class="bookmark-snippet">${esc(snippet || "")}</span>
      </a>`;
  }).join("");
  document.getElementById("app").innerHTML = `
    <div class="hero compact">
      <h1 class="hero-title-sm">My Edits</h1>
      ${ornament()}
      <p class="hero-subtitle">${all.length ? `${all.length} ${all.length === 1 ? "ayah" : "ayāt"} with your edits & notes` : "Your word edits, translation edits, and tadabbur appear here."}</p>
    </div>
    <div class="edit-filter">${chips}</div>
    ${all.length ? `<div class="bookmark-list">${rows}</div>` : `<p class="empty-note center">Nothing matches the selected categories.</p>`}`;
  document.querySelectorAll(".edit-chip").forEach((btn) => btn.addEventListener("click", () => {
    prefs.editsFilter[btn.dataset.cat] = !prefs.editsFilter[btn.dataset.cat];
    savePrefs();
    renderEdits();
  }));
}

async function renderDuas(focusId) {
  setBreadcrumb(`<a href="#/">Home</a> › Duas`);
  const app = document.getElementById("app");
  app.innerHTML = `<p class="loading">Loading duas…</p>`;
  const duas = await loadDuas();
  if (!duas || !duas.length) {
    app.innerHTML = `<p class="loading">Couldn't load the duas.</p>`;
    return;
  }
  const themes = [...new Set(duas.map((d) => d.theme))];
  app.innerHTML = `
    <div class="duas-page">
      <header class="duas-intro">
        <h1 class="duas-title">Duas of the Qur'an</h1>
        <p class="duas-sub">${duas.length} supplications made by the prophets and the believers — each with who said it and the moment behind it.</p>
        <p class="duas-hint">Tap any Arabic word for its meaning, grammar, and root. <span class="dua-legend">The <span class="dua-legend-mark">underlined</span> words are the supplication itself — what you recite.</span></p>
      </header>
      <div class="dua-filters" id="dua-filters">
        <button type="button" class="dua-chip active" data-theme="all">All <span class="dua-chip-n">${duas.length}</span></button>
        <button type="button" class="dua-chip dua-chip-oft" data-theme="oft" title="Authentically reported as frequently recited by the Prophet ﷺ">★ Oft-recited <span class="dua-chip-n">${duas.filter((d) => d.oft_repeated).length}</span></button>
        ${themes
          .map(
            (t) =>
              `<button type="button" class="dua-chip" data-theme="${esc(t)}">${esc(t)} <span class="dua-chip-n">${duas.filter((d) => d.theme === t).length}</span></button>`
          )
          .join("")}
      </div>
      <div class="dua-list" id="dua-list"></div>
    </div>`;
  const listEl = document.getElementById("dua-list");
  function renderList(theme) {
    const items =
      theme === "all" ? duas :
      theme === "oft" ? duas.filter((d) => d.oft_repeated) :
      duas.filter((d) => d.theme === theme);
    listEl.innerHTML = items.map(duaCard).join("");
  }
  renderList("all");
  bindDuaWordHover(listEl);
  document.querySelectorAll(".dua-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".dua-chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderList(chip.dataset.theme);
      document.getElementById("dua-filters").scrollIntoView({ block: "start", behavior: "smooth" });
    });
  });
  if (focusId) {
    const el = document.getElementById(`dua-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("dua-focus");
    }
  }
}

function duaCard(d) {
  return `<article class="dua-card${d.oft_repeated ? " dua-card-oft" : ""}" id="dua-${esc(d.id)}">
    <div class="dua-card-hd">
      <h2 class="dua-card-title">${esc(d.title)}</h2>
      <a href="#/${d.surah}/${d.ayah}" class="dua-ref" title="Read in context">${esc(d.ref)}</a>
    </div>
    ${d.oft_repeated ? `<div class="dua-oft">★ Among the supplications most often recited by the Prophet ﷺ</div>` : ""}
    <div class="dua-who"><span class="dua-tag">Said by</span> ${esc(d.who)}</div>
    <p class="dua-arabic" dir="rtl" lang="ar">${duaArabicHtml(d)}</p>
    <p class="dua-trans"><span class="dua-tag dua-tag-ai">AI translation</span> ${esc(d.ai_translation || d.translation)}</p>
    <div class="dua-situation"><span class="dua-tag dua-tag-when">When &amp; why</span> ${esc(d.situation)}</div>
    <a href="#/${d.surah}/${d.ayah}" class="dua-read">Read in context →</a>
  </article>`;
}

function toArabicDigits(n) {
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return String(n).replace(/[0-9]/g, (x) => ar[+x]);
}

function duaArabicHtml(d) {
  if (!Array.isArray(d.words) || !d.words.length) return esc(d.arabic || "");
  const multi = d.words.length > 1;
  return d.words
    .map((grp, gi) => {
      const ws = (grp.t || [])
        .map(
          (tok, i) =>
            `<span class="q-word dua-word ${tok.d ? "dua-actual" : "dua-frame"}" data-dua="${esc(d.id)}" data-g="${gi}" data-i="${i}" tabindex="0">${esc(tok.ar)}</span>`
        )
        .join(" ");
      return ws + (multi ? ` <span class="dua-ayah-num" aria-hidden="true">${toArabicDigits(grp.a)}</span> ` : "");
    })
    .join("");
}

let duaWtTimer = null;
function bindDuaWordHover(listEl) {
  listEl.addEventListener("mouseover", (e) => {
    const w = e.target.closest(".dua-word");
    if (!w) return;
    clearTimeout(duaWtTimer);
    showDuaWordTooltip(w);
  });
  listEl.addEventListener("mouseout", (e) => {
    if (!e.target.closest(".dua-word")) return;
    duaWtTimer = setTimeout(hideTooltip, 220);
  });
  listEl.addEventListener("click", (e) => {
    const w = e.target.closest(".dua-word");
    if (!w) return;
    e.preventDefault();
    clearTimeout(duaWtTimer);
    showDuaWordTooltip(w);
  });
  listEl.addEventListener("focusin", (e) => {
    const w = e.target.closest(".dua-word");
    if (w) showDuaWordTooltip(w);
  });
  const wt = document.getElementById("word-tooltip");
  if (wt && !wt.dataset.duaHoverBound) {
    wt.dataset.duaHoverBound = "1";
    wt.addEventListener("mouseenter", () => clearTimeout(duaWtTimer));
    wt.addEventListener("mouseleave", () => {
      duaWtTimer = setTimeout(hideTooltip, 220);
    });
  }
}

// Read-only word tooltip for the Duas tab. Reuses the shared #word-tooltip
// element + classes, but reads from the baked-in dua word data (cache.duas)
// instead of currentSurah, since duas span many sūrahs.
function showDuaWordTooltip(el) {
  const tooltip = document.getElementById("word-tooltip");
  if (!tooltip) return;
  const dua = (cache.duas || []).find((d) => d.id === el.dataset.dua);
  const grp = dua && dua.words ? dua.words[+el.dataset.g] : null;
  const tok = grp && grp.t ? grp.t[+el.dataset.i] : null;
  if (!tok) return;
  document.querySelectorAll(".q-word.active").forEach((w) => w.classList.remove("active"));
  el.classList.add("active");
  const ai = tok.ai;
  tooltip.hidden = false;
  tooltip.classList.remove("pinned");
  tooltip.classList.toggle("ai", !!ai);
  if (ai) {
    tooltip.innerHTML = `<div class="wt-ar">${esc(tok.ar)}</div>
      <div class="wt-tr">${esc(tok.tr || "")}</div>
      <div class="wt-ai-meaning">${esc(ai.m || tok.en || "")}</div>
      ${ai.p && ai.p.length ? `<div class="wt-ai-parts">${ai.p.map((p) => `<span class="wt-seg"><span class="wt-seg-ar" dir="rtl" lang="ar">${esc(p.ar || "")}</span><span class="wt-seg-en">${p.tr ? `<em>${esc(p.tr)}</em> — ` : ""}${esc(p.en || "")}</span></span>`).join("")}</div>` : ""}
      ${ai.g ? `<div class="wt-ai-grammar">${esc(ai.g)}</div>` : ""}
      ${ai.r ? `<div class="wt-ai-root">${esc(ai.r)}</div>` : ""}`;
  } else {
    tooltip.innerHTML = `<div class="wt-ar">${esc(tok.ar)}</div>
      <div class="wt-tr">${esc(tok.tr || "")}</div>
      <div class="wt-en">${esc(tok.en || "")}</div>
      <div class="wt-ai-pending">Detailed AI word analysis for this sūrah is being prepared.</div>`;
  }
  const m = 8;
  const rect = el.getBoundingClientRect();
  const ttW = tooltip.offsetWidth, ttH = tooltip.offsetHeight;
  const left = Math.min(Math.max(m, rect.left), Math.max(m, window.innerWidth - ttW - m));
  let top = rect.bottom + m;
  if (top + ttH > window.innerHeight - m) {
    const above = rect.top - ttH - m;
    top = above >= m ? above : Math.max(m, window.innerHeight - ttH - m);
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
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
  // The ayah blocks read passage tafsir synchronously, so it must be cached
  // before the first paint — but only wait for it when it will actually be
  // shown; otherwise just warm the cache and let the paint go ahead.
  if (prefs.studyShow?.passageTafsir) await loadPassageTafsir(data.id);
  else loadPassageTafsir(data.id);
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

  if (prefs.layoutMode === "mushaf") {
    await renderMushafInto(document.querySelector(".ayah-stream.layout-mushaf"), data.id);
  }

  applyScales();
  bindSurahEvents();
  bindReaderSearch(surahList);
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

document.addEventListener("click", async (e) => {
  if (e.target.closest && e.target.closest("#content-btn")) {
    e.stopPropagation();
    const m = document.getElementById("content-menu");
    if (m) m.hidden = !m.hidden;
    return;
  }
  // Clearable Edit Version: clicking the already-active radio deselects it,
  // falling back to "none" (= Original text, edits hidden).
  const ev = e.target.closest && e.target.closest("#content-menu input[data-ev]");
  if (ev && prefs.editView === ev.dataset.ev) {
    ev.checked = false;
    prefs.editView = "none";
    savePrefs();
    if (currentSurah) await renderSurah(currentSurah, visibleAyah || getLastReadForSurah(currentSurah.id)?.ayah);
    return;
  }
  const menu = document.getElementById("content-menu");
  if (menu && !menu.hidden && !(e.target.closest && e.target.closest(".content-menu-wrap"))) menu.hidden = true;
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  if (!t.closest || !t.closest("#content-menu")) return;
  // Book content checkboxes: cheap stream refresh, keep menu open.
  if (t.matches("input[data-bc]")) {
    prefs.bookContent[t.dataset.bc] = t.checked;
    savePrefs();
    if (currentSurah) refreshAyahStream(currentSurah.id);
    return;
  }
  // Study (whole view): tadabbur / tafsir inline under every ayah.
  if (t.matches("input[data-sx]")) {
    prefs.studyShow[t.dataset.sx] = t.checked;
    savePrefs();
    // Rendered synchronously from cache, so fetch it before refreshing.
    if (t.dataset.sx === "passageTafsir" && t.checked && currentSurah) {
      await loadPassageTafsir(currentSurah.id);
    }
    if (currentSurah) refreshAyahStream(currentSurah.id);
    return;
  }
  // Reading mode / transliteration / edit version: full re-render.
  if (t.matches("input[data-rm]")) {
    if (!t.checked) return;
    prefs.readMode = t.dataset.rm;
  } else if (t.matches("input[data-translit]")) {
    prefs.showTransliteration = t.checked;
  } else if (t.matches("input[data-ev]")) {
    if (!t.checked) return;
    prefs.editView = t.dataset.ev;
  } else return;
  savePrefs();
  if (currentSurah) await renderSurah(currentSurah, visibleAyah || getLastReadForSurah(currentSurah.id)?.ayah);
});

// Per-ayah ☰ study menu: toggle an extra for just this ayah (additive over view-wide).
document.addEventListener("change", async (e) => {
  const axs = e.target.closest && e.target.closest(".ayah-study-menu input[data-axs]");
  if (!axs) return;
  const block = axs.closest(".ayah-block");
  if (!block) return;
  const s = +block.dataset.surah, an = +block.dataset.ayah;
  const key = `${s}:${an}`;
  (ayahShow[key] || (ayahShow[key] = {}))[axs.dataset.axs] = axs.checked;
  if (axs.dataset.axs === "timeline" && axs.checked && !cache.timeline) {
    await loadTimeline();
  }
  if (axs.dataset.axs === "passageTafsir" && axs.checked) {
    await loadPassageTafsir(s);   // rendered synchronously; must be in cache first
  }
  if (axs.dataset.axs === "hadith" && axs.checked && (!cache.hadithIndex || cache.asbabNuzul === null)) {
    await Promise.all([
      !cache.hadithIndex ? loadHadithData() : Promise.resolve(),
      cache.asbabNuzul === null ? loadAsbabNuzul() : Promise.resolve(),
    ]);
  }
  refreshAyahExtras(s, an);
  if (axs.dataset.axs === "timeline" && axs.checked) {
    bindTimelineEvents(block);
  }
  if (axs.dataset.axs === "hadith" && axs.checked) {
    const axWrap = block.querySelector(".ax-hadith");
    if (axWrap) bindContextPanelEvents(axWrap);
  }
});

// Inline tadabbur: save as you type, mark the ayah as having a note.
document.addEventListener("input", (e) => {
  const ta = e.target.closest && e.target.closest(".ax-tadabbur-input");
  if (!ta) return;
  const s = +ta.dataset.s, an = +ta.dataset.a;
  const ay = ayahWithEdits(s, an);
  if (!ay) return;
  ay.personal_reflections = ta.value;
  selectedAyah = ay;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistSelectedAyah, 600);
  document.getElementById(`ayah-${s}-${an}`)?.querySelector(".study-btn")?.classList.toggle("has-note", !!ta.value.trim());
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
    } else if (r.view === "duas") {
      currentSurah = null;
      selectedAyah = null;
      await renderDuas(r.id);
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
  updateTadabburFab();
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
  // Sync the unified Content menu controls from prefs (no full re-render).
  const menu = document.getElementById("content-menu");
  if (menu) {
    menu.querySelectorAll("input[data-rm]").forEach((el) => { el.checked = el.dataset.rm === prefs.readMode; });
    const tl = menu.querySelector("input[data-translit]");
    if (tl) tl.checked = !!prefs.showTransliteration;
    menu.querySelectorAll("input[data-ev]").forEach((el) => { el.checked = el.dataset.ev === prefs.editView; });
    menu.querySelectorAll("input[data-bc]").forEach((el) => { el.checked = !!(prefs.bookContent && prefs.bookContent[el.dataset.bc]); });
  }
  const wordmode = document.getElementById("toggle-wordmode");
  if (wordmode) wordmode.classList.toggle("active", prefs.wordMode === "ai");
  const layoutSel = document.getElementById("layout-select");
  if (layoutSel) layoutSel.value = prefs.layoutMode;
  const reader = document.querySelector(".surah-reader");
  if (reader) {
    reader.classList.remove("mode-arabic", "mode-translation", "mode-ai", "layout-verse", "layout-book");
    reader.classList.add(`mode-${prefs.readMode}`, `layout-${prefs.layoutMode}`);
  }
}

function handleSyncMerged({ source = "pull", changed } = {}) {
  reloadPrefsFromStorage();
  rebuildMyWorkIndex().catch((err) => console.warn("My-work index rebuild failed", err));

  // Background push — page already shows local data; never re-render.
  if (source === "push") return;
  // Pull that changed nothing locally — nothing new to show; skip the re-render
  // (this is the common case on every page load and caused a visible blink).
  if (changed === false) return;

  const r = route();
  if (r.view === "surah" && currentSurah) {
    applyPrefsToToolbarIfPresent();
    return;
  }

  if (!scrollLock) render();
}

/* ---- Offline: one-tap "save the whole Qur'an on this device" ---- */
function offlineUrlList(idx) {
  const dv = DATA_VERSION;
  const urls = new Set();
  ["data/index.json", "data/pages.json", "data/juz.json", "data/search-index.json"].forEach((u) => urls.add(`${u}?v=${dv}`));
  for (const s of idx.surahs || []) {
    urls.add(`data/surah_${s.id}.json?v=${dv}`);
    urls.add(`data/ai_wbw/surah_${s.id}.json?v=${dv}`); // 404s for surahs without AI data are harmless
  }
  urls.add(`data/mushaf/index.json?v=${dv}`);
  for (let p = 582; p <= 604; p++) {
    urls.add(`data/mushaf/page_${p}.json?v=${dv}`);
    urls.add(`fonts/qcf2/p${p}.woff2`);
  }
  urls.add(`fonts/pdms-saleem-quranfont.ttf`);
  return [...urls];
}

async function downloadForOffline(onProgress) {
  const idx = await loadIndex();
  const urls = offlineUrlList(idx);
  let done = 0, ok = 0, i = 0;
  async function worker() {
    while (i < urls.length) {
      const u = urls[i++];
      try { const r = await fetch(u, { cache: "reload" }); if (r && r.ok) ok++; } catch (_) {}
      done++; if (onProgress) onProgress(done, urls.length, ok);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker)); // 6 in parallel
  return { total: urls.length, ok };
}

function initOfflineBanner() {
  if (!("serviceWorker" in navigator)) return;
  if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return; // mobile only
  try {
    if (localStorage.getItem("quran-offline-done") === "1") return;
    if (localStorage.getItem("quran-offline-dismissed") === "1") return;
  } catch (_) {}
  if (document.getElementById("offline-banner")) return;

  const banner = document.createElement("div");
  banner.id = "offline-banner";
  banner.className = "offline-banner";
  banner.innerHTML = `
    <div class="ob-row">
      <span class="ob-text">Save the whole Qur'an on this device for offline reading?</span>
      <div class="ob-actions">
        <button type="button" id="ob-yes" class="btn ob-primary">Download</button>
        <button type="button" id="ob-no" class="btn ob-dismiss">Not now</button>
      </div>
    </div>
    <div id="ob-progress" class="ob-progress" hidden></div>`;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("show"));

  const close = () => { banner.classList.remove("show"); setTimeout(() => banner.remove(), 320); };
  document.getElementById("ob-no")?.addEventListener("click", () => {
    try { localStorage.setItem("quran-offline-dismissed", "1"); } catch (_) {}
    close();
  });
  document.getElementById("ob-yes")?.addEventListener("click", async () => {
    const prog = document.getElementById("ob-progress");
    const actions = banner.querySelector(".ob-actions");
    const text = banner.querySelector(".ob-text");
    if (actions) actions.hidden = true;
    if (prog) prog.hidden = false;
    if (text) text.textContent = "Downloading the Qur'an for offline use…";
    try {
      const res = await downloadForOffline((done, total) => {
        if (prog) prog.textContent = `${done} / ${total} files…`;
      });
      try { localStorage.setItem("quran-offline-done", "1"); } catch (_) {}
      if (text) text.textContent = `✓ Saved (${res.ok} files) — the whole Qur'an now works offline.`;
      if (prog) prog.hidden = true;
      setTimeout(close, 2800);
    } catch (_) {
      if (text) text.textContent = "Couldn't finish — check your connection and try again.";
      if (actions) actions.hidden = false;
      if (prog) prog.hidden = true;
    }
  });
}

async function boot() {
  try {
    const syncOptions = {
      lsKeys: LS,
      ayahEditsKey: LS.ayahEdits,
      onMerged: handleSyncMerged,
      collectExtras: () => ({ tadabburNotes: getTadabburNotes() }),
    };

    QuranGitHubSync?.init(syncOptions);

    // Paint local content immediately — sync must never delay first render.
    // If the pull below merges in remote changes, onMerged re-renders (and
    // skips the re-render when nothing changed, so no blink).
    render();
    booted = true; // the app is up; past here, transient errors must not nuke it

    await QuranFirebaseSync?.init(syncOptions);
    await checkSync();
    if (QuranFirebaseSync?.isSignedIn?.()) {
      await QuranFirebaseSync.pullAndMerge();
    }
    rebuildMyWorkIndex().catch((err) => console.warn("My-work index rebuild failed", err));
    setTimeout(initOfflineBanner, 1800);
  } catch (err) {
    // Once local content is on screen, a sync/init failure must not replace
    // the reader with "Failed to load".
    if (booted) console.warn("Post-render boot step failed", err);
    else showBootError(err);
  }
}

// These only catch FATAL boot failures. Once the app has rendered, a stray error
// or a rejected background fetch (flaky mobile network, Firebase sync, an aborted
// request) must be logged, not replace the whole reader with "Failed to load".
window.addEventListener("error", (e) => { if (!booted) showBootError(e.error || e.message); else console.warn("Runtime error", e.error || e.message); });
window.addEventListener("unhandledrejection", (e) => { if (!booted) showBootError(e.reason); else console.warn("Unhandled rejection", e.reason); });

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
