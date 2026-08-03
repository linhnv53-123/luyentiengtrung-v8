var CACHE_NAME = 'hanzi-trainer-v10.2-session-unlock';
var APP_SHELL = [
  './',
  './index.html',
  './css/app.css',
  './data/default-data.js',
  './js/storage.js',
  './js/drawing.js',
  './js/review.js',
  './js/remote-data.js',
  './js/data-manager.js',
  './js/dictionary.js',
  './js/study-reference.js',
  './js/github-notebook-sync.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isDataRequest(request) {
  var url = new URL(request.url);
  return /\/data\/(lessons\.json|characters\.json|default-data\.js|lessons\/)/.test(url.pathname);
}

function getIndexUrl() {
  return new URL('./index.html', self.registration.scope).href;
}

function isAppEntryNavigation(request) {
  var requestUrl = new URL(request.url);
  var scopeUrl = new URL(self.registration.scope);
  var scopePath = scopeUrl.pathname;
  var path = requestUrl.pathname;

  if (requestUrl.origin !== scopeUrl.origin || path.indexOf(scopePath) !== 0) {
    return false;
  }

  var relativePath = path.slice(scopePath.length);
  return relativePath === '' || relativePath === '/' || relativePath === 'index.html';
}

function networkFirst(request) {
  return fetch(request, { cache: 'no-store' }).then(function (response) {
    var copy;
    if (response && response.status === 200) {
      copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(request, copy);
      });
    }
    return response;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      if (cached) {
        return cached;
      }
      return new Response('', { status: 504, statusText: 'Offline' });
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(function (cached) {
    var update = fetch(request).then(function (response) {
      var copy;
      if (response && response.status === 200) {
        copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, copy);
        });
      }
      return response;
    }).catch(function () {
      return cached;
    });
    return cached || update;
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET' || !isSameOrigin(event.request)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    // Chỉ dùng index.html làm trang ứng dụng cho đúng URL gốc.
    // Không bao giờ ghi nội dung /tests/*.js hay trang khác đè lên index.html.
    if (!isAppEntryNavigation(event.request)) {
      return;
    }

    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).then(function (response) {
        var contentType = response.headers.get('content-type') || '';
        if (response.status === 200 && contentType.indexOf('text/html') !== -1) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(getIndexUrl(), copy);
          });
        }
        return response;
      }).catch(function () {
        return caches.match(getIndexUrl());
      })
    );
    return;
  }

  if (isDataRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});
