// Optional free Cloudflare Worker relay for Glassnote temporary live rooms.
// Deploy once with: npx wrangler deploy (inside collab-worker/)
export class Room {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = crypto.randomUUID().slice(0, 8);
    this.state.acceptWebSocket(server, [id]);
    const all = this.state.getWebSockets();
    server.send(JSON.stringify({ t: 'welcome', id, count: all.length }));
    for (const ws of all) if (ws !== server) try { ws.send(JSON.stringify({ t: 'join', id, count: all.length })); } catch (_) {}
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, raw) {
    const id = (this.state.getTags(ws) || [])[0] || 'peer';
    let msg; try { msg = JSON.parse(String(raw)); } catch (_) { return; }
    msg.from = id;
    const out = JSON.stringify(msg);
    for (const peer of this.state.getWebSockets()) if (peer !== ws) try { peer.send(out); } catch (_) {}
  }
  webSocketClose(ws) {
    const id = (this.state.getTags(ws) || [])[0] || 'peer';
    const rem = this.state.getWebSockets().filter(p => p !== ws);
    for (const peer of rem) try { peer.send(JSON.stringify({ t: 'leave', id, count: rem.length })); } catch (_) {}
  }
}

export default {
  async fetch(req, env) {
    const m = new URL(req.url).pathname.match(/^\/ws\/([a-zA-Z0-9_-]{3,40})/);
    if (!m) return new Response('Glassnote collab relay OK', { status: 200 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    return stub.fetch(req);
  },
};
