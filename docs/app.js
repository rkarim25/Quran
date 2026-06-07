const cache = { index: null, surahs: {} };
let canSync = false;
let showTranslation = true;
let activePanel = "reflection";
let currentAyah = null;
let currentSurah = null;
let saveTimer = null;

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
  if (parts.length === 1) return { view: "surah", surah: +parts[0] };
  return { view: "ayah", surah: +parts[0], ayah: +parts[1] };
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
  return Object.keys(wbw)
    .sort((a, b) => +a - +b)
    .map((k) => ({ key: k, ...wbw[k] }));
}

function renderArabicWords(ayah) {
  const words = orderedWords(ayah.word_by_word);
  if (!words.length) return `<div class="arabic-block">${esc(ayah.arabic)}</div>`;
  return `<div class="arabic-block">${words
    .map(
      (w, i) =>
        `<span class="q-word" data-i="${w.key}" data-idx="${i}" tabindex="0">${esc(w.arabic)}</span>`
    )
    .join(" ")}</div>`;
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

  localStorage.setItem(`quran-${currentSurah.id}-${data.ayah}`, JSON.stringify(payload));
}

function showSaveStatus(msg, ok) {
  const el = document.querySelector(".save-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "save-status" + (ok ? " ok" : ok === false ? " err" : "");
}

async function persistCurrentAyah() {
  if (!currentAyah || !currentSurah) return;
  try {
    await saveAyah(currentAyah);
    showSaveStatus(canSync ? "Saved to markdown" : "Saved locally (run serve.py to sync)", true);
  } catch (e) {
    showSaveStatus("Save failed", false);
    console.error(e);
  }
}

function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistCurrentAyah, 600);
}

function renderHome(surahs) {
  setBreadcrumb("");
  document.getElementById("app").innerHTML = `
    <div class="hero">
      <h1>القرآن الكريم</h1>
      <p>Hover words for meaning · Toggle translation · Reflect & study tafsir</p>
    </div>
    <div class="surah-grid">${surahs
      .map(
        (s) => `
      <a href="#/${s.id}" class="surah-card">
        <div class="surah-num">${s.id}</div>
        <div class="surah-ar">${esc(s.name_arabic)}</div>
        <div class="surah-en">${esc(s.translated_name)}</div>
        <div class="surah-meta">${s.revelation_place} · ${s.verses_count} ayahs</div>
      </a>`
      )
      .join("")}</div>`;
}

function renderSurah(data) {
  setBreadcrumb(`<a href="#/">Surahs</a> › ${esc(data.translated_name)}`);
  document.getElementById("app").innerHTML = `
    <div class="hero">
      <h1>${esc(data.name_arabic)}</h1>
      <p>${esc(data.translated_name)} · ${data.revelation_place} · ${data.verses_count} ayahs</p>
    </div>
    <div class="ayah-list">${data.ayahs
      .map(
        (a) => `
      <a href="#/${data.id}/${a.ayah}" class="ayah-link">
        <span class="ayah-link-num">${a.ayah}</span>
        <span class="ayah-link-ar">${esc(a.arabic)}</span>
      </a>`
      )
      .join("")}</div>`;
}

function panelContent(ayah) {
  if (activePanel === "reflection") {
    return `
      <textarea class="reflection-area" id="reflection-input" placeholder="Write your personal reflections…"></textarea>
      <div class="save-status"></div>`;
  }
  if (activePanel === "context") {
    return ayah.context ? md(ayah.context) : `<p style="color:var(--muted)">No recorded occasion of revelation for this ayah.</p>`;
  }
  if (activePanel === "tafsir") {
    let html = "";
    if (ayah.tafsir_summary) html += `<h3>Summary</h3>${md(ayah.tafsir_summary)}`;
    if (ayah.tafsir_ibn_kathir) html += `<h3>Ibn Kathir</h3>${md(ayah.tafsir_ibn_kathir)}`;
    if (ayah.maarif_ul_quran) html += `<h3>Maarif ul Quran</h3>${md(ayah.maarif_ul_quran)}`;
    return html || `<p style="color:var(--muted)">No tafsir available.</p>`;
  }
  return "";
}

function bindAyahEvents() {
  const tooltip = document.getElementById("word-tooltip");

  document.querySelectorAll(".q-word").forEach((el) => {
    el.addEventListener("mouseenter", (e) => showWordTooltip(e.currentTarget));
    el.addEventListener("focus", (e) => showWordTooltip(e.currentTarget));
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      showWordTooltip(e.currentTarget, true);
    });
  });

  document.getElementById("toggle-translation")?.addEventListener("click", () => {
    showTranslation = !showTranslation;
    document.getElementById("toggle-translation").classList.toggle("active", showTranslation);
    document.getElementById("translation-block")?.classList.toggle("hidden", !showTranslation);
  });

  document.querySelectorAll(".panel-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activePanel = btn.dataset.panel;
      document.querySelectorAll(".panel-tab").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("panel-content").innerHTML = panelContent(currentAyah);
      bindPanelEvents();
    });
  });

  bindPanelEvents();
}

document.addEventListener("click", (e) => {
  const tooltip = document.getElementById("word-tooltip");
  if (tooltip.hidden) return;
  if (!tooltip.contains(e.target) && !e.target.classList.contains("q-word")) hideTooltip();
});

function bindPanelEvents() {
  const input = document.getElementById("reflection-input");
  if (input) {
    input.value = currentAyah.personal_reflections || "";
    input.addEventListener("input", () => {
      currentAyah.personal_reflections = input.value;
      debouncedSave();
    });
  }
}

