const cache = { index: null, surahs: {} };

function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts.length === 0) return { view: "home" };
  if (parts.length === 1) return { view: "surah", surah: +parts[0] };
  return { view: "ayah", surah: +parts[0], ayah: +parts[1] };
}

async function loadIndex() {
  if (!cache.index) {
    const res = await fetch("data/index.json");
    cache.index = await res.json();
  }
  return cache.index;
}

async function loadSurah(n) {
  if (!cache.surahs[n]) {
    const res = await fetch(`data/surah_${n}.json`);
    cache.surahs[n] = await res.json();
  }
  return cache.surahs[n];
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
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

function renderHome(surahs) {
  setBreadcrumb("");
  const cards = surahs
    .map(
      (s) => `
    <a href="#/${s.id}" class="surah-card">
      <div class="surah-num">${s.id}</div>
      <div class="surah-ar">${esc(s.name_arabic)}</div>
      <div class="surah-en">${esc(s.translated_name)}</div>
      <div class="surah-meta">${s.revelation_place} · ${s.verses_count} ayahs</div>
    </a>`
    )
    .join("");

  document.getElementById("app").innerHTML = `
    <div class="hero">
      <h1>القرآن الكريم</h1>
      <p>Read the Quran with English translation, word-by-word breakdown, revelation context, and tafsir.</p>
    </div>
    <div class="surah-grid">${cards}</div>`;
}

function renderSurah(data) {
  setBreadcrumb(`<a href="#/">All Surahs</a> › ${esc(data.translated_name)}`);
  const links = data.ayahs
    .map(
      (a) => `
    <a href="#/${data.id}/${a.ayah}" class="ayah-link">
      <span class="ayah-link-num">${a.ayah}</span>
      <span class="ayah-link-ar">${esc(a.arabic)}</span>
      <span class="ayah-link-tr">${esc(a.translation)}</span>
    </a>`
    )
    .join("");

  document.getElementById("app").innerHTML = `
    <div class="hero">
      <h1>${esc(data.name_arabic)}</h1>
      <p>${esc(data.translated_name)} · ${data.revelation_place} · ${data.verses_count} ayahs</p>
    </div>
    <div class="ayah-list">${links}</div>`;
}

function wordTable(wbw) {
  if (!wbw || !Object.keys(wbw).length) return "";
  const rows = Object.values(wbw)
    .map(
      (w) => `
    <tr>
      <td class="w-ar">${esc(w.arabic || "")}</td>
      <td>${esc(w.transliteration || "")}</td>
      <td>${esc(w.translation || "")}</td>
    </tr>`
    )
    .join("");
  return `
    <table class="word-table">
      <thead><tr><th>Arabic</th><th>Transliteration</th><th>Translation</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function section(title, content) {
  if (!content) return "";
  return `
    <section class="section">
      <h2>${esc(title)}</h2>
      <div class="section-body">${md(content)}</div>
    </section>`;
}

function renderAyah(surahData, ayah) {
  setBreadcrumb(
    `<a href="#/">All Surahs</a> › <a href="#/${surahData.id}">${esc(surahData.translated_name)}</a> › Ayah ${ayah.ayah}`
  );

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
    <div class="ayah-view">
      <div class="ayah-header">
        <div class="label">${esc(surahData.translated_name)} · Ayah ${ayah.ayah}</div>
        <div class="ayah-arabic">${esc(ayah.arabic)}</div>
        <div class="ayah-translation">${esc(ayah.translation)}</div>
      </div>
      ${wordTable(ayah.word_by_word)}
      ${section("Context", ayah.context)}
      ${section("Tafsir Summary", ayah.tafsir_summary)}
      ${section("Tafsir Ibn Kathir", ayah.tafsir_ibn_kathir)}
      ${section("Maarif ul Quran", ayah.maarif_ul_quran)}
      <div class="nav-row">${prev}${next}</div>
    </div>`;
}

async function render() {
  const r = route();
  try {
    if (r.view === "home") {
      const { surahs } = await loadIndex();
      renderHome(surahs);
    } else if (r.view === "surah") {
      const data = await loadSurah(r.surah);
      renderSurah(data);
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
    document.getElementById("app").innerHTML = `<p class="loading">Failed to load content.</p>`;
    console.error(err);
  }
}

window.addEventListener("hashchange", render);
render();
