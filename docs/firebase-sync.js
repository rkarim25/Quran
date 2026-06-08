/**
 * Cross-device sync via Firebase Auth (Google Sign-In) + Firestore.
 * Document path: users/{uid}/data — same shape as docs/sync/user-data.json
 */
const QuranFirebaseSync = (() => {
  const PUSH_DEBOUNCE_MS = 4000;
  const SYNC_TAB_LS = "quran-sync-tab";

  let lsKeys = null;
  let ayahEditsKey = null;
  let onMerged = null;
  let collectExtras = null;
  let status = "not-configured";
  let pushTimer = null;
  let pushing = false;
  let pendingPush = false;
  let auth = null;
  let db = null;
  let currentUser = null;
  let configured = false;

  function isConfigured() {
    if (typeof FIREBASE_CONFIG === "undefined") return false;
    const c = FIREBASE_CONFIG;
    return !!(c.apiKey && c.apiKey !== "YOUR_API_KEY" && c.projectId && c.projectId !== "YOUR_PROJECT_ID");
  }

  function isSignedIn() {
    return configured && !!currentUser;
  }

  function isActive() {
    return isSignedIn();
  }

  function isEnabled() {
    return isSignedIn();
  }

  function collectLocalData() {
    if (QuranGitHubSync?.collectLocalData) return QuranGitHubSync.collectLocalData();
    return { version: 1, updatedAt: 0, prefs: {}, lastRead: null, bookmarks: [], ayahEdits: {} };
  }

  function mergeBundles(local, remote) {
    if (QuranGitHubSync?.mergeBundles) return QuranGitHubSync.mergeBundles(local, remote);
    return remote || local;
  }

  function applyBundle(bundle) {
    if (QuranGitHubSync?.applyBundle) return QuranGitHubSync.applyBundle(bundle);
  }

  function userDocRef(uid) {
    return db.collection("users").doc(uid).collection("data").doc("data");
  }

  function setStatus(next) {
    if (!isActive()) return;
    status = next;
    const badge = document.getElementById("sync-badge");
    if (!badge) return;
    badge.hidden = false;
    badge.classList.remove("readonly", "syncing", "offline", "synced", "error", "local-sync");
    const labels = {
      "not-configured": "Sync",
      syncing: "Syncing…",
      synced: "Synced",
      offline: "Offline",
      error: "Sync error",
    };
    badge.textContent = labels[next] || next;
    if (next === "syncing") badge.classList.add("syncing");
    else if (next === "offline") badge.classList.add("offline");
    else if (next === "synced") badge.classList.add("synced");
    else if (next === "error") badge.classList.add("error");
    else badge.classList.add("synced");
  }

  function updateGooglePanel() {
    const signedInEl = document.getElementById("firebase-signed-in");
    const signedOutEl = document.getElementById("firebase-signed-out");
    const emailEl = document.getElementById("firebase-user-email");
    const msgEl = document.getElementById("firebase-status-msg");
    if (!signedInEl || !signedOutEl) return;

    if (isSignedIn()) {
      signedInEl.hidden = false;
      signedOutEl.hidden = true;
      if (emailEl) emailEl.textContent = currentUser.email || currentUser.displayName || "Signed in";
      if (msgEl) msgEl.textContent = `Status: ${status}`;
    } else {
      signedInEl.hidden = true;
      signedOutEl.hidden = false;
      if (msgEl) {
        msgEl.textContent = configured
          ? "Sign in to sync across devices."
          : "Firebase not configured — see docs/SYNC_SETUP.md";
      }
    }
  }

  function setActiveTab(tab) {
    const googleTab = document.getElementById("sync-tab-google");
    const githubTab = document.getElementById("sync-tab-github");
    const googlePanel = document.getElementById("sync-panel-google");
    const githubPanel = document.getElementById("sync-panel-github");
    const isGoogle = tab === "google";
    googleTab?.classList.toggle("active", isGoogle);
    githubTab?.classList.toggle("active", !isGoogle);
    githubTab?.setAttribute("aria-selected", String(!isGoogle));
    googleTab?.setAttribute("aria-selected", String(isGoogle));
    if (googlePanel) googlePanel.hidden = !isGoogle;
    if (githubPanel) githubPanel.hidden = isGoogle;
    try {
      localStorage.setItem(SYNC_TAB_LS, tab);
    } catch (_) {}
  }

  async function fetchRemote() {
    if (!currentUser) return null;
    const snap = await userDocRef(currentUser.uid).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  async function pushRemote(bundle) {
    if (!currentUser) throw new Error("Not signed in");
    await userDocRef(currentUser.uid).set(bundle, { merge: false });
    return bundle;
  }

  async function pullAndMerge() {
    if (!isSignedIn()) {
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
      if (onMerged) onMerged(merged);
      setStatus("synced");
      updateGooglePanel();
      return merged;
    } catch (e) {
      console.warn("Firebase sync pull failed", e);
      setStatus(navigator.onLine ? "error" : "offline");
      updateGooglePanel();
      return null;
    }
  }

  async function flushPush() {
    if (!isSignedIn() || pushing) {
      if (isSignedIn()) pendingPush = true;
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
      if (onMerged) onMerged(merged);
      setStatus("synced");
    } catch (e) {
      console.warn("Firebase sync push failed", e);
      setStatus(navigator.onLine ? "error" : "offline");
      pendingPush = true;
    } finally {
      pushing = false;
      updateGooglePanel();
      if (pendingPush) schedulePush();
    }
  }

  function schedulePush() {
    if (!isSignedIn()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => flushPush(), PUSH_DEBOUNCE_MS);
  }

  async function signInWithGoogle() {
    if (!configured) {
      document.getElementById("firebase-status-msg").textContent =
        "Add your Firebase config to docs/firebase-config.js first.";
      return;
    }
    const msgEl = document.getElementById("firebase-status-msg");
    if (msgEl) msgEl.textContent = "Opening Google sign-in…";
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        await auth.signInWithRedirect(provider);
      } else {
        await auth.signInWithPopup(provider);
      }
    } catch (e) {
      console.warn("Google sign-in failed", e);
      if (msgEl) {
        msgEl.textContent =
          e.code === "auth/popup-closed-by-user"
            ? "Sign-in cancelled."
            : e.message || "Sign-in failed.";
      }
    }
  }

  async function signOut() {
    if (!auth) return;
    clearTimeout(pushTimer);
    try {
      await auth.signOut();
    } catch (e) {
      console.warn("Sign out failed", e);
    }
    status = "not-configured";
    updateGooglePanel();
    if (QuranGitHubSync?.isEnabled?.()) {
      QuranGitHubSync.setStatus?.("synced");
    } else {
      const badge = document.getElementById("sync-badge");
      if (badge) {
        badge.classList.remove("syncing", "synced", "offline", "error");
        badge.classList.add("readonly");
        badge.textContent = "Sync";
      }
    }
  }

  function openSettings() {
    const modal = document.getElementById("sync-modal");
    const backdrop = document.getElementById("sync-modal-backdrop");
    if (!modal) return;

    const tab = isSignedIn() ? "google" : localStorage.getItem(SYNC_TAB_LS) || "google";
    setActiveTab(tab);
    updateGooglePanel();
    QuranGitHubSync?.populateForm?.();
    modal.removeAttribute("hidden");
    backdrop?.removeAttribute("hidden");
  }

  function closeModal() {
    document.getElementById("sync-modal")?.setAttribute("hidden", "");
    document.getElementById("sync-modal-backdrop")?.setAttribute("hidden", "");
  }

  function bindModal() {
    const backdrop = document.getElementById("sync-modal-backdrop");
    const closeBtn = document.getElementById("sync-modal-close");
    const badge = document.getElementById("sync-badge");
    const googleTab = document.getElementById("sync-tab-google");
    const githubTab = document.getElementById("sync-tab-github");
    const signInBtn = document.getElementById("firebase-sign-in-btn");
    const signOutBtn = document.getElementById("firebase-sign-out-btn");
    const pullBtn = document.getElementById("firebase-pull-btn");

    badge?.addEventListener("click", openSettings);
    backdrop?.addEventListener("click", closeModal);
    closeBtn?.addEventListener("click", closeModal);
    googleTab?.addEventListener("click", () => setActiveTab("google"));
    githubTab?.addEventListener("click", () => setActiveTab("github"));
    signInBtn?.addEventListener("click", signInWithGoogle);
    signOutBtn?.addEventListener("click", signOut);
    pullBtn?.addEventListener("click", async () => {
      const msgEl = document.getElementById("firebase-status-msg");
      if (msgEl) msgEl.textContent = "Pulling latest…";
      await pullAndMerge();
      if (msgEl) msgEl.textContent = "Pull complete.";
    });
  }

  function onAuthStateChanged(user) {
    currentUser = user;
    updateGooglePanel();
    if (user) {
      pullAndMerge().then(() => schedulePush());
    } else {
      status = "not-configured";
    }
  }

  function init(options = {}) {
    lsKeys = options.lsKeys;
    ayahEditsKey = options.ayahEditsKey;
    onMerged = options.onMerged;
    collectExtras = options.collectExtras;
    bindModal();

    configured = isConfigured();
    if (!configured) {
      console.info("Firebase sync: config placeholders — see docs/SYNC_SETUP.md");
      return Promise.resolve();
    }

    if (typeof firebase === "undefined") {
      console.warn("Firebase SDK not loaded");
      return Promise.resolve();
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      auth = firebase.auth();
      db = firebase.firestore();
    } catch (e) {
      console.warn("Firebase init failed", e);
      configured = false;
      return Promise.resolve();
    }

    window.addEventListener("online", () => {
      if (isSignedIn()) {
        pullAndMerge().then(() => schedulePush());
      }
    });
    window.addEventListener("offline", () => {
      if (isSignedIn()) setStatus("offline");
    });

    return new Promise((resolve) => {
      auth.getRedirectResult().catch((e) => console.warn("Redirect sign-in failed", e));
      auth.onAuthStateChanged((user) => {
        onAuthStateChanged(user);
        resolve();
      });
    });
  }

  return {
    init,
    isConfigured,
    isSignedIn,
    isActive,
    isEnabled,
    pullAndMerge,
    schedulePush,
    openSettings,
    getStatus: () => status,
  };
})();
