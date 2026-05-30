const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3000;

// 读取 cloudflared 隧道 URL
let tunnelUrl = '';
try {
  tunnelUrl = fs.readFileSync(path.join(__dirname, 'tunnel_url.txt'), 'utf-8').trim();
} catch (e) {}

// HTTP 服务器
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API: 返回隧道地址供前端连接
  if (req.url.startsWith('/api/config')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      tunnelUrl: tunnelUrl,
      wsUrl: tunnelUrl ? tunnelUrl.replace('https://', 'wss://') : '',
    }));
    return;
  }

  // 静态文件
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

// WebSocket
const wss = new WebSocketServer({ server });

const rooms = new Map();

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

      // 创建房间（MQTT 兼容协议）
      case 'create': {
        const roomId = genRoomId();
        rooms.set(roomId, {
          players: [{ ws, color: 'black' }],
          currentPlayer: 1,
        });
        myRoomId = roomId;
        myColor = 'black';
        send(ws, { type: 'room', roomId, color: 'black', status: 'waiting' });
        break;
      }

      // 加入房间（MQTT 兼容协议）
      case 'join': {
        // 使用 join 协议：客户端发 {type:'join', roomId}
        const room = rooms.get(data.roomId);
        if (!room) return send(ws, { type: 'error', msg: '房间不存在' });
        if (room.players.length >= 2) return send(ws, { type: 'error', msg: '房间已满' });

        room.players.push({ ws, color: 'white' });
        myRoomId = data.roomId;
        myColor = 'white';

        // 通知双方
        send(room.players[0].ws, { type: 'join_ack' });
        send(ws, { type: 'room', roomId: data.roomId, color: 'white', status: 'playing' });
        break;
      }

      // 落子
      case 'move': {
        const room = rooms.get(myRoomId);
        if (!room) return;
        const opponent = room.players.find(p => p.color !== myColor);
        if (opponent) send(opponent.ws, { type: 'move', r: data.r, c: data.c, player: data.player });
        break;
      }

      // 悔棋请求
      case 'undo_req': {
        const room = rooms.get(myRoomId);
        if (!room) return;
        const opponent = room.players.find(p => p.color !== myColor);
        if (opponent) send(opponent.ws, { type: 'undo_req' });
        break;
      }

      // 悔棋应答
      case 'undo_rsp': {
        const room = rooms.get(myRoomId);
        if (!room) return;
        const opponent = room.players.find(p => p.color !== myColor);
        if (opponent) send(opponent.ws, { type: 'undo_rsp', accepted: data.accepted });
        break;
      }

      // 获胜
      case 'win': {
        const room = rooms.get(myRoomId);
        if (!room) return;
        const opponent = room.players.find(p => p.color !== myColor);
        if (opponent) send(opponent.ws, { type: 'win' });
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
  console.log('五子棋服务器已启动:');
  console.log('  本机: http://localhost:' + PORT);
  if (tunnelUrl) {
    console.log('  公网: ' + tunnelUrl);
  }
});
