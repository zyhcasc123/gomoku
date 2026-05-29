const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3000;

// HTTP 服务器，提供静态文件
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.join(__dirname, filePath);

  const extMap = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': extMap[ext] || 'text/plain' });
      res.end(data);
    }
  });
});

// WebSocket 绑定到同一个 HTTP 服务器
const wss = new WebSocketServer({ server });

// 预计算分享用的 IP 地址
const os = require('os');
const ifaces = os.networkInterfaces();
let shareHost = 'localhost';
for (const name of Object.keys(ifaces)) {
  for (const iface of ifaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      shareHost = iface.address;
      break;
    }
  }
}

const rooms = new Map(); // roomId -> { players: [{ws, color}], currentPlayer: 1 }

function genRoomId() {
  let id;
  do { id = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(id));
  return id;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  let myRoomId = null;
  let myColor = null;

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    switch (data.type) {

      case 'create': {
        const roomId = genRoomId();
        rooms.set(roomId, {
          players: [{ ws, color: 'black' }],
          currentPlayer: 1,
        });
        myRoomId = roomId;
        myColor = 'black';
        send(ws, { type: 'room', roomId, color: 'black', status: 'waiting', shareHost: shareHost + ':' + PORT });
        break;
      }

      case 'join': {
        const room = rooms.get(data.roomId);
        if (!room) return send(ws, { type: 'error', msg: '房间不存在' });
        if (room.players.length >= 2) return send(ws, { type: 'error', msg: '房间已满' });

        room.players.push({ ws, color: 'white' });
        myRoomId = data.roomId;
        myColor = 'white';

        // 通知双方
        send(room.players[0].ws, { type: 'room', roomId: data.roomId, color: 'black', status: 'playing', shareHost: shareHost + ':' + PORT });
        send(ws, { type: 'room', roomId: data.roomId, color: 'white', status: 'playing', shareHost: shareHost + ':' + PORT });
        break;
      }

      case 'move': {
        const room = rooms.get(myRoomId);
        if (!room) return;
        const opponent = room.players.find(p => p.color !== myColor);
        if (opponent) send(opponent.ws, { type: 'move', r: data.r, c: data.c, player: data.player });
        break;
      }

      case 'undo_req': {
        const room = rooms.get(myRoomId);
        if (!room) return;
        const opponent = room.players.find(p => p.color !== myColor);
        if (opponent) send(opponent.ws, { type: 'undo_req' });
        break;
      }

      case 'undo_rsp': {
        const room = rooms.get(myRoomId);
        if (!room) return;
        const opponent = room.players.find(p => p.color !== myColor);
        if (opponent) send(opponent.ws, { type: 'undo_rsp', accepted: data.accepted });
        break;
      }

      case 'win': {
        const room = rooms.get(myRoomId);
        if (!room) return;
        const opponent = room.players.find(p => p.color !== myColor);
        if (opponent) send(opponent.ws, { type: 'lose' });
        break;
      }

    }
  });

  ws.on('close', () => {
    if (!myRoomId) return;
    const room = rooms.get(myRoomId);
    if (!room) return;
    const opponent = room.players.find(p => p.color !== myColor);
    if (opponent) send(opponent.ws, { type: 'leave' });
    rooms.delete(myRoomId);
  });
});

server.listen(PORT, () => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  console.log(`五子棋服务器已启动:`);
  console.log(`  本机: http://localhost:${PORT}`);
  for (const ip of ips) {
    console.log(`  局域网: http://${ip}:${PORT}`);
  }
});
