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

let maze = generateMaze(MAZE_ROOMS);

// Room (0,0) → grid (1,1); Room (N-1,N-1) → grid (2N-1, 2N-1)
const START_POSITIONS = [
  { x: CELL_SIZE * 1,                        y: 0, z: CELL_SIZE * 1 },
  { x: CELL_SIZE * (2 * MAZE_ROOMS - 1),     y: 0, z: CELL_SIZE * (2 * MAZE_ROOMS - 1) },
];

// ─── Game state ───────────────────────────────────────────────────────────────
const players = {};
const slots   = [false, false];   // which player slots are occupied
let   gameOver = false;

// ─── Monster helpers ──────────────────────────────────────────────────────────
const DIRS4               = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MONSTER_SPEED       = 10;   // world units / sec
const MONSTER_RADIUS      = 0.55;  // movement collision radius
const MONSTER_KILL_RADIUS = 1.5;   // distance at which monster kills player

function mazeIsWall(wx, wz) {
  const c = Math.round(wx / CELL_SIZE);
  const r = Math.round(wz / CELL_SIZE);
  if (r < 0 || r >= maze.length || c < 0 || c >= maze[0].length) return true;
  return maze[r][c] === 1;
}

function mazeHitsWall(wx, wz, radius) {
  return mazeIsWall(wx + radius, wz) || mazeIsWall(wx - radius, wz) ||
         mazeIsWall(wx, wz + radius) || mazeIsWall(wx, wz - radius);
}

// Monster starts near maze centre (grid cell MAZE_ROOMS, MAZE_ROOMS)
const MONSTER_START = { x: CELL_SIZE * MAZE_ROOMS, y: 0, z: CELL_SIZE * MAZE_ROOMS };

const monster = {
  position:     { ...MONSTER_START },
  dir:          { x: 1, z: 0 },
  angle:        0,
  lastKillTime: 0,
  health:       100,
  dead:         false,
};

// ─── Game restart ─────────────────────────────────────────────────────────────
function scheduleRestart() {
  setTimeout(() => {
    maze     = generateMaze(MAZE_ROOMS);
    gameOver = false;
    for (const p of Object.values(players)) {
      p.health   = 100;
      p.dead     = false;
      p.lives    = 3;
      p.position = { ...START_POSITIONS[p.slot] };
    }
    monster.position     = { ...MONSTER_START };
    monster.dir          = { x: 1, z: 0 };
    monster.angle        = 0;
    monster.lastKillTime = 0;
    monster.health       = 100;
    monster.dead         = false;
    io.emit('gameRestart', { maze, players: Object.values(players) });
  }, 5000);
}

// ─── Monster AI (10 Hz) ───────────────────────────────────────────────────────
let lastMonsterTick = Date.now();

setInterval(() => {
  if (gameOver || monster.dead) return;

  const now = Date.now();
  const dt  = Math.min((now - lastMonsterTick) / 1000, 0.1);
  lastMonsterTick = now;

  const step = MONSTER_SPEED * dt;
  const nx   = monster.position.x + monster.dir.x * step;
  const nz   = monster.position.z + monster.dir.z * step;

  if (!mazeHitsWall(nx, nz, MONSTER_RADIUS)) {
    monster.position.x = nx;
    monster.position.z = nz;
    // Occasionally turn at junctions
    if (Math.random() < 0.015) {
      const open = DIRS4.filter(([dx, dz]) =>
        !mazeHitsWall(monster.position.x + dx * step * 4,
                      monster.position.z + dz * step * 4, MONSTER_RADIUS));
      if (open.length > 0) {
        const pick = open[Math.floor(Math.random() * open.length)];
        monster.dir = { x: pick[0], z: pick[1] };
      }
    }
  } else {
    // Blocked – choose an open direction
    const open = DIRS4.filter(([dx, dz]) =>
      !mazeHitsWall(monster.position.x + dx * step * 4,
                    monster.position.z + dz * step * 4, MONSTER_RADIUS));
    if (open.length > 0) {
      const pick = open[Math.floor(Math.random() * open.length)];
      monster.dir = { x: pick[0], z: pick[1] };
    }
  }
  monster.angle = Math.atan2(monster.dir.x, monster.dir.z);

  if (Object.keys(players).length > 0) {
    io.emit('monsterMoved', { position: monster.position, angle: monster.angle });
  }

  // Kill check
  for (const [sid, p] of Object.entries(players)) {
    if (p.dead || gameOver) continue;
    const dx   = p.position.x - monster.position.x;
    const dz   = p.position.z - monster.position.z;
    if (dx * dx + dz * dz < MONSTER_KILL_RADIUS * MONSTER_KILL_RADIUS &&
        now - monster.lastKillTime > 1500) {
      monster.lastKillTime = now;
      p.health = 0;
      p.dead   = true;
      p.lives  = Math.max(0, p.lives - 1);
      io.emit('playerKilled', { targetId: sid, killerId: 'monster', lives: p.lives });
      if (p.lives > 0) {
        setTimeout(() => {
          const t = players[sid];
          if (!t) return;
          t.health   = 100;
          t.dead     = false;
          t.position = { ...START_POSITIONS[t.slot] };
          io.emit('playerRespawned', { id: sid, position: t.position });
        }, 3000);
      } else {
        gameOver = true;
        const winnerId = Object.keys(players).find(id => id !== sid) || 'monster';
        io.emit('gameOver', { loserId: sid, winnerId });
        scheduleRestart();
      }
    }
  }
}, 100);

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

  // Send init data to the new player (includes monster position)
  socket.emit('init', {
    myId:     socket.id,
    slot,
    maze,
    cellSize: CELL_SIZE,
    players:  Object.values(players),
    monster:  { position: monster.position, angle: monster.angle },
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
      target.dead  = true;
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
        scheduleRestart();
      }
    }
  });

  // ── Wolf hit (shooter-authoritative) ──────────────────────────────────────
  socket.on('hitWolf', () => {
    if (monster.dead || gameOver) return;
    monster.health = Math.max(0, monster.health - 25);
    if (monster.health <= 0) {
      monster.dead = true;
      io.emit('wolfKilled');
      setTimeout(() => {
        monster.health   = 100;
        monster.dead     = false;
        monster.position = { ...MONSTER_START };
        monster.dir      = { x: 1, z: 0 };
        monster.angle    = 0;
        io.emit('wolfRespawned', { position: monster.position });
      }, 5000);
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
