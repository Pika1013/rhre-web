// RHRE Web のサービスワーカー：ネットがなくても使えるように、使ったものを端末に保存しておく。
//  ・このサイトのページ：まずネットから（新しい版をすぐ受け取る）。つながらなければ保存しておいたものを出す
//  ・このサイトのほかのファイル（プログラム・画像など）：保存しておいたものをすぐ出し、裏でネットから新しくする
//  ・音のデコーダ・フォント・GitHub からの予備の読み込み：URL ごとに中身が変わらないので、一度読んだら保存したものを使う
//  ・効果音とミニゲームの定義（jsDelivr の /gh/）は、アプリ自身が「rhre-db-…」に保存しているので、ここでは触らない
//  ・version.json（更新の確認）とアクセス数は、いつもネットへ（保存しない）
const APP_CACHE = 'rhre-app-v1';
const CDN_CACHE = 'rhre-ext-v1';
const OWN_PREFIXES = ['rhre-app-', 'rhre-ext-', 'rhre-cdn-'];
const isCdn = (url) => (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/'))
  || url.hostname === 'raw.githubusercontent.com' || url.hostname === 'fonts.gstatic.com';
const SWR_HOSTS = ['fonts.googleapis.com'];

const scopeUrl = () => new URL('./', self.registration.scope).href;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.add(scopeUrl())).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 自分の古い保存場所だけ消す（アプリの rhre-db-… などは消さない）
    const keep = [APP_CACHE, CDN_CACHE];
    for (const k of await caches.keys()) {
      if (OWN_PREFIXES.some((p) => k.startsWith(p)) && !keep.includes(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

// 同じファイルの古い版（?v=60 と ?v=61 など）は、新しいほうを保存したら消す
async function pruneOldVersions(cache, req) {
  const url = new URL(req.url);
  if (!url.search) return;
  for (const k of await cache.keys()) {
    const u = new URL(k.url);
    if (u.origin === url.origin && u.pathname === url.pathname && u.search !== url.search) await cache.delete(k);
  }
}

// ページ：ネットを先に（4 秒でつながらなければ保存したもの）
async function pageNetworkFirst(event) {
  const cache = await caches.open(APP_CACHE);
  const key = scopeUrl();
  try {
    const res = await Promise.race([
      fetch(event.request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
    ]);
    if (res && res.ok) event.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (_) {
    return (await cache.match(key)) || (await cache.match(event.request, { ignoreSearch: true })) || Response.error();
  }
}

// 保存したものをすぐ出して、裏でネットから新しくする
async function staleWhileRevalidate(event, cacheName, allowOpaque) {
  const cache = await caches.open(cacheName);
  const req = event.request;
  const cached = await cache.match(req);
  const fresh = fetch(req).then(async (res) => {
    if (res && (res.ok || (allowOpaque && res.type === 'opaque'))) {
      await cache.put(req, res.clone());
      await pruneOldVersions(cache, req);
    }
    return res;
  }).catch(() => null);
  event.waitUntil(fresh);
  return cached || (await fresh) || Response.error();
}

// 一度読んだら、保存したものを使う（URL に版が入っていて中身が変わらないもの）
async function cacheFirst(event) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  try {
    const res = await fetch(event.request);
    if (res && res.ok) event.waitUntil(cache.put(event.request, res.clone()));
    return res;
  } catch (_) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { event.respondWith(pageNetworkFirst(event)); return; }
    if (url.pathname.endsWith('/version.json')) return;
    event.respondWith(staleWhileRevalidate(event, APP_CACHE, false));
    return;
  }
  if (isCdn(url)) { event.respondWith(cacheFirst(event)); return; }
  if (SWR_HOSTS.includes(url.hostname)) { event.respondWith(staleWhileRevalidate(event, CDN_CACHE, true)); }
  // それ以外（アクセス数など）は何もしない＝そのままネットへ
});
