// 가계부 — PWA 서비스워커
// 앱 껍데기(HTML/아이콘)만 최소한으로 캐싱해서 "홈 화면에서 바로 열리는" 경험을 위한 용도예요.
// 데이터는 이 기기의 localStorage에만 저장되고, 서버로 전송되지 않아요.

const CACHE_NAME = 'ledger-shell-v1';
const SHELL_FILES = [
  './ledger.html',
  './ledger-manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
