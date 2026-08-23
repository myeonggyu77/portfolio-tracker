// 포트폴리오 원장 — PWA 서비스워커
// 앱 껍데기(HTML/아이콘)만 최소한으로 캐싱해서 "홈 화면에서 바로 열리는" 경험을 위한 용도예요.
// 실제 데이터(Supabase, 구글시트)는 캐싱하지 않고 항상 네트워크에서 최신 값을 가져와요.

const CACHE_NAME = 'portfolio-shell-v1';
const SHELL_FILES = [
  './portfolio-tracker.html',
  './manifest.json',
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

  // 같은 출처(GitHub Pages)의 요청만 다루고, Supabase/구글시트/CDN 등 외부 요청은 그대로 통과시켜요.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 앱 파일(HTML 등)은 "네트워크 우선, 실패하면 캐시" — 항상 최신 버전을 우선 시도해요.
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
