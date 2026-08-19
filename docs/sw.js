/* Service worker — offline support for the Qur'an reader.
   Strategy:
   - Navigations: network-first, fall back to the cached SPA shell (index.html).
   - Same-origin assets + data + fonts (and the cross-origin font/SDK files):
     stale-while-revalidate — serve from cache instantly, refresh in the
     background. After one online visit the whole app + any surahs you opened
     work with no connection.
   - Firebase Auth/Firestore endpoints and build.json are never intercepted, so
     sign-in, cross-device sync, and the auto-update check still need (and use)
     the live network.
   Bump VERSION on any change here to roll caches over. */
const VERSION = "2026-08-19ad";
const CORE = `quran-core-${VERSION}`;
const RUNTIME = `quran-runtime-${VERSION}`;

// Stable-URL shell assets worth precaching so the app frame loads offline.
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./site.webmanifest",
  "./favicon.svg",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
];

// Live endpoints that must always hit the network (caching them breaks auth/sync
// or the new-build check).
const NETWORK_ONLY_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "www.googleapis.com",
  "firebaseinstallations.googleapis.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE).then((c) => c.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CORE && k !== RUNTIME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Never cache auth/sync/installations calls, or the auto-update probe.
  if (NETWORK_ONLY_HOSTS.includes(url.hostname)) return;
  if (url.pathname.endsWith("build.json")) return;

  // SPA navigations: try the network (so deploys land), fall back to the shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CORE);
          cache.put("./index.html", fresh.clone());
          return fresh;
        } catch (_) {
          return (
            (await caches.match("./index.html")) ||
            (await caches.match("./")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // Everything else (CSS/JS/JSON data/fonts, same- or cross-origin): SWR.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })()
  );
});
