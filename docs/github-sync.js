/**
 * User-data bundle helpers (collect, merge, apply) used by Firebase sync.
 */
const QuranGitHubSync = (() => {
  const DATA_VERSION = 1;

  let lsKeys = null;
  let ayahEditsKey = null;
  let onMerged = null;
  let collectExtras = null;

  function collectLocalData() {
    if (!lsKeys) return emptyBundle();

    let prefs = {};
    try {
      prefs = JSON.parse(localStorage.getItem(lsKeys.prefs) || "{}");
    } catch (_) {}

    let recentReads = [];
    try {
      recentReads = JSON.parse(localStorage.getItem(lsKeys.recentReads) || "[]");
    } catch (_) {}

    let lastRead = null;
    try {
      lastRead = JSON.parse(localStorage.getItem(lsKeys.lastRead) || "null");
    } catch (_) {}

    let bookmarks = [];
    try {
      bookmarks = JSON.parse(localStorage.getItem(lsKeys.bookmarks) || "[]");
    } catch (_) {}

    const ayahEdits = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const m = key?.match(/^quran-(\d+)-(\d+)$/);
      if (!m || !ayahEditsKey) continue;
      try {
        const data = JSON.parse(localStorage.getItem(key));
        ayahEdits[`${m[1]}:${m[2]}`] = {
          ...data,
          updatedAt: data.updatedAt || 0,
        };
      } catch (_) {}
    }

    const bundle = {
      version: DATA_VERSION,
      updatedAt: Date.now(),
      prefs: { ...prefs, updatedAt: prefs.updatedAt || 0 },
      lastRead,
      recentReads,
      bookmarks,
      ayahEdits,
    };
    if (collectExtras) Object.assign(bundle, collectExtras());
    return bundle;
  }

  function emptyBundle() {
    return {
      version: DATA_VERSION,
      updatedAt: 0,
      prefs: { updatedAt: 0 },
      lastRead: null,
      recentReads: [],
      bookmarks: [],
      ayahEdits: {},
      tadabburNotes: [],
    };
  }

  function mergeTadabburNotes(local, remote) {
    const map = new Map();
    for (const n of [...(local || []), ...(remote || [])]) {
      if (!n || !n.id) continue;
      const e = map.get(n.id);
      if (!e || (n.updated || 0) > (e.updated || 0)) map.set(n.id, n);
    }
    return [...map.values()].sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
  }

  function mergeBookmarks(local, remote) {
    const map = new Map();
    for (const b of [...(local || []), ...(remote || [])]) {
      if (!b || b.surah == null || b.ayah == null) continue;
      const key = `${b.surah}:${b.ayah}`;
      const existing = map.get(key);
      if (!existing || (b.at || 0) > (existing.at || 0)) map.set(key, b);
    }
    return [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  function mergeAyahEdits(local, remote) {
    const out = { ...(local || {}) };
    for (const [key, remoteEdit] of Object.entries(remote || {})) {
      const localEdit = out[key];
      const rAt = remoteEdit?.updatedAt || 0;
      const lAt = localEdit?.updatedAt || 0;
      if (!localEdit || rAt >= lAt) out[key] = remoteEdit;
    }
    return out;
  }

  function mergePrefs(local, remote) {
    const lAt = local?.updatedAt || 0;
    const rAt = remote?.updatedAt || 0;
    return rAt >= lAt ? { ...remote } : { ...local };
  }

  function mergeRecentReads(local, remote, legacyLocal, legacyRemote) {
    const RECENT_MAX = 5;
    const map = new Map();
    const all = [...(local || []), ...(remote || [])];
    if (legacyLocal?.surah != null) all.push(legacyLocal);
    if (legacyRemote?.surah != null) all.push(legacyRemote);
    for (const r of all) {
      if (!r || r.surah == null || r.ayah == null) continue;
      const existing = map.get(r.surah);
      if (!existing || (r.at || 0) > (existing.at || 0)) {
        map.set(r.surah, { surah: r.surah, ayah: r.ayah, at: r.at || 0 });
      }
    }
    return [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, RECENT_MAX);
  }

  function mergeLastRead(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    return (remote.at || 0) >= (local.at || 0) ? remote : local;
  }

  function mergeBundles(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    return {
      version: DATA_VERSION,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
      prefs: mergePrefs(local.prefs, remote.prefs),
      lastRead: mergeLastRead(local.lastRead, remote.lastRead),
      recentReads: mergeRecentReads(
        local.recentReads,
        remote.recentReads,
        local.lastRead,
        remote.lastRead
      ),
      bookmarks: mergeBookmarks(local.bookmarks, remote.bookmarks),
      ayahEdits: mergeAyahEdits(local.ayahEdits, remote.ayahEdits),
      tadabburNotes: mergeTadabburNotes(local.tadabburNotes, remote.tadabburNotes),
    };
  }

  function applyBundle(bundle) {
    if (!lsKeys || !bundle) return;

    localStorage.setItem(lsKeys.prefs, JSON.stringify(bundle.prefs || {}));

    if (bundle.recentReads?.length) {
      localStorage.setItem(lsKeys.recentReads, JSON.stringify(bundle.recentReads));
    } else if (bundle.lastRead) {
      localStorage.setItem(lsKeys.recentReads, JSON.stringify([bundle.lastRead]));
    }

    localStorage.setItem(lsKeys.bookmarks, JSON.stringify(bundle.bookmarks || []));

    if (lsKeys.tadabburNotes && Array.isArray(bundle.tadabburNotes)) {
      localStorage.setItem(lsKeys.tadabburNotes, JSON.stringify(bundle.tadabburNotes));
    }

    const keepKeys = new Set();
    for (const [key, edit] of Object.entries(bundle.ayahEdits || {})) {
      const [surah, ayah] = key.split(":");
      if (!surah || !ayah || !ayahEditsKey) continue;
      const lsKey = ayahEditsKey(+surah, +ayah);
      keepKeys.add(lsKey);
      localStorage.setItem(lsKey, JSON.stringify(edit));
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!/^quran-\d+-\d+$/.test(key || "")) continue;
      if (!keepKeys.has(key)) localStorage.removeItem(key);
    }

    if (onMerged) onMerged(bundle);
  }

  function init(options = {}) {
    lsKeys = options.lsKeys;
    ayahEditsKey = options.ayahEditsKey;
    onMerged = options.onMerged;
    collectExtras = options.collectExtras;
  }

  return {
    init,
    isEnabled: () => false,
    schedulePush: () => {},
    mergeBundles,
    collectLocalData,
    applyBundle,
  };
})();
