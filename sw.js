/* Офлайн-кэш демо-версии. */
const C = "shinamashina-web-demo-v2";
const FILES = ["./", "index.html", "owner.html", "book.html", "client.html", "css/app.css", "logo-header.png", "icon.svg", "manifest.webmanifest", "vendor/xlsx.full.min.js",
  "js/prices-data.js", "js/core.js", "js/store.js", "js/prices.js", "js/cart.js", "js/payroll.js", "js/shift.js", "js/orders.js", "js/warehouse.js", "js/storage.js", "js/booking.js", "js/reports.js", "js/excel.js", "js/seed.js", "js/docs.js", "js/consent.js",
  "ui/base.js", "ui/report-view.js", "ui/kassa.js", "ui/shift.js", "ui/clients.js", "ui/storage.js", "ui/warehouse.js", "ui/bookings.js", "ui/admin.js"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => { if (e.request.method !== "GET") return; e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request))); });
