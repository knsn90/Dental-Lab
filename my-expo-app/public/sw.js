// Service Worker — PWA installability + otomatik güncelleme + offline shell.
//
// Cache stratejisi:
//   • HTML (navigate): NETWORK-FIRST → her zaman taze sürüm; offline'da cache fallback
//   • Statik asset (JS/CSS): STALE-WHILE-REVALIDATE → eski sürüm anında render,
//     arka planda yeni sürüm fetch + cache update
//   • Supabase: SW dokunmaz — her zaman direkt network
//
// Otomatik güncelleme:
//   • İstemci sayfası ~30sn'de bir SW update kontrol eder (window tarafında)
//   • SW skipWaiting + clients.claim → yeni sürüm anında devreye girer
//   • Asset cache STALE-WHILE-REVALIDATE → kullanıcı reload yapmadan da yenilenir
//
// Production deploy'da CACHE sabitini bump etmek ZORUNLU (eski cache'ler silinir).

const CACHE = 'siman-shell-v2';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // İlk açılış hızı kritik — install sırasında SADECE küçük shell dosyalarını cache'le.
  // JS/CSS bundle'larını install'da fetch etmiyoruz çünkü browser zaten page load için
  // indiriyor; ikinci kez no-store ile çekmek 2x bandwidth + minutes-long ilk yükleme
  // demek oluyordu. Runtime fetch handler (stale-while-revalidate) ilk hit'te cache'ler.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => null),
  );
  // Yeni SW kuyrukta beklemesin — anında aktif olsun
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Eski cache'leri sil
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      // Tüm açık sekmeleri yeni SW'a bağla
      await self.clients.claim();
      // Her sekmeye "yeni sürüm aktif oldu" mesajı gönder — istemci toast gösterebilir
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) c.postMessage({ type: 'SW_ACTIVATED', cache: CACHE });
    })(),
  );
});

// Manuel SW skipWaiting tetikleyici (istemciden gelen mesaj)
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname.includes('supabase.co')) return;

  // HTML navigate — NETWORK-FIRST (her zaman taze HTML, offline fallback "/")
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // HTML'i cache'e de yansıt (offline için)
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Same-origin statik asset — STALE-WHILE-REVALIDATE
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => null);
          }
          return res;
        }).catch(() => cached);
        // Cache varsa anında ver, arka planda yenile
        return cached || networkFetch;
      }),
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
//
// Backend (edge function `send-web-push`) bir kullanıcının subscription
// endpoint'ine VAPID-imzalı POST gönderir. Tarayıcı bu SW'i uyandırır ve
// 'push' event'i tetiklenir — sekme kapalı olsa bile çalışır.
//
// Payload formatı (JSON):
//   {
//     title:       string,
//     body:        string,
//     icon?:       string,    // default: /icons/icon-192.png
//     badge?:      string,    // default: /icons/icon-96.png
//     tag?:        string,    // aynı tag varsa replace eder
//     data?:       { url, notificationId, ... }   // tıklayınca client.openWindow(url)
//     requireInteraction?: boolean,
//     silent?:     boolean,
//   }
// ══════════════════════════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // payload düz string olabilir
    try { data = { title: event.data.text() }; } catch { data = {}; }
  }

  const title = data.title || 'Siman';
  const options = {
    body:    data.body || '',
    icon:    data.icon  || '/icons/icon-192.png',
    badge:   data.badge || '/icons/icon-192.png',
    tag:     data.tag,
    data:    data.data || {},
    requireInteraction: data.requireInteraction === true,
    silent:  data.silent === true,
    timestamp: Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Açık bir sekmede zaten varsa onu öne al + url'e navigate et
    for (const c of allClients) {
      try {
        // postMessage ile client-side navigate et (in-app router)
        c.postMessage({ type: 'NOTIFICATION_CLICK', url, data: event.notification.data });
        await c.focus();
        return;
      } catch { /* skip */ }
    }
    // Hiç açık sekme yoksa yeni pencere aç
    if (self.clients.openWindow) {
      await self.clients.openWindow(url);
    }
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Tarayıcı subscription'ı yeniliyor — yeni endpoint'i client'a bildir
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window' });
    for (const c of allClients) {
      c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' });
    }
  })());
});
