/**
 * Cross-device sync via GitHub API (fine-grained PAT).
 * Data file: docs/sync/user-data.json in the Quran repo.
 * PAT is stored in localStorage only — never committed.
 */
const QuranGitHubSync = (() => {
  const SYNC_LS = {
    enabled: "quran-sync-enabled",
    pat: "quran-sync-pat",
    repo: "quran-sync-repo",
    branch: "quran-sync-branch",
  };

  const DEFAULTS = {
    repo: "rkarim25/Quran",
    branch: "main",
    path: "docs/sync/user-data.json",
  };

  const DATA_VERSION = 1;
  const PUSH_DEBOUNCE_MS = 4000;

  let lsKeys = null;
  let ayahEditsKey = null;
  let onMerged = null;
  let collectExtras = null;
  let status = "not-configured";
  let remoteSha = null;
  let pushTimer = null;
  let pushing = false;
  let pendingPush = false;

  function cfg() {
    return {
      enabled: localStorage.getItem(SYNC_LS.enabled) === "1",
      pat: localStorage.getItem(SYNC_LS.pat) || "",
      repo: localStorage.getItem(SYNC_LS.repo) || DEFAULTS.repo,
      branch: localStorage.getItem(SYNC_LS.branch) || DEFAULTS.branch,
      path: DEFAULTS.path,
    };
  }

  function isEnabled() {
    const c = cfg();
    return c.enabled && !!c.pat.trim();
  }

  function setStatus(next) {
    status = next;
    const badge = document.getElementById("sync-badge");
    if (!badge) return;
    badge.classList.remove("readonly", "syncing", "offline", "synced", "error", "local-sync");
    const labels = {
      "not-configured": "Sync",
      syncing: "Syncing…",
      synced: "Synced",
      offline: "Offline",
      error: "Sync error",
    };
    badge.textContent = labels[next] || next;
    if (next === "not-configured") badge.classList.add("readonly");
    else if (next === "syncing") badge.classList.add("syncing");
    else if (next === "offline") badge.classList.add("offline");
    else if (next === "synced") badge.classList.add("synced");
    else if (next === "error") badge.classList.add("error");
  }

  function parseRepo(repo) {
    const [owner, name] = (repo || "").split("/");
    return { owner: owner?.trim(), name: name?.trim() };
  }

  function collectLocalData() {
    if (!lsKeys) return emptyBundle();

    let prefs = {};
    try {
      prefs = JSON.parse(localStorage.getItem(lsKeys.prefs) || "{}");
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
      bookmarks: [],
      ayahEdits: {},
    };
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
      bookmarks: mergeBookmarks(local.bookmarks, remote.bookmarks),
      ayahEdits: mergeAyahEdits(local.ayahEdits, remote.ayahEdits),
    };
  }

  function applyBundle(bundle) {
    if (!lsKeys || !bundle) return;

    localStorage.setItem(lsKeys.prefs, JSON.stringify(bundle.prefs || {}));

    if (bundle.lastRead) {
      localStorage.setItem(lsKeys.lastRead, JSON.stringify(bundle.lastRead));
    }

    localStorage.setItem(lsKeys.bookmarks, JSON.stringify(bundle.bookmarks || []));

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

  function authHeaders(pat) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${pat}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async function fetchRemote() {
    const c = cfg();
    if (!c.pat) throw new Error("No PAT configured");

    const { owner, name } = parseRepo(c.repo);
    const url = `https://api.github.com/repos/${owner}/${name}/contents/${c.path}?ref=${encodeURIComponent(c.branch)}`;

    const res = await fetch(url, { headers: authHeaders(c.pat) });
    if (res.status === 404) {
      remoteSha = null;
      return emptyBundle();
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub fetch failed (${res.status})`);
    }

    const meta = await res.json();
    remoteSha = meta.sha || null;
    const raw = atob((meta.content || "").replace(/\n/g, ""));
    try {
      return JSON.parse(raw);
    } catch (_) {
      return emptyBundle();
    }
  }

  function encodeContent(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function pushRemote(bundle, retries = 1) {
    const c = cfg();
    if (!c.pat) throw new Error("No PAT configured");

    const { owner, name } = parseRepo(c.repo);
    const url = `https://api.github.com/repos/${owner}/${name}/contents/${c.path}`;

    const body = {
      message: "Sync Quran reader user data",
      content: encodeContent(JSON.stringify(bundle, null, 2)),
      branch: c.branch,
    };
    if (remoteSha) body.sha = remoteSha;

    const res = await fetch(url, {
      method: "PUT",
      headers: { ...authHeaders(c.pat), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 409 && retries > 0) {
        const remote = await fetchRemote();
        const merged = mergeBundles(collectLocalData(), remote);
        applyBundle(merged);
        return pushRemote(merged, retries - 1);
      }
      throw new Error(err.message || `GitHub push failed (${res.status})`);
    }

    const result = await res.json();
    remoteSha = result.content?.sha || remoteSha;
    return bundle;
  }

  async function pullAndMerge() {
    if (!isEnabled()) {
      setStatus("not-configured");
      return null;
    }
    if (!navigator.onLine) {
      setStatus("offline");
      return null;
    }

    setStatus("syncing");
    try {
      const local = collectLocalData();
      const remote = await fetchRemote();
      const merged = mergeBundles(local, remote);
      applyBundle(merged);
      setStatus("synced");
      return merged;
    } catch (e) {
      console.warn("GitHub sync pull failed", e);
      setStatus(navigator.onLine ? "error" : "offline");
      return null;
    }
  }

  async function flushPush() {
    if (!isEnabled() || pushing) {
      if (isEnabled()) pendingPush = true;
      return;
    }
    if (!navigator.onLine) {
      setStatus("offline");
      pendingPush = true;
      return;
    }

    pushing = true;
    pendingPush = false;
    setStatus("syncing");
    try {
      const remote = await fetchRemote();
      const merged = mergeBundles(collectLocalData(), remote);
      await pushRemote(merged);
      applyBundle(merged);
      setStatus("synced");
    } catch (e) {
      console.warn("GitHub sync push failed", e);
      setStatus(navigator.onLine ? "error" : "offline");
      pendingPush = true;
    } finally {
      pushing = false;
      if (pendingPush) schedulePush();
    }
  }

  function schedulePush() {
    if (!isEnabled()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => flushPush(), PUSH_DEBOUNCE_MS);
  }

  function bindModal() {
    const modal = document.getElementById("sync-modal");
    const backdrop = document.getElementById("sync-modal-backdrop");
    const closeBtn = document.getElementById("sync-modal-close");
    const saveBtn = document.getElementById("sync-save-btn");
    const disableBtn = document.getElementById("sync-disable-btn");
    const pullBtn = document.getElementById("sync-pull-btn");
    const badge = document.getElementById("sync-badge");

    const close = () => {
      modal?.setAttribute("hidden", "");
      backdrop?.setAttribute("hidden", "");
    };

    badge?.addEventListener("click", openSettings);
    backdrop?.addEventListener("click", close);
    closeBtn?.addEventListener("click", close);

    saveBtn?.addEventListener("click", async () => {
      const enabled = document.getElementById("sync-enabled")?.checked;
      const pat = document.getElementById("sync-pat")?.value?.trim() || "";
      const repo = document.getElementById("sync-repo")?.value?.trim() || DEFAULTS.repo;
      const branch = document.getElementById("sync-branch")?.value?.trim() || DEFAULTS.branch;

      if (enabled && !pat && !localStorage.getItem(SYNC_LS.pat)) {
        document.getElementById("sync-status-msg").textContent = "Enter a GitHub token to enable sync.";
        return;
      }

      localStorage.setItem(SYNC_LS.enabled, enabled ? "1" : "0");
      if (pat) localStorage.setItem(SYNC_LS.pat, pat);
      localStorage.setItem(SYNC_LS.repo, repo);
      localStorage.setItem(SYNC_LS.branch, branch);

      document.getElementById("sync-status-msg").textContent = enabled ? "Saving & syncing…" : "Sync disabled.";
      if (enabled) {
        await pullAndMerge();
        schedulePush();
      } else {
        setStatus("not-configured");
      }
      close();
    });

    disableBtn?.addEventListener("click", () => {
      localStorage.setItem(SYNC_LS.enabled, "0");
      setStatus("not-configured");
      document.getElementById("sync-enabled").checked = false;
      document.getElementById("sync-status-msg").textContent = "Sync disabled. Local data kept on this device.";
    });

    pullBtn?.addEventListener("click", async () => {
      document.getElementById("sync-status-msg").textContent = "Pulling latest…";
      await pullAndMerge();
      document.getElementById("sync-status-msg").textContent = "Pull complete.";
    });
  }

  function openSettings() {
    const c = cfg();
    const modal = document.getElementById("sync-modal");
    const backdrop = document.getElementById("sync-modal-backdrop");
    if (!modal) return;
    document.getElementById("sync-enabled").checked = c.enabled;
    document.getElementById("sync-pat").value = "";
    document.getElementById("sync-pat").placeholder = c.pat ? "••••••••  (saved — leave blank to keep)" : "ghp_… or github_pat_…";
    document.getElementById("sync-repo").value = c.repo;
    document.getElementById("sync-branch").value = c.branch;
    document.getElementById("sync-status-msg").textContent = `Status: ${status}`;
    modal.removeAttribute("hidden");
    backdrop?.removeAttribute("hidden");
  }

  function init(options = {}) {
    lsKeys = options.lsKeys;
    ayahEditsKey = options.ayahEditsKey;
    onMerged = options.onMerged;
    collectExtras = options.collectExtras;
    bindModal();

    window.addEventListener("online", () => {
      if (isEnabled()) {
        pullAndMerge().then(() => schedulePush());
      }
    });
    window.addEventListener("offline", () => {
      if (isEnabled()) setStatus("offline");
    });

    if (isEnabled()) setStatus("synced");
    else setStatus("not-configured");
  }

  return {
    init,
    isEnabled,
    pullAndMerge,
    schedulePush,
    openSettings,
    getStatus: () => status,
    mergeBundles,
    collectLocalData,
    applyBundle,
  };
})();
