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

  let currentSurahId = null;
  let currentAyahNum = null;
  let isPlaying = false;
  let playPhase = "arabic"; // "arabic" | "english"
  let continuous = localStorage.getItem(STORAGE_CONT) !== "false";
  let includeEnglish = localStorage.getItem(STORAGE_ENG) !== "false";
  let playbackFormat = localStorage.getItem(STORAGE_FORMAT) || "auto"; // "auto" | "paragraph" | "sentence"
  let playbackRate = parseFloat(localStorage.getItem(STORAGE_RATE)) || 1.0;
  let seeking = false;

  // Active chunk tracking for Paragraph mode
  let currentChunk = null; // array of ayah objects in active chunk
  let chunkStartAyah = null; // ayah number where playback of the chunk started
  let currentChunkEnglishIndex = 0; // index within chunk being spoken in English

  // Dedicated HTML audio elements
  const arabicAudio = new Audio();
  const englishAudio = new Audio();
  const wordAudio = new Audio();

  arabicAudio.preload = "auto";
  englishAudio.preload = "auto";

  let usingArabicFallback = false;
  let usingEnglishFallback = false;

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
      // In Book view: highlight chunk's translation section & active ayah segment
      const start = currentChunk[0].ayah;
      const chunkEl = document.querySelector(`.book-chunk[data-start="${start}"]`)
        || document.getElementById(`ayah-${currentSurahId}-${start}`)?.closest(".book-chunk");
      if (chunkEl) {
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
      // In Verse / WBW view: highlight translation block of active ayah
      const block = document.getElementById(`ayah-${currentSurahId}-${ayahNum}`);
      if (block) {
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

    let title = `${sName} · Ayah ${currentAyahNum}`;
    let artist = "Mishary Rashid Alafasy";

    if (playPhase === "english") {
      artist = "Ibrahim Walk (English)";
      if (isPara && currentChunk) {
        const s = currentChunk[0].ayah;
        const e = currentChunk[currentChunk.length - 1].ayah;
        title = `${sName} · ${currentSurahId}:${s}–${e} (Ayah ${currentAyahNum}) [English]`;
      } else {
        title = `${sName} · ${currentSurahId}:${currentAyahNum} [English]`;
      }
    } else if (isPara && currentChunk) {
      const s = currentChunk[0].ayah;
      const e = currentChunk[currentChunk.length - 1].ayah;
      title = `${sName} · ${currentSurahId}:${s}–${e} (Ayah ${currentAyahNum})`;
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

    navigator.mediaSession.setActionHandler("play", () => resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => prevAyah());
    navigator.mediaSession.setActionHandler("nexttrack", () => nextAyah());
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
          if (activeAudio.duration) activeAudio.currentTime = details.seekTime;
        }
      });
    } catch (_) {}
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
        reciterEl.textContent = "Ibrahim Walk (English)";
        reciterEl.classList.add("speaking-english");
      } else {
        reciterEl.textContent = "Mishary Rashid Alafasy";
        reciterEl.classList.remove("speaking-english");
      }
    }

    if (trackEl) {
      if (isPara && currentChunk) {
        const start = currentChunk[0].ayah;
        const end = currentChunk[currentChunk.length - 1].ayah;
        const phaseSuffix = playPhase === "english" ? " [English]" : "";
        trackEl.textContent = `${sName} · ${currentSurahId}:${start}–${end} (Ayah ${currentAyahNum})${phaseSuffix}`;
      } else {
        const phaseSuffix = playPhase === "english" ? " [English]" : "";
        trackEl.textContent = `${sName} · ${currentSurahId}:${currentAyahNum}${phaseSuffix}`;
      }
    }

    if (playBtn) {
      playBtn.textContent = isPlaying ? "⏸" : "▶";
      playBtn.title = isPlaying ? "Pause (Space)" : "Play (Space)";
      playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    }

    if (contBtn) {
      contBtn.classList.toggle("active", continuous);
      contBtn.textContent = continuous ? "🔁 Cont." : "🔂 Single";
      contBtn.title = continuous
        ? "Continuous playback enabled (auto-advances)"
        : "Single playback enabled";
    }

    if (engBtn) {
      engBtn.classList.toggle("active", includeEnglish);
      engBtn.textContent = includeEnglish ? "🌐 Eng: ON" : "🌐 Eng: OFF";
      engBtn.title = includeEnglish
        ? "Real human voice English translation enabled (Ibrahim Walk)"
        : "English translation audio disabled";
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
    currentSurahId = +surahId;
    currentAyahNum = +ayahNum;
    playPhase = "arabic";
    usingArabicFallback = false;

    // Instant UI reaction
    isPlaying = true;
    highlightArabicAyah(currentSurahId, currentAyahNum);
    clearEnglishHighlights();
    updatePlayerBar();
    updateMediaSession();
    if (autoScroll) scrollToAyah(currentSurahId, currentAyahNum);

    const url = getArabicAudioUrl(currentSurahId, currentAyahNum, false);
    arabicAudio.src = url;
    arabicAudio.playbackRate = playbackRate;

    // Preload English audio for this ayah so transition is immediate
    if (includeEnglish) {
      englishAudio.src = getEnglishAudioUrl(currentSurahId, currentAyahNum, false);
      englishAudio.load();
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

  function playEnglishAyah(surahId, ayahNum, { autoScroll = true } = {}) {
    arabicAudio.pause();
    playPhase = "english";
    currentSurahId = +surahId;
    currentAyahNum = +ayahNum;
    usingEnglishFallback = false;

    isPlaying = true;
    clearArabicHighlights();
    highlightEnglishSegment(currentAyahNum);
    updatePlayerBar();
    updateMediaSession();

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

    const speakAyahs = chunk.filter((a) => a.ayah >= startAt);
    if (!speakAyahs.length) {
      advanceAfterChunk(chunk);
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

    const firstEnglishAyah = chunk[currentChunkEnglishIndex].ayah;
    playEnglishAyah(currentSurahId, firstEnglishAyah);
  }

  function handleArabicEnded() {
    if (!isPlaying || playPhase !== "arabic") return;

    const isPara = isParagraphMode();
    if (isPara) {
      const chunkInfo = findChunkForAyah(currentSurahId, currentAyahNum);
      if (!chunkInfo) {
        advanceAfterSentence();
        return;
      }

      currentChunk = chunkInfo.chunk;
      const lastAyahInChunk = currentChunk[currentChunk.length - 1].ayah;

      if (currentAyahNum < lastAyahInChunk) {
        // More Arabic ayahs remain in this paragraph
        playArabicAyah(currentSurahId, currentAyahNum + 1);
      } else {
        // Reached end of the Arabic paragraph
        if (includeEnglish) {
          startEnglishPhaseForChunk(currentChunk);
        } else {
          advanceAfterChunk(currentChunk);
        }
      }
    } else {
      // Sentence mode
      if (includeEnglish) {
        playEnglishAyah(currentSurahId, currentAyahNum);
      } else {
        advanceAfterSentence();
      }
    }
  }

  function handleEnglishEnded() {
    if (!isPlaying || playPhase !== "english") return;

    const isPara = isParagraphMode();
    if (isPara && currentChunk) {
      currentChunkEnglishIndex++;
      if (currentChunkEnglishIndex < currentChunk.length) {
        // Play next ayah in the chunk
        const nextAyahInChunk = currentChunk[currentChunkEnglishIndex].ayah;
        playEnglishAyah(currentSurahId, nextAyahInChunk);
      } else {
        // Reached end of English paragraph
        clearEnglishHighlights();
        if (continuous) {
          advanceAfterChunk(currentChunk);
        } else {
          pause();
        }
      }
    } else {
      // Sentence mode
      clearEnglishHighlights();
      if (continuous) {
        advanceAfterSentence();
      } else {
        pause();
      }
    }
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
    isPlaying = false;
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
    if (playPhase === "english") {
      englishAudio.play().catch((e) => console.warn("English resume failed", e));
      highlightEnglishSegment(currentAyahNum);
    } else {
      arabicAudio.play().catch((e) => console.warn("Arabic resume failed", e));
      highlightArabicAyah(currentSurahId, currentAyahNum);
    }
    updatePlayerBar();
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
    continuous = !continuous;
    try {
      localStorage.setItem(STORAGE_CONT, String(continuous));
    } catch (_) {}
    updatePlayerBar();
  }

  function toggleEnglish() {
    includeEnglish = !includeEnglish;
    try {
      localStorage.setItem(STORAGE_ENG, String(includeEnglish));
    } catch (_) {}

    if (!includeEnglish && playPhase === "english") {
      englishAudio.pause();
      clearEnglishHighlights();
      if (continuous) {
        if (isParagraphMode() && currentChunk) {
          advanceAfterChunk(currentChunk);
        } else {
          advanceAfterSentence();
        }
      } else {
        pause();
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
    pause();
    currentSurahId = null;
    currentAyahNum = null;
    currentChunk = null;
    clearArabicHighlights();
    clearEnglishHighlights();
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
        progress.value = (activeAudio.currentTime / activeAudio.duration) * 100;
      }
      if (curTime) curTime.textContent = formatTime(activeAudio.currentTime);
      if (durTime && activeAudio.duration) durTime.textContent = formatTime(activeAudio.duration);
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
        const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
        const curTime = document.getElementById("qap-current-time");
        if (curTime && activeAudio.duration) {
          curTime.textContent = formatTime((progressEl.value / 100) * activeAudio.duration);
        }
      });
      progressEl.addEventListener("change", () => {
        const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
        if (activeAudio.duration) {
          activeAudio.currentTime = (progressEl.value / 100) * activeAudio.duration;
        }
        seeking = false;
      });
    }

    document.getElementById("qap-play")?.addEventListener("click", togglePlay);
    document.getElementById("qap-prev")?.addEventListener("click", prevAyah);
    document.getElementById("qap-next")?.addEventListener("click", nextAyah);
    document.getElementById("qap-continuous")?.addEventListener("click", toggleContinuous);
    document.getElementById("qap-english")?.addEventListener("click", toggleEnglish);
    document.getElementById("qap-format")?.addEventListener("click", cycleFormat);
    document.getElementById("qap-speed")?.addEventListener("click", cycleSpeed);
    document.getElementById("qap-close")?.addEventListener("click", closePlayer);
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
