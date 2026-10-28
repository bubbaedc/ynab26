/* YNAB 26 service worker: caches the app shell only, so the app opens instantly and offline.
   It never touches API calls: only same-origin GET requests for the files below are handled, and the
   Apps Script API lives on script.google.com (another origin), so its requests go straight to the network.
   Shell files are served cache-first (no network wait when the app opens) and refreshed in the background,
   so a new deploy shows up on the open after next. Bump SHELL_VERSION when the list changes. */
var SHELL_VERSION = 'ynab26-shell-v3';
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
  var key = req.url.split('#')[0];
  var update = fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      return caches.open(SHELL_VERSION).then(function (c) { return c.put(key, copy); }).then(function () { return res; });
    }
    return res;
  });
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) {
        e.waitUntil(update.catch(function () {}));        // refresh the copy for next time
        return hit;
      }
      return update.catch(function () {
        return (req.mode === 'navigate' ? caches.match('./') : Promise.resolve(null)).then(function (page) {
          return page || Response.error();
        });
      });
    })
  );
});
