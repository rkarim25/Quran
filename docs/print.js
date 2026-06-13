/* print.js — mushaf-style printable / PDF export.
   Builds a print document into #print-root and opens the browser print dialog
   ("Save as PDF"). Uses the reader's own Arabic text (surah_N.json `arabic`),
   so the PDF matches the on-screen reader exactly. Font is selectable:
   Uthmani Hafs (reader default) or Indo-Pak PDMS Saleem. Reuses reader.js
   globals (loadIndex, loadSurah, esc, cleanArabic, orderedWords,
   renderAyahTransliteration) when present. */
(function () {
  "use strict";

  const PDV = "1";
  const DV = "21";
  const pc = { pages: null, juz: null, index: null, bismillah: null };
  const QURAN_AR = "الْقُرْآن الْكَرِيم";

  const $ = (id) => document.getElementById(id);
  const esc2 = (s) =>
    window.esc ? window.esc(s) : String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clean = (s) => (window.cleanArabic ? window.cleanArabic(s) : String(s ?? "").replace(/[-‎‏﻿؜]/g, "").trim());

  async function jget(url) { const r = await fetch(url); if (!r.ok) throw new Error("Could not load " + url); return r.json(); }
  async function getIndex() { if (!pc.index) pc.index = window.loadIndex ? await window.loadIndex() : await jget(`data/index.json?v=${DV}`); return pc.index; }
  async function getPages() { if (!pc.pages) pc.pages = await jget(`data/pages.json?v=${PDV}`); return pc.pages; }
  async function getJuz() { if (!pc.juz) pc.juz = await jget(`data/juz.json?v=${PDV}`); return pc.juz; }
  async function getSurah(n) { return window.loadSurah ? window.loadSurah(n) : jget(`data/surah_${n}.json?v=${DV}`); }
  async function getBismillah() { if (!pc.bismillah) { const s1 = await getSurah(1); pc.bismillah = s1.ayahs[0].arabic; } return pc.bismillah; }

  const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  const toArab = (n) => String(n).split("").map((d) => (/\d/.test(d) ? AR_DIGITS[+d] : d)).join("");

  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];
  const pk = (k) => k.split(":").map(Number);
  function allRefs(index) { const o = []; for (const s of index.surahs) for (let a = 1; a <= s.verses_count; a++) o.push([s.id, a]); return o; }

  async function resolveRefs(opt) {
    const index = await getIndex();
    if (opt.scope === "surah") {
      const s = index.surahs.find((x) => x.id === opt.surah);
      const o = []; for (let a = 1; a <= s.verses_count; a++) o.push([s.id, a]); return o;
    }
    if (opt.scope === "juz") {
      const juz = await getJuz(); const j = juz[String(opt.juz)];
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
    const groups = []; let cur = null;
    for (const [s, a] of refs) { if (!cur || cur.surah !== s) { cur = { surah: s, ayahs: [] }; groups.push(cur); } cur.ayahs.push(a); }
    return groups;
  }

  // verse -> mushaf page / juz, from the maps
  let _pagesArr = null;
  async function verseToPage(ref) {
    if (!_pagesArr) { const p = await getPages(); _pagesArr = Object.keys(p).map((k) => [+k, pk(p[k])]).sort((a, b) => a[0] - b[0]); }
    let page = 1;
    for (const [num, start] of _pagesArr) { if (cmp(start, ref) <= 0) page = num; else break; }
    return page;
  }
  async function verseToJuz(ref) {
    const juz = await getJuz();
    for (let j = 1; j <= 30; j++) { const e = juz[String(j)]; if (cmp(pk(e.first), ref) <= 0 && cmp(ref, pk(e.last)) <= 0) return j; }
    return 30;
  }

  // accessors (use reader's own arabic text)
  const arabicOf = (ay) => clean(ay && ay.arabic);
  const translationOf = (ay, src) => (src === "ai" ? ay.ai_translation || ay.translation || "" : ay.translation || "");
  function translitOf(ay) {
    if (window.renderAyahTransliteration) return window.renderAyahTransliteration(ay);
    const w = ay.word_by_word || {};
    return Object.keys(w).sort((a, b) => +a - +b).map((k) => (w[k].transliteration || "").trim()).filter(Boolean).join(" ");
  }
  function words(ay) {
    if (window.orderedWords) return window.orderedWords(ay.word_by_word);
    const w = ay.word_by_word || {};
    return Object.keys(w).sort((a, b) => +a - +b).map((k) => ({ key: k, ...w[k] }));
  }
  const rosette = (n) => `<span class="pr-rosette" aria-hidden="true">${toArab(n)}</span>`;
  const pageMark = (page, juz) => `<div class="pr-pagemark"><span class="pr-pm-rule"></span><span class="pr-pm-text">Page ${page} · Juzʼ ${juz}</span><span class="pr-pm-rule"></span></div>`;

  function surahHeader(meta, withBismillah, bism) {
    return `<div class="pr-surah-head">
        <span class="pr-sh-orn" aria-hidden="true">۞</span>
        <div class="pr-surah-names">
          <div class="pr-surah-ar" dir="rtl" lang="ar">${esc2(meta.name_arabic)}</div>
          <div class="pr-surah-en">${meta.id}. ${esc2(meta.name_simple)} — ${esc2(meta.translated_name)}</div>
          <div class="pr-surah-sub">${meta.revelation_place === "makkah" ? "Makkan" : "Madinan"} · ${meta.verses_count} āyāt</div>
        </div>
        <span class="pr-sh-orn" aria-hidden="true">۞</span>
      </div>
      ${withBismillah ? `<div class="pr-bismillah" dir="rtl" lang="ar">${esc2(bism)}</div>` : ""}`;
  }

  async function renderAyahMode(group, sdata, opt, pageOf, juzOf, state) {
    const byNum = {}; for (const a of sdata.ayahs) byNum[a.ayah] = a;
    let h = "";
    for (const num of group.ayahs) {
      const ay = byNum[num]; if (!ay) continue;
      const pg = pageOf[group.surah + ":" + num];
      if (pg > state.lastPage) { h += pageMark(pg, juzOf[group.surah + ":" + num]); state.lastPage = pg; }
      const ar = opt.arabic ? `<div class="pr-ar" dir="rtl" lang="ar">${esc2(arabicOf(ay))} ${rosette(num)}</div>` : `<div class="pr-aynum">${num}</div>`;
      const tl = opt.translit ? `<div class="pr-tl" dir="ltr">${esc2(translitOf(ay))}</div>` : "";
      const tr = opt.translation ? `<div class="pr-tr">${esc2(translationOf(ay, opt.transSource))}</div>` : "";
      h += `<div class="pr-ayah">${ar}${tl}${tr}</div>`;
    }
    return h;
  }

  async function renderWbwMode(group, sdata, opt, pageOf, juzOf, state) {
    const byNum = {}; for (const a of sdata.ayahs) byNum[a.ayah] = a;
    let h = "";
    for (const num of group.ayahs) {
      const ay = byNum[num]; if (!ay) continue;
      const pg = pageOf[group.surah + ":" + num];
      if (pg > state.lastPage) { h += pageMark(pg, juzOf[group.surah + ":" + num]); state.lastPage = pg; }
      const cells = words(ay).map((w) => {
        const tl = opt.translit && w.transliteration ? `<div class="pr-wbw-tl">${esc2(w.transliteration)}</div>` : "";
        const tr = opt.translation && w.translation ? `<div class="pr-wbw-tr">${esc2(w.translation)}</div>` : "";
        return `<div class="pr-wbw-word"><div class="pr-wbw-ar" lang="ar">${esc2(clean(w.arabic))}</div>${tl}${tr}</div>`;
      }).join("");
      h += `<div class="pr-wbw-ayah"><div class="pr-wbw-num">${rosette(num)}</div><div class="pr-wbw-grid" dir="rtl">${cells}</div></div>`;
    }
    return h;
  }

  function renderBookMode(group, sdata, opt, pageOf, state) {
    const byNum = {}; for (const a of sdata.ayahs) byNum[a.ayah] = a;
    let h = "";
    if (opt.arabic) {
      const flow = group.ayahs.map((num) => {
        const ay = byNum[num];
        const pg = pageOf[group.surah + ":" + num];
        let pre = "";
        if (pg > state.lastPage) { pre = `<span class="pr-pm-inline">۞ ${pg} ۞</span> `; state.lastPage = pg; }
        return `${pre}<span class="pr-ar-seg">${esc2(arabicOf(ay))} ${rosette(num)}</span>`;
      }).join(" ");
      h += `<div class="pr-block pr-ar-block" dir="rtl" lang="ar">${flow}</div>`;
    }
    if (opt.translit) {
      const flow = group.ayahs.map((num) => { const ay = byNum[num]; const t = ay ? translitOf(ay) : ""; return t ? `<span class="pr-seg"><sup class="pr-segnum">${num}</sup> ${esc2(t)}</span>` : ""; }).filter(Boolean).join(" ");
      if (flow) h += `<div class="pr-block pr-tl-block" dir="ltr">${flow}</div>`;
    }
    if (opt.translation) {
      const flow = group.ayahs.map((num) => { const ay = byNum[num]; const t = ay ? translationOf(ay, opt.transSource) : ""; return t ? `<span class="pr-seg"><sup class="pr-segnum">${num}</sup> ${esc2(t)}</span>` : ""; }).filter(Boolean).join(" ");
      if (flow) h += `<div class="pr-block pr-tr-block">${flow}</div>`;
    }
    return h;
  }

  function scopeTitle(opt, index) {
    if (opt.scope === "surah") { const s = index.surahs.find((x) => x.id === opt.surah); return `Sūrah ${s.name_simple} (${s.id})`; }
    if (opt.scope === "juz") return `Juzʼ ${opt.juz}`;
    return opt.pageFrom === opt.pageTo ? `Page ${opt.pageFrom}` : `Pages ${opt.pageFrom}–${opt.pageTo}`;
  }

  async function buildDoc(opt) {
    const index = await getIndex();
    const refs = await resolveRefs(opt);
    if (!refs.length) throw new Error("No āyāt found for that selection.");
    const bism = await getBismillah();
    const groups = groupBySurah(refs);
    const metaById = Object.fromEntries(index.surahs.map((s) => [s.id, s]));

    // page/juz per ayah + cover span
    const pageOf = {}, juzOf = {};
    for (const r of refs) { const k = r[0] + ":" + r[1]; pageOf[k] = await verseToPage(r); juzOf[k] = await verseToJuz(r); }
    const firstK = refs[0][0] + ":" + refs[0][1], lastK = refs[refs.length - 1][0] + ":" + refs[refs.length - 1][1];
    const jA = juzOf[firstK], jB = juzOf[lastK], pA = pageOf[firstK], pB = pageOf[lastK];
    const juzLabel = jA === jB ? `Juzʼ ${jA}` : `Juzʼ ${jA}–${jB}`;
    const pageLabel = pA === pB ? `Page ${pA}` : `Pages ${pA}–${pB}`;
    const state = { lastPage: pageOf[firstK] };

    let body = "", first = true;
    for (const g of groups) {
      const meta = metaById[g.surah];
      const sdata = await getSurah(g.surah);
      const withBismillah = g.ayahs[0] === 1 && g.surah !== 1 && g.surah !== 9;
      body += `<section class="pr-surah${first ? " pr-first" : ""}">`;
      body += surahHeader(meta, withBismillah, bism);
      if (opt.layout === "book") body += renderBookMode(g, sdata, opt, pageOf, state);
      else if (opt.layout === "wbw") body += await renderWbwMode(g, sdata, opt, pageOf, juzOf, state);
      else body += await renderAyahMode(g, sdata, opt, pageOf, juzOf, state);
      body += `</section>`;
      first = false;
    }

    const title = scopeTitle(opt, index);
    return `<table class="pr-frame">
      <thead><tr><td><div class="pr-run pr-run-top"><span class="pr-run-ar" dir="rtl" lang="ar">${QURAN_AR}</span></div></td></tr></thead>
      <tfoot><tr><td><div class="pr-run pr-run-bot"><span>${esc2(juzLabel)}</span><span class="pr-run-dot">✦</span><span>Qurʼān — ${esc2(pageLabel)}</span></div></td></tr></tfoot>
      <tbody><tr><td class="pr-cell">
        <div class="pr-cover">
          <div class="pr-cover-orn" aria-hidden="true">۞</div>
          <div class="pr-cover-title">${esc2(title)}</div>
          <div class="pr-cover-sub">${esc2(juzLabel)} &nbsp;·&nbsp; ${esc2(pageLabel)}</div>
        </div>
        ${body}
      </td></tr></tbody>
    </table>`;
  }

  // ---------- form / modal ----------
  function currentSurahId() { const m = (location.hash || "").match(/#\/?(\d+)/); return m ? +m[1] : null; }

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
      font: $("pr-font")?.value || "hafs",
    };
    if (!opt.arabic && !opt.translit && !opt.translation) opt.arabic = true;
    if (opt.layout === "wbw") opt.arabic = true; // word-by-word always shows Arabic
    if (opt.pageTo < opt.pageFrom) opt.pageTo = opt.pageFrom;
    return opt;
  }

  function syncScopeUI() {
    const scope = document.querySelector('input[name="pr-scope"]:checked')?.value || "surah";
    $("pr-wrap-surah").hidden = scope !== "surah";
    $("pr-wrap-juz").hidden = scope !== "juz";
    $("pr-wrap-page").hidden = scope !== "page";
  }
  function syncTransSourceUI() { const sel = $("pr-trans-source"); if (sel) sel.disabled = !$("pr-translation")?.checked; }

  let populated = false;
  async function populate() {
    if (populated) return;
    const index = await getIndex();
    $("pr-surah").innerHTML = index.surahs.map((s) => `<option value="${s.id}">${s.id}. ${esc2(s.name_simple)}</option>`).join("");
    $("pr-juz").innerHTML = Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">Juzʼ ${i + 1}</option>`).join("");
    const cur = currentSurahId(); if (cur) $("pr-surah").value = String(cur);
    populated = true;
  }

  function openModal() {
    populate();
    $("pr-modal-backdrop").hidden = false; $("pr-modal").hidden = false;
    syncScopeUI(); syncTransSourceUI();
    const st = $("pr-status"); if (st) st.textContent = "";
    document.body.style.overflow = "hidden";
  }
  function closeModal() { $("pr-modal-backdrop").hidden = true; $("pr-modal").hidden = true; document.body.style.overflow = ""; }

  async function generate() {
    const opt = readForm();
    const st = $("pr-status"), btn = $("pr-generate");
    if (btn) btn.disabled = true;
    if (st) st.textContent = "Preparing the mushaf…";
    try {
      const html = await buildDoc(opt);
      let root = $("print-root");
      if (!root) { root = document.createElement("div"); root.id = "print-root"; document.body.appendChild(root); }
      root.className = `layout-${opt.layout} pr-font-${opt.font}`;
      root.innerHTML = html;
      const fam = opt.font === "indopak" ? '"PDMSSaleem"' : '"UthmanicHafs"';
      try { await document.fonts.load('32px ' + fam); await document.fonts.ready; } catch (_) {}
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
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("pr-modal")?.hidden) closeModal(); });
    window.addEventListener("afterprint", () => { const root = $("print-root"); if (root) root.innerHTML = ""; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
  window.QuranPrint = { open: openModal };
})();
