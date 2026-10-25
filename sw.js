/* YNAB 26 service worker: caches the app shell only, so the app opens instantly and offline.
   It never touches API calls: only same-origin GET requests for the files below are handled, and the
   Apps Script API lives on script.google.com (another origin), so its requests go straight to the network.
   Shell files are fetched network-first (a new deploy shows up on the next open) with the cache as a
   fallback when offline. Bump SHELL_VERSION when the list changes. */
var SHELL_VERSION = 'ynab26-shell-v2';
var SHELL = [
  './', 'index.html', 'config.js', 'lib.js', 'vendor/chart.umd.min.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL_VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('ynab26-shell-') === 0 && k !== SHELL_VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isShell(url) {
  var scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || url.pathname.indexOf(scope.pathname) !== 0) return false;
  var rel = url.pathname.slice(scope.pathname.length) || './';
  return SHELL.indexOf(rel) >= 0;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                 // API calls are POSTs: never intercepted
  var url = new URL(req.url);
  if (!isShell(url)) return;                        // other origins (the API) and other files: browser default
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(SHELL_VERSION).then(function (c) { c.put(req.url.split('#')[0], copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return (req.mode === 'navigate' ? caches.match('./') : Promise.resolve(null)).then(function (page) {
          return page || Response.error();
        });
      });
    })
  );
});
