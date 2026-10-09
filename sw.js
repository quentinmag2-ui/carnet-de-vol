// Fonctionnement hors ligne : tous les fichiers de l'app sont gardés sur le téléphone.
// À chaque nouvelle version publiée, changer VERSION ci-dessous : les téléphones téléchargent la nouvelle version.
const VERSION = "carnet-1.5.2";
const FILES = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/app.js", "js/polyfills.js", "js/core.js", "js/calendar.js", "js/releve.js", "js/store.js",
  "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "vendor/land.json",
  "fonts/Barlow-Regular.woff", "fonts/Barlow-Medium.woff", "fonts/Barlow-SemiBold.woff",
  "fonts/BarlowCondensed-Medium.woff", "fonts/BarlowCondensed-SemiBold.woff", "fonts/BarlowCondensed-Bold.woff",
  "fonts/IBMPlexMono-Regular.woff", "fonts/IBMPlexMono-Medium.woff",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match("index.html"))));
});
