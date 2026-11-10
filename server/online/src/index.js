// RHRE Web のオンライン人数（Cloudflare Workers + Durable Objects）
// 今 RHRE Web を開いている端末の数を数えて、つないでいる全員に知らせる。
// 受け取るのは端末ごとのランダムな番号だけ（名前などは受け取らない・保存しない）。同じ端末のタブは 1 つと数える。
//  ・/ws    ：WebSocket でつなぐ（?d=端末の番号）。人数が変わるたびに {"online": 人数} が届く
//  ・/count ：今の人数を JSON で返す
// 端末は 30 秒ごとに "ping"（サーバーを起こさずに "pong" を返す）、60 秒ごとに "count" を送る。
// 90 秒以上 ping が来ない端末は、電源が切れたなどとみなして数えない。
import { DurableObject } from 'cloudflare:workers';

const ALLOWED_ORIGINS = ['https://pika1013.github.io', 'http://localhost:8123'];
const STALE_MS = 90_000;

const counterOf = (env) => env.ONLINE.get(env.ONLINE.idFromName('rhre-web'));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      if (!ALLOWED_ORIGINS.includes(request.headers.get('Origin') || '')) return new Response('Forbidden', { status: 403 });
      return counterOf(env).fetch(request);
    }
    if (url.pathname === '/count') {
      const res = await counterOf(env).fetch(new Request(new URL('/count', url)));
      return new Response(res.body, {
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
      });
    }
    return new Response('RHRE Web online counter\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};

export class OnlineCounter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // ping にはサーバーを起こさずに返事をする（休んでいる間はお金も通信回数もかからない）
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // つないでいる端末の数（90 秒以上 ping が来ないものは閉じて数えない）
  online(except) {
    const now = Date.now();
    const devices = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const info = ws.deserializeAttachment() || {};
      const last = Math.max(this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0, info.t || 0);
      if (now - last > STALE_MS) { try { ws.close(1001, 'stale'); } catch (_) { /* もう閉じている */ } continue; }
      devices.add(info.d);
    }
    return devices.size;
  }

  broadcast(except) {
    const msg = JSON.stringify({ online: this.online(except) });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(msg); } catch (_) { /* 閉じかけ */ }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/count') return Response.json({ online: this.online() });
    const d = (url.searchParams.get('d') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || crypto.randomUUID();
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ d, t: Date.now() });
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    if (msg === 'count') {
      const info = ws.deserializeAttachment() || {};
      ws.serializeAttachment({ ...info, t: Date.now() });
      try { ws.send(JSON.stringify({ online: this.online() })); } catch (_) { /* 閉じかけ */ }
    }
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'bye'); } catch (_) { /* もう閉じている */ }
    this.broadcast(ws);
  }

  async webSocketError(ws) {
    this.broadcast(ws);
  }
}
