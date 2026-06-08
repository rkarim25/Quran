#!/usr/bin/env node
/** Quick sanity check for QuranGitHubSync merge helpers (no network). */
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "../docs/github-sync.js"), "utf8");
const fn = new Function(`${src}; return QuranGitHubSync;`);
const sync = fn();

const local = {
  version: 1,
  updatedAt: 100,
  prefs: { readMode: "translation", updatedAt: 100 },
  lastRead: { surah: 2, ayah: 5, at: 100 },
  bookmarks: [{ surah: 1, ayah: 1, at: 50, snippet: "old" }],
  ayahEdits: {
    "2:5": { translation: "local", updatedAt: 100 },
  },
};

const remote = {
  version: 1,
  updatedAt: 200,
  prefs: { readMode: "arabic", updatedAt: 200 },
  lastRead: { surah: 3, ayah: 1, at: 200 },
  bookmarks: [
    { surah: 1, ayah: 1, at: 150, snippet: "newer" },
    { surah: 4, ayah: 2, at: 120, snippet: "remote only" },
  ],
  ayahEdits: {
    "2:5": { translation: "remote", updatedAt: 80 },
    "3:1": { translation: "only remote", updatedAt: 200 },
  },
};

const merged = sync.mergeBundles(local, remote);

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

assert(merged.prefs.readMode === "arabic", "remote prefs should win");
assert(merged.lastRead.surah === 3, "remote lastRead should win");
assert(merged.bookmarks.length === 2, "bookmarks union");
assert(merged.bookmarks.find((b) => b.surah === 1).snippet === "newer", "bookmark keeps newer at");
assert(merged.ayahEdits["2:5"].translation === "local", "local ayah edit newer wins");
assert(merged.ayahEdits["3:1"].translation === "only remote", "remote-only ayah included");

console.log("All merge tests passed.");
