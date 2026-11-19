// Glassnote temporary collaboration relay + static file server (zero npm dependencies).
// Usage: npm run collab   (or: PORT=5174 node scripts/collab-server.mjs)
// Rooms live in memory only and disappear automatically when everyone disconnects.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5174);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const rooms = new Map(); // roomId -> { clients: Set<Client>, lastNb: object|null }

function wsFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let hdr;
  if (len < 126) hdr = Buffer.from([0x81, len]);
  else if (len < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x81; hdr[1] = 126; hdr.writeUInt16BE(len, 2); }
  else { hdr = Buffer.alloc(10); hdr[0] = 0x81; hdr[1] = 127; hdr.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([hdr, payload]);
}

function send(client, obj) {
  if (client.socket.destroyed) return;
  try { client.socket.write(wsFrame(typeof obj === 'string' ? obj : JSON.stringify(obj))); } catch (_) {}
}

function broadcast(roomId, msg, except) {
  const room = rooms.get(roomId); if (!room) return;
  const frame = wsFrame(typeof msg === 'string' ? msg : JSON.stringify(msg));
  for (const c of room.clients) if (c !== except && !c.socket.destroyed) { try { c.socket.write(frame); } catch (_) {} }
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? 'glassnote.html' : urlPath.replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  if (!full.startsWith(root) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
});

server.on('upgrade', (req, socket) => {
  const m = (req.url || '').match(/^\/ws\/([a-zA-Z0-9_-]{3,40})/);
  const key = req.headers['sec-websocket-key'];
  if (!m || !key) { socket.destroy(); return; }
  const roomId = m[1];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const client = { id: crypto.randomBytes(4).toString('hex'), socket, roomId };
  if (!rooms.has(roomId)) rooms.set(roomId, { clients: new Set(), lastNb: null });
  const room = rooms.get(roomId);
  room.clients.add(client);
  send(client, { t: 'welcome', id: client.id, count: room.clients.size });
  if (room.lastNb) send(client, { t: 'nb', nb: room.lastNb });
  broadcast(roomId, { t: 'join', id: client.id, count: room.clients.size }, client);

  let buf = Buffer.alloc(0);
  let fragChunks = [];
  const cleanup = () => {
    const r = rooms.get(roomId);
    if (r) {
      r.clients.delete(client);
      if (r.clients.size === 0) rooms.delete(roomId);
      else broadcast(roomId, { t: 'leave', id: client.id, count: r.clients.size });
    }
  };

  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const total = off + (masked ? 4 : 0) + len;
      if (buf.length < total) return;
      if (opcode === 0x8) { socket.end(); return; }
      if (opcode === 0x9) { socket.write(Buffer.from([0x8a, 0])); buf = buf.subarray(total); continue; }
      if (opcode === 0xa) { buf = buf.subarray(total); continue; }
      let data = buf.subarray(off + (masked ? 4 : 0), total);
      if (masked) {
        const mask = buf.subarray(off, off + 4);
        const out = Buffer.alloc(len);
        for (let i = 0; i < len; i++) out[i] = data[i] ^ mask[i & 3];
        data = out;
      }
      buf = buf.subarray(total);
      if (opcode === 0x1 || opcode === 0x0) {
        fragChunks.push(data);
        if (!fin) continue;
        const full = fragChunks.length === 1 ? fragChunks[0] : Buffer.concat(fragChunks);
        fragChunks = [];
        try {
          const msg = JSON.parse(full.toString('utf8'));
          msg.from = client.id;
          if (msg.t === 'nb' && msg.nb) room.lastNb = msg.nb;
          else if (msg.t === 'delta' && room.lastNb && room.lastNb.pages && room.lastNb.pages[msg.pi]) {
            const pg = room.lastNb.pages[msg.pi], rem = new Set(msg.removed || []);
            const kept = pg.items.filter(it => !it.id || !rem.has(it.id));
            const have = new Set(kept.map(it => it.id).filter(Boolean));
            pg.items = [...kept, ...(msg.added || []).filter(it => !it.id || !have.has(it.id))];
            if (msg.h && msg.h > (pg.h || 0)) pg.h = msg.h;
          }
          else if (msg.t === 'page' && room.lastNb && room.lastNb.pages && room.lastNb.pages[msg.pi]) {
            room.lastNb.pages[msg.pi].items = msg.items;
            if (msg.h) room.lastNb.pages[msg.pi].h = msg.h;
          }
          broadcast(roomId, msg, client);
        } catch (_) {}
      }
    }
  });
  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

server.listen(port, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address);
  console.log(`\nGlassnote Collab Server running (temporary in-memory rooms):`);
  console.log(`  Local:   http://localhost:${port}/glassnote.html`);
  if (ips[0]) console.log(`  Wi-Fi:   http://${ips[0]}:${port}/glassnote.html`);
  console.log(`\nFor a temporary public link over the internet, run in another terminal:`);
  console.log(`  cloudflared tunnel --url http://localhost:${port}\n`);
});
