// みんなで編集：曲を端末どうしで直接送る（WebRTC のデータチャンネル）。
// 部屋のサーバーは、つなぐための紹介（sig：相手の住所など）を相手に渡すだけで、曲はサーバーを通らない。
// 中継サーバー（TURN）は使わない。直接つながらないときは失敗にして、ほかの人から受け取るか、自分で同じ曲を選んでもらう。
// 自分の外から見た住所を調べるのに、公開されている STUN サーバー（Google・Cloudflare）を使う（曲は通らない）。
//
// 紹介の中身（どれも { k, id, ... }。id は 1 回の受け渡しの番号）
//  受け取る側 → 送る側： offer（曲の目印 hash と、つなぎ方）／ ice（住所の候補）
//  送る側 → 受け取る側： answer ／ ice ／ busy（今たくさん送っている）／ nosong（その曲を持っていない）
// データチャンネルでは、最初に {"size":バイト数}、次に 16KB ずつの曲、最後に {"end":true} を送る。

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const CHUNK = 16 * 1024;
const OPEN_TIMEOUT = 20000; // つながるまで待つ
const IDLE_TIMEOUT = 15000; // 届くのが止まってから待つ
const MAX_UPLOADS = 2; // 同時に送る相手の数（受け取った人も送れるので、部屋を作った人の通信量が軽くなる）

// 曲の目印（SHA-256 の頭 16 バイト）
export async function songHash(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const canShareSongs = () => typeof RTCPeerConnection === 'function' && !!crypto?.subtle;

export class SongShare {
  // sendSig(相手の番号, 中身)：部屋のサーバーに紹介を頼む ／ getSong()：今送れる曲 { hash, bytes } か null
  constructor(sendSig, getSong) {
    this.sendSig = sendSig;
    this.getSong = getSong;
    this.links = new Map();
    this.uploads = 0;
  }

  // 受け取る：provider（相手の番号）から目印 hash の曲をもらう。届いたら Uint8Array、だめなら例外
  fetch(provider, hash, onProgress) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2, 10);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const link = { id, pc, peer: provider, ice: [] };
      this.links.set(id, link);
      const chunks = [];
      let size = 0, got = 0, idle = 0, finished = false;
      const dc = pc.createDataChannel('song', { ordered: true });
      dc.binaryType = 'arraybuffer';
      const end = (err, bytes) => {
        if (finished) return;
        finished = true;
        clearTimeout(openTimer);
        clearTimeout(idle);
        this.links.delete(id);
        try { dc.close(); } catch (_) { /* もう閉じている */ }
        try { pc.close(); } catch (_) { /* もう閉じている */ }
        if (err) reject(err); else resolve(bytes);
      };
      const bump = () => { clearTimeout(idle); idle = setTimeout(() => end(new Error('idle')), IDLE_TIMEOUT); };
      const openTimer = setTimeout(() => end(new Error('connect')), OPEN_TIMEOUT);
      link.fail = (why) => end(new Error(why));
      dc.onopen = () => { clearTimeout(openTimer); bump(); };
      dc.onmessage = (e) => {
        bump();
        if (typeof e.data === 'string') {
          let m = null;
          try { m = JSON.parse(e.data); } catch (_) { return; }
          if (m?.size) size = m.size;
          else if (m?.end) {
            const out = new Uint8Array(got);
            let o = 0;
            for (const c of chunks) { out.set(new Uint8Array(c), o); o += c.byteLength; }
            end(null, out);
          }
          return;
        }
        chunks.push(e.data);
        got += e.data.byteLength;
        onProgress?.(size ? Math.min(1, got / size) : 0);
      };
      dc.onclose = () => end(new Error('closed'));
      pc.onicecandidate = (e) => { if (e.candidate) this.sendSig(provider, { k: 'ice', id, c: e.candidate.toJSON() }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') end(new Error('connect')); };
      (async () => {
        await pc.setLocalDescription(await pc.createOffer());
        this.sendSig(provider, { k: 'offer', id, hash, sdp: pc.localDescription.toJSON() });
      })().catch((e) => end(e));
    });
  }

  // 部屋のサーバーから届いた紹介
  onSig(from, d) {
    if (!d || typeof d !== 'object' || typeof d.id !== 'string') return;
    if (d.k === 'offer') { this.serve(from, d); return; }
    const link = this.links.get(d.id);
    if (!link || link.peer !== from) return;
    if (d.k === 'answer') {
      link.remote = link.pc.setRemoteDescription(d.sdp);
      link.remote.then(() => { for (const c of link.ice.splice(0)) link.pc.addIceCandidate(c).catch(() => {}); }, () => link.fail?.('sdp'));
    } else if (d.k === 'ice') {
      // 相手のつなぎ方を受け取る前に届いた住所の候補は、受け取ってから入れる
      if (link.remote) link.remote.then(() => link.pc.addIceCandidate(d.c)).catch(() => {});
      else link.ice.push(d.c);
    } else if (d.k === 'busy' || d.k === 'nosong') link.fail?.(d.k);
  }

  // 送る：相手からの offer に答えて、データチャンネルで曲を送る
  serve(from, d) {
    const song = this.getSong();
    if (!song || song.hash !== d.hash) { this.sendSig(from, { k: 'nosong', id: d.id }); return; }
    if (this.uploads >= MAX_UPLOADS) { this.sendSig(from, { k: 'busy', id: d.id }); return; }
    this.uploads++;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const link = { id: d.id, pc, peer: from, ice: [] };
    this.links.set(d.id, link);
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      clearTimeout(safety);
      this.uploads = Math.max(0, this.uploads - 1);
      this.links.delete(d.id);
      setTimeout(() => { try { pc.close(); } catch (_) { /* もう閉じている */ } }, 1000);
    };
    const safety = setTimeout(end, 10 * 60 * 1000); // どうしても終わらないとき
    link.fail = end;
    pc.onicecandidate = (e) => { if (e.candidate) this.sendSig(from, { k: 'ice', id: d.id, c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') end(); };
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.binaryType = 'arraybuffer';
      dc.bufferedAmountLowThreshold = 256 * 1024;
      dc.onclose = end;
      dc.onopen = async () => {
        const bytes = song.bytes;
        try {
          dc.send(JSON.stringify({ size: bytes.byteLength }));
          for (let o = 0; o < bytes.byteLength; o += CHUNK) {
            if (dc.readyState !== 'open') { end(); return; }
            // 送り待ちがたまったら、減るまで待つ（一度に詰め込むと落ちる）
            if (dc.bufferedAmount > 1024 * 1024) await new Promise((r) => { dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; r(); }; });
            dc.send(bytes.slice(o, Math.min(o + CHUNK, bytes.byteLength)).buffer);
          }
          dc.send(JSON.stringify({ end: true }));
        } catch (_) { end(); }
      };
    };
    link.remote = pc.setRemoteDescription(d.sdp);
    link.remote
      .then(async () => {
        for (const c of link.ice.splice(0)) pc.addIceCandidate(c).catch(() => {});
        await pc.setLocalDescription(await pc.createAnswer());
        this.sendSig(from, { k: 'answer', id: d.id, sdp: pc.localDescription.toJSON() });
      })
      .catch(end);
  }

  closeAll() {
    for (const l of [...this.links.values()]) l.fail?.('leave');
  }
}
