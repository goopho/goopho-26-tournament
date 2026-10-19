// GOOPHO 26 - service worker: rende l'app utilizzabile anche senza internet.
// Quando pubblichi una nuova versione dell'app, cambia il numero qui sotto
// (es. v2, v3...) così i dispositivi scaricano l'aggiornamento.
const VERSION = "goopho26-v118";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  // live.html c'è solo nella versione pubblicata: se manca non è un errore
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_SHELL).then(() => c.add("./live.html").catch(() => {}))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== VERSION + "-regs" && k !== VERSION + "-fonts").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Font di Google: una volta scaricati restano in memoria per l'uso offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(VERSION + "-fonts").then((cache) =>
        cache.match(req).then((hit) => {
          const net = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Pagina dell'app: prima prova la rete (per avere sempre l'ultima versione),
  // se non c'è connessione usa la copia salvata.
  if (req.mode === "navigate") {
    event.respondWith(
      // cache "no-cache": chiede sempre al sito se c'è una versione nuova (niente copie vecchie di 10 minuti)
      // la pagina della Live (live.html) e quella dell'app si salvano separate
      fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then((res) => {
        const copy = res.clone(), key = /live\.html$/.test(url.pathname) ? "./live.html" : "./index.html";
        if (res.ok) caches.open(VERSION).then((c) => c.put(key, copy));
        return res;
      }).catch(() => caches.match(/live\.html$/.test(url.pathname) ? "./live.html" : "./index.html"))
    );
    return;
  }

  // Regolamenti: prima la rete (così si vedono quelli nuovi), senza internet la copia salvata.
  if (url.pathname.indexOf("/regolamenti/") !== -1) {
    event.respondWith(
      fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION + "-regs").then((c) => c.put(req, copy)); } return res; })
        .catch(() => caches.open(VERSION + "-regs").then((c) => c.match(req, { ignoreSearch: true })))
    );
    return;
  }

  // Altri file (icone, manifest): prima la copia salvata.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});

// tocco sulla notifica "Tocca a te": riporta alla pagina della Live
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      const u = (event.notification.data && event.notification.data.url) || "./";
      return self.clients.openWindow ? self.clients.openWindow(u) : null;
    })
  );
});