function showWordTooltip(el, editing = false) {
  const tooltip = document.getElementById("word-tooltip");
  const key = el.dataset.i;
  const word = currentAyah.word_by_word[key];
  if (!word) return;

  document.querySelectorAll(".q-word").forEach((w) => w.classList.remove("active"));
  el.classList.add("active");

  const rect = el.getBoundingClientRect();
  tooltip.hidden = false;
  tooltip.innerHTML = editing
    ? `
    <div class="wt-ar">${esc(word.arabic)}</div>
    <div class="wt-tr">${esc(word.transliteration || "")}</div>
    <label style="font-size:0.72rem;color:var(--muted)">Meaning</label>
    <input id="wt-meaning" />
    <div class="wt-actions">
      <button type="button" id="wt-cancel">Cancel</button>
      <button type="button" class="primary" id="wt-save">Save</button>
    </div>`
    : `
    <div class="wt-ar">${esc(word.arabic)}</div>
    <div class="wt-tr">${esc(word.transliteration || "")}</div>
    <div class="wt-en">${esc(word.translation || "")}</div>
    <div class="wt-actions"><button type="button" class="primary" id="wt-edit">Edit meaning</button></div>`;

  tooltip.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
  tooltip.style.top = `${rect.bottom + 8}px`;

  if (editing) document.getElementById("wt-meaning").value = word.translation || "";

  tooltip.querySelector("#wt-edit")?.addEventListener("click", () => showWordTooltip(el, true));
  tooltip.querySelector("#wt-cancel")?.addEventListener("click", hideTooltip);
  tooltip.querySelector("#wt-save")?.addEventListener("click", async () => {
    const val = document.getElementById("wt-meaning").value;
    currentAyah.word_by_word[key].translation = val;
    hideTooltip();
    await persistCurrentAyah();
    renderAyah(currentSurah, currentAyah);
  });
}

function hideTooltip() {
  document.getElementById("word-tooltip").hidden = true;
  document.querySelectorAll(".q-word").forEach((w) => w.classList.remove("active"));
}

function renderAyah(surahData, ayah) {
  currentSurah = surahData;
  currentAyah = { ...ayah, word_by_word: { ...ayah.word_by_word } };

  if (!canSync) {
    const local = localStorage.getItem(`quran-${surahData.id}-${ayah.ayah}`);
    if (local) Object.assign(currentAyah, JSON.parse(local));
  }

  setBreadcrumb(
    `<a href="#/">Surahs</a> › <a href="#/${surahData.id}">${esc(surahData.translated_name)}</a> › ${ayah.ayah}`
  );

  const hasContext = !!(currentAyah.context && currentAyah.context.trim());
  if (activePanel === "context" && !hasContext) activePanel = "reflection";

  const prev =
    ayah.ayah > 1
      ? `<a class="nav-btn" href="#/${surahData.id}/${ayah.ayah - 1}">← Previous</a>`
      : surahData.id > 1
        ? `<a class="nav-btn" href="#/${surahData.id - 1}">← Previous Surah</a>`
        : `<span class="nav-btn disabled">← Previous</span>`;

  const next =
    ayah.ayah < surahData.verses_count
      ? `<a class="nav-btn" href="#/${surahData.id}/${ayah.ayah + 1}">Next →</a>`
      : surahData.id < 114
        ? `<a class="nav-btn" href="#/${surahData.id + 1}">Next Surah →</a>`
        : `<span class="nav-btn disabled">Next →</span>`;

  document.getElementById("app").innerHTML = `
    <div class="ayah-reader">
      <div class="reader-toolbar">
        <span class="ayah-label">${esc(surahData.translated_name)} · Ayah ${ayah.ayah}</span>
        <div class="toolbar-actions">
          <button type="button" class="btn ${showTranslation ? "active" : ""}" id="toggle-translation">Translation</button>
        </div>
      </div>
      ${renderArabicWords(currentAyah)}
      <div class="translation-block ${showTranslation ? "" : "hidden"}" id="translation-block">${esc(currentAyah.translation)}</div>
      <div class="panel-tabs">
        <button type="button" class="btn panel-tab ${activePanel === "reflection" ? "active" : ""}" data-panel="reflection">Reflection</button>
        <button type="button" class="btn panel-tab ${activePanel === "context" ? "active" : ""}" data-panel="context" ${hasContext ? "" : "disabled"}>Context</button>
        <button type="button" class="btn panel-tab ${activePanel === "tafsir" ? "active" : ""}" data-panel="tafsir">Tafsir</button>
      </div>
      <div class="panel-body" id="panel-content">${panelContent(currentAyah)}</div>
      <div class="nav-row">${prev}${next}</div>
    </div>`;

  bindAyahEvents();
}

async function render() {
  const r = route();
  hideTooltip();
  try {
    if (r.view === "home") {
      currentAyah = null;
      renderHome((await loadIndex()).surahs);
    } else if (r.view === "surah") {
      currentAyah = null;
      renderSurah(await loadSurah(r.surah));
    } else if (r.view === "ayah") {
      const data = await loadSurah(r.surah);
      const ayah = data.ayahs.find((a) => a.ayah === r.ayah);
      if (!ayah) {
        document.getElementById("app").innerHTML = `<p class="loading">Ayah not found.</p>`;
        return;
      }
      renderAyah(data, ayah);
    }
  } catch (err) {
    document.getElementById("app").innerHTML = `<p class="loading">Failed to load.</p>`;
    console.error(err);
  }
}

checkSync().then(render);
window.addEventListener("hashchange", render);
