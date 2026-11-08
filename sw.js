// RHRE Web のサービスワーカー。Android の「アプリとしてインストール」のためだけに置いている。
// 何も保存せず、同じサイトの読み込みをそのままネットに通すだけ（更新はいつもどおり version.json で）
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req));
});
