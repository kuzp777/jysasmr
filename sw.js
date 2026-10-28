// JY's ASMR · Service Worker
// 缓存策略：
//   - 静态资源（HTML/CSS/JS/图标）→ 缓存优先，后台更新
//   - videos.json → 网络优先，失败退回缓存（保证能看列表）
//   - 封面图 → 缓存优先，渐进积累
//   - B 站/YouTube 播放 → 不拦截（保持在线体验）

const VERSION = 'v1.0.0';
const STATIC_CACHE = `jys-static-${VERSION}`;
const DATA_CACHE = `jys-data-${VERSION}`;
const IMAGE_CACHE = `jys-img-${VERSION}`;

const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './user-data.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k.startsWith('jys-') && !k.endsWith(VERSION))
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // 跨域（B 站 / YouTube）不拦截
    if (url.origin !== self.location.origin) return;

    // 数据：网络优先
    if (url.pathname.endsWith('videos.json') || url.pathname.endsWith('/sync_bilibili_search.py')) {
        event.respondWith(
            fetch(req)
                .then(res => {
                    const clone = res.clone();
                    caches.open(DATA_CACHE).then(c => c.put(req, clone));
                    return res;
                })
                .catch(() => caches.match(req))
        );
        return;
    }

    // 封面图：缓存优先
    if (url.pathname.includes('/covers/') || /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(url.pathname)) {
        event.respondWith(
            caches.match(req).then(hit => {
                if (hit) return hit;
                return fetch(req).then(res => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const clone = res.clone();
                        caches.open(IMAGE_CACHE).then(c => c.put(req, clone));
                    }
                    return res;
                });
            })
        );
        return;
    }

    // 静态资源：缓存优先 + 后台更新
    if (req.mode === 'navigate' || /\.(js|css|html|json|svg|ico|woff2?)$/i.test(url.pathname) || url.pathname.endsWith('/')) {
        event.respondWith(
            caches.match(req).then(hit => {
                const fetching = fetch(req).then(res => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(STATIC_CACHE).then(c => c.put(req, clone));
                    }
                    return res;
                }).catch(() => hit);
                return hit || fetching;
            })
        );
        return;
    }
});
