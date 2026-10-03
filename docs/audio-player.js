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
  let playPhase = "arabic"; // "arabic" | "english"
  let continuous = localStorage.getItem(STORAGE_CONT) !== "false";
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

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    navigator.mediaSession.setActionHandler("play", () => resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => prevAyah());
    navigator.mediaSession.setActionHandler("nexttrack", () => nextAyah());

    try {
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const skip = details.seekOffset || 10;
        const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
        activeAudio.currentTime = Math.max(0, activeAudio.currentTime - skip);
        updateMediaSessionPosition();
      });
    } catch (_) {}

    try {
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const skip = details.seekOffset || 10;
        const activeAudio = playPhase === "arabic" ? arabicAudio : englishAudio;
        if (activeAudio.duration) {
          activeAudio.currentTime = Math.min(activeAudio.duration, activeAudio.currentTime + skip);
          updateMediaSessionPosition();
        }
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

    if (paneSurah) paneSurah.hidden = tab !== "surah";
    if (paneVerse) paneVerse.hidden = tab !== "verse";
    if (paneJuz) paneJuz.hidden = tab !== "juz";

    if (tab === "surah") renderSurahChooser();
    else if (tab === "verse") renderVerseChooser(verseChooserSurahId);
    else if (tab === "juz") renderJuzChooser();
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
      englishAudio.play().catch((e) => console.warn("English resume failed", e));
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
        updateMediaSessionPosition();
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
