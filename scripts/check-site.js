#!/usr/bin/env node
/**
 * check-site.js — Comprehensive Quran Site Health, Audio, Data & Notes Audit
 *
 * Designed to be executed autonomously by any AI (Antigravity, Claude, Codex, Cursor, etc.)
 * or via CLI: `node scripts/check-site.js [--notes=path/to/notes.json]`
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");

// Colors for terminal output
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

let passCount = 0;
let warnCount = 0;
let failCount = 0;

function report(status, title, details = "") {
  if (status === "PASS") {
    passCount++;
    console.log(`  ${GREEN}✓ PASS${RESET}  ${title}`);
  } else if (status === "WARN") {
    warnCount++;
    console.log(`  ${YELLOW}⚠ WARN${RESET}  ${title}${details ? ` — ${details}` : ""}`);
  } else {
    failCount++;
    console.log(`  ${RED}✗ FAIL${RESET}  ${title}${details ? ` — ${details}` : ""}`);
  }
}

function checkUrl(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "HEAD",
          timeout: timeoutMs,
          headers: { "User-Agent": "Mozilla/5.0 QuranSiteHealthCheck/1.0" },
        },
        (res) => {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
        }
      );
      req.on("error", () => resolve({ ok: false, status: 0 }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, status: 408 });
      });
      req.end();
    } catch (_) {
      resolve({ ok: false, status: 0 });
    }
  });
}

async function run() {
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`${BOLD}          QURAN SITE COMPREHENSIVE HEALTH & QUALITY AUDIT       ${RESET}`);
  console.log(`${BOLD}================================================================${RESET}\n`);

  // SECTION 1: Syntax & Code Integrity
  console.log(`${BOLD}1. Code Integrity & Syntax Checks${RESET}`);
  const jsFiles = [
    "reader.js",
    "audio-player.js",
    "print.js",
    "sw.js",
    "github-sync.js",
    "firebase-sync.js",
  ];

  for (const f of jsFiles) {
    const full = path.join(DOCS, f);
    if (!fs.existsSync(full)) {
      report("FAIL", `File exists: docs/${f}`, "Missing file");
      continue;
    }
    try {
      execSync(`node -c "${full}"`, { stdio: "pipe" });
      report("PASS", `Syntax check: docs/${f}`);
    } catch (e) {
      report("FAIL", `Syntax check: docs/${f}`, e.message.trim());
    }
  }

  // Check __BUILD_ID__ invariant in index.html
  const indexHtml = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
  const buildMatches = (indexHtml.match(/__BUILD_ID__/g) || []).length;
  if (buildMatches === 2) {
    report("PASS", `Index invariant: __BUILD_ID__ count is exactly 2`);
  } else {
    report("FAIL", `Index invariant: __BUILD_ID__ count`, `Found ${buildMatches}, expected 2`);
  }

  // Check SW network-only audio hosts
  const swJs = fs.readFileSync(path.join(DOCS, "sw.js"), "utf8");
  const requiredHosts = ["everyayah.com", "verses.quran.com", "audio.qurancdn.com", "cdn.islamic.network"];
  const missingHosts = requiredHosts.filter((h) => !swJs.includes(h));
  if (missingHosts.length === 0) {
    report("PASS", `Service worker: all 4 audio streaming hosts bypassed in cache`);
  } else {
    report("FAIL", `Service worker: streaming audio bypass`, `Missing ${missingHosts.join(", ")}`);
  }

  // SECTION 2: Audio CDN Endpoints
  console.log(`\n${BOLD}2. Audio Recitation & Narration CDN Health${RESET}`);
  const audioEndpoints = [
    {
      name: "Mishary Rashid Alafasy (Arabic, Primary EveryAyah)",
      url: "https://everyayah.com/data/Alafasy_128kbps/001001.mp3",
    },
    {
      name: "Mishary Rashid Alafasy (Arabic, Fallback Verses)",
      url: "https://verses.quran.com/Alafasy/mp3/001001.mp3",
    },
    {
      name: "Ibrahim Walk (Human English, Primary EveryAyah 192kbps)",
      url: "https://everyayah.com/data/English/Sahih_Intnl_Ibrahim_Walk_192kbps/001001.mp3",
    },
    {
      name: "Ibrahim Walk (Human English, Fallback Islamic Network)",
      url: "https://cdn.islamic.network/quran/audio/192/en.walk/1.mp3",
    },
    {
      name: "Word-by-Word Audio (QuranCDN WBW)",
      url: "https://audio.qurancdn.com/wbw/001_001_001.mp3",
    },
  ];

  for (const ep of audioEndpoints) {
    const res = await checkUrl(ep.url);
    if (res.ok) {
      report("PASS", `${ep.name} [HTTP ${res.status}]`);
    } else {
      report("WARN", `${ep.name}`, `Failed or timed out [HTTP ${res.status}]`);
    }
  }

  // SECTION 3: Quranic Data Completeness & Pipeline
  console.log(`\n${BOLD}3. Quranic Data & Tafsir Coverage${RESET}`);
  try {
    const pyTransOutput = execSync(`python scripts/validate_ai_translations.py`, {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (pyTransOutput.includes("6236 / 6236")) {
      report("PASS", `AI Translation coverage: 6,236 / 6,236 verses complete`);
    } else {
      report("WARN", `AI Translation coverage`, pyTransOutput.trim());
    }
  } catch (e) {
    report("FAIL", `AI Translation validator`, e.message.trim());
  }

  try {
    const pyWbwOutput = execSync(`python scripts/validate_wbw.py --surah 1`, {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (pyWbwOutput.includes("PROBLEMS=0")) {
      report("PASS", `Word-by-word integrity: Surah 1 validated (0 problems)`);
    } else {
      report("WARN", `Word-by-word integrity: Surah 1`, pyWbwOutput.trim());
    }
  } catch (e) {
    report("WARN", `Word-by-word validator execution`, e.message.trim());
  }

  try {
    const pyTafsirOutput = execSync(`python scripts/tafsir_passages.py status`, {
      cwd: ROOT,
      encoding: "utf8",
    });
    const doneCount = (pyTafsirOutput.match(/DONE surah/g) || []).length;
    if (doneCount === 114) {
      report("PASS", `Passage Tafsir: All 114 surahs drafted and published (100%)`);
    } else {
      report("WARN", `Passage Tafsir coverage: ${doneCount} / 114 surahs published`);
    }
  } catch (e) {
    report("WARN", `Passage Tafsir status command`, e.message.trim());
  }

  // SECTION 4: Translation & Theological Language Audit
  console.log(`\n${BOLD}4. Translation & Theological Guidelines Audit${RESET}`);
  // Check for standalone "God" vs "Allah"
  let godViolations = 0;
  const sampleSurahs = [1, 2, 18, 36, 67, 112];
  for (const s of sampleSurahs) {
    const sFile = path.join(DOCS, "data", "surah", `surah_${s}.json`);
    if (fs.existsSync(sFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(sFile, "utf8"));
        for (const a of data.ayahs || []) {
          const t = a.ai_translation || a.translation || "";
          // Flag standalone "God" (allow "gods" if referring to false deities)
          if (/\bGod\b(?!\s*of)/.test(t)) {
            godViolations++;
          }
        }
      } catch (_) {}
    }
  }
  if (godViolations === 0) {
    report("PASS", `Theological consistency: "Allah" used respectfully (zero standalone "God" in sample)`);
  } else {
    report("WARN", `Theological language check`, `Found ${godViolations} instances of "God" in sample`);
  }

  // SECTION 5: User AI Notes & Tadabbur Assessment
  console.log(`\n${BOLD}5. User AI Notes & Improvement Requests${RESET}`);
  let notes = [];

  // Check CLI arguments for custom notes path
  const args = process.argv.slice(2);
  let notesArg = args.find((a) => a.startsWith("--notes="));
  if (notesArg) {
    const p = notesArg.split("=")[1];
    if (fs.existsSync(p)) {
      try {
        notes = JSON.parse(fs.readFileSync(p, "utf8"));
      } catch (_) {}
    }
  }

  // Fallback to docs/sync/user-data.json
  if (!notes.length) {
    const syncDataPath = path.join(DOCS, "sync", "user-data.json");
    if (fs.existsSync(syncDataPath)) {
      try {
        const d = JSON.parse(fs.readFileSync(syncDataPath, "utf8"));
        if (Array.isArray(d.tadabburNotes)) notes = d.tadabburNotes;
      } catch (_) {}
    }
  }

  // Fallback to any local export
  if (!notes.length) {
    const localExport = path.join(ROOT, "notes.json");
    if (fs.existsSync(localExport)) {
      try {
        notes = JSON.parse(fs.readFileSync(localExport, "utf8"));
      } catch (_) {}
    }
  }

  const aiNotes = (notes || []).filter(
    (n) => n.forAi || n.target === "ai" || (n.tags && n.tags.includes("ai"))
  );

  if (aiNotes.length === 0) {
    console.log(`  ${CYAN}ℹ INFO${RESET}  No pending AI notes found in sync/user-data.json or notes.json.`);
    console.log(`         (To inspect specific notes, provide: node scripts/check-site.js --notes=<file.json>)`);
  } else {
    console.log(`  ${YELLOW}Found ${aiNotes.length} notes addressed to AI:${RESET}\n`);
    aiNotes.forEach((n, idx) => {
      const range = n.from === n.to ? `Ayah ${n.from}` : `Ayahs ${n.from}–${n.to}`;
      const status = n.status || "open";
      const tags = (n.tags || []).join(", ");
      console.log(`  ${BOLD}[Note ${idx + 1}] Surah ${n.surah} (${n.surahName || "Unknown"}) · ${range}${RESET}`);
      console.log(`    Status: ${status} | Tags: [${tags}]`);
      console.log(`    Content: "${n.text.slice(0, 160)}${n.text.length > 160 ? "..." : ""}"`);

      // Category diagnosis
      if (tags.includes("translation") || /translat/i.test(n.text)) {
        console.log(`    ${CYAN}→ Action Plan (Translation):${RESET} Inspect Quran-obs/Surah_${n.surah}/Ayah_${n.from}.md, compare with Saheeh Intl and classical tafsir, update translation and run python scripts/build_site.py --surah ${n.surah}`);
      } else if (tags.includes("transliteration") || /translit/i.test(n.text)) {
        console.log(`    ${CYAN}→ Action Plan (Transliteration):${RESET} Review Hafs pronunciation, verify long vowels (ā, ī, ū) and sub-dots, update wbw data.`);
      } else if (tags.includes("tafsir") || /tafsir/i.test(n.text)) {
        console.log(`    ${CYAN}→ Action Plan (Tafsir):${RESET} Cross-reference Ibn Kathir & Maarif ul Quran, enrich passage_tafsir/${n.surah}.json without inventing hadith.`);
      } else {
        console.log(`    ${CYAN}→ Action Plan (Site/Feature):${RESET} Verify UI behavior, test on mobile/desktop, update docs/reader.js or docs/audio-player.js.`);
      }
      console.log("");
    });
  }

  // Summary
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`Audit Complete: ${GREEN}${passCount} Passed${RESET}, ${YELLOW}${warnCount} Warnings${RESET}, ${failCount > 0 ? RED : GREEN}${failCount} Failed${RESET}`);
  console.log(`${BOLD}================================================================${RESET}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

run();
