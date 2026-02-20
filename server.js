'use strict';

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const app        = express();
const httpServer = http.createServer(app);
const io         = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

// ─── Maze generation (recursive back-tracker) ─────────────────────────────────
const MAZE_ROOMS = 7;   // 7×7 logical rooms → 15×15 cell grid
const CELL_SIZE  = 4;   // world units per grid cell

function generateMaze(rooms) {
  const G    = 2 * rooms + 1;
  const grid = Array.from({ length: G }, () => Array(G).fill(1));

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function carve(rx, ry) {
    grid[2 * ry + 1][2 * rx + 1] = 0;
    const dirs = shuffle([[0, -1], [1, 0], [0, 1], [-1, 0]]);
    for (const [dx, dy] of dirs) {
      const nx = rx + dx;
      const ny = ry + dy;
      if (nx >= 0 && nx < rooms && ny >= 0 && ny < rooms &&
          grid[2 * ny + 1][2 * nx + 1] === 1) {
        grid[2 * ry + 1 + dy][2 * rx + 1 + dx] = 0;
        carve(nx, ny);
      }
    }
  }

  carve(0, 0);
  return grid;
}

const maze = generateMaze(MAZE_ROOMS);

// Room (0,0) → grid (1,1); Room (N-1,N-1) → grid (2N-1, 2N-1)
const START_POSITIONS = [
  { x: CELL_SIZE * 1,                        y: 0, z: CELL_SIZE * 1 },
  { x: CELL_SIZE * (2 * MAZE_ROOMS - 1),     y: 0, z: CELL_SIZE * (2 * MAZE_ROOMS - 1) },
];

// ─── Game state ───────────────────────────────────────────────────────────────
const players = {};
const slots   = [false, false];   // which player slots are occupied
let   gameOver = false;

io.on('connection', (socket) => {
  const slot = slots.findIndex(s => !s);
  if (slot === -1) {
    socket.emit('gameFull');
    socket.disconnect(true);
    return;
  }
  slots[slot] = true;

  players[socket.id] = {
    id:       socket.id,
    slot,
    position: { ...START_POSITIONS[slot] },
    yaw:      0,
    health:   100,
    lives:    3,
    dead:     false,
  };

  // Send init data to the new player
  socket.emit('init', {
    myId:     socket.id,
    slot,
    maze,
    cellSize: CELL_SIZE,
    players:  Object.values(players),
  });

  // Notify everyone else
  socket.broadcast.emit('playerJoined', players[socket.id]);

  // ── Position updates ──────────────────────────────────────────────────────
  socket.on('move', ({ position, yaw }) => {
    const p = players[socket.id];
    if (!p || p.dead) return;
    p.position = position;
    p.yaw      = yaw;
    socket.broadcast.emit('playerMoved', { id: socket.id, position, yaw });
  });

  // ── Shooting ──────────────────────────────────────────────────────────────
  socket.on('shoot', (data) => {
    io.emit('playerShot', { shooterId: socket.id, slot, ...data });
  });

  // ── Hit registration (shooter-authoritative) ──────────────────────────────
  socket.on('hit', ({ targetId }) => {
    const target = players[targetId];
    if (!target || target.dead || gameOver) return;
    target.health = Math.max(0, target.health - 25);
    io.emit('playerHit', { targetId, health: target.health });
    if (target.health <= 0) {
      target.dead = true;
      target.lives = Math.max(0, target.lives - 1);
      io.emit('playerKilled', { targetId, killerId: socket.id, lives: target.lives });
      if (target.lives > 0) {
        setTimeout(() => {
          const t = players[targetId];
          if (!t) return;
          t.health   = 100;
          t.dead     = false;
          t.position = { ...START_POSITIONS[t.slot] };
          io.emit('playerRespawned', { id: targetId, position: t.position });
        }, 3000);
      } else {
        gameOver = true;
        io.emit('gameOver', { loserId: targetId, winnerId: socket.id });
      }
    }
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  socket.on('chat', (msg) => {
    const p = players[socket.id];
    if (!p) return;
    const text = String(msg).slice(0, 200);
    io.emit('chatMsg', { slot: p.slot, text });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    slots[slot] = false;
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
    if (Object.keys(players).length === 0) gameOver = false;
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () =>
  console.log(`🚀  Worriors server listening on http://localhost:${PORT}`));
