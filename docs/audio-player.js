/**
 * Quran Audio Player — Complete recitation by Mishary Rashid Alafasy
 * Supports:
 * - Ayah-by-ayah playback (with auto-advancing continuous play)
 * - Word-by-word human audio clips
 * - Playback rate control (1x, 0.75x slow, 1.25x)
 * - Floating responsive player bar with scrubber and keyboard shortcuts
 * - MediaSession API for lock-screen, headphone, and car Bluetooth controls
 */
const QuranAudio = (() => {
  const STORAGE_CONT = "quran-audio-cont";
  const STORAGE_RATE = "quran-audio-rate";
  const PRIMARY_BASE = "https://everyayah.com/data/Alafasy_128kbps/";
  const FALLBACK_BASE = "https://verses.quran.com/Alafasy/mp3/";
  const WBW_BASE = "https://audio.qurancdn.com/wbw/";

  let currentSurahId = null;
  let currentAyahNum = null;
  let isPlaying = false;
  let continuous = localStorage.getItem(STORAGE_CONT) !== "false";
  let playbackRate = parseFloat(localStorage.getItem(STORAGE_RATE)) || 1.0;
  let usingFallback = false;
  let seeking = false;

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

  function updateMediaSession() {
    if (!("mediaSession" in navigator) || !currentSurahId || !currentAyahNum) return;
    const sName = getSurahName(currentSurahId);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${sName} — Ayah ${currentAyahNum}`,
      artist: "Mishary Rashid Alafasy",
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
        if (details.seekTime !== undefined && audio.duration) {
          audio.currentTime = details.seekTime;
        }
      });
    } catch (_) {}
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

  function updateHighlights() {
    document.querySelectorAll(".ayah-block.audio-playing").forEach((el) => {
      el.classList.remove("audio-playing");
    });
    document.querySelectorAll(".ayah-dot.play-btn").forEach((btn) => {
      btn.classList.remove("playing");
      const icon = btn.querySelector(".icon-play");
      if (icon) icon.textContent = "▶";
      btn.title = "Play recitation (Mishary Alafasy)";
      btn.setAttribute("aria-label", "Play recitation");
    });

    if (!currentSurahId || !currentAyahNum) return;

    const block = document.getElementById(`ayah-${currentSurahId}-${currentAyahNum}`);
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
  }

  function updatePlayerBar() {
    const bar = document.getElementById("quran-audio-player");
    if (!bar) return;

    if (!currentSurahId || !currentAyahNum) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;

    const trackEl = document.getElementById("qap-track");
    const playBtn = document.getElementById("qap-play");
    const contBtn = document.getElementById("qap-continuous");
    const speedBtn = document.getElementById("qap-speed");

    if (trackEl) {
      const sName = getSurahName(currentSurahId);
      trackEl.textContent = `${sName} · ${currentSurahId}:${currentAyahNum}`;
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
        ? "Continuous play enabled (auto-advances)"
        : "Single ayah play enabled";
    }
    if (speedBtn) {
      speedBtn.textContent = `${playbackRate}x`;
    }
  }

  function playAyah(surahId, ayahNum, { autoScroll = true } = {}) {
    currentSurahId = +surahId;
    currentAyahNum = +ayahNum;
    usingFallback = false;

    const url = getAyahAudioUrl(currentSurahId, currentAyahNum, false);
    audio.src = url;
    audio.playbackRate = playbackRate;

    audio
      .play()
      .then(() => {
        isPlaying = true;
        updateHighlights();
        updatePlayerBar();
        updateMediaSession();
        if (autoScroll) scrollToAyah(currentSurahId, currentAyahNum);
      })
      .catch((err) => {
        console.warn("Primary audio play failed, trying fallback", err);
        usingFallback = true;
        audio.src = getAyahAudioUrl(currentSurahId, currentAyahNum, true);
        audio.playbackRate = playbackRate;
        audio.play().then(() => {
          isPlaying = true;
          updateHighlights();
          updatePlayerBar();
          updateMediaSession();
          if (autoScroll) scrollToAyah(currentSurahId, currentAyahNum);
        }).catch((e) => {
          console.warn("Audio playback blocked or failed", e);
          isPlaying = false;
          updateHighlights();
          updatePlayerBar();
        });
      });
  }

  function pause() {
    audio.pause();
    isPlaying = false;
    updateHighlights();
    updatePlayerBar();
  }

  function resume() {
    if (!currentSurahId || !currentAyahNum) {
      const sId = window.currentSurah ? window.currentSurah.id : 1;
      playAyah(sId, 1);
      return;
    }
    audio
      .play()
      .then(() => {
        isPlaying = true;
        updateHighlights();
        updatePlayerBar();
      })
      .catch((e) => console.warn("Resume failed", e));
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

  function prevAyah() {
    if (!currentSurahId || !currentAyahNum) return;
    if (audio.currentTime > 2.5) {
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
    pause();
    currentSurahId = null;
    currentAyahNum = null;
    updateHighlights();
    updatePlayerBar();
  }

  function bindAudioEvents() {
    audio.addEventListener("timeupdate", () => {
      if (seeking) return;
      const progress = document.getElementById("qap-progress");
      const curTime = document.getElementById("qap-current-time");
      const durTime = document.getElementById("qap-duration");
      if (progress && audio.duration) {
        progress.value = (audio.currentTime / audio.duration) * 100;
      }
      if (curTime) curTime.textContent = formatTime(audio.currentTime);
      if (durTime && audio.duration) durTime.textContent = formatTime(audio.duration);
    });

    audio.addEventListener("ended", () => {
      if (continuous) {
        nextAyah();
      } else {
        pause();
      }
    });

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
        seeking = true;
        const curTime = document.getElementById("qap-current-time");
        if (curTime && audio.duration) {
          curTime.textContent = formatTime((progressEl.value / 100) * audio.duration);
        }
      });
      progressEl.addEventListener("change", () => {
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

    // Keyboard controls
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

    // Delegate clicks on word audio buttons in tooltips or wbw view
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
    cycleSpeed,
    closePlayer,
    updateHighlights,
    isPlayingAyah: (s, a) => isPlaying && currentSurahId === +s && currentAyahNum === +a,
    getCurrentAyah: () => ({ surah: currentSurahId, ayah: currentAyahNum, isPlaying }),
    onSurahRendered: (surahData) => {
      updateHighlights();
      updatePlayerBar();
    },
  };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", QuranAudio.init);
} else {
  QuranAudio.init();
}
