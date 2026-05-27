// 外卖比价 AI 助手 - PWA 离线缓存
const CACHE_NAME = "waimai-ai-cache-v1";
const CACHE_FILES = [
  "/",
  "/index.html",
  "/api/compare.js",
  "https://cdn.tailwindcss.com"
];

// 安装缓存
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

// 激活清理旧缓存
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    })
  );
  return self.clients.claim();
});

// 拦截请求，离线可用
self.addEventListener("fetch", (event) => {
  if (
    event.request.url.includes("api/compare") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
