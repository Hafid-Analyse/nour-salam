/**
 * عامل الخدمة — السجل اليومي
 * • ملفات الواجهة: من الشبكة أولاً (أحدث نسخة دائماً)، ومن الذاكرة عند انقطاع الاتصال
 * • الأيقونات والخطوط: من الذاكرة أولاً (أسرع)
 * • طلبات الخادم (Apps Script) لا تُخزَّن أبداً
 */
const VERSION = 'ns-shell-v7';
const SHELL = [
  './', './index.html', './style.css', './app.js', './config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const font = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!same && !font) return;

  const staticAsset = font || /\/icons\//.test(url.pathname);
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: same });
    // ملفات الواجهة: تجاوز ذاكرة المتصفح والتحقق من الخادم في كل مرة (لا تبقى نسخة قديمة)
    const net = fetch(same && !staticAsset ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    });
    if (staticAsset && hit) { net.catch(() => {}); return hit; }
    try { return await net; }
    catch (err) { return hit || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()); }
  }));
});
