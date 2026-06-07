const cache = { index: null, surahs: {} };
const LS = {
  lastRead: "quran-last-read",
  bookmarks: "quran-bookmarks",
  prefs: "quran-prefs",
  ayahEdits: (s, a) => `quran-${s}-${a}`,
};

let canSync = false;
let scrollLock = false;
let saveTimer = null;
let observer = null;
let selectedAyah = null;
let currentSurah = null;

const prefs = loadPrefs();

function loadPrefs() {
  try {
    return { showTranslation: true, fontScale: 1, activePanel: "reflection", ...JSON.parse(localStorage.getItem(LS.prefs) || "{}") };
  } catch {
    return { showTranslation: true, fontScale: 1, activePanel: "reflection" };
  }
}

function savePrefs() {
  localStorage.setItem(LS.prefs, JSON.stringify(prefs));
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
  return i < 0;
}

async function checkSync() {
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      canSync = true;
      const badge = document.getElementById("sync-badge");
      badge.hidden = false;
      badge.textContent = "Sync on";
      badge.classList.remove("readonly");
      return;
    }
  } catch (_) {}
  const badge = document.getElementById("sync-badge");
  badge.hidden = false;
  badge.textContent = "Read-only";
  badge.classList.add("readonly");
}

function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (!parts.length) return { view: "home" };
  if (parts[0] === "bookmarks") return { view: "bookmarks" };
  if (parts.length === 1) return { view: "surah", surah: +parts[0], ayah: null };
  return { view: "surah", surah: +parts[0], ayah: +parts[1] };
}

async function loadIndex() {
  if (!cache.index) cache.index = await (await fetch("data/index.json")).json();
  return cache.index;
}

async function loadSurah(n) {
  if (!cache.surahs[n]) cache.surahs[n] = await (await fetch(`data/surah_${n}.json`)).json();
  return cache.surahs[n];
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function arabicNumeral(n) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
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
  if (!words.length) return esc(ayah.arabic);
  return words
    .map(
      (w) =>
        `<span class="q-word" data-s="${surahId}" data-a="${ayah.ayah}" data-i="${w.key}" tabindex="0">${esc(w.arabic)}</span>`
    )
    .join(" ");
}

function ayahBlock(data, ayah, surahId) {
  const a = mergeLocalEdits(ayah, surahId);
  const bookmarked = isBookmarked(surahId, ayah.ayah);
  const hasReflection = !!(a.personal_reflections && a.personal_reflections.trim());
  return `
    <article class="ayah-block" id="ayah-${surahId}-${ayah.ayah}" data-surah="${surahId}" data-ayah="${ayah.ayah}">
      <div class="ayah-meta">
        <button type="button" class="ayah-marker" data-action="select" aria-label="Ayah ${ayah.ayah}">
          <span class="marker-ring"></span>
          <span class="marker-num">${ayah.ayah}</span>
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
        <p class="arabic-text">${renderArabicWords(a, surahId)}</p>
        <span class="ayah-end" aria-hidden="true"><span class="ayah-end-num">${arabicNumeral(ayah.ayah)}</span></span>
      </div>
      <div class="translation-block ${prefs.showTranslation ? "" : "hidden"}">
        <p class="translation-text">${esc(a.translation)}</p>
        <button type="button" class="translation-edit-btn" data-action="edit-translation" title="Edit translation" aria-label="Edit translation">✎</button>
      </div>
    </article>`;
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
    if (idx >= 0) currentSurah.ayahs[idx] = updated.ayah;
    cache.surahs[currentSurah.id] = currentSurah;
    return;
  }
  localStorage.setItem(LS.ayahEdits(currentSurah.id, data.ayah), JSON.stringify(payload));
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
      };
    }
    showSaveStatus(canSync ? "Saved to markdown" : "Saved locally", true, statusEl);
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
    return ayah.context?.trim()
      ? md(ayah.context)
      : `<p class="empty-note">No recorded occasion of revelation for this ayah.</p>`;
  }
  if (prefs.activePanel === "tafsir") {
    let html = "";
    if (ayah.tafsir_summary) html += `<details open><summary>Tafsir Summary</summary>${md(ayah.tafsir_summary)}</details>`;
    if (ayah.tafsir_ibn_kathir) html += `<details><summary>Ibn Kathir</summary>${md(ayah.tafsir_ibn_kathir)}</details>`;
    if (ayah.maarif_ul_quran) html += `<details><summary>Maarif ul Quran</summary>${md(ayah.maarif_ul_quran)}</details>`;
    return html || `<p class="empty-note">No tafsir available.</p>`;
  }
  return "";
}

