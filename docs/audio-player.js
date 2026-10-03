/**
 * Quran Audio Player — Complete recitation by Mishary Rashid Alafasy + Real Human English Voice (Ibrahim Walk)
 *
 * Supports:
 * - Mishary Rashid Alafasy complete Arabic recitation (EveryAyah 128kbps stereo + verses.quran.com fallback)
 * - Real human voice English translation audio (Ibrahim Walk - Saheeh International 192kbps studio recordings)
 *   with Islamic Network CDN fallback (https://cdn.islamic.network/quran/audio/192/en.walk/)
 * - Automatic synchronization with active display format:
 *   * Book view (Paragraph mode): recites Arabic chunk -> recites English human audio for each ayah in paragraph -> advances
 *   * Verse/WBW view (Sentence mode): recites Arabic ayah -> recites English human audio of that ayah -> advances
 * - Format toggle (Auto follows display, Paragraph forced, Sentence forced)
 * - Preloads upcoming audio for zero-latency transitions
 * - Word-by-word human audio clips
 * - Playback rate control (1x, 0.75x slow, 1.25x)
 * - Floating responsive player bar with scrubber, time display, and keyboard shortcuts (Space, J, K)
 * - MediaSession API for lock-screen, headphone, and car Bluetooth controls
 */
const QuranAudio = (() => {
  const STORAGE_CONT = "quran-audio-cont";
  const STORAGE_RATE = "quran-audio-rate";
  const STORAGE_ENG = "quran-audio-english";
  const STORAGE_FORMAT = "quran-audio-format";
  const STORAGE_REPEAT_MODE = "quran-audio-repeat-mode";
  const STORAGE_REPEAT_START = "quran-audio-repeat-start";
  const STORAGE_REPEAT_END = "quran-audio-repeat-end";
  const STORAGE_REPEAT_LIMIT = "quran-audio-repeat-limit";

  // Audio CDNs
  const ARABIC_PRIMARY_BASE = "https://everyayah.com/data/Alafasy_128kbps/";
  const ARABIC_FALLBACK_BASE = "https://verses.quran.com/Alafasy/mp3/";
  const ENGLISH_PRIMARY_BASE = "https://everyayah.com/data/English/Sahih_Intnl_Ibrahim_Walk_192kbps/";
  const ENGLISH_FALLBACK_BASE = "https://cdn.islamic.network/quran/audio/192/en.walk/";
  const WBW_BASE = "https://audio.qurancdn.com/wbw/";

  // Total verses per surah for calculating global ayah numbers (1..6236)
  const SURAH_VERSE_COUNTS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
    123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
    28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
    29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
    15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
    5, 4, 5, 6
  ];

  // Standard Hafs 30 Juz definitions
  const JUZ_LIST = [
    { juz: 1, surah: 1, ayah: 1, name: "Al-Fatihah", ar: "آلم" },
    { juz: 2, surah: 2, ayah: 142, name: "Sayaqool", ar: "سَيَقُولُ" },
    { juz: 3, surah: 2, ayah: 253, name: "Tilka 'r-Rusul", ar: "تِلْكَ الرُّسُلُ" },
    { juz: 4, surah: 3, ayah: 93, name: "Lan Tanaloo", ar: "لَنْ تَنَالُوا" },
    { juz: 5, surah: 4, ayah: 24, name: "Wal Muhsanat", ar: "وَالْمُحْصَنَاتُ" },
    { juz: 6, surah: 4, ayah: 148, name: "La Yuhibbullah", ar: "لَا يُحِبُّ اللَّهُ" },
    { juz: 7, surah: 5, ayah: 82, name: "Wa Iza Sami'oo", ar: "وَإِذَا سَمِعُوا" },
    { juz: 8, surah: 6, ayah: 111, name: "Wa Law Annana", ar: "وَلَوْ أَنَّنَا" },
    { juz: 9, surah: 7, ayah: 88, name: "Qal al-Mala'u", ar: "قَالَ الْمَلَأُ" },
    { juz: 10, surah: 8, ayah: 41, name: "Wa'lamoo", ar: "وَاعْلَمُوا" },
    { juz: 11, surah: 9, ayah: 93, name: "Ya'taziroona", ar: "يَعْتَذِرُونَ" },
    { juz: 12, surah: 11, ayah: 6, name: "Wa Ma Min Da'abbah", ar: "وَمَا مِنْ دَابَّةٍ" },
    { juz: 13, surah: 12, ayah: 53, name: "Wa Ma Ubarri'u", ar: "وَمَا أُبَرِّئُ" },
    { juz: 14, surah: 15, ayah: 1, name: "Rubama", ar: "رُبَمَا" },
    { juz: 15, surah: 17, ayah: 1, name: "Subhana 'lladhi", ar: "سُبْحَانَ الَّذِي" },
    { juz: 16, surah: 18, ayah: 75, name: "Qala Alam Aqul", ar: "قَالَ أَلَمْ أَقُلْ" },
    { juz: 17, surah: 21, ayah: 1, name: "Iqtaraba li-n-Nas", ar: "اقْتَرَبَ لِلنَّاسِ" },
    { juz: 18, surah: 23, ayah: 1, name: "Qad Aflaha", ar: "قَدْ أَفْلَحَ" },
    { juz: 19, surah: 25, ayah: 21, name: "Wa Qal alladhina", ar: "وَقَالَ الَّذِينَ" },
    { juz: 20, surah: 27, ayah: 56, name: "Amman Khalaqa", ar: "أَمَّنْ خَلَقَ" },
    { juz: 21, surah: 29, ayah: 46, name: "Utlu Ma Oohiya", ar: "اتْلُ مَا أُوحِيَ" },
    { juz: 22, surah: 33, ayah: 31, name: "Wa Man Yaqnut", ar: "وَمَنْ يَقْنُتْ" },
    { juz: 23, surah: 36, ayah: 28, name: "Wa Ma Anzalna", ar: "وَمَا أَنْزَلْنَا" },
    { juz: 24, surah: 39, ayah: 32, name: "Fa-man Azlamu", ar: "فَمَنْ أَظْلَمُ" },
    { juz: 25, surah: 41, ayah: 47, name: "Ilayhi Yuraddu", ar: "إِلَيْهِ يُرَدُّ" },
    { juz: 26, surah: 46, ayah: 1, name: "Ha Meem", ar: "حم" },
    { juz: 27, surah: 51, ayah: 31, name: "Qala Fa-ma Khatbukum", ar: "قَالَ فَمَا خَطْبُكُمْ" },
    { juz: 28, surah: 58, ayah: 1, name: "Qad Sami'a", ar: "قَدْ سَمِعَ" },
    { juz: 29, surah: 67, ayah: 1, name: "Tabarak alladhi", ar: "تَبَارَكَ الَّذِي" },
    { juz: 30, surah: 78, ayah: 1, name: "'Amma Yatasa'aloon", ar: "عَمَّ يَتَسَاءَلُونَ" }
  ];

  let currentSurahId = null;
  let currentAyahNum = null;
  let isPlaying = false;
  // Repeat Modes: "cont" (continuous) | "ayah" (repeat 1) | "para" (repeat paragraph) | "range" (repeat range of ayat) | "single" (once)
  let repeatMode = localStorage.getItem(STORAGE_REPEAT_MODE) ||
    (localStorage.getItem(STORAGE_CONT) === "false" ? "single" : "cont");
  let repeatRangeStart = parseInt(localStorage.getItem(STORAGE_REPEAT_START), 10) || 1;
  let repeatRangeEnd = parseInt(localStorage.getItem(STORAGE_REPEAT_END), 10) || 7;
  let repeatLimit = parseInt(localStorage.getItem(STORAGE_REPEAT_LIMIT), 10) || 0; // 0 = infinite (∞)
  let repeatCurrentIteration = 1;
  let continuous = repeatMode === "cont";
  let includeEnglish = localStorage.getItem(STORAGE_ENG) !== "false";
  let playbackFormat = localStorage.getItem(STORAGE_FORMAT) || "auto"; // "auto" | "paragraph" | "sentence"
  let playbackRate = parseFloat(localStorage.getItem(STORAGE_RATE)) || 1.0;
  let seeking = false;

  // Audio Chooser state (Surah, Verse, Juz)
  let surahsList = [];
  let chooserOpen = false;
  let activeChooserTab = "surah";
  let verseChooserSurahId = 1;

  // Active chunk tracking for Paragraph mode
  let currentChunk = null; // array of ayah objects in active chunk
  let chunkStartAyah = null; // ayah number where playback of the chunk started
  let currentChunkEnglishIndex = 0; // index within chunk being spoken in English

  // Natural Voice Speech Synthesis State (for AI Translation, AI Tafsir, and custom text)
  let bestEnglishVoice = null;
  let speechActive = false;
  let speechSentences = [];
  let speechSentenceIndex = 0;
  let speechTimer = null;
  let speechProgressTimer = null;
  let speechEstimatedDuration = 0;
  let speechStartTime = 0;
  let activeUtterance = null;
  let activeSpeechType = "studio"; // "studio" | "ai_translation" | "tafsir" | "custom"

  // Dedicated HTML audio elements
  const arabicAudio = new Audio();
  const englishAudio = new Audio();
  const wordAudio = new Audio();

  arabicAudio.preload = "auto";
  englishAudio.preload = "auto";

  let usingArabicFallback = false;
  let usingEnglishFallback = false;
  let aiAudioFallbackTriggered = false;

  function pad(n, len = 3) {
    return String(n).padStart(len, "0");
  }

  function getGlobalAyahNumber(surah, ayah) {
    let count = 0;
    for (let s = 1; s < surah; s++) {
      count += SURAH_VERSE_COUNTS[s - 1] || 0;
    }
    return count + ayah;
  }

  function getArabicAudioUrl(surah, ayah, fallback = false) {
    const s = pad(surah, 3);
    const a = pad(ayah, 3);
    return fallback ? `${ARABIC_FALLBACK_BASE}${s}${a}.mp3` : `${ARABIC_PRIMARY_BASE}${s}${a}.mp3`;
  }

  function getEnglishAudioUrl(surah, ayah, fallback = false) {
    if (fallback) {
      const globalNum = getGlobalAyahNumber(surah, ayah);
      return `${ENGLISH_FALLBACK_BASE}${globalNum}.mp3`;
    }
    const s = pad(surah, 3);
    const a = pad(ayah, 3);
    return `${ENGLISH_PRIMARY_BASE}${s}${a}.mp3`;
  }

  function getWordAudioUrl(surah, ayah, word) {
    return `${WBW_BASE}${pad(surah, 3)}_${pad(ayah, 3)}_${pad(word, 3)}.mp3`;
  }

  function getAiTranslationAudioUrl(surah, ayah) {
    const s = pad(surah, 3);
    const a = pad(ayah, 3);
    return `audio/en_ai/${s}_${a}.mp3`;
  }

  // Natural Voice Selection and Scoring
  function scoreVoice(v) {
    const name = (v.name || "").toLowerCase();
    const lang = (v.lang || "").toLowerCase();
    if (!lang.startsWith("en")) return -10000;

    let score = 0;
    // Massive bonus for online/natural neural voices
    if (name.includes("natural") || name.includes("neural") || name.includes("online")) score += 500;
    if (name.includes("enhanced") || name.includes("premium")) score += 400;

    // Cloud network voices on Chrome/Android (Google Neural Cloud)
    if (name.includes("-network") || name.includes("network")) score += 450;
    // Penalize offline compact local synthesizers
    if (name.includes("-local") || name.includes("local")) score -= 250;

    // British English preferred for Quran recitation/translation dignity
    if (lang.startsWith("en-gb")) score += 80;
    else if (lang.startsWith("en-us")) score += 50;
    else score += 20;

    // Google Cloud / Neural voices on Chrome & Android
    if (name.includes("google")) {
      score += 350;
      if (lang.startsWith("en-gb")) score += 200; // Google UK English Male/Female
    }

    // Specific well-tuned human/natural voices
    if (name.includes("ryan")) score += 300;      // Microsoft Ryan Online Natural (gold standard)
    if (name.includes("sonia")) score += 220;     // Microsoft Sonia
    if (name.includes("libby")) score += 200;     // Microsoft Libby
    if (name.includes("guy")) score += 190;       // Microsoft Guy
    if (name.includes("oliver") || name.includes("arthur")) score += 190; // Siri
    if (name.includes("martha") || name.includes("serena")) score += 180;
    if (name.includes("daniel")) score += 170;    // Daniel UK
    if (name.includes("george")) score += 150;    // OneCore George
    if (name.includes("jenny") || name.includes("aria")) score += 140;
    if (name.includes("samantha")) score += 120;

    // Penalize legacy robotic SAPI desktop voices
    if (name.includes("desktop") || name.includes("david") || name.includes("zira") || name.includes("mark")) {
      score -= 400;
    }
    return score;
  }

  function pickBestEnglishVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const en = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
    if (!en.length) return voices[0];
    en.sort((a, b) => scoreVoice(b) - scoreVoice(a));
    return en[0];
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      bestEnglishVoice = pickBestEnglishVoice();
    };
  }

  function cleanTextForNaturalSpeech(raw) {
    if (!raw) return "";
    let text = String(raw);

    // Strip HTML tags
    text = text.replace(/<[^>]+>/g, " ");

    // Strip Markdown
    text = text.replace(/^#+\s+/gm, "");
    text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
    text = text.replace(/\*([^*]+)\*/g, "$1");
    text = text.replace(/`([^`]+)`/g, "$1");

    // Islamic honorifics expanded to natural English phrasing
    text = text.replace(/ﷺ/g, ", peace be upon him, ");
    text = text.replace(/ﷻ/g, ", the Exalted, ");
    text = text.replace(/رضي الله عنه|رضي الله عنهم|ؓ/g, ", may Allah be pleased with them, ");
    text = text.replace(/\(peace be upon him\)/gi, ", peace be upon him, ");

    // Strip bracketed references e.g. [1], (38:27), (15:87)
    text = text.replace(/\[\d+\]/g, " ");
    text = text.replace(/\(\d+:\d+\)/g, " ");
    text = text.replace(/\(\d+\)/g, " ");

    // Strip list markers and bullets
    text = text.replace(/^\s*[-*•]\s+/gm, "");
    text = text.replace(/^\s*\d+[\.\)]\s*/gm, "");

    // Replace dashes and colons with gentle breath pauses
    text = text.replace(/[—–]/g, ", ");
    text = text.replace(/--/g, ", ");
    text = text.replace(/:\s+/g, ", ");
    text = text.replace(/;\s+/g, ", ");

    // Transliterated Arabic letter normalization for smooth pronunciation
    text = text.replace(/[āĀ]/g, "a");
    text = text.replace(/[īĪ]/g, "ee");
    text = text.replace(/[ūŪ]/g, "oo");
    text = text.replace(/[ḥḤ]/g, "h");
    text = text.replace(/[ṣṢ]/g, "s");
    text = text.replace(/[ḍḌ]/g, "d");
    text = text.replace(/[ṭṬ]/g, "t");
    text = text.replace(/[ẓẒ]/g, "z");
    text = text.replace(/[ʿʾ`']/g, "");

    // Strip quotes and duplicate commas
    text = text.replace(/["“”«»]/g, " ");
    text = text.replace(/,\s*,+/g, ", ");
    text = text.replace(/\s+/g, " ");
    return text.trim();
  }

  function splitIntoNaturalSentences(text) {
    let cleaned = cleanTextForNaturalSpeech(text);
    if (!cleaned) return [];
    // Protect abbreviations so they are not broken mid-sentence
    cleaned = cleaned.replace(/\b(e\.g|i\.e|vs|etc|dr|mr|mrs)\./gi, "$1@DOT@");
    const matches = cleaned.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [cleaned];
    return matches
      .map((s) => s.replace(/@DOT@/g, ".").trim())
      .filter((s) => s.length > 0);
  }

  function stopEnglishSpeech() {
    speechActive = false;
    speechSentences = [];
    speechSentenceIndex = 0;
    if (speechTimer) {
      clearTimeout(speechTimer);
      speechTimer = null;
    }
    if (speechProgressTimer) {
      clearInterval(speechProgressTimer);
      speechProgressTimer = null;
    }
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    activeUtterance = null;
    window.__quranUtterance = null;
  }

  function speakNaturalText(text, onComplete) {
    stopEnglishSpeech();
    englishAudio.pause();

    const sentences = splitIntoNaturalSentences(text);
    if (!sentences.length) {
      if (onComplete) onComplete();
      return;
    }

    if (!("speechSynthesis" in window)) {
      console.warn("SpeechSynthesis not available in browser");
      if (onComplete) onComplete();
      return;
    }

    if (!bestEnglishVoice) {
      bestEnglishVoice = pickBestEnglishVoice();
    }

    speechSentences = sentences;
    speechSentenceIndex = 0;
    speechActive = true;
    speechStartTime = Date.now();

    // Estimate duration: ~135 words per minute at 0.92x rate ≈ 2.25 words/sec
    const totalWords = text.trim().split(/\s+/).length;
    speechEstimatedDuration = Math.max(2, totalWords / (2.25 * playbackRate));

    if (speechProgressTimer) clearInterval(speechProgressTimer);
    speechProgressTimer = setInterval(() => {
      if (!speechActive || !isPlaying) return;
      const elapsed = (Date.now() - speechStartTime) / 1000;
      const progress = document.getElementById("qap-progress");
      const curTime = document.getElementById("qap-current-time");
      const durTime = document.getElementById("qap-duration");
      if (progress && speechEstimatedDuration > 0) {
        const pct = Math.min(100, (elapsed / speechEstimatedDuration) * 100);
        progress.value = pct;
        progress.style.setProperty("--seek-pct", `${pct}%`);
      }
      if (curTime) curTime.textContent = formatTime(elapsed);
      if (durTime) durTime.textContent = formatTime(speechEstimatedDuration);
      updateMediaSessionPosition();
    }, 250);

    function speakNext() {
      if (!speechActive || !isPlaying) return;
      if (speechSentenceIndex >= speechSentences.length) {
        speechActive = false;
        if (speechProgressTimer) {
          clearInterval(speechProgressTimer);
          speechProgressTimer = null;
        }
        if (onComplete) onComplete();
        return;
      }

      const sentence = speechSentences[speechSentenceIndex];
      speechSentenceIndex++;

      const u = new SpeechSynthesisUtterance(sentence);
      if (bestEnglishVoice) u.voice = bestEnglishVoice;
      const voiceName = (bestEnglishVoice?.name || "").toLowerCase();
      const isNeuralOrGoogle = voiceName.includes("neural") ||
        voiceName.includes("natural") ||
        voiceName.includes("google") ||
        voiceName.includes("network") ||
        voiceName.includes("online");

      // Pitch shifting causes metallic DSP artifacts on neural synthesis; keep 1.0
      u.pitch = 1.0;
      u.rate = isNeuralOrGoogle
        ? Math.max(0.75, Math.min(1.3, playbackRate * 0.98))
        : Math.max(0.75, Math.min(1.3, playbackRate * 0.94));
      u.volume = 1.0;
      u.lang = bestEnglishVoice?.lang || "en-GB";

      activeUtterance = u;
      window.__quranUtterance = u;

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        activeUtterance = null;
        window.__quranUtterance = null;
        speechTimer = setTimeout(() => {
          speakNext();
        }, 180);
      };

      u.onend = finish;
      u.onerror = (e) => {
        if (e && (e.error === "interrupted" || e.error === "canceled")) {
          finished = true;
          return;
        }
        console.warn("Utterance error or interrupt", e);
        finish();
      };

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(u);
      } catch (err) {
        console.warn("SpeechSynthesis speak failed", err);
        finish();
      }
    }

    speakNext();
  }

  function getDisplayedEnglishContent(surahId, ayahNum) {
    const sId = surahId || currentSurahId || (window.currentSurah ? window.currentSurah.id : 1);
    const aNum = ayahNum || currentAyahNum || 1;
    const s = (window.currentSurah && window.currentSurah.id === sId) ? window.currentSurah : null;
    const ayahObj = s?.ayahs?.find((a) => a.ayah === aNum);
    const merged = (typeof window.mergeLocalEdits === "function" && ayahObj)
      ? window.mergeLocalEdits(ayahObj, sId)
      : ayahObj;

    const layout = window.prefs?.layoutMode || "verse";
    const readMode = window.prefs?.readMode || "translation";
    const bookContent = window.prefs?.bookContent || {};
    const studyShow = window.prefs?.studyShow || {};

    // 1. Passage Tafsir: if active and displayed for this chunk / ayah
    const isPassageTafsir = (layout === "book" && bookContent.passageTafsir) || studyShow.passageTafsir;
    if (isPassageTafsir) {
      if (typeof window.passageFor === "function") {
        const p = window.passageFor(sId, aNum);
        if (p && p.tafsir) {
          return { text: p.tafsir, type: "tafsir", useStudio: false };
        }
      }
      if (layout === "book") {
        const chunkInfo = findChunkForAyah(sId, aNum);
        const start = chunkInfo ? chunkInfo.chunk[0].ayah : aNum;
        const chunkEl = document.querySelector(`.book-chunk[data-start="${start}"]`);
        const tafsirBlock = chunkEl?.querySelector(".book-tafsir-section, .ax-tafsir-body");
        if (tafsirBlock) {
          const text = tafsirBlock.textContent.trim();
          if (text) return { text, type: "tafsir", useStudio: false };
        }
      } else {
        const tafsirBlock = document.querySelector(`#ayah-${sId}-${aNum} .ax-passage .ax-tafsir-body, #ayah-${sId}-${aNum} .ayah-tafsir-body, #ayah-${sId}-${aNum} .tafsir-summary-body`);
        if (tafsirBlock) {
          const text = tafsirBlock.textContent.trim();
          if (text) return { text, type: "tafsir", useStudio: false };
        }
      }
      if (merged?.tafsir_summary) {
        return { text: merged.tafsir_summary, type: "tafsir", useStudio: false };
      }
    }

    // 2. AI Translation: if active in readMode or in Book view content toggles
    const isAiTranslation = (layout === "book" && bookContent.aiTranslation) || readMode === "ai";
    if (isAiTranslation && merged?.ai_translation) {
      return { text: merged.ai_translation, type: "ai_translation", useStudio: false };
    }

    // 3. Check what is actually rendered in the DOM
    let renderedText = "";
    if (layout === "book") {
      const seg = document.querySelector(`.book-trans-seg[data-ayah="${aNum}"]`);
      if (seg) renderedText = seg.textContent.replace(/^\s*\d+\s*/, "").trim();
    } else {
      const transBlock = document.querySelector(`#ayah-${sId}-${aNum} .translation-block, #ayah-${sId}-${aNum} .wbw-fulltrans`);
      if (transBlock) renderedText = transBlock.textContent.trim();
    }

    if (renderedText) {
      if (merged?.ai_translation && renderedText.includes(merged.ai_translation.slice(0, 25))) {
        return { text: renderedText, type: "ai_translation", useStudio: false };
      }
      const origTrans = (ayahObj?.translation || ayahObj?.qf_translation || "").trim();
      if (renderedText !== origTrans && origTrans.length > 0) {
        return { text: renderedText, type: "custom", useStudio: false };
      }
    }

    // 4. If readMode is "ai"
    if (readMode === "ai" && merged?.ai_translation) {
      return { text: merged.ai_translation, type: "ai_translation", useStudio: false };
    }

    // 5. Standard Translation (Saheeh International)
    const standardText = merged?.translation || merged?.qf_translation || ayahObj?.translation || "";
    return { text: standardText, type: "studio", useStudio: true };
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function getSurahName(surahId) {
    if (window.currentSurah && window.currentSurah.id === surahId) {
      return window.currentSurah.name_simple || `Surah ${surahId}`;
    }
    const card = document.querySelector(`.surah-card[data-id="${surahId}"]`);
    if (card) {
      const en = card.querySelector(".surah-en");
      if (en) return en.textContent.trim();
    }
    return `Sūrah ${surahId}`;
  }

  function getTotalVerses(surahId) {
    if (window.currentSurah && window.currentSurah.id === surahId) {
      return window.currentSurah.verses_count || window.currentSurah.ayahs?.length || 7;
    }
    return SURAH_VERSE_COUNTS[surahId - 1] || 286;
  }

  function isParagraphMode() {
    if (playbackFormat === "paragraph") return true;
    if (playbackFormat === "sentence") return false;
    // Auto: follows active display mode
    const layout = window.prefs?.layoutMode;
    return layout === "book";
  }

  function getChunksForSurah(surahId) {
    const surah = window.currentSurah && window.currentSurah.id === surahId
      ? window.currentSurah
      : null;
    if (!surah || !surah.ayahs) return [];
    if (typeof window.bookChunks === "function") {
      return window.bookChunks(surah.ayahs, surahId);
    }
    // Fallback chunking (~520 chars per chunk)
    const TARGET = 520;
    const chunks = []; let cur = []; let len = 0;
    for (const a of surah.ayahs) {
      const t = a.ai_translation || a.translation || a.qf_translation || "";
      cur.push(a);
      len += (t.length || 60);
      if (len >= TARGET) { chunks.push(cur); cur = []; len = 0; }
    }
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  function findChunkForAyah(surahId, ayahNum) {
    const chunks = getChunksForSurah(surahId);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (c.some((a) => a.ayah === ayahNum)) {
        return { index: i, chunk: c, total: chunks.length };
      }
    }
    return null;
  }

  function clearArabicHighlights() {
    document.querySelectorAll(".ayah-block.audio-playing, .book-ayah.audio-playing").forEach((el) => {
      el.classList.remove("audio-playing");
    });
    document.querySelectorAll(".ayah-dot.play-btn").forEach((btn) => {
      btn.classList.remove("playing");
      const icon = btn.querySelector(".icon-play");
      if (icon) icon.textContent = "▶";
      btn.title = "Play recitation (Mishary Alafasy)";
      btn.setAttribute("aria-label", "Play recitation");
    });
  }

  function clearEnglishHighlights() {
    document.querySelectorAll(".translation-speaking").forEach((el) => {
      el.classList.remove("translation-speaking");
    });
    document.querySelectorAll(".segment-speaking").forEach((el) => {
      el.classList.remove("segment-speaking");
    });
  }

  function highlightArabicAyah(surahId, ayahNum) {
    clearArabicHighlights();
    if (!surahId || !ayahNum) return;

    // Verse and WBW view
    const block = document.getElementById(`ayah-${surahId}-${ayahNum}`);
    if (block) {
      block.classList.add("audio-playing");
      const btn = block.querySelector(".ayah-dot.play-btn");
      if (btn) {
        btn.classList.toggle("playing", isPlaying);
        const icon = btn.querySelector(".icon-play");
        if (icon) icon.textContent = isPlaying ? "⏸" : "▶";
        btn.title = isPlaying ? "Pause recitation" : "Play recitation";
        btn.setAttribute("aria-label", isPlaying ? "Pause recitation" : "Play recitation");
      }
    }

    // Book view
    const bookAyah = document.querySelector(`.book-ayah#ayah-${surahId}-${ayahNum}`);
    if (bookAyah) {
      bookAyah.classList.add("audio-playing");
    }
  }

  function highlightEnglishSegment(ayahNum) {
    clearEnglishHighlights();
    if (!currentSurahId || !ayahNum) return;

    const isPara = isParagraphMode();
    if (isPara && currentChunk) {
      // In Book view: highlight chunk's translation section & active ayah segment, or tafsir
      const start = currentChunk[0].ayah;
      const chunkEl = document.querySelector(`.book-chunk[data-start="${start}"]`)
        || document.getElementById(`ayah-${currentSurahId}-${start}`)?.closest(".book-chunk");
      if (chunkEl) {
        if (activeSpeechType === "tafsir") {
          const tafsirSec = chunkEl.querySelector(".book-tafsir-section, .ax-passage, .ax-tafsir-body");
          if (tafsirSec) {
            tafsirSec.classList.add("translation-speaking");
            const rect = tafsirSec.getBoundingClientRect();
            if (rect.top < 80 || rect.bottom > (window.innerHeight - 90)) {
              tafsirSec.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
          }
        }
        const transSec = chunkEl.querySelector(".book-translation-section");
        if (transSec) {
          transSec.classList.add("translation-speaking");
        }
        const seg = chunkEl.querySelector(`.book-trans-seg[data-ayah="${ayahNum}"]`);
        if (seg) {
          seg.classList.add("segment-speaking");
          const rect = seg.getBoundingClientRect();
          if (rect.top < 80 || rect.bottom > (window.innerHeight - 90)) {
            seg.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
    } else {
      // In Verse / WBW view: highlight translation block or tafsir block of active ayah
      const block = document.getElementById(`ayah-${currentSurahId}-${ayahNum}`);
      if (block) {
        if (activeSpeechType === "tafsir") {
          const tafsirSec = block.querySelector(".ax-passage, .ayah-tafsir-body, .tafsir-summary-body");
          if (tafsirSec) {
            tafsirSec.classList.add("translation-speaking");
            const rect = tafsirSec.getBoundingClientRect();
            if (rect.top < 80 || rect.bottom > (window.innerHeight - 90)) {
              tafsirSec.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
          }
        }
        const trans = block.querySelector(".translation-block, .wbw-fulltrans");
        if (trans) {
          trans.classList.add("translation-speaking");
          const rect = trans.getBoundingClientRect();
          if (rect.top < 80 || rect.bottom > (window.innerHeight - 90)) {
            trans.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
    }
  }

  function scrollToAyah(surahId, ayahNum) {
    const el = document.getElementById(`ayah-${surahId}-${ayahNum}`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const isVisible = rect.top >= 80 && rect.bottom <= (window.innerHeight - 90);
    if (!isVisible) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function updateMediaSession() {
    if (!("mediaSession" in navigator) || !currentSurahId || !currentAyahNum) return;
    const sName = getSurahName(currentSurahId);
    const isPara = isParagraphMode();

    let loopTag = "";
    if (repeatMode === "ayah") loopTag = " 🔂";
    else if (repeatMode === "para") loopTag = " 🔁 Para";
    else if (repeatMode === "range") loopTag = ` 🔁 ${Math.min(repeatRangeStart, repeatRangeEnd)}–${Math.max(repeatRangeStart, repeatRangeEnd)}`;

    let title = `${sName} · Ayah ${currentAyahNum}${loopTag}`;
    let artist = "Mishary Rashid Alafasy";

    if (playPhase === "english") {
      if (activeSpeechType === "ai_translation") {
        artist = (!speechActive && englishAudio.src && !aiAudioFallbackTriggered)
          ? "English AI Translation (Studio Neural)"
          : "English AI Translation (Natural Voice)";
      } else if (activeSpeechType === "tafsir") {
        artist = "AI Tafsir (Natural Voice)";
      } else if (activeSpeechType === "custom") {
        artist = "Custom Translation (Natural Voice)";
      } else {
        artist = "Ibrahim Walk (Studio English)";
      }

      const typeLabel = activeSpeechType === "tafsir" ? " [AI Tafsir]" : activeSpeechType === "ai_translation" ? " [AI Translation]" : " [English]";
      if (isPara && currentChunk) {
        const s = currentChunk[0].ayah;
        const e = currentChunk[currentChunk.length - 1].ayah;
        title = `${sName} · ${currentSurahId}:${s}–${e} (Ayah ${currentAyahNum})${typeLabel}${loopTag}`;
      } else {
        title = `${sName} · ${currentSurahId}:${currentAyahNum}${typeLabel}${loopTag}`;
      }
    } else if (isPara && currentChunk) {
      const s = currentChunk[0].ayah;
      const e = currentChunk[currentChunk.length - 1].ayah;
      title = `${sName} · ${currentSurahId}:${s}–${e} (Ayah ${currentAyahNum})${loopTag}`;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: "Al-Qur'an Al-Kareem",
      artwork: [
        { src: "icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    navigator.mediaSession.setActionHandler("play", () => resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => prevAyah());
    navigator.mediaSession.setActionHandler("nexttrack", () => nextAyah());

    try {
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const skip = details.seekOffset || 10;
        const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
        if (playPhase === "english" && speechActive) {
          if (speechSentences.length > 0) {
            speechSentenceIndex = Math.max(0, speechSentenceIndex - 2);
            speakNaturalText(speechSentences.slice(speechSentenceIndex).join(" "), handleEnglishEnded);
          }
        } else {
          activeAudio.currentTime = Math.max(0, activeAudio.currentTime - skip);
        }
        updateMediaSessionPosition();
      });
    } catch (_) {}

    try {
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const skip = details.seekOffset || 10;
        const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
        if (playPhase === "english" && speechActive) {
          if (speechSentences.length > 0) {
            speechSentenceIndex = Math.min(speechSentences.length - 1, speechSentenceIndex + 1);
            speakNaturalText(speechSentences.slice(speechSentenceIndex).join(" "), handleEnglishEnded);
          }
        } else if (activeAudio.duration) {
          activeAudio.currentTime = Math.min(activeAudio.duration, activeAudio.currentTime + skip);
        }
        updateMediaSessionPosition();
      });
    } catch (_) {}

    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
          if (activeAudio.duration) activeAudio.currentTime = details.seekTime;
          updateMediaSessionPosition();
        }
      });
    } catch (_) {}

    updateMediaSessionPosition();
  }

  function updateMediaSessionPosition() {
    if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession)) return;
    if (playPhase === "english" && speechActive) {
      if (speechEstimatedDuration > 0) {
        const elapsed = (Date.now() - speechStartTime) / 1000;
        try {
          navigator.mediaSession.setPositionState({
            duration: speechEstimatedDuration,
            playbackRate: playbackRate,
            position: Math.min(Math.max(0, elapsed), speechEstimatedDuration),
          });
        } catch (_) {}
      }
      return;
    }
    const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
    if (activeAudio.duration && isFinite(activeAudio.duration) && activeAudio.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: activeAudio.duration,
          playbackRate: activeAudio.playbackRate || 1.0,
          position: Math.min(Math.max(0, activeAudio.currentTime), activeAudio.duration),
        });
      } catch (_) {}
    }
  }

  async function loadSurahsList() {
    if (surahsList && surahsList.length) return surahsList;
    if (window.cache?.index?.surahs?.length) {
      surahsList = window.cache.index.surahs;
      return surahsList;
    }
    try {
      const res = await fetch("data/index.json");
      const data = await res.json();
      surahsList = data.surahs || [];
      return surahsList;
    } catch (e) {
      console.warn("Could not load surahs list for audio chooser", e);
      return [];
    }
  }

  function openChooser(tab = null) {
    const drawer = document.getElementById("qap-chooser-drawer");
    if (!drawer) return;
    chooserOpen = true;
    drawer.hidden = false;
    verseChooserSurahId = currentSurahId || (window.currentSurah ? window.currentSurah.id : 1);
    switchChooserTab(tab || activeChooserTab || "surah");
  }

  function closeChooser() {
    const drawer = document.getElementById("qap-chooser-drawer");
    if (!drawer) return;
    chooserOpen = false;
    drawer.hidden = true;
  }

  function toggleChooser() {
    if (chooserOpen) closeChooser();
    else openChooser();
  }

  function switchChooserTab(tab) {
    activeChooserTab = tab;
    document.querySelectorAll(".qap-chooser-tabs .qap-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    const paneSurah = document.getElementById("qap-pane-surah");
    const paneVerse = document.getElementById("qap-pane-verse");
    const paneJuz = document.getElementById("qap-pane-juz");
    const paneRepeat = document.getElementById("qap-pane-repeat");

    if (paneSurah) paneSurah.hidden = tab !== "surah";
    if (paneVerse) paneVerse.hidden = tab !== "verse";
    if (paneJuz) paneJuz.hidden = tab !== "juz";
    if (paneRepeat) paneRepeat.hidden = tab !== "repeat";

    if (tab === "surah") renderSurahChooser();
    else if (tab === "verse") renderVerseChooser(verseChooserSurahId);
    else if (tab === "juz") renderJuzChooser();
    else if (tab === "repeat") renderRepeatChooser();
  }

  async function renderSurahChooser(filter = "") {
    const listEl = document.getElementById("qap-surah-list");
    if (!listEl) return;
    const surahs = await loadSurahsList();
    const q = (filter || "").trim().toLowerCase();

    const filtered = surahs.filter((s) => {
      if (!q) return true;
      if (String(s.id) === q) return true;
      if (s.name_simple && s.name_simple.toLowerCase().includes(q)) return true;
      if (s.translated_name && s.translated_name.toLowerCase().includes(q)) return true;
      if (s.name_arabic && s.name_arabic.includes(q)) return true;
      return false;
    });

    listEl.innerHTML = filtered.map((s) => {
      const active = (currentSurahId === s.id) ? " active" : "";
      return `<button type="button" class="qap-surah-item${active}" data-surah="${s.id}">
        <span class="qap-s-num">${s.id}</span>
        <span class="qap-s-names">
          <span class="qap-s-en">${s.name_simple}</span>
          <span class="qap-s-trans">${s.translated_name} · ${s.verses_count}v</span>
        </span>
        <span class="qap-s-ar">${s.name_arabic}</span>
      </button>`;
    }).join("");

    listEl.querySelectorAll(".qap-surah-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sId = +btn.dataset.surah;
        verseChooserSurahId = sId;
        if (window.location.hash !== `#/${sId}`) {
          window.location.hash = `#/${sId}`;
        }
        playAyah(sId, 1);
        closeChooser();
      });
    });

    const activeEl = listEl.querySelector(".qap-surah-item.active");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }

  function renderVerseChooser(surahId) {
    verseChooserSurahId = surahId || currentSurahId || (window.currentSurah ? window.currentSurah.id : 1);
    const label = document.getElementById("qap-verse-surah-label");
    const grid = document.getElementById("qap-verse-grid");
    const prevBtn = document.getElementById("qap-prev-surah-btn");
    const nextBtn = document.getElementById("qap-next-surah-btn");

    if (prevBtn) prevBtn.disabled = verseChooserSurahId <= 1;
    if (nextBtn) nextBtn.disabled = verseChooserSurahId >= 114;

    const total = getTotalVerses(verseChooserSurahId);
    const sName = getSurahName(verseChooserSurahId);

    if (label) {
      label.textContent = `${verseChooserSurahId}. ${sName} (${total} verses)`;
    }

    if (grid) {
      let html = "";
      for (let v = 1; v <= total; v++) {
        const isActive = (verseChooserSurahId === currentSurahId && v === currentAyahNum) ? " active" : "";
        html += `<button type="button" class="qap-v-pill${isActive}" data-verse="${v}">${v}</button>`;
      }
      grid.innerHTML = html;

      grid.querySelectorAll(".qap-v-pill").forEach((btn) => {
        btn.addEventListener("click", () => {
          const vNum = +btn.dataset.verse;
          if (verseChooserSurahId !== currentSurahId) {
            if (window.location.hash !== `#/${verseChooserSurahId}`) {
              window.location.hash = `#/${verseChooserSurahId}`;
            }
          }
          playAyah(verseChooserSurahId, vNum);
          closeChooser();
        });
      });

      const activeEl = grid.querySelector(".qap-v-pill.active");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function renderJuzChooser() {
    const grid = document.getElementById("qap-juz-grid");
    if (!grid) return;

    grid.innerHTML = JUZ_LIST.map((j) => {
      const isCur = currentSurahId === j.surah;
      return `<button type="button" class="qap-juz-card${isCur ? " active" : ""}" data-juz="${j.juz}" data-surah="${j.surah}" data-ayah="${j.ayah}">
        <div class="qap-j-top">
          <span class="qap-j-num">Juzʼ ${j.juz}</span>
          <span class="qap-j-ar">${j.ar}</span>
        </div>
        <span class="qap-j-name">${j.name} (${j.surah}:${j.ayah})</span>
      </button>`;
    }).join("");

    grid.querySelectorAll(".qap-juz-card").forEach((card) => {
      card.addEventListener("click", () => {
        const s = +card.dataset.surah;
        const a = +card.dataset.ayah;
        window.location.hash = `#/${s}/${a}`;
        playAyah(s, a);
        closeChooser();
      });
    });
  }

  function setRepeatMode(mode, opts = {}) {
    repeatMode = mode;
    repeatCurrentIteration = 1;
    continuous = repeatMode === "cont";
    if (opts.start !== undefined) repeatRangeStart = +opts.start;
    if (opts.end !== undefined) repeatRangeEnd = +opts.end;
    if (opts.limit !== undefined) repeatLimit = +opts.limit;

    if (repeatMode === "range" && (!opts.start || !opts.end)) {
      const sId = currentSurahId || (window.currentSurah ? window.currentSurah.id : 1);
      const total = getTotalVerses(sId);
      const cur = currentAyahNum || 1;
      const chunkInfo = findChunkForAyah(sId, cur);
      if (chunkInfo) {
        repeatRangeStart = chunkInfo.chunk[0].ayah;
        repeatRangeEnd = chunkInfo.chunk[chunkInfo.chunk.length - 1].ayah;
      } else {
        repeatRangeStart = cur;
        repeatRangeEnd = Math.min(total, cur + 3);
      }
    }

    try {
      localStorage.setItem(STORAGE_REPEAT_MODE, repeatMode);
      localStorage.setItem(STORAGE_CONT, String(continuous));
      localStorage.setItem(STORAGE_REPEAT_START, String(repeatRangeStart));
      localStorage.setItem(STORAGE_REPEAT_END, String(repeatRangeEnd));
      localStorage.setItem(STORAGE_REPEAT_LIMIT, String(repeatLimit));
    } catch (_) {}

    updatePlayerBar();
    renderRepeatChooser();

    if (opts.playNow) {
      const sId = currentSurahId || (window.currentSurah ? window.currentSurah.id : 1);
      if (repeatMode === "range") {
        playAyah(sId, repeatRangeStart);
      } else if (repeatMode === "para") {
        const chunkInfo = findChunkForAyah(sId, currentAyahNum);
        const sAyah = chunkInfo ? chunkInfo.chunk[0].ayah : currentAyahNum;
        playAyah(sId, sAyah);
      } else if (!isPlaying) {
        resume();
      }
    }
  }

  function cycleRepeatMode() {
    const modes = ["cont", "ayah", "para", "range", "single"];
    const idx = modes.indexOf(repeatMode);
    const nextMode = modes[(idx + 1) % modes.length];
    setRepeatMode(nextMode);
  }

  function renderRepeatChooser() {
    const container = document.getElementById("qap-repeat-container");
    if (!container) return;

    const sId = currentSurahId || (window.currentSurah ? window.currentSurah.id : 1);
    const sName = getSurahName(sId);
    const totalVerses = getTotalVerses(sId);
    const curAyah = currentAyahNum || 1;

    const chunkInfo = findChunkForAyah(sId, curAyah);
    const chunkStart = chunkInfo ? chunkInfo.chunk[0].ayah : curAyah;
    const chunkEnd = chunkInfo ? chunkInfo.chunk[chunkInfo.chunk.length - 1].ayah : Math.min(totalVerses, curAyah + 3);
    const paraRangeLabel = `${chunkStart}–${chunkEnd}`;

    if (repeatRangeStart < 1) repeatRangeStart = 1;
    if (repeatRangeStart > totalVerses) repeatRangeStart = totalVerses;
    if (repeatRangeEnd < 1) repeatRangeEnd = 1;
    if (repeatRangeEnd > totalVerses) repeatRangeEnd = totalVerses;
    if (repeatRangeEnd < repeatRangeStart) repeatRangeEnd = repeatRangeStart;

    container.innerHTML = `
      <div class="qap-repeat-wrap">
        <div class="qap-repeat-header">
          <span class="qap-repeat-sname">${sId}. ${sName}</span>
          <span class="qap-repeat-meta">${totalVerses} verses total</span>
        </div>

        <div class="qap-repeat-sec">
          <div class="qap-repeat-label">Repeat Mode</div>
          <div class="qap-repeat-grid">
            <button type="button" class="qap-rpt-opt${repeatMode === 'cont' ? ' active' : ''}" data-mode="cont">
              <span class="qap-rpt-icon">🔁</span>
              <span class="qap-rpt-text">
                <span class="qap-rpt-title">Continuous</span>
                <span class="qap-rpt-desc">Entire Sūrah</span>
              </span>
            </button>

            <button type="button" class="qap-rpt-opt${repeatMode === 'ayah' ? ' active' : ''}" data-mode="ayah">
              <span class="qap-rpt-icon">🔂</span>
              <span class="qap-rpt-text">
                <span class="qap-rpt-title">1 Ayah</span>
                <span class="qap-rpt-desc">Loop Ayah ${curAyah}</span>
              </span>
            </button>

            <button type="button" class="qap-rpt-opt${repeatMode === 'para' ? ' active' : ''}" data-mode="para">
              <span class="qap-rpt-icon">📄</span>
              <span class="qap-rpt-text">
                <span class="qap-rpt-title">Paragraph</span>
                <span class="qap-rpt-desc">Passage ${paraRangeLabel}</span>
              </span>
            </button>

            <button type="button" class="qap-rpt-opt${repeatMode === 'range' ? ' active' : ''}" data-mode="range">
              <span class="qap-rpt-icon">🔢</span>
              <span class="qap-rpt-text">
                <span class="qap-rpt-title">Custom Range</span>
                <span class="qap-rpt-desc">Ayat ${repeatRangeStart}–${repeatRangeEnd}</span>
              </span>
            </button>

            <button type="button" class="qap-rpt-opt${repeatMode === 'single' ? ' active' : ''}" data-mode="single">
              <span class="qap-rpt-icon">⏸</span>
              <span class="qap-rpt-text">
                <span class="qap-rpt-title">Play Once</span>
                <span class="qap-rpt-desc">Stop after current</span>
              </span>
            </button>
          </div>
        </div>

        <div class="qap-repeat-sec qap-range-box" id="qap-range-box">
          <div class="qap-repeat-label">Range of Ayat (For Custom Range)</div>
          <div class="qap-range-inputs">
            <div class="qap-range-field">
              <label>From Verse</label>
              <div class="qap-stepper">
                <button type="button" class="qap-step-btn" id="qap-step-start-dec">−</button>
                <input type="number" id="qap-step-start-input" min="1" max="${totalVerses}" value="${repeatRangeStart}">
                <button type="button" class="qap-step-btn" id="qap-step-start-inc">+</button>
              </div>
            </div>
            <div class="qap-range-sep">➔</div>
            <div class="qap-range-field">
              <label>To Verse</label>
              <div class="qap-stepper">
                <button type="button" class="qap-step-btn" id="qap-step-end-dec">−</button>
                <input type="number" id="qap-step-end-input" min="1" max="${totalVerses}" value="${repeatRangeEnd}">
                <button type="button" class="qap-step-btn" id="qap-step-end-inc">+</button>
              </div>
            </div>
          </div>
          <div class="qap-range-presets">
            <button type="button" class="qap-preset-btn" id="qap-preset-para">Current Paragraph (${paraRangeLabel})</button>
            <button type="button" class="qap-preset-btn" id="qap-preset-single">Current Ayah (${curAyah})</button>
            <button type="button" class="qap-preset-btn" id="qap-preset-3">+3 Verses</button>
            <button type="button" class="qap-preset-btn" id="qap-preset-5">+5 Verses</button>
            <button type="button" class="qap-preset-btn" id="qap-preset-all">Whole Sūrah (1–${totalVerses})</button>
          </div>
        </div>

        <div class="qap-repeat-sec">
          <div class="qap-repeat-label">Repeat Limit</div>
          <div class="qap-count-pills">
            <button type="button" class="qap-cnt-pill${repeatLimit === 0 ? ' active' : ''}" data-limit="0">∞ Infinite Loop</button>
            <button type="button" class="qap-cnt-pill${repeatLimit === 2 ? ' active' : ''}" data-limit="2">2×</button>
            <button type="button" class="qap-cnt-pill${repeatLimit === 3 ? ' active' : ''}" data-limit="3">3×</button>
            <button type="button" class="qap-cnt-pill${repeatLimit === 5 ? ' active' : ''}" data-limit="5">5×</button>
            <button type="button" class="qap-cnt-pill${repeatLimit === 10 ? ' active' : ''}" data-limit="10">10×</button>
          </div>
        </div>

        <div class="qap-repeat-actions">
          <button type="button" class="qap-apply-repeat-btn" id="qap-apply-repeat">
            ▶ Apply & Start Loop
          </button>
        </div>
      </div>
    `;

    container.querySelectorAll(".qap-rpt-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        setRepeatMode(btn.dataset.mode);
      });
    });

    const startInput = container.querySelector("#qap-step-start-input");
    const endInput = container.querySelector("#qap-step-end-input");

    const updateInputs = (s, e) => {
      repeatRangeStart = Math.max(1, Math.min(totalVerses, s));
      repeatRangeEnd = Math.max(repeatRangeStart, Math.min(totalVerses, e));
      if (startInput) startInput.value = repeatRangeStart;
      if (endInput) endInput.value = repeatRangeEnd;
      try {
        localStorage.setItem(STORAGE_REPEAT_START, String(repeatRangeStart));
        localStorage.setItem(STORAGE_REPEAT_END, String(repeatRangeEnd));
      } catch (_) {}
      updatePlayerBar();
    };

    container.querySelector("#qap-step-start-dec")?.addEventListener("click", () => {
      updateInputs(repeatRangeStart - 1, repeatRangeEnd);
    });
    container.querySelector("#qap-step-start-inc")?.addEventListener("click", () => {
      updateInputs(repeatRangeStart + 1, Math.max(repeatRangeStart + 1, repeatRangeEnd));
    });
    container.querySelector("#qap-step-end-dec")?.addEventListener("click", () => {
      updateInputs(repeatRangeStart, Math.max(repeatRangeStart, repeatRangeEnd - 1));
    });
    container.querySelector("#qap-step-end-inc")?.addEventListener("click", () => {
      updateInputs(repeatRangeStart, repeatRangeEnd + 1);
    });

    startInput?.addEventListener("change", (e) => {
      updateInputs(+e.target.value, repeatRangeEnd);
    });
    endInput?.addEventListener("change", (e) => {
      updateInputs(repeatRangeStart, +e.target.value);
    });

    container.querySelector("#qap-preset-para")?.addEventListener("click", () => {
      updateInputs(chunkStart, chunkEnd);
      setRepeatMode("para");
    });
    container.querySelector("#qap-preset-single")?.addEventListener("click", () => {
      updateInputs(curAyah, curAyah);
      setRepeatMode("ayah");
    });
    container.querySelector("#qap-preset-3")?.addEventListener("click", () => {
      updateInputs(curAyah, Math.min(totalVerses, curAyah + 2));
      setRepeatMode("range");
    });
    container.querySelector("#qap-preset-5")?.addEventListener("click", () => {
      updateInputs(curAyah, Math.min(totalVerses, curAyah + 4));
      setRepeatMode("range");
    });
    container.querySelector("#qap-preset-all")?.addEventListener("click", () => {
      updateInputs(1, totalVerses);
      setRepeatMode("range");
    });

    container.querySelectorAll(".qap-cnt-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        repeatLimit = +btn.dataset.limit;
        repeatCurrentIteration = 1;
        try {
          localStorage.setItem(STORAGE_REPEAT_LIMIT, String(repeatLimit));
        } catch (_) {}
        container.querySelectorAll(".qap-cnt-pill").forEach((b) => {
          b.classList.toggle("active", +b.dataset.limit === repeatLimit);
        });
        updatePlayerBar();
      });
    });

    container.querySelector("#qap-apply-repeat")?.addEventListener("click", () => {
      closeChooser();
      if (repeatMode === "range") {
        playAyah(sId, repeatRangeStart);
      } else if (repeatMode === "para") {
        playAyah(sId, chunkStart);
      } else if (repeatMode === "ayah") {
        playAyah(sId, curAyah);
      } else {
        if (!isPlaying) resume();
      }
    });
  }

  function openQuickNote() {
    const surah = currentSurahId || (window.currentSurah ? window.currentSurah.id : 1);
    const ayah = currentAyahNum || 1;
    if (typeof window.openTadabburEditor === "function") {
      window.openTadabburEditor({ surah, from: ayah, to: ayah });
    } else {
      console.warn("openTadabburEditor not available");
    }
  }

  function updatePlayerBar() {
    const bar = document.getElementById("quran-audio-player");
    if (!bar) return;

    if (!currentSurahId || !currentAyahNum) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;

    const reciterEl = document.getElementById("qap-reciter");
    const trackEl = document.getElementById("qap-track");
    const playBtn = document.getElementById("qap-play");
    const contBtn = document.getElementById("qap-continuous");
    const engBtn = document.getElementById("qap-english");
    const fmtBtn = document.getElementById("qap-format");
    const speedBtn = document.getElementById("qap-speed");

    const sName = getSurahName(currentSurahId);
    const isPara = isParagraphMode();

    if (reciterEl) {
      if (playPhase === "english") {
        if (activeSpeechType === "ai_translation") {
          reciterEl.textContent = (!speechActive && englishAudio.src && !aiAudioFallbackTriggered)
            ? "English AI Translation (Studio Neural)"
            : "English AI Translation (Natural Voice)";
          reciterEl.classList.add("speaking-english");
        } else if (activeSpeechType === "tafsir") {
          reciterEl.textContent = "AI Tafsir (Natural Voice)";
          reciterEl.classList.add("speaking-english");
        } else if (activeSpeechType === "custom") {
          reciterEl.textContent = "My Translation (Natural Voice)";
          reciterEl.classList.add("speaking-english");
        } else {
          reciterEl.textContent = "Ibrahim Walk (Studio English)";
          reciterEl.classList.add("speaking-english");
        }
      } else {
        reciterEl.textContent = "Mishary Rashid Alafasy";
        reciterEl.classList.remove("speaking-english");
      }
    }

    if (trackEl) {
      let loopTag = "";
      if (repeatMode === "ayah") loopTag = " 🔂";
      else if (repeatMode === "para") loopTag = " 🔁 Para";
      else if (repeatMode === "range") loopTag = ` 🔁 ${Math.min(repeatRangeStart, repeatRangeEnd)}–${Math.max(repeatRangeStart, repeatRangeEnd)}`;

      if (isPara && currentChunk) {
        const start = currentChunk[0].ayah;
        const end = currentChunk[currentChunk.length - 1].ayah;
        const typeLabel = activeSpeechType === "tafsir" ? " [AI Tafsir]" : activeSpeechType === "ai_translation" ? " [AI Trans]" : " [English]";
        const phaseSuffix = playPhase === "english" ? typeLabel : "";
        trackEl.textContent = `${sName} · ${currentSurahId}:${start}–${end} (Ayah ${currentAyahNum})${phaseSuffix}${loopTag}`;
      } else {
        const typeLabel = activeSpeechType === "tafsir" ? " [AI Tafsir]" : activeSpeechType === "ai_translation" ? " [AI Trans]" : " [English]";
        const phaseSuffix = playPhase === "english" ? typeLabel : "";
        trackEl.textContent = `${sName} · ${currentSurahId}:${currentAyahNum}${phaseSuffix}${loopTag}`;
      }
    }

    if (playBtn) {
      playBtn.textContent = isPlaying ? "⏸" : "▶";
      playBtn.title = isPlaying ? "Pause (Space)" : "Play (Space)";
      playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    }

    if (contBtn) {
      contBtn.classList.remove("repeat-ayah", "repeat-para", "repeat-range", "repeat-single");
      const countSuffix = (repeatLimit > 0) ? ` (${repeatCurrentIteration}/${repeatLimit})` : "";

      if (repeatMode === "cont") {
        contBtn.classList.add("active");
        contBtn.textContent = "🔁 Cont.";
        contBtn.title = "Repeat: Continuous (plays whole Sūrah). Click to cycle mode, or right-click / drawer to customize.";
      } else if (repeatMode === "ayah") {
        contBtn.classList.add("active", "repeat-ayah");
        contBtn.textContent = `🔂 Ayah${countSuffix}`;
        contBtn.title = `Repeat: 1 Ayah (looping Ayah ${currentAyahNum || 1}${countSuffix}). Click to cycle mode, or right-click / drawer to customize.`;
      } else if (repeatMode === "para") {
        contBtn.classList.add("active", "repeat-para");
        contBtn.textContent = `🔁 Para${countSuffix}`;
        const chunkInfo = findChunkForAyah(currentSurahId, currentAyahNum);
        const rLabel = chunkInfo ? ` (${chunkInfo.chunk[0].ayah}–${chunkInfo.chunk[chunkInfo.chunk.length - 1].ayah})` : "";
        contBtn.title = `Repeat: Paragraph${rLabel}${countSuffix}. Click to cycle mode, or right-click / drawer to customize.`;
      } else if (repeatMode === "range") {
        contBtn.classList.add("active", "repeat-range");
        const s = Math.min(repeatRangeStart, repeatRangeEnd);
        const e = Math.max(repeatRangeStart, repeatRangeEnd);
        contBtn.textContent = `🔁 ${s}–${e}${countSuffix}`;
        contBtn.title = `Repeat: Range (Ayahs ${s} to ${e}${countSuffix}). Click to cycle mode, or right-click / drawer to customize.`;
      } else {
        contBtn.classList.remove("active");
        contBtn.textContent = "⏸ Once";
        contBtn.title = "Repeat: Off (plays once and pauses). Click to cycle mode.";
      }
    }

    if (engBtn) {
      engBtn.classList.toggle("active", includeEnglish);
      if (!includeEnglish) {
        engBtn.textContent = "🌐 Eng: OFF";
        engBtn.title = "English audio disabled. Click to enable.";
      } else {
        const content = getDisplayedEnglishContent(currentSurahId, currentAyahNum);
        if (content.type === "ai_translation") {
          engBtn.textContent = "🌐 AI Trans";
          engBtn.title = "English: AI Translation (Natural Voice). Click to toggle.";
        } else if (content.type === "tafsir") {
          engBtn.textContent = "🌐 AI Tafsir";
          engBtn.title = "English: AI Tafsir (Natural Voice). Click to toggle.";
        } else {
          engBtn.textContent = "🌐 Studio Eng";
          engBtn.title = "English: Ibrahim Walk Studio Recitation. Click to toggle.";
        }
      }
    }

    if (fmtBtn) {
      if (playbackFormat === "auto") {
        const isBook = window.prefs?.layoutMode === "book";
        fmtBtn.textContent = isBook ? "📄 Para (Auto)" : "📜 Verse (Auto)";
        fmtBtn.title = `Format: Auto (follows ${isBook ? "Book" : "Verse"} view). Click to switch.`;
      } else if (playbackFormat === "paragraph") {
        fmtBtn.textContent = "📄 Para";
        fmtBtn.title = "Format: Paragraph mode (always plays chunks). Click to switch.";
      } else {
        fmtBtn.textContent = "📜 Verse";
        fmtBtn.title = "Format: Sentence mode (always plays ayah-by-ayah). Click to switch.";
      }
    }

    if (speedBtn) {
      speedBtn.textContent = `${playbackRate}x`;
    }

    const toolbarBtn = document.getElementById("toolbar-play-surah");
    if (toolbarBtn) {
      toolbarBtn.textContent = isPlaying ? "⏸ Pause" : "▶ Listen";
      toolbarBtn.classList.toggle("playing", isPlaying);
    }
  }

  function playArabicAyah(surahId, ayahNum, { autoScroll = true } = {}) {
    englishAudio.pause();
    stopEnglishSpeech();
    currentSurahId = +surahId;
    currentAyahNum = +ayahNum;
    playPhase = "arabic";
    usingArabicFallback = false;

    // Instant UI reaction
    isPlaying = true;
    highlightArabicAyah(currentSurahId, currentAyahNum);
    clearEnglishHighlights();
    const progressEl = document.getElementById("qap-progress");
    if (progressEl) {
      progressEl.value = 0;
      progressEl.style.setProperty("--seek-pct", "0%");
    }
    updatePlayerBar();
    updateMediaSession();
    if (autoScroll) scrollToAyah(currentSurahId, currentAyahNum);

    const url = getArabicAudioUrl(currentSurahId, currentAyahNum, false);
    arabicAudio.src = url;
    arabicAudio.playbackRate = playbackRate;

    // Preload English audio for this ayah if studio audio will be used
    if (includeEnglish) {
      const content = getDisplayedEnglishContent(currentSurahId, currentAyahNum);
      if (content.useStudio) {
        englishAudio.src = getEnglishAudioUrl(currentSurahId, currentAyahNum, false);
        englishAudio.load();
      }
    }

    arabicAudio
      .play()
      .then(() => {
        isPlaying = true;
        updatePlayerBar();
      })
      .catch((err) => {
        console.warn("Primary Arabic audio failed, trying fallback", err);
        usingArabicFallback = true;
        arabicAudio.src = getArabicAudioUrl(currentSurahId, currentAyahNum, true);
        arabicAudio.playbackRate = playbackRate;
        arabicAudio
          .play()
          .then(() => {
            isPlaying = true;
            updatePlayerBar();
          })
          .catch((e) => {
            console.warn("Fallback recitation playback failed", e);
            isPlaying = false;
            highlightArabicAyah(currentSurahId, currentAyahNum);
            updatePlayerBar();
          });
      });
  }

  function fallbackToAiSpeech() {
    if (aiAudioFallbackTriggered) return;
    aiAudioFallbackTriggered = true;
    try {
      englishAudio.pause();
    } catch (_) {}
    const content = getDisplayedEnglishContent(currentSurahId, currentAyahNum);
    updatePlayerBar();
    updateMediaSession();
    speakNaturalText(content.text, handleEnglishEnded);
  }

  function playEnglishAyah(surahId, ayahNum, { autoScroll = true } = {}) {
    arabicAudio.pause();
    stopEnglishSpeech();
    playPhase = "english";
    currentSurahId = +surahId;
    currentAyahNum = +ayahNum;
    usingEnglishFallback = false;

    // Detect what content is currently displayed
    const content = getDisplayedEnglishContent(currentSurahId, currentAyahNum);
    activeSpeechType = content.type;

    isPlaying = true;
    clearArabicHighlights();
    highlightEnglishSegment(currentAyahNum);
    const progressEl = document.getElementById("qap-progress");
    if (progressEl) {
      progressEl.value = 0;
      progressEl.style.setProperty("--seek-pct", "0%");
    }
    updatePlayerBar();
    updateMediaSession();

    if (content.useStudio) {
      const url = getEnglishAudioUrl(currentSurahId, currentAyahNum, false);
      englishAudio.src = url;
      englishAudio.playbackRate = playbackRate;

      englishAudio
        .play()
        .then(() => {
          isPlaying = true;
          updatePlayerBar();
        })
        .catch((err) => {
          console.warn("Primary English audio failed, trying fallback", err);
          usingEnglishFallback = true;
          englishAudio.src = getEnglishAudioUrl(currentSurahId, currentAyahNum, true);
          englishAudio.playbackRate = playbackRate;
          englishAudio
            .play()
            .then(() => {
              isPlaying = true;
              updatePlayerBar();
            })
            .catch((e) => {
              console.warn("Fallback English audio failed", e);
              handleEnglishEnded();
            });
        });
    } else if (content.type === "ai_translation") {
      aiAudioFallbackTriggered = false;
      const url = getAiTranslationAudioUrl(currentSurahId, currentAyahNum);
      englishAudio.src = url;
      englishAudio.playbackRate = playbackRate;

      englishAudio
        .play()
        .then(() => {
          isPlaying = true;
          updatePlayerBar();
        })
        .catch((err) => {
          console.warn("Studio AI audio file unavailable, falling back to natural speech synthesis", err);
          fallbackToAiSpeech();
        });
    } else {
      // Natural speech synthesis for AI tafsir, or custom edits
      speakNaturalText(content.text, handleEnglishEnded);
    }
  }

  function playAyah(surahId, ayahNum, { autoScroll = true } = {}) {
    currentSurahId = +(surahId || (window.currentSurah ? window.currentSurah.id : 1));
    currentAyahNum = +(ayahNum || 1);
    chunkStartAyah = currentAyahNum;

    const isPara = isParagraphMode();
    if (isPara) {
      const chunkInfo = findChunkForAyah(currentSurahId, currentAyahNum);
      if (chunkInfo) {
        currentChunk = chunkInfo.chunk;
      }
    } else {
      currentChunk = null;
    }

    playArabicAyah(currentSurahId, currentAyahNum, { autoScroll });
  }

  function startEnglishPhaseForChunk(chunk) {
    playPhase = "english";
    clearArabicHighlights();
    currentChunk = chunk;
    updatePlayerBar();

    const startAt = (chunkStartAyah && chunk.some((a) => a.ayah === chunkStartAyah))
      ? chunkStartAyah
      : chunk[0].ayah;

    const rangeEnd = (repeatMode === "range") ? Math.max(repeatRangeStart, repeatRangeEnd) : Infinity;
    const speakAyahs = chunk.filter((a) => a.ayah >= startAt && a.ayah <= rangeEnd);
    if (!speakAyahs.length) {
      onChunkAudioFinished(chunk);
      return;
    }

    currentChunkEnglishIndex = chunk.findIndex((a) => a.ayah === speakAyahs[0].ayah);

    // Scroll chunk's translation section into view
    const chunkEl = document.querySelector(`.book-chunk[data-start="${chunk[0].ayah}"]`)
      || document.getElementById(`ayah-${currentSurahId}-${chunk[0].ayah}`)?.closest(".book-chunk");
    const transSec = chunkEl?.querySelector(".book-translation-section");
    if (transSec) {
      transSec.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Check if Passage Tafsir is active for this chunk in Book mode
    const isBook = window.prefs?.layoutMode === "book";
    const bookContent = window.prefs?.bookContent || {};
    const studyShow = window.prefs?.studyShow || {};
    const isPassageTafsir = (isBook && bookContent.passageTafsir) || studyShow.passageTafsir;

    if (isPassageTafsir) {
      const content = getDisplayedEnglishContent(currentSurahId, chunk[0].ayah);
      if (content.type === "tafsir" && content.text) {
        stopEnglishSpeech();
        englishAudio.pause();
        activeSpeechType = "tafsir";
        currentAyahNum = chunk[0].ayah;
        isPlaying = true;
        highlightEnglishSegment(currentAyahNum);
        updatePlayerBar();
        updateMediaSession();
        speakNaturalText(content.text, () => {
          clearEnglishHighlights();
          onChunkAudioFinished(chunk);
        });
        return;
      }
    }

    const firstEnglishAyah = chunk[currentChunkEnglishIndex].ayah;
    playEnglishAyah(currentSurahId, firstEnglishAyah);
  }

  function handleArabicEnded() {
    if (!isPlaying || playPhase !== "arabic") return;

    if (repeatMode === "ayah") {
      if (includeEnglish) {
        playEnglishAyah(currentSurahId, currentAyahNum);
      } else {
        onAyahLoopFinished();
      }
      return;
    }

    const isPara = isParagraphMode();
    if (isPara) {
      const chunkInfo = findChunkForAyah(currentSurahId, currentAyahNum);
      if (!chunkInfo) {
        if (includeEnglish) {
          playEnglishAyah(currentSurahId, currentAyahNum);
        } else {
          onSentenceAudioFinished();
        }
        return;
      }

      currentChunk = chunkInfo.chunk;
      const lastAyahInChunk = currentChunk[currentChunk.length - 1].ayah;
      const rangeEnd = (repeatMode === "range") ? Math.max(repeatRangeStart, repeatRangeEnd) : Infinity;
      const effectiveLastAyah = Math.min(lastAyahInChunk, rangeEnd);

      if (currentAyahNum < effectiveLastAyah) {
        // More Arabic ayahs remain in this paragraph (or range)
        playArabicAyah(currentSurahId, currentAyahNum + 1);
      } else {
        // Reached end of the Arabic paragraph (or range)
        if (includeEnglish) {
          startEnglishPhaseForChunk(currentChunk);
        } else {
          onChunkAudioFinished(currentChunk);
        }
      }
    } else {
      // Sentence mode
      if (includeEnglish) {
        playEnglishAyah(currentSurahId, currentAyahNum);
      } else {
        onSentenceAudioFinished();
      }
    }
  }

  function handleEnglishEnded() {
    if (!isPlaying || playPhase !== "english") return;

    if (repeatMode === "ayah") {
      onAyahLoopFinished();
      return;
    }

    const isPara = isParagraphMode();
    if (isPara && currentChunk) {
      const rangeEnd = (repeatMode === "range") ? Math.max(repeatRangeStart, repeatRangeEnd) : Infinity;
      currentChunkEnglishIndex++;

      if (currentChunkEnglishIndex < currentChunk.length) {
        const nextAyahInChunk = currentChunk[currentChunkEnglishIndex].ayah;
        if (nextAyahInChunk <= rangeEnd) {
          playEnglishAyah(currentSurahId, nextAyahInChunk);
          return;
        }
      }

      // Reached end of English paragraph or range limit
      clearEnglishHighlights();
      onChunkAudioFinished(currentChunk);
    } else {
      // Sentence mode
      clearEnglishHighlights();
      onSentenceAudioFinished();
    }
  }

  function shouldStopRepeat() {
    if (repeatLimit > 0) {
      if (repeatCurrentIteration >= repeatLimit) {
        repeatCurrentIteration = 1;
        pause();
        return true;
      }
      repeatCurrentIteration++;
      updatePlayerBar();
    }
    return false;
  }

  function onAyahLoopFinished() {
    clearArabicHighlights();
    clearEnglishHighlights();
    if (repeatMode === "single") {
      pause();
      return;
    }
    if (shouldStopRepeat()) return;
    playAyah(currentSurahId, currentAyahNum);
  }

  function onSentenceAudioFinished() {
    clearArabicHighlights();
    clearEnglishHighlights();

    if (repeatMode === "ayah") {
      onAyahLoopFinished();
      return;
    }

    if (repeatMode === "para") {
      const chunkInfo = findChunkForAyah(currentSurahId, currentAyahNum);
      if (chunkInfo) {
        const endAyah = chunkInfo.chunk[chunkInfo.chunk.length - 1].ayah;
        if (currentAyahNum < endAyah) {
          playAyah(currentSurahId, currentAyahNum + 1);
        } else {
          if (shouldStopRepeat()) return;
          playAyah(currentSurahId, chunkInfo.chunk[0].ayah);
        }
      } else {
        advanceAfterSentence();
      }
      return;
    }

    if (repeatMode === "range") {
      const rStart = Math.min(repeatRangeStart, repeatRangeEnd);
      const rEnd = Math.max(repeatRangeStart, repeatRangeEnd);
      if (currentAyahNum < rEnd) {
        playAyah(currentSurahId, currentAyahNum + 1);
      } else {
        if (shouldStopRepeat()) return;
        playAyah(currentSurahId, rStart);
      }
      return;
    }

    if (repeatMode === "single") {
      pause();
      return;
    }

    advanceAfterSentence();
  }

  function onChunkAudioFinished(chunk) {
    clearArabicHighlights();
    clearEnglishHighlights();

    if (repeatMode === "ayah") {
      onAyahLoopFinished();
      return;
    }

    if (repeatMode === "para") {
      if (shouldStopRepeat()) return;
      playAyah(currentSurahId, chunk[0].ayah);
      return;
    }

    if (repeatMode === "range") {
      const rStart = Math.min(repeatRangeStart, repeatRangeEnd);
      const rEnd = Math.max(repeatRangeStart, repeatRangeEnd);
      if (currentAyahNum < rEnd) {
        const nextAyah = currentAyahNum + 1;
        const total = getTotalVerses(currentSurahId);
        if (nextAyah <= total) {
          playAyah(currentSurahId, nextAyah);
        } else {
          if (shouldStopRepeat()) return;
          playAyah(currentSurahId, rStart);
        }
      } else {
        if (shouldStopRepeat()) return;
        playAyah(currentSurahId, rStart);
      }
      return;
    }

    if (repeatMode === "single") {
      pause();
      return;
    }

    advanceAfterChunk(chunk);
  }

  function advanceAfterSentence() {
    const total = getTotalVerses(currentSurahId);
    if (currentAyahNum < total) {
      playAyah(currentSurahId, currentAyahNum + 1);
    } else if (currentSurahId < 114) {
      const nextSurah = currentSurahId + 1;
      if (window.location.hash !== `#/${nextSurah}`) {
        window.location.hash = `#/${nextSurah}`;
      }
      setTimeout(() => playAyah(nextSurah, 1), 350);
    } else {
      pause();
    }
  }

  function advanceAfterChunk(chunk) {
    const nextAyahNum = chunk[chunk.length - 1].ayah + 1;
    const total = getTotalVerses(currentSurahId);
    if (nextAyahNum <= total) {
      playAyah(currentSurahId, nextAyahNum);
    } else if (currentSurahId < 114) {
      const nextSurah = currentSurahId + 1;
      if (window.location.hash !== `#/${nextSurah}`) {
        window.location.hash = `#/${nextSurah}`;
      }
      setTimeout(() => playAyah(nextSurah, 1), 350);
    } else {
      pause();
    }
  }

  function pause() {
    arabicAudio.pause();
    englishAudio.pause();
    if (speechActive && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    isPlaying = false;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    clearArabicHighlights();
    clearEnglishHighlights();
    updatePlayerBar();
  }

  function resume() {
    if (!currentSurahId || !currentAyahNum) {
      const sId = window.currentSurah ? window.currentSurah.id : 1;
      playAyah(sId, 1);
      return;
    }

    isPlaying = true;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    if (playPhase === "english") {
      if (activeSpeechType === "ai_translation" && !aiAudioFallbackTriggered && englishAudio.src) {
        englishAudio.play().catch((e) => {
          console.warn("English AI audio resume failed, falling back to speech", e);
          fallbackToAiSpeech();
        });
      } else if (activeSpeechType !== "studio") {
        if (speechSentences.length > 0) {
          const resumeIdx = Math.max(0, speechSentenceIndex > 0 ? speechSentenceIndex - 1 : 0);
          const remaining = speechSentences.slice(resumeIdx).join(" ");
          speakNaturalText(remaining, handleEnglishEnded);
        } else {
          playEnglishAyah(currentSurahId, currentAyahNum);
        }
      } else {
        englishAudio.play().catch((e) => console.warn("English resume failed", e));
      }
      highlightEnglishSegment(currentAyahNum);
    } else {
      arabicAudio.play().catch((e) => console.warn("Arabic resume failed", e));
      highlightArabicAyah(currentSurahId, currentAyahNum);
    }
    updatePlayerBar();
    updateMediaSessionPosition();
  }

  function togglePlay() {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }

  function toggleAyah(surahId, ayahNum) {
    const sId = +(surahId || (window.currentSurah ? window.currentSurah.id : 1));
    const aNum = +(ayahNum || 1);
    if (currentSurahId === sId && currentAyahNum === aNum && isPlaying) {
      pause();
    } else if (currentSurahId === sId && currentAyahNum === aNum && !isPlaying) {
      resume();
    } else {
      playAyah(sId, aNum);
    }
  }

  function nextAyah() {
    if (!currentSurahId || !currentAyahNum) return;
    arabicAudio.pause();
    englishAudio.pause();
    stopEnglishSpeech();

    const isPara = isParagraphMode();
    if (isPara) {
      const chunkInfo = findChunkForAyah(currentSurahId, currentAyahNum);
      if (chunkInfo) {
        advanceAfterChunk(chunkInfo.chunk);
        return;
      }
    }
    advanceAfterSentence();
  }

  function prevAyah() {
    if (!currentSurahId || !currentAyahNum) return;
    arabicAudio.pause();
    englishAudio.pause();
    stopEnglishSpeech();

    const isPara = isParagraphMode();
    if (isPara) {
      const chunkInfo = findChunkForAyah(currentSurahId, currentAyahNum);
      if (chunkInfo) {
        if (currentAyahNum > chunkInfo.chunk[0].ayah || playPhase === "english") {
          playAyah(currentSurahId, chunkInfo.chunk[0].ayah);
          return;
        }
        if (chunkInfo.index > 0) {
          const allChunks = getChunksForSurah(currentSurahId);
          const prevChunk = allChunks[chunkInfo.index - 1];
          playAyah(currentSurahId, prevChunk[0].ayah);
          return;
        }
      }
    }

    const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
    if (activeAudio.currentTime > 2.5) {
      activeAudio.currentTime = 0;
      resume();
      return;
    }
    if (currentAyahNum > 1) {
      playAyah(currentSurahId, currentAyahNum - 1);
    } else if (currentSurahId > 1) {
      const prevSurah = currentSurahId - 1;
      window.location.hash = `#/${prevSurah}`;
      setTimeout(() => {
        const total = getTotalVerses(prevSurah);
        playAyah(prevSurah, total);
      }, 350);
    }
  }

  function playWord(surahId, ayahNum, wordIndex, triggerEl) {
    wordAudio.pause();
    const url = getWordAudioUrl(surahId, ayahNum, wordIndex);
    wordAudio.src = url;
    wordAudio.playbackRate = playbackRate;

    const el = triggerEl || document.querySelector(`.q-word[data-s="${surahId}"][data-a="${ayahNum}"][data-i="${wordIndex}"]`);
    if (el) {
      el.classList.add("word-audio-playing");
      const clearWordHighlight = () => el.classList.remove("word-audio-playing");
      wordAudio.onended = clearWordHighlight;
      wordAudio.onerror = clearWordHighlight;
    }

    wordAudio.play().catch((e) => {
      console.warn("Word audio play failed", e);
      if (el) el.classList.remove("word-audio-playing");
    });
  }

  function toggleContinuous() {
    cycleRepeatMode();
  }

  function toggleEnglish() {
    includeEnglish = !includeEnglish;
    try {
      localStorage.setItem(STORAGE_ENG, String(includeEnglish));
    } catch (_) {}

    if (!includeEnglish && playPhase === "english") {
      englishAudio.pause();
      stopEnglishSpeech();
      clearEnglishHighlights();
      if (isParagraphMode() && currentChunk) {
        onChunkAudioFinished(currentChunk);
      } else {
        onSentenceAudioFinished();
      }
    }
    updatePlayerBar();
  }

  function cycleFormat() {
    const modes = ["auto", "paragraph", "sentence"];
    const idx = modes.indexOf(playbackFormat);
    playbackFormat = modes[(idx + 1) % modes.length];
    try {
      localStorage.setItem(STORAGE_FORMAT, playbackFormat);
    } catch (_) {}
    updatePlayerBar();
  }

  function cycleSpeed() {
    const rates = [1.0, 0.75, 1.25];
    const idx = rates.indexOf(playbackRate);
    playbackRate = rates[(idx + 1) % rates.length];
    arabicAudio.playbackRate = playbackRate;
    englishAudio.playbackRate = playbackRate;
    wordAudio.playbackRate = playbackRate;
    try {
      localStorage.setItem(STORAGE_RATE, String(playbackRate));
    } catch (_) {}
    updatePlayerBar();
  }

  function closePlayer() {
    arabicAudio.pause();
    englishAudio.pause();
    stopEnglishSpeech();
    pause();
    currentSurahId = null;
    currentAyahNum = null;
    currentChunk = null;
    clearArabicHighlights();
    clearEnglishHighlights();
    const progressEl = document.getElementById("qap-progress");
    if (progressEl) {
      progressEl.value = 0;
      progressEl.style.setProperty("--seek-pct", "0%");
    }
    updatePlayerBar();
    const toolbarBtn = document.getElementById("toolbar-play-surah");
    if (toolbarBtn) {
      toolbarBtn.textContent = "▶ Listen";
      toolbarBtn.classList.remove("playing");
    }
  }

  function bindAudioEvents() {
    const onTimeUpdate = (activeAudio) => {
      if (seeking) return;
      const progress = document.getElementById("qap-progress");
      const curTime = document.getElementById("qap-current-time");
      const durTime = document.getElementById("qap-duration");
      if (progress && activeAudio.duration) {
        const pct = (activeAudio.currentTime / activeAudio.duration) * 100;
        progress.value = pct;
        progress.style.setProperty("--seek-pct", `${pct}%`);
      }
      if (curTime) curTime.textContent = formatTime(activeAudio.currentTime);
      if (durTime && activeAudio.duration) durTime.textContent = formatTime(activeAudio.duration);
      updateMediaSessionPosition();
    };

    arabicAudio.addEventListener("timeupdate", () => {
      if (playPhase === "arabic") onTimeUpdate(arabicAudio);
    });

    englishAudio.addEventListener("timeupdate", () => {
      if (playPhase === "english") onTimeUpdate(englishAudio);
    });

    arabicAudio.addEventListener("ended", handleArabicEnded);
    englishAudio.addEventListener("ended", handleEnglishEnded);

    arabicAudio.addEventListener("error", () => {
      if (!usingArabicFallback && currentSurahId && currentAyahNum) {
        usingArabicFallback = true;
        arabicAudio.src = getArabicAudioUrl(currentSurahId, currentAyahNum, true);
        arabicAudio.play().catch(() => pause());
      } else {
        pause();
      }
    });

    englishAudio.addEventListener("error", () => {
      if (activeSpeechType === "ai_translation" && !aiAudioFallbackTriggered) {
        fallbackToAiSpeech();
        return;
      }
      if (!usingEnglishFallback && currentSurahId && currentAyahNum) {
        usingEnglishFallback = true;
        englishAudio.src = getEnglishAudioUrl(currentSurahId, currentAyahNum, true);
        englishAudio.play().catch(() => handleEnglishEnded());
      } else {
        handleEnglishEnded();
      }
    });

    // Scrubber
    const progressEl = document.getElementById("qap-progress");
    if (progressEl) {
      progressEl.addEventListener("input", () => {
        seeking = true;
        progressEl.style.setProperty("--seek-pct", `${progressEl.value}%`);
        const curTime = document.getElementById("qap-current-time");
        if (playPhase === "english" && speechActive) {
          if (curTime && speechEstimatedDuration > 0) {
            curTime.textContent = formatTime((progressEl.value / 100) * speechEstimatedDuration);
          }
        } else {
          const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
          if (curTime && activeAudio.duration) {
            curTime.textContent = formatTime((progressEl.value / 100) * activeAudio.duration);
          }
        }
      });
      progressEl.addEventListener("change", () => {
        progressEl.style.setProperty("--seek-pct", `${progressEl.value}%`);
        if (playPhase === "english" && speechActive) {
          if (speechSentences.length > 0 && speechEstimatedDuration > 0) {
            const pct = progressEl.value / 100;
            const targetIdx = Math.min(
              speechSentences.length - 1,
              Math.max(0, Math.floor(pct * speechSentences.length))
            );
            speechSentenceIndex = targetIdx;
            const remaining = speechSentences.slice(speechSentenceIndex).join(" ");
            speakNaturalText(remaining, handleEnglishEnded);
          }
        } else {
          const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
          if (activeAudio.duration) {
            activeAudio.currentTime = (progressEl.value / 100) * activeAudio.duration;
          }
        }
        seeking = false;
        updateMediaSessionPosition();
      });
    }

    document.getElementById("qap-play")?.addEventListener("click", togglePlay);
    document.getElementById("qap-prev")?.addEventListener("click", prevAyah);
    document.getElementById("qap-next")?.addEventListener("click", nextAyah);
    const contBtn = document.getElementById("qap-continuous");
    if (contBtn) {
      contBtn.addEventListener("click", (e) => {
        e.preventDefault();
        cycleRepeatMode();
      });
      contBtn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openChooser("repeat");
      });
    }
    document.getElementById("qap-english")?.addEventListener("click", toggleEnglish);
    document.getElementById("qap-format")?.addEventListener("click", cycleFormat);
    document.getElementById("qap-speed")?.addEventListener("click", cycleSpeed);
    document.getElementById("qap-close")?.addEventListener("click", closePlayer);
    document.getElementById("qap-note")?.addEventListener("click", openQuickNote);
    document.getElementById("qap-track-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleChooser();
    });
    document.getElementById("qap-chooser-close")?.addEventListener("click", closeChooser);
    document.querySelectorAll(".qap-chooser-tabs .qap-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchChooserTab(btn.dataset.tab));
    });
    document.getElementById("qap-surah-search")?.addEventListener("input", (e) => {
      renderSurahChooser(e.target.value);
    });
    document.getElementById("qap-prev-surah-btn")?.addEventListener("click", () => {
      if (verseChooserSurahId > 1) renderVerseChooser(verseChooserSurahId - 1);
    });
    document.getElementById("qap-next-surah-btn")?.addEventListener("click", () => {
      if (verseChooserSurahId < 114) renderVerseChooser(verseChooserSurahId + 1);
    });

    // Click outside to close chooser
    document.addEventListener("click", (e) => {
      if (chooserOpen) {
        const drawer = document.getElementById("qap-chooser-drawer");
        const trackBtn = document.getElementById("qap-track-btn");
        if (drawer && !drawer.contains(e.target) && (!trackBtn || !trackBtn.contains(e.target))) {
          closeChooser();
        }
      }
    });

    document.getElementById("header-audio-btn")?.addEventListener("click", () => {
      const bar = document.getElementById("quran-audio-player");
      if (bar && !bar.hidden && isPlaying) {
        pause();
      } else {
        resume();
      }
    });

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape" && chooserOpen) {
        closeChooser();
        return;
      }

      if (e.code === "Space") {
        const bar = document.getElementById("quran-audio-player");
        if (bar && !bar.hidden) {
          e.preventDefault();
          togglePlay();
        }
      } else if (e.key === "j" || e.key === "J") {
        const bar = document.getElementById("quran-audio-player");
        if (bar && !bar.hidden) {
          e.preventDefault();
          prevAyah();
        }
      } else if (e.key === "k" || e.key === "K") {
        const bar = document.getElementById("quran-audio-player");
        if (bar && !bar.hidden) {
          e.preventDefault();
          nextAyah();
        }
      }
    });

    // Delegate clicks on word audio buttons
    document.addEventListener("click", (e) => {
      const playWordBtn = e.target.closest("[data-play-word]");
      if (playWordBtn) {
        e.stopPropagation();
        const parts = playWordBtn.dataset.playWord.split("-");
        if (parts.length >= 3) {
          playWord(+parts[0], +parts[1], parts[2], playWordBtn.closest(".q-word") || playWordBtn);
        }
      }
    });
  }

  function init() {
    bindAudioEvents();
    updatePlayerBar();
  }

  const api = {
    init,
    playAyah,
    toggleAyah,
    togglePlay,
    pause,
    resume,
    nextAyah,
    prevAyah,
    playWord,
    toggleContinuous,
    toggleEnglish,
    cycleFormat,
    cycleSpeed,
    closePlayer,
    openChooser,
    closeChooser,
    toggleChooser,
    openQuickNote,
    setRepeatMode,
    cycleRepeatMode,
    getRepeatMode: () => ({
      mode: repeatMode,
      start: repeatRangeStart,
      end: repeatRangeEnd,
      limit: repeatLimit,
      iteration: repeatCurrentIteration,
    }),
    updateHighlights: () => {
      if (playPhase === "arabic") {
        highlightArabicAyah(currentSurahId, currentAyahNum);
      } else {
        highlightEnglishSegment(currentAyahNum);
      }
    },
    isPlayingAyah: (s, a) => isPlaying && currentSurahId === +s && currentAyahNum === +a,
    getCurrentAyah: () => ({ surah: currentSurahId, ayah: currentAyahNum, isPlaying, playPhase }),
    onSurahRendered: () => {
      if (playPhase === "arabic") {
        highlightArabicAyah(currentSurahId, currentAyahNum);
      } else {
        highlightEnglishSegment(currentAyahNum);
      }
      updatePlayerBar();
    },
    onLayoutChanged: () => {
      updatePlayerBar();
    },
  };

  window.QuranAudio = api;
  return api;
})();

window.QuranAudio = QuranAudio;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", QuranAudio.init);
} else {
  QuranAudio.init();
}
