/**
 * Quick sanity check for sync merge logic (same rules as github-sync.js).
 * Run: node scripts/test-sync-merge.js
 */
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
    version: 1,
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
    prefs: mergePrefs(local.prefs, remote.prefs),
    lastRead: mergeLastRead(local.lastRead, remote.lastRead),
    bookmarks: mergeBookmarks(local.bookmarks, remote.bookmarks),
    ayahEdits: mergeAyahEdits(local.ayahEdits, remote.ayahEdits),
  };
}

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

const local = {
  version: 1,
  updatedAt: 100,
  prefs: { readMode: "translation", updatedAt: 50 },
  lastRead: { surah: 1, ayah: 1, at: 100 },
  bookmarks: [{ surah: 2, ayah: 255, at: 80 }],
  ayahEdits: { "2:255": { reflection: "local", updatedAt: 90 } },
};

const remote = {
  version: 1,
  updatedAt: 200,
  prefs: { readMode: "arabic", updatedAt: 150 },
  lastRead: { surah: 3, ayah: 1, at: 200 },
  bookmarks: [
    { surah: 2, ayah: 255, at: 120 },
    { surah: 18, ayah: 1, at: 110 },
  ],
  ayahEdits: {
    "2:255": { reflection: "remote", updatedAt: 200 },
    "1:1": { reflection: "only remote", updatedAt: 100 },
  },
};

const merged = mergeBundles(local, remote);

assert(merged.prefs.readMode === "arabic", "newer prefs win");
assert(merged.lastRead.surah === 3, "newer lastRead wins");
assert(merged.bookmarks.length === 2, "bookmarks deduped");
assert(merged.bookmarks.find((b) => b.surah === 2 && b.ayah === 255).at === 120, "newer bookmark timestamp kept");
assert(merged.ayahEdits["2:255"].reflection === "remote", "newer ayah edit wins");
assert(merged.ayahEdits["1:1"].reflection === "only remote", "remote-only edit kept");

const localWins = mergeBundles(
  { ...local, prefs: { readMode: "ai", updatedAt: 999 } },
  remote
);
assert(localWins.prefs.readMode === "ai", "local prefs win when newer");

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll merge tests passed.");
