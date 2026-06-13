/* print.js — Indo-Pak mushaf-style printable / PDF export.
   Builds a clean print document (Indo-Pak text + PDMS Saleem font) into #print-root
   and opens the browser print dialog ("Save as PDF"). Reuses reader.js globals
   (loadIndex, loadSurah, esc, renderAyahTransliteration) when present. */
(function () {
  "use strict";

  const PDV = "1"; // version for the print-only data files (indopak/pages/juz)
  const DV = "21"; // matches reader.js DATA_VERSION for index/surah fetches
  const pc = { indopak: null, pages: null, juz: null, index: null };

  const QURAN_AR = "الْقُرْآن الْكَرِيم";
  let BISMILLAH = "بِسۡمِ اللهِ الرَّحۡمٰنِ الرَّحِيۡمِ";

  const $ = (id) => document.getElementById(id);
  const esc2 = (s) =>
    window.esc
      ? window.esc(s)
      : String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function jget(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Could not load " + url);
    return r.json();
  }
  async function getIndex() {
    if (!pc.index) pc.index = window.loadIndex ? await window.loadIndex() : await jget(`data/index.json?v=${DV}`);
    return pc.index;
  }
  async function getIndopak() { if (!pc.indopak) pc.indopak = await jget(`data/indopak.json?v=${PDV}`); return pc.indopak; }
  async function getPages() { if (!pc.pages) pc.pages = await jget(`data/pages.json?v=${PDV}`); return pc.pages; }
  async function getJuz() { if (!pc.juz) pc.juz = await jget(`data/juz.json?v=${PDV}`); return pc.juz; }
  async function getSurah(n) { return window.loadSurah ? window.loadSurah(n) : jget(`data/surah_${n}.json?v=${DV}`); }

  const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  const toArab = (n) => String(n).split("").map((d) => (/\d/.test(d) ? AR_DIGITS[+d] : d)).join("");

  // ---------- scope -> ordered list of [surah, ayah] ----------
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];
  const pk = (k) => k.split(":").map(Number);
  function allRefs(index) {
    const o = [];
    for (const s of index.surahs) for (let a = 1; a <= s.verses_count; a++) o.push([s.id, a]);
    return o;
  }
  async function resolveRefs(opt) {
    const index = await getIndex();
    if (opt.scope === "surah") {
      const s = index.surahs.find((x) => x.id === opt.surah);
      const o = [];
      for (let a = 1; a <= s.verses_count; a++) o.push([s.id, a]);
      return o;
    }
    if (opt.scope === "juz") {
      const juz = await getJuz();
      const j = juz[String(opt.juz)];
      const f = pk(j.first), l = pk(j.last);
      return allRefs(index).filter((r) => cmp(r, f) >= 0 && cmp(r, l) <= 0);
    }
    const pages = await getPages();
    const p1 = Math.max(1, Math.min(604, opt.pageFrom));
    const p2 = Math.max(p1, Math.min(604, opt.pageTo));
    const start = pk(pages[String(p1)]);
    const endEx = p2 + 1 <= 604 && pages[String(p2 + 1)] ? pk(pages[String(p2 + 1)]) : null;
    return allRefs(index).filter((r) => cmp(r, start) >= 0 && (endEx === null || cmp(r, endEx) < 0));
  }
  function groupBySurah(refs) {
    const groups = [];
    let cur = null;
    for (const [s, a] of refs) {
      if (!cur || cur.surah !== s) { cur = { surah: s, ayahs: [] }; groups.push(cur); }
      cur.ayahs.push(a);
    }
    return groups;
  }

  // ---------- field accessors ----------
  const arabicOf = (indopak, s, a, fb) => indopak[s + ":" + a] || fb || "";
  const translationOf = (ay, src) => (src === "ai" ? ay.ai_translation || ay.translation || "" : ay.translation || "");
  function translitOf(ay) {
    if (window.renderAyahTransliteration) return window.renderAyahTransliteration(ay);
    const w = ay.word_by_word || {};
    return Object.keys(w).sort((a, b) => +a - +b).map((k) => (w[k].transliteration || "").trim()).filter(Boolean).join(" ");
  }
  const rosette = (n) => `<span class="pr-rosette" aria-hidden="true">${toArab(n)}</span>`;

  // ---------- markup ----------
  function surahHeader(meta, withBismillah) {
    return `<div class="pr-surah-head">
        <span class="pr-sh-orn" aria-hidden="true">۞</span>
        <div class="pr-surah-names">
          <div class="pr-surah-ar" dir="rtl" lang="ar">${esc2(meta.name_arabic)}</div>
          <div class="pr-surah-en">${meta.id}. ${esc2(meta.name_simple)} — ${esc2(meta.translated_name)}</div>
          <div class="pr-surah-sub">${meta.revelation_place === "makkah" ? "Makkan" : "Madinan"} · ${meta.verses_count} āyāt</div>
        </div>
        <span class="pr-sh-orn" aria-hidden="true">۞</span>
      </div>
      ${withBismillah ? `<div class="pr-bismillah" dir="rtl" lang="ar">${esc2(BISMILLAH)}</div>` : ""}`;
  }

  function renderAyahMode(group, sdata, indopak, opt) {
    const byNum = {};
    for (const a of sdata.ayahs) byNum[a.ayah] = a;
    return group.ayahs
      .map((num) => {
        const ay = byNum[num];
        if (!ay) return "";
        const ar = opt.arabic
          ? `<div class="pr-ar" dir="rtl" lang="ar">${esc2(arabicOf(indopak, group.surah, num, ay.arabic))} ${rosette(num)}</div>`
          : `<div class="pr-aynum">${num}</div>`;
        const tl = opt.translit ? `<div class="pr-tl" dir="ltr">${esc2(translitOf(ay))}</div>` : "";
        const tr = opt.translation ? `<div class="pr-tr">${esc2(translationOf(ay, opt.transSource))}</div>` : "";
        return `<div class="pr-ayah">${ar}${tl}${tr}</div>`;
      })
      .join("");
  }

  function renderBookMode(group, sdata, indopak, opt) {
    const byNum = {};
    for (const a of sdata.ayahs) byNum[a.ayah] = a;
    let h = "";
    if (opt.arabic) {
      const flow = group.ayahs
        .map((num) => {
          const ay = byNum[num];
          return `<span class="pr-ar-seg">${esc2(arabicOf(indopak, group.surah, num, ay && ay.arabic))} ${rosette(num)}</span>`;
        })
        .join(" ");
      h += `<div class="pr-block pr-ar-block" dir="rtl" lang="ar">${flow}</div>`;
    }
    if (opt.translit) {
      const flow = group.ayahs
        .map((num) => {
          const ay = byNum[num];
          const t = ay ? translitOf(ay) : "";
          return t ? `<span class="pr-seg"><sup class="pr-segnum">${num}</sup> ${esc2(t)}</span>` : "";
        })
        .filter(Boolean)
        .join(" ");
      if (flow) h += `<div class="pr-block pr-tl-block" dir="ltr">${flow}</div>`;
    }
    if (opt.translation) {
      const flow = group.ayahs
        .map((num) => {
          const ay = byNum[num];
          const t = ay ? translationOf(ay, opt.transSource) : "";
          return t ? `<span class="pr-seg"><sup class="pr-segnum">${num}</sup> ${esc2(t)}</span>` : "";
        })
        .filter(Boolean)
        .join(" ");
      if (flow) h += `<div class="pr-block pr-tr-block">${flow}</div>`;
    }
    return h;
  }

  function scopeTitle(opt, index) {
    if (opt.scope === "surah") {
      const s = index.surahs.find((x) => x.id === opt.surah);
      return `Sūrah ${s.name_simple} (${s.id})`;
    }
    if (opt.scope === "juz") return `Juzʼ ${opt.juz}`;
    return opt.pageFrom === opt.pageTo ? `Page ${opt.pageFrom}` : `Pages ${opt.pageFrom}–${opt.pageTo}`;
  }

  async function buildDoc(opt) {
    const index = await getIndex();
    const refs = await resolveRefs(opt);
    if (!refs.length) throw new Error("No āyāt found for that selection.");
    const indopak = await getIndopak();
    if (indopak["1:1"]) BISMILLAH = indopak["1:1"];
    const groups = groupBySurah(refs);
    const metaById = Object.fromEntries(index.surahs.map((s) => [s.id, s]));

    let body = "";
    let first = true;
    for (const g of groups) {
      const meta = metaById[g.surah];
      const sdata = await getSurah(g.surah);
      const startsAtOne = g.ayahs[0] === 1;
      const withBismillah = startsAtOne && g.surah !== 1 && g.surah !== 9;
      body += `<section class="pr-surah${first ? " pr-first" : ""}">`;
      body += surahHeader(meta, withBismillah);
      body += opt.layout === "book" ? renderBookMode(g, sdata, indopak, opt) : renderAyahMode(g, sdata, indopak, opt);
      body += `</section>`;
      first = false;
    }

    const title = scopeTitle(opt, index);
    const modes = [opt.arabic && "Indo-Pak Arabic", opt.translit && "transliteration", opt.translation && (opt.transSource === "ai" ? "AI translation" : "translation")]
      .filter(Boolean)
      .join(" · ");

    return `<table class="pr-frame">
      <thead><tr><td><div class="pr-run pr-run-top"><span class="pr-run-ar" dir="rtl" lang="ar">${QURAN_AR}</span></div></td></tr></thead>
      <tfoot><tr><td><div class="pr-run pr-run-bot"><span>${esc2(title)}</span><span class="pr-run-dot">✦</span><span>rkarim25.github.io/Quran</span></div></td></tr></tfoot>
      <tbody><tr><td class="pr-cell">
        <div class="pr-cover">
          <div class="pr-cover-orn" aria-hidden="true">۞</div>
          <div class="pr-cover-ar" dir="rtl" lang="ar">${QURAN_AR}</div>
          <div class="pr-cover-title">${esc2(title)}</div>
          ${modes ? `<div class="pr-cover-modes">${esc2(modes)}</div>` : ""}
        </div>
        ${body}
      </td></tr></tbody>
    </table>`;
  }

  // ---------- form / modal ----------
  function currentSurahId() {
    const m = (location.hash || "").match(/#\/?(\d+)/);
    return m ? +m[1] : null;
  }

  function readForm() {
    const opt = {
      scope: document.querySelector('input[name="pr-scope"]:checked')?.value || "surah",
      surah: +($("pr-surah")?.value || 1),
      juz: +($("pr-juz")?.value || 1),
      pageFrom: +($("pr-page-from")?.value || 1),
      pageTo: +($("pr-page-to")?.value || 1),
      arabic: !!$("pr-arabic")?.checked,
      translit: !!$("pr-translit")?.checked,
      translation: !!$("pr-translation")?.checked,
      transSource: $("pr-trans-source")?.value || "standard",
      layout: document.querySelector('input[name="pr-layout"]:checked')?.value || "ayah",
    };
    if (!opt.arabic && !opt.translit && !opt.translation) opt.arabic = true;
    if (opt.pageTo < opt.pageFrom) opt.pageTo = opt.pageFrom;
    return opt;
  }

  function syncScopeUI() {
    const scope = document.querySelector('input[name="pr-scope"]:checked')?.value || "surah";
    $("pr-wrap-surah").hidden = scope !== "surah";
    $("pr-wrap-juz").hidden = scope !== "juz";
    $("pr-wrap-page").hidden = scope !== "page";
  }
  function syncTransSourceUI() {
    const on = !!$("pr-translation")?.checked;
    const sel = $("pr-trans-source");
    if (sel) sel.disabled = !on;
  }

  let populated = false;
  async function populate() {
    if (populated) return;
    const index = await getIndex();
    const sSel = $("pr-surah");
    sSel.innerHTML = index.surahs
      .map((s) => `<option value="${s.id}">${s.id}. ${esc2(s.name_simple)}</option>`)
      .join("");
    $("pr-juz").innerHTML = Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">Juzʼ ${i + 1}</option>`).join("");
    const cur = currentSurahId();
    if (cur) sSel.value = String(cur);
    populated = true;
  }

  function openModal() {
    populate();
    $("pr-modal-backdrop").hidden = false;
    $("pr-modal").hidden = false;
    syncScopeUI();
    syncTransSourceUI();
    const st = $("pr-status");
    if (st) st.textContent = "";
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("pr-modal-backdrop").hidden = true;
    $("pr-modal").hidden = true;
    document.body.style.overflow = "";
  }

  async function generate() {
    const opt = readForm();
    const st = $("pr-status");
    const btn = $("pr-generate");
    if (btn) btn.disabled = true;
    if (st) st.textContent = "Preparing the mushaf…";
    try {
      const html = await buildDoc(opt);
      let root = $("print-root");
      if (!root) {
        root = document.createElement("div");
        root.id = "print-root";
        document.body.appendChild(root);
      }
      root.className = `layout-${opt.layout}`;
      root.innerHTML = html;
      try {
        await document.fonts.load('32px "PDMSSaleem"');
        await document.fonts.ready;
      } catch (_) {}
      if (st) st.textContent = "Opening the print dialog — choose “Save as PDF”.";
      closeModal();
      setTimeout(() => window.print(), 80);
    } catch (e) {
      if (st) st.textContent = "Error: " + (e && e.message ? e.message : e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bind() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-print-open]")) { e.preventDefault(); openModal(); }
      else if (e.target.closest("#pr-close") || e.target.closest("#pr-modal-backdrop")) closeModal();
      else if (e.target.closest("#pr-generate")) generate();
    });
    document.addEventListener("change", (e) => {
      if (e.target.name === "pr-scope") syncScopeUI();
      else if (e.target.id === "pr-translation") syncTransSourceUI();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("pr-modal")?.hidden) closeModal();
    });
    window.addEventListener("afterprint", () => {
      const root = $("print-root");
      if (root) root.innerHTML = "";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  window.QuranPrint = { open: openModal };
})();