function openStudyDrawer(ayah) {
  selectedAyah = mergeLocalEdits(ayah, currentSurah.id);
  const drawer = document.getElementById("study-drawer");
  const hasContext = !!(selectedAyah.context && selectedAyah.context.trim());
  if (prefs.activePanel === "context" && !hasContext) prefs.activePanel = "reflection";

  document.getElementById("drawer-title").textContent = `${currentSurah.translated_name} · Ayah ${ayah.ayah}`;
  document.getElementById("drawer-panel").innerHTML = `
    <div class="drawer-translation">
      <label class="drawer-field-label" for="drawer-translation-input">Ayah translation</label>
      <textarea class="translation-edit-input drawer-translation-input" id="drawer-translation-input" rows="3"></textarea>
      <div class="drawer-translation-status translation-save-status"></div>
    </div>
    <div class="panel-tabs">
      <button type="button" class="btn panel-tab ${prefs.activePanel === "reflection" ? "active" : ""}" data-panel="reflection">Tadabbur</button>
      <button type="button" class="btn panel-tab ${prefs.activePanel === "context" ? "active" : ""}" data-panel="context" ${hasContext ? "" : "disabled"}>Context</button>
      <button type="button" class="btn panel-tab ${prefs.activePanel === "tafsir" ? "active" : ""}" data-panel="tafsir">Tafsir</button>
    </div>
    <div class="panel-body" id="panel-content">${panelContent(selectedAyah)}</div>`;

  document.getElementById("drawer-translation-input").value = selectedAyah.translation || "";

  drawer.hidden = false;
  document.getElementById("drawer-backdrop").hidden = false;
  document.body.classList.add("drawer-open");
  bindDrawerEvents();
  highlightAyah(ayah.ayah);
}

function closeStudyDrawer() {
  document.getElementById("study-drawer").hidden = true;
  document.getElementById("drawer-backdrop").hidden = true;
  document.body.classList.remove("drawer-open");
  document.querySelectorAll(".ayah-block.active").forEach((el) => el.classList.remove("active"));
}

function highlightAyah(ayahNum) {
  document.querySelectorAll(".ayah-block").forEach((el) => {
    el.classList.toggle("active", +el.dataset.ayah === ayahNum);
  });
}

function bindDrawerEvents() {
  const translationInput = document.getElementById("drawer-translation-input");
  if (translationInput) {
    translationInput.addEventListener("input", () => {
      selectedAyah.translation = translationInput.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        persistAyah(selectedAyah, document.querySelector(".drawer-translation-status"));
        const surahId = currentSurah.id;
        const ayahNum = selectedAyah.ayah;
        const block = document.getElementById(`ayah-${surahId}-${ayahNum}`);
        const textEl = block?.querySelector(".translation-text");
        if (textEl) textEl.textContent = translationInput.value;
      }, 600);
    });
  }

  const input = document.getElementById("reflection-input");
  if (input) {
    input.value = selectedAyah.personal_reflections || "";
    input.addEventListener("input", () => {
      selectedAyah.personal_reflections = input.value;
      debouncedSave();
    });
  }
  document.querySelectorAll(".panel-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      prefs.activePanel = btn.dataset.panel;
      savePrefs();
      document.querySelectorAll(".panel-tab").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("panel-content").innerHTML = panelContent(selectedAyah);
      bindDrawerEvents();
    });
  });
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

async function refreshAyahBlock(surahId, ayahNum) {
  const data = await loadSurah(surahId);
  const ayah = data.ayahs.find((a) => a.ayah === ayahNum);
  const el = document.getElementById(`ayah-${surahId}-${ayahNum}`);
  if (el && ayah) {
    const tmp = document.createElement("div");
    tmp.innerHTML = ayahBlock(data, ayah, surahId);
    el.replaceWith(tmp.firstElementChild);
    bindSurahEvents();
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
  document.querySelectorAll(".ayah-block").forEach((el) => observer.observe(el));
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
        openStudyDrawer(currentSurah.ayahs.find((a) => a.ayah === ayahNum));
      }
    });

    block.querySelector(".translation-text")?.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      openTranslationEdit(block);
    });
  });

  document.getElementById("toggle-translation")?.addEventListener("click", () => {
    prefs.showTranslation = !prefs.showTranslation;
    savePrefs();
    document.getElementById("toggle-translation").classList.toggle("active", prefs.showTranslation);
    document.querySelectorAll(".translation-block").forEach((el) => el.classList.toggle("hidden", !prefs.showTranslation));
  });

  document.getElementById("font-smaller")?.addEventListener("click", () => setFontScale(prefs.fontScale - 0.08));
  document.getElementById("font-larger")?.addEventListener("click", () => setFontScale(prefs.fontScale + 0.08));

  document.getElementById("ayah-jump")?.addEventListener("change", (e) => {
    const ayah = +e.target.value;
    if (ayah) scrollToAyah(currentSurah.id, ayah);
  });

  document.getElementById("close-drawer")?.addEventListener("click", closeStudyDrawer);
  document.getElementById("drawer-backdrop")?.addEventListener("click", closeStudyDrawer);
}

