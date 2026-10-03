/**
 * Quran Audio Player — Complete recitation by Mishary Rashid Alafasy + English Translation Audio
 *
 * Supports:
 * - Mishary Rashid Alafasy complete Arabic recitation (EveryAyah 128kbps stereo + verses.quran.com fallback)
 * - Hands-free English translation audio (prioritizing AI translation)
 * - Automatic synchronization with active display format:
 *   * Book view (Paragraph mode): recites Arabic chunk -> speaks English AI translation paragraph -> advances to next paragraph
 *   * Verse/WBW view (Sentence mode): recites Arabic ayah -> speaks English AI translation of that ayah -> advances to next ayah
 * - Manual format toggle (Auto follows display, Paragraph forced, Sentence forced)
 * - High-fidelity English speech synthesis with neural/natural UK & US voice selection and Chrome GC protection
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

  const PRIMARY_BASE = "https://everyayah.com/data/Alafasy_128kbps/";
  const FALLBACK_BASE = "https://verses.quran.com/Alafasy/mp3/";
  const WBW_BASE = "https://audio.qurancdn.com/wbw/";

  let currentSurahId = null;
  let currentAyahNum = null;
  let isPlaying = false;
  let playPhase = "arabic"; // "arabic" | "english"
  let continuous = localStorage.getItem(STORAGE_CONT) !== "false";
  let includeEnglish = localStorage.getItem(STORAGE_ENG) !== "false";
  let playbackFormat = localStorage.getItem(STORAGE_FORMAT) || "auto"; // "auto" | "paragraph" | "sentence"
  let playbackRate = parseFloat(localStorage.getItem(STORAGE_RATE)) || 1.0;
  let usingFallback = false;
  let seeking = false;

  // Active chunk tracking for Paragraph mode
  let currentChunk = null; // array of ayah objects in active chunk
  let chunkStartAyah = null; // ayah number where playback of the chunk started
  let activeUtterance = null;
  let bestEnglishVoice = null;
  let speechActive = false;
  let speechSequence = [];
  let speechSequenceIndex = 0;
  let speechCompleteCallback = null;

  const audio = new Audio();
  const wordAudio = new Audio();

  function pad(n, len = 3) {
    return String(n).padStart(len, "0");
  }

  function getAyahAudioUrl(surah, ayah, fallback = false) {
    const s = pad(surah, 3);
    const a = pad(ayah, 3);
    return fallback ? `${FALLBACK_BASE}${s}${a}.mp3` : `${PRIMARY_BASE}${s}${a}.mp3`;
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
    return 286;
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

  function getAyahTranslationText(ayah, surahId) {
    if (!ayah) return "";
    const merged = (typeof window.mergeLocalEdits === "function")
      ? window.mergeLocalEdits(ayah, surahId)
      : ayah;
    // Reza's priority: AI translation first, then standard translation
    if (merged.ai_translation && merged.ai_translation.trim()) {
      return merged.ai_translation.trim();
    }
    if (merged.translation && merged.translation.trim()) {
      return merged.translation.trim();
    }
    if (merged.qf_translation && merged.qf_translation.trim()) {
      return merged.qf_translation.trim();
    }
    return "";
  }

  function cleanEnglishText(text) {
    if (!text) return "";
    return text
      .replace(/<[^>]+>/g, " ") // strip HTML tags
      .replace(/\[\d+\]|\(\d+\)/g, " ") // strip footnote numbers like [1]
      .replace(/[—–]/g, ", ") // convert em/en dashes to gentle comma pauses
      .replace(/\s+/g, " ") // normalize spacing
      .trim();
  }

  // Voice Selection for SpeechSynthesis
  function pickBestEnglishVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;

    const scoreVoice = (v) => {
      const name = (v.name || "").toLowerCase();
      const lang = (v.lang || "").toLowerCase();
      if (!lang.startsWith("en")) return -1000;
      let score = 0;
      if (lang.startsWith("en-gb")) score += 40;
      else if (lang.startsWith("en-us")) score += 30;
      else score += 10;

      if (name.includes("natural")) score += 60;
      if (name.includes("neural")) score += 60;
      if (name.includes("ryan")) score += 45;
      if (name.includes("daniel")) score += 40;
      if (name.includes("george") || name.includes("oliver")) score += 35;
      if (name.includes("serena") || name.includes("sonia")) score += 35;
      if (name.includes("google")) score += 30;
      if (name.includes("online")) score += 25;
      if (name.includes("samantha")) score += 20;
      return score;
    };

    const enVoices = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
    if (!enVoices.length) return voices[0];
    enVoices.sort((a, b) => scoreVoice(b) - scoreVoice(a));
    return enVoices[0];
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      bestEnglishVoice = pickBestEnglishVoice();
    };
  }

  function stopEnglishSpeech() {
    speechActive = false;
    speechSequence = [];
    speechSequenceIndex = 0;
    speechCompleteCallback = null;
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    activeUtterance = null;
    window.__quranActiveUtterance = null;
    clearEnglishHighlights();
  }

  function speakSequence(items, onComplete) {
    stopEnglishSpeech();
    if (!items || !items.length) {
      if (onComplete) onComplete();
      return;
    }
    if (!("speechSynthesis" in window)) {
      console.warn("SpeechSynthesis not available in browser");
      if (onComplete) onComplete();
      return;
    }

    speechSequence = items;
    speechSequenceIndex = 0;
    speechCompleteCallback = onComplete;
    speechActive = true;

    if (!bestEnglishVoice) {
      bestEnglishVoice = pickBestEnglishVoice();
    }

    playSequenceStep();
  }

  function playSequenceStep() {
    if (!isPlaying || !speechActive) return;
    if (speechSequenceIndex >= speechSequence.length) {
      speechActive = false;
      clearEnglishHighlights();
      const cb = speechCompleteCallback;
      speechCompleteCallback = null;
      if (cb) cb();
      return;
    }

    const item = speechSequence[speechSequenceIndex];
    const cleaned = cleanEnglishText(item.text);
    if (!cleaned) {
      speechSequenceIndex++;
      playSequenceStep();
      return;
    }

    highlightEnglishSegment(item.ayah);
    updatePlayerBar();
    updateMediaSession();

    const utterance = new SpeechSynthesisUtterance(cleaned);
    if (bestEnglishVoice) utterance.voice = bestEnglishVoice;
    utterance.rate = Math.max(0.7, Math.min(1.4, playbackRate));
    utterance.lang = bestEnglishVoice?.lang || "en-GB";

    // Keep reference on window to prevent Chrome garbage-collection bug
    activeUtterance = utterance;
    window.__quranActiveUtterance = utterance;

    let ended = false;
    const onDone = () => {
      if (ended) return;
      ended = true;
      activeUtterance = null;
      window.__quranActiveUtterance = null;
      speechSequenceIndex++;
      // Natural 200ms cadence between segments
      setTimeout(() => {
        if (isPlaying && speechActive && playPhase === "english") {
          playSequenceStep();
        }
      }, 200);
    };

    utterance.onend = onDone;
    utterance.onerror = (err) => {
      console.warn("Speech synthesis error", err);
      onDone();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("SpeechSynthesis.speak failed", e);
      onDone();
    }
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
      artist = "English AI Translation";
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
        if (details.seekTime !== undefined && audio.duration && playPhase === "arabic") {
          audio.currentTime = details.seekTime;
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
        reciterEl.textContent = "English Translation (AI)";
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
        ? "English translation audio enabled (Click to turn off)"
        : "English translation audio disabled (Click to turn on)";
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
  }

  function playArabicAyah(surahId, ayahNum, { autoScroll = true } = {}) {
    stopEnglishSpeech();
    currentSurahId = +surahId;
    currentAyahNum = +ayahNum;
    playPhase = "arabic";
    usingFallback = false;

    const url = getAyahAudioUrl(currentSurahId, currentAyahNum, false);
    audio.src = url;
    audio.playbackRate = playbackRate;

    audio
      .play()
      .then(() => {
        isPlaying = true;
        highlightArabicAyah(currentSurahId, currentAyahNum);
        updatePlayerBar();
        updateMediaSession();
        if (autoScroll) scrollToAyah(currentSurahId, currentAyahNum);
      })
      .catch((err) => {
        console.warn("Primary audio play failed, trying fallback", err);
        usingFallback = true;
        audio.src = getAyahAudioUrl(currentSurahId, currentAyahNum, true);
        audio.playbackRate = playbackRate;
        audio
          .play()
          .then(() => {
            isPlaying = true;
            highlightArabicAyah(currentSurahId, currentAyahNum);
            updatePlayerBar();
            updateMediaSession();
            if (autoScroll) scrollToAyah(currentSurahId, currentAyahNum);
          })
          .catch((e) => {
            console.warn("Fallback recitation playback failed", e);
            isPlaying = false;
            highlightArabicAyah(currentSurahId, currentAyahNum);
            updatePlayerBar();
          });
      });
  }

  function playAyah(surahId, ayahNum, { autoScroll = true } = {}) {
    stopEnglishSpeech();
    currentSurahId = +surahId;
    currentAyahNum = +ayahNum;
    chunkStartAyah = +ayahNum;

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

  function startEnglishPhaseForAyah(surahId, ayahNum) {
    playPhase = "english";
    clearArabicHighlights();
    updatePlayerBar();

    const surah = window.currentSurah && window.currentSurah.id === surahId
      ? window.currentSurah
      : null;
    const ayahObj = surah?.ayahs?.find((a) => a.ayah === ayahNum);
    const text = getAyahTranslationText(ayahObj, surahId);

    if (!text) {
      advanceAfterSentence();
      return;
    }

    const items = [{ ayah: ayahNum, text }];
    speakSequence(items, () => {
      if (continuous) {
        advanceAfterSentence();
      } else {
        pause();
      }
    });
  }

  function startEnglishPhaseForChunk(chunk) {
    playPhase = "english";
    clearArabicHighlights();
    currentChunk = chunk;
    updatePlayerBar();

    // Determine which ayahs in the chunk to speak:
    // From chunkStartAyah up to chunk end
    const startAt = (chunkStartAyah && chunk.some((a) => a.ayah === chunkStartAyah))
      ? chunkStartAyah
      : chunk[0].ayah;

    const speakAyahs = chunk.filter((a) => a.ayah >= startAt);
    const items = speakAyahs
      .map((a) => ({
        ayah: a.ayah,
        text: getAyahTranslationText(a, currentSurahId),
      }))
      .filter((item) => !!item.text.trim());

    if (!items.length) {
      advanceAfterChunk(chunk);
      return;
    }

    // Scroll chunk's translation section into view
    const chunkEl = document.querySelector(`.book-chunk[data-start="${chunk[0].ayah}"]`)
      || document.getElementById(`ayah-${currentSurahId}-${chunk[0].ayah}`)?.closest(".book-chunk");
    const transSec = chunkEl?.querySelector(".book-translation-section");
    if (transSec) {
      transSec.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    speakSequence(items, () => {
      if (continuous) {
        advanceAfterChunk(chunk);
      } else {
        pause();
      }
    });
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
        startEnglishPhaseForAyah(currentSurahId, currentAyahNum);
      } else {
        advanceAfterSentence();
      }
    }
  }

  function pause() {
    audio.pause();
    if (playPhase === "english") {
      speechActive = false;
      if ("speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
    }
    isPlaying = false;
    clearArabicHighlights();
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
      speechActive = true;
      playSequenceStep();
    } else {
      audio.play().catch((e) => console.warn("Audio resume failed", e));
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
    if (currentSurahId === +surahId && currentAyahNum === +ayahNum) {
      togglePlay();
    } else {
      playAyah(surahId, ayahNum);
    }
  }

  function nextAyah() {
    if (!currentSurahId || !currentAyahNum) return;
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
    stopEnglishSpeech();

    const isPara = isParagraphMode();
    if (isPara) {
      const chunkInfo = findChunkForAyah(currentSurahId, currentAyahNum);
      if (chunkInfo) {
        // If we are past the start of the chunk, jump back to start of chunk
        if (currentAyahNum > chunkInfo.chunk[0].ayah || playPhase === "english") {
          playAyah(currentSurahId, chunkInfo.chunk[0].ayah);
          return;
        }
        // If at start of chunk, jump to previous chunk
        if (chunkInfo.index > 0) {
          const allChunks = getChunksForSurah(currentSurahId);
          const prevChunk = allChunks[chunkInfo.index - 1];
          playAyah(currentSurahId, prevChunk[0].ayah);
          return;
        }
      }
    }

    // Sentence mode
    if (audio.currentTime > 2.5 && playPhase === "arabic") {
      audio.currentTime = 0;
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
      stopEnglishSpeech();
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
    audio.playbackRate = playbackRate;
    wordAudio.playbackRate = playbackRate;
    try {
      localStorage.setItem(STORAGE_RATE, String(playbackRate));
    } catch (_) {}
    updatePlayerBar();
  }

  function closePlayer() {
    stopEnglishSpeech();
    pause();
    currentSurahId = null;
    currentAyahNum = null;
    currentChunk = null;
    clearArabicHighlights();
    clearEnglishHighlights();
    updatePlayerBar();
  }

  function bindAudioEvents() {
    audio.addEventListener("timeupdate", () => {
      if (seeking || playPhase !== "arabic") return;
      const progress = document.getElementById("qap-progress");
      const curTime = document.getElementById("qap-current-time");
      const durTime = document.getElementById("qap-duration");
      if (progress && audio.duration) {
        progress.value = (audio.currentTime / audio.duration) * 100;
      }
      if (curTime) curTime.textContent = formatTime(audio.currentTime);
      if (durTime && audio.duration) durTime.textContent = formatTime(audio.duration);
    });

    audio.addEventListener("ended", handleArabicEnded);

    audio.addEventListener("error", () => {
      if (!usingFallback && currentSurahId && currentAyahNum) {
        usingFallback = true;
        audio.src = getAyahAudioUrl(currentSurahId, currentAyahNum, true);
        audio.play().catch(() => pause());
      } else {
        pause();
      }
    });

    // Scrubber
    const progressEl = document.getElementById("qap-progress");
    if (progressEl) {
      progressEl.addEventListener("input", () => {
        if (playPhase !== "arabic") return;
        seeking = true;
        const curTime = document.getElementById("qap-current-time");
        if (curTime && audio.duration) {
          curTime.textContent = formatTime((progressEl.value / 100) * audio.duration);
        }
      });
      progressEl.addEventListener("change", () => {
        if (playPhase !== "arabic") return;
        if (audio.duration) {
          audio.currentTime = (progressEl.value / 100) * audio.duration;
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

  return {
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
      }
    },
    isPlayingAyah: (s, a) => isPlaying && currentSurahId === +s && currentAyahNum === +a,
    getCurrentAyah: () => ({ surah: currentSurahId, ayah: currentAyahNum, isPlaying, playPhase }),
    onSurahRendered: () => {
      if (playPhase === "arabic") {
        highlightArabicAyah(currentSurahId, currentAyahNum);
      }
      updatePlayerBar();
    },
    onLayoutChanged: () => {
      updatePlayerBar();
    },
  };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", QuranAudio.init);
} else {
  QuranAudio.init();
}