function setFontScale(scale) {
  prefs.fontScale = Math.min(1.4, Math.max(0.85, scale));
  savePrefs();
  document.documentElement.style.setProperty("--arabic-scale", prefs.fontScale);
}

function renderHome(surahs) {
  setBreadcrumb("");
  const last = getLastRead();
  const bookmarks = getBookmarks().slice(0, 5);
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
    <div class="hero">
      <div class="hero-arch" aria-hidden="true"></div>
      <p class="hero-bismillah" dir="rtl">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
      <h1 class="hero-title" dir="rtl">القرآن الكريم</h1>
      ${ornament()}
      <p class="hero-subtitle">Recite, reflect, and let your heart find rest in His words</p>
      <p class="hero-hadith">“The best of you are those who learn the Qur'an and teach it.”</p>
    </div>
    <div class="search-wrap">
      <input type="search" id="surah-search" class="search-input" placeholder="Find a surah…" autocomplete="off" />
    </div>
    <div class="surah-grid" id="surah-grid">${surahs.map((s) => surahCard(s)).join("")}</div>`;

  document.getElementById("surah-search")?.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".surah-card").forEach((card) => {
      const text = card.dataset.search;
      card.hidden = q && !text.includes(q);
    });
  });
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
      renderBookmarks();
    });
  });
}

async function renderSurah(data, targetAyah) {
  currentSurah = data;
  const last = getLastRead();
  if (!targetAyah && last?.surah === data.id) targetAyah = last.ayah;
  const ayah = targetAyah || 1;
  saveLastRead(data.id, ayah);

  setBreadcrumb(`<a href="#/">Home</a> › ${esc(data.translated_name)}`);

  const jumpOptions = data.ayahs.map((a) => `<option value="${a.ayah}" ${a.ayah === ayah ? "selected" : ""}>Ayah ${a.ayah}</option>`).join("");
  const prevSurah = data.id > 1 ? `<a class="nav-btn" href="#/${data.id - 1}">← ${data.id - 1}</a>` : `<span class="nav-btn disabled">←</span>`;
  const nextSurah = data.id < 114 ? `<a class="nav-btn" href="#/${data.id + 1}">${data.id + 1} →</a>` : `<span class="nav-btn disabled">→</span>`;

  document.getElementById("app").innerHTML = `
    <div class="surah-reader">
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
      <div class="reader-toolbar sticky-toolbar">
        <div class="surah-progress-wrap">
          <div class="surah-progress" role="progressbar"><div class="surah-progress-bar" style="width:0"></div></div>
          <span class="surah-progress-label">Ayah ${ayah} of ${data.verses_count}</span>
        </div>
        <div class="toolbar-actions">
          <select id="ayah-jump" class="select-input" aria-label="Jump to ayah">${jumpOptions}</select>
          <button type="button" class="btn icon-only" id="font-smaller" title="Smaller text">A−</button>
          <button type="button" class="btn icon-only" id="font-larger" title="Larger text">A+</button>
          <button type="button" class="btn ${prefs.showTranslation ? "active" : ""}" id="toggle-translation">Translation</button>
        </div>
      </div>
      <p class="reader-hint">Hover a word to edit its meaning · ✎ on the translation to edit the full line · ✧ to save · ☰ for tadabbur</p>
      <div class="mushaf-sheet">
        <div class="ayah-stream">${data.ayahs.map((a) => ayahBlock(data, a, data.id)).join("")}</div>
      </div>
      <nav class="surah-nav" aria-label="Surah navigation">${prevSurah}<span class="nav-label">${data.id} / 114</span>${nextSurah}</nav>
    </div>`;

  document.documentElement.style.setProperty("--arabic-scale", prefs.fontScale);
  bindSurahEvents();
  setupScrollObserver(data.id);
  updateProgress(data.id, ayah);
  requestAnimationFrame(() => scrollToAyah(data.id, ayah, false));
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
  } else if (e.key === "Escape") closeStudyDrawer();
});

async function render() {
  if (scrollLock) return;
  hideTooltip();
  closeStudyDrawer();
  const r = route();
  try {
    if (r.view === "home") {
      currentSurah = null;
      selectedAyah = null;
      renderHome((await loadIndex()).surahs);
    } else if (r.view === "bookmarks") {
      currentSurah = null;
      renderBookmarks();
    } else if (r.view === "surah") {
      const sameSurah = currentSurah?.id === r.surah;
      if (sameSurah && r.ayah) {
        scrollToAyah(r.surah, r.ayah);
        return;
      }
      selectedAyah = null;
      await renderSurah(await loadSurah(r.surah), r.ayah);
    }
  } catch (err) {
    document.getElementById("app").innerHTML = `<p class="loading">Failed to load.</p>`;
    console.error(err);
  }
}

checkSync().then(render);
window.addEventListener("hashchange", render);
