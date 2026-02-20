/* public/game.js – Worriors FPS client */
'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const WALL_HEIGHT    = 3.2;
const EYE_HEIGHT     = 1.62;
const MOVE_SPEED     = 5.2;
const COLLIDE_R      = 0.38;
const BOLT_SPEED     = 22;    // world units per second
const BOLT_MAX_DIST  = 50;    // max travel distance before despawn
const BOLT_COLOR     = 0xFF2200;  // Star Wars-style bright red
const MOVE_EMIT_HZ   = 50;   // ms between position broadcasts

// Index 0 = yellow player, 1 = blue player
const SUIT_COLOR  = [0xFFCC00, 0x1166EE];

// ─── Three.js scene ───────────────────────────────────────────────────────────
const scene    = new THREE.Scene();
scene.background = new THREE.Color(0x040410);
scene.fog        = new THREE.FogExp2(0x040410, 0.022);

const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.05, 120);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Ambient + hemisphere light
scene.add(new THREE.AmbientLight(0x1a1a2a, 2.0));
const hemi = new THREE.HemisphereLight(0x223344, 0x080808, 0.6);
scene.add(hemi);

// ─── Shared materials ─────────────────────────────────────────────────────────
const wallMat  = new THREE.MeshLambertMaterial({ color: 0x445566 });
const floorMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
const ceilMat  = new THREE.MeshLambertMaterial({ color: 0x191925 });

// ─── Space-suit model (Apollo 11 style) ───────────────────────────────────────
function makeSuit(suitColor) {
  const g     = new THREE.Group();
  const suit  = new THREE.MeshLambertMaterial({ color: suitColor });
  const white = new THREE.MeshLambertMaterial({ color: 0xDDDDDD });
  const visor = new THREE.MeshLambertMaterial({ color: 0x66AAFF, transparent: true, opacity: 0.78 });
  const dark  = new THREE.MeshLambertMaterial({ color: 0x222222 });

  function mesh(geo, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    g.add(m);
    return m;
  }

  // Torso
  mesh(new THREE.BoxGeometry(0.52, 0.58, 0.32), suit, 0, 0, 0);
  // Chest life-support panel
  mesh(new THREE.BoxGeometry(0.18, 0.22, 0.05), dark, 0, 0.06, 0.19);
  // PLSS backpack
  mesh(new THREE.BoxGeometry(0.42, 0.44, 0.18), white, 0, 0.04, -0.24);
  // Neck ring
  mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), dark, 0, 0.32, 0);
  // Helmet (white)
  mesh(new THREE.SphereGeometry(0.24, 16, 12), white, 0, 0.58, 0);
  // Visor (coloured)
  mesh(new THREE.SphereGeometry(0.215, 16, 12, 0, Math.PI * 1.5, 0.3, Math.PI * 0.55), visor, 0, 0.58, 0.04);
  // Shoulders
  mesh(new THREE.SphereGeometry(0.14, 10, 8), suit, -0.34, 0.22, 0);
  mesh(new THREE.SphereGeometry(0.14, 10, 8), suit,  0.34, 0.22, 0);
  // Arms
  mesh(new THREE.CylinderGeometry(0.10, 0.09, 0.40, 10), suit, -0.36, -0.03, 0, 0, 0,  0.22);
  mesh(new THREE.CylinderGeometry(0.10, 0.09, 0.40, 10), suit,  0.36, -0.03, 0, 0, 0, -0.22);
  // Gloves
  mesh(new THREE.SphereGeometry(0.09, 8, 6), suit, -0.43, -0.24, 0);
  mesh(new THREE.SphereGeometry(0.09, 8, 6), suit,  0.43, -0.24, 0);
  // Waist ring
  mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 14), dark, 0, -0.32, 0);
  // Legs
  mesh(new THREE.BoxGeometry(0.20, 0.52, 0.22), suit, -0.15, -0.62, 0);
  mesh(new THREE.BoxGeometry(0.20, 0.52, 0.22), suit,  0.15, -0.62, 0);
  // Boots
  mesh(new THREE.BoxGeometry(0.21, 0.10, 0.26), dark, -0.15, -0.90, 0.02);
  mesh(new THREE.BoxGeometry(0.21, 0.10, 0.26), dark,  0.15, -0.90, 0.02);
  // Laser rifle body (right hand)
  mesh(new THREE.BoxGeometry(0.07, 0.08, 0.55), dark, 0.42, -0.22, 0.18);
  // Rifle barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.42, -0.22, 0.48);
  g.add(barrel);

  return g;
}

// ─── Maze builder ─────────────────────────────────────────────────────────────
let maze     = null;
let CELL_SIZE = 4;

function buildMaze(mazeGrid, cs) {
  CELL_SIZE = cs;
  const G   = mazeGrid.length;
  const cx  = (G - 1) * cs / 2;
  const cz  = (G - 1) * cs / 2;
  const tw  = G * cs;

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(tw, tw), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);

  // Ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(tw, tw), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, WALL_HEIGHT, cz);
  scene.add(ceil);

  // Walls via InstancedMesh
  let wallCount = 0;
  for (let r = 0; r < G; r++)
    for (let c = 0; c < G; c++)
      if (mazeGrid[r][c] === 1) wallCount++;

  const wallGeo  = new THREE.BoxGeometry(cs, WALL_HEIGHT, cs);
  const wallInst = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
  const dummy    = new THREE.Object3D();
  let idx = 0;
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      if (mazeGrid[r][c] === 1) {
        dummy.position.set(c * cs, WALL_HEIGHT / 2, r * cs);
        dummy.updateMatrix();
        wallInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
  }
  wallInst.instanceMatrix.needsUpdate = true;
  scene.add(wallInst);

  // Point lights scattered through corridors for atmosphere
  for (let r = 1; r < G; r += 4) {
    for (let c = 1; c < G; c += 4) {
      if (mazeGrid[r][c] === 0) {
        const pt = new THREE.PointLight(0x8899FF, 1.3, 18);
        pt.position.set(c * cs, WALL_HEIGHT - 0.3, r * cs);
        scene.add(pt);
      }
    }
  }
}

// ─── Collision helpers ────────────────────────────────────────────────────────
function isWallAt(wx, wz) {
  if (!maze) return false;
  const c = Math.round(wx / CELL_SIZE);
  const r = Math.round(wz / CELL_SIZE);
  if (r < 0 || r >= maze.length || c < 0 || c >= maze[0].length) return true;
  return maze[r][c] === 1;
}

function hitsWall(wx, wz, radius) {
  return isWallAt(wx + radius, wz) || isWallAt(wx - radius, wz) ||
         isWallAt(wx, wz + radius) || isWallAt(wx, wz - radius);
}

// ─── Bolt helpers ─────────────────────────────────────────────────────────────
const bolts = [];
let canShoot = true;

function spawnBolt(origin, dir, isLocal) {
  const normDir = dir.clone().normalize();

  // Elongated bolt capsule oriented along travel direction
  const boltMat = new THREE.MeshBasicMaterial({ color: BOLT_COLOR });
  const boltGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8);
  const boltMesh = new THREE.Mesh(boltGeo, boltMat);
  boltMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normDir);
  boltMesh.position.copy(origin);
  scene.add(boltMesh);

  // Soft glow sphere around the bolt
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xFF6633, transparent: true, opacity: 0.35 });
  const glowMesh = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), glowMat);
  glowMesh.position.copy(origin);
  scene.add(glowMesh);

  bolts.push({ mesh: boltMesh, glow: glowMesh, pos: origin.clone(), dir: normDir, isLocal, traveled: 0 });
}

function removeBolt(i) {
  const bolt = bolts[i];
  scene.remove(bolt.mesh);
  scene.remove(bolt.glow);
  bolts.splice(i, 1);
  if (bolt.isLocal) canShoot = true;
}

function checkBoltHit(pos) {
  for (const [id, op] of Object.entries(otherPlayers)) {
    const center = op.model.position.clone();
    center.y += 0.45;
    if (pos.distanceTo(center) < 0.6) return id;
  }
  return null;
}

// ─── Remote players ───────────────────────────────────────────────────────────
const otherPlayers = {};   // socketId → { model, slot }
const otherHealth  = {};   // slot → number

function addRemotePlayer(p) {
  const model = makeSuit(SUIT_COLOR[p.slot]);
  model.position.set(p.position.x, p.position.y + 1.0, p.position.z);
  scene.add(model);
  otherPlayers[p.id] = { model, slot: p.slot };
  otherHealth[p.slot] = p.health !== undefined ? p.health : 100;
  otherLivesCount[p.slot] = p.lives !== undefined ? p.lives : 3;
  updateHUD();
  updateLives();
}

// ─── HUD helpers ──────────────────────────────────────────────────────────────
function updateHUD() {
  const myBar = document.getElementById('myHealthBar');
  if (myBar) myBar.style.width = Math.max(0, myHealth) + '%';

  const enemyOp = Object.values(otherPlayers)[0];
  const enemyBar = document.getElementById('enemyHealthBar');
  if (enemyBar && enemyOp !== undefined) {
    enemyBar.style.width = Math.max(0, otherHealth[enemyOp.slot] !== undefined
      ? otherHealth[enemyOp.slot] : 100) + '%';
  }
}

function showMsg(id, durationMs) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, durationMs);
}

function flashDamage() {
  const el = document.getElementById('damageFlash');
  if (!el) return;
  el.style.opacity = '0.45';
  setTimeout(() => { el.style.opacity = '0'; }, 350);
}

// ─── Player state ─────────────────────────────────────────────────────────────
let mySlot   = -1;
let myHealth = 100;
let myLives  = 3;
let isDead   = false;
let gameEnded = false;
const myPos  = new THREE.Vector3();
let yaw      = 0;
let pitch    = 0;

const keys          = {};
const otherLivesCount = {};   // slot → lives remaining
let lastMoveSent = 0;

// ─── Shooting ────────────────────────────────────────────────────────────────
function shoot() {
  if (isDead || !maze || !canShoot || gameEnded) return;
  canShoot = false;

  // Muzzle just below eye level
  const origin = camera.position.clone();
  origin.y -= 0.18;

  const dir = new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
    .normalize();

  spawnBolt(origin, dir, true);
  socket.emit('shoot', { origin: origin.toArray(), direction: dir.toArray() });
}

// ─── Pointer lock ─────────────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const chatPanel = document.getElementById('chatPanel');
  if (chatPanel && chatPanel.contains(e.target)) return;
  if (maze && !document.pointerLockElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  const prompt = document.getElementById('lockPrompt');
  if (prompt) prompt.style.display = locked ? 'none' : 'block';
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw   -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch  = Math.max(-Math.PI / 2.6, Math.min(Math.PI / 2.6, pitch));
});

document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement === renderer.domElement && e.button === 0) shoot();
});

document.addEventListener('keydown', (e) => {
  const chatInput = document.getElementById('chatInput');
  if (document.activeElement === chatInput) return;
  if (e.code === 'KeyT' && !e.repeat && maze) {
    e.preventDefault();
    if (document.pointerLockElement) document.exitPointerLock();
    if (chatInput) chatInput.focus();
    return;
  }
  keys[e.code] = true;
});
document.addEventListener('keyup',   (e) => { keys[e.code] = false; });

// ─── Minimap ──────────────────────────────────────────────────────────────────
let minimapStaticCanvas = null;   // cached static maze layer

function buildMinimapStatic() {
  const G = maze.length;
  const W = 180;
  const cellPx = W / G;
  const cvs = document.createElement('canvas');
  cvs.width  = W;
  cvs.height = W;
  const ctx = cvs.getContext('2d');

  ctx.fillStyle = '#06060f';
  ctx.fillRect(0, 0, W, W);

  ctx.fillStyle = '#1e2d3d';
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      if (maze[r][c] === 1) {
        ctx.fillRect(c * cellPx, r * cellPx, cellPx, cellPx);
      }
    }
  }
  minimapStaticCanvas = cvs;
}

function drawMinimapAstronaut(ctx, x, y, plyYaw, color) {
  ctx.save();
  ctx.translate(x, y);
  // canvas rotation = -yaw (world yaw=0 faces -Z = "up" on top-down canvas)
  ctx.rotate(-plyYaw);

  // Helmet (white)
  ctx.fillStyle = '#dddddd';
  ctx.beginPath();
  ctx.arc(0, -5, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Visor (tinted with player color)
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(0.5, -5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Torso
  ctx.fillStyle = color;
  ctx.fillRect(-2.5, -2.5, 5, 4);

  // Backpack (light grey, on the back side)
  ctx.fillStyle = '#aaaaaa';
  ctx.fillRect(-2.5, -2, 1.2, 2);

  // Legs
  ctx.fillStyle = color;
  ctx.fillRect(-2, 1.5, 1.8, 2.8);
  ctx.fillRect(0.2, 1.5, 1.8, 2.8);

  ctx.restore();
}

function drawMinimap() {
  if (!maze) return;
  const canvas = document.getElementById('minimapCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const G = maze.length;
  const cellPx = W / G;

  // Blit cached static maze layer
  if (minimapStaticCanvas) {
    ctx.drawImage(minimapStaticCanvas, 0, 0);
  } else {
    ctx.fillStyle = '#06060f';
    ctx.fillRect(0, 0, W, W);
  }

  // World position → canvas position
  function toCanvas(wx, wz) {
    return [wx / CELL_SIZE * cellPx, wz / CELL_SIZE * cellPx];
  }

  // Bolts
  bolts.forEach(bolt => {
    const [bx, by] = toCanvas(bolt.pos.x, bolt.pos.z);
    ctx.fillStyle = 'rgba(255,80,0,0.45)';
    ctx.beginPath();
    ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FF2200';
    ctx.beginPath();
    ctx.arc(bx, by, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Remote players
  for (const op of Object.values(otherPlayers)) {
    const [px, pz] = toCanvas(op.model.position.x, op.model.position.z);
    drawMinimapAstronaut(ctx, px, pz, op.model.rotation.y,
                         op.slot === 0 ? '#FFD700' : '#4499FF');
  }

  // My player
  if (mySlot >= 0) {
    const [mx, mz] = toCanvas(myPos.x, myPos.z);
    drawMinimapAstronaut(ctx, mx, mz, yaw, mySlot === 0 ? '#FFD700' : '#4499FF');
  }
}

// ─── Lives display ────────────────────────────────────────────────────────────
function drawLifeIcon(ctx, x, y, color, alive) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alive ? 1.0 : 0.18;

  // Helmet
  ctx.fillStyle = '#dddddd';
  ctx.beginPath();
  ctx.arc(0, -5, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Visor
  ctx.fillStyle = color;
  ctx.globalAlpha = alive ? 0.7 : 0.18;
  ctx.beginPath();
  ctx.arc(0.5, -5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alive ? 1.0 : 0.18;

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(-2.5, -2.5, 5, 4);

  // Legs
  ctx.fillRect(-2, 1.5, 1.8, 2.8);
  ctx.fillRect(0.2, 1.5, 1.8, 2.8);

  ctx.restore();
}

function updateLives() {
  const canvas = document.getElementById('livesCanvas');
  if (!canvas || mySlot < 0) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const myColor = mySlot === 0 ? '#FFD700' : '#4499FF';

  // Row 1 – my lives (centred at y=14)
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = '7px Courier New';
  ctx.textBaseline = 'middle';
  ctx.fillText('YOU', 1, 14);
  for (let i = 0; i < 3; i++) {
    drawLifeIcon(ctx, 30 + i * 22, 14, myColor, i < myLives);
  }

  // Row 2 – enemy lives (centred at y=34)
  const enemyOp = Object.values(otherPlayers)[0];
  if (enemyOp) {
    const enemyColor = enemyOp.slot === 0 ? '#FFD700' : '#4499FF';
    const eL = otherLivesCount[enemyOp.slot] !== undefined ? otherLivesCount[enemyOp.slot] : 3;
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillText('FOE', 1, 34);
    for (let i = 0; i < 3; i++) {
      drawLifeIcon(ctx, 30 + i * 22, 34, enemyColor, i < eL);
    }
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function sendChat() {
  const chatInput = document.getElementById('chatInput');
  if (!chatInput) return;
  const text = chatInput.value.trim();
  if (!text || !maze) return;
  socket.emit('chat', text);
  chatInput.value = '';
  chatInput.blur();
  if (maze) renderer.domElement.requestPointerLock();
}

(function initChat() {
  const chatInput  = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSend');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        e.stopPropagation();
        sendChat();
      } else if (e.code === 'Escape') {
        e.stopPropagation();
        chatInput.blur();
        if (maze) renderer.domElement.requestPointerLock();
      }
    });
  }
  if (chatSendBtn) chatSendBtn.addEventListener('click', sendChat);
}());

// ─── Socket.IO ────────────────────────────────────────────────────────────────
/* global io */
const socket = io();

socket.on('gameFull', () => {
  const sub = document.getElementById('waitingSub');
  if (sub) sub.textContent = '⛔ Game is full — try again later.';
});

socket.on('init', ({ myId, slot, maze: mazeData, cellSize, players }) => {
  mySlot    = slot;
  maze      = mazeData;
  CELL_SIZE = cellSize;

  buildMaze(maze, CELL_SIZE);
  buildMinimapStatic();

  players.forEach(p => {
    if (p.id === myId) {
      myPos.set(p.position.x, p.position.y, p.position.z);
      myLives = p.lives !== undefined ? p.lives : 3;
    } else {
      addRemotePlayer(p);
    }
  });

  camera.position.set(myPos.x, myPos.y + EYE_HEIGHT, myPos.z);
  // Slot 0 spawns at the near corner → face +Z into the maze
  // Slot 1 spawns at the far corner  → face -Z into the maze
  yaw = slot === 0 ? Math.PI : 0;

  document.getElementById('waiting').style.display = 'none';
  document.getElementById('gameUI').style.display  = 'block';

  const chatPanel = document.getElementById('chatPanel');
  if (chatPanel) chatPanel.style.display = 'block';
  const chatHint = document.getElementById('chatHint');
  if (chatHint) chatHint.style.display = 'none';

  const lbl = document.getElementById('myColorLabel');
  if (lbl) {
    lbl.textContent = slot === 0 ? '🟡 YELLOW' : '🔵 BLUE';
    lbl.style.color  = slot === 0 ? '#FFD700'   : '#4499FF';
  }
  const myLbl = document.getElementById('myLabel');
  if (myLbl) {
    myLbl.style.color = slot === 0 ? '#FFD700' : '#4499FF';
  }

  // If an opponent is already in the game, update the status message
  const st = document.getElementById('statusMsg');
  if (st && players.length > 1) {
    st.textContent = '⚠️  Enemy astronaut detected!';
  }

  updateHUD();
  updateLives();
});

socket.on('playerJoined', (p) => {
  if (p.id !== socket.id) {
    addRemotePlayer(p);
    const st = document.getElementById('statusMsg');
    if (st) st.textContent = '⚠️  Enemy astronaut detected!';
  }
});

socket.on('playerMoved', ({ id, position, yaw: ry }) => {
  const op = otherPlayers[id];
  if (!op) return;
  op.model.position.set(position.x, position.y + 1.0, position.z);
  op.model.rotation.y = ry;
});

socket.on('playerShot', ({ shooterId, slot, origin, direction }) => {
  if (shooterId === socket.id) return;
  const o = new THREE.Vector3(...origin);
  const d = new THREE.Vector3(...direction).normalize();
  spawnBolt(o, d, false);
});

socket.on('playerHit', ({ targetId, health }) => {
  if (targetId === socket.id) {
    myHealth = health;
    updateHUD();
    flashDamage();
  } else {
    const op = otherPlayers[targetId];
    if (op) { otherHealth[op.slot] = health; updateHUD(); }
  }
});

socket.on('playerKilled', ({ targetId, killerId, lives }) => {
  if (targetId === socket.id) {
    myLives  = lives;
    isDead   = true;
    myHealth = 0;
    showMsg('deathMsg', 3000);
    updateLives();
  } else if (killerId === socket.id) {
    showMsg('killMsg', 3000);
  }
  if (targetId !== socket.id) {
    const op = otherPlayers[targetId];
    if (op) {
      otherHealth[op.slot] = 0;
      if (lives !== undefined) otherLivesCount[op.slot] = lives;
      updateLives();
    }
  }
  updateHUD();
});

socket.on('gameOver', ({ loserId, winnerId }) => {
  gameEnded = true;
  canShoot  = false;
  const el = document.getElementById('gameOverMsg');
  if (el) {
    el.textContent = (winnerId === socket.id) ? '🏆 VICTORY!' : '💀 DEFEATED!';
    el.style.display = 'block';
  }
});

socket.on('chatMsg', ({ slot, text }) => {
  const chatLog = document.getElementById('chatLog');
  if (!chatLog) return;
  const color = slot === 0 ? '#FFD700' : '#4499FF';
  const name  = slot === 0 ? 'YELLOW' : 'BLUE';
  const div   = document.createElement('div');
  const nameSpan = document.createElement('span');
  nameSpan.style.color = color;
  nameSpan.textContent = name;
  div.appendChild(nameSpan);
  div.appendChild(document.createTextNode(': ' + text));
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
});

socket.on('playerRespawned', ({ id, position }) => {
  if (id === socket.id) {
    myPos.set(position.x, position.y, position.z);
    myHealth = 100;
    isDead   = false;
    updateHUD();
  } else {
    const op = otherPlayers[id];
    if (op) {
      op.model.position.set(position.x, position.y + 1.0, position.z);
      otherHealth[op.slot] = 100;
      updateHUD();
    }
  }
});

socket.on('playerLeft', (id) => {
  const op = otherPlayers[id];
  if (op) { scene.remove(op.model); delete otherPlayers[id]; }
  const st = document.getElementById('statusMsg');
  if (st) st.textContent = '👤 Waiting for opponent…';
});

// ─── Game loop ────────────────────────────────────────────────────────────────
let prevTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - prevTime) / 1000, 0.1);
  prevTime  = now;

  // Movement
  if (maze && !isDead) {
    const fwd   = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0));
    const right = new THREE.Vector3(1, 0,  0).applyEuler(new THREE.Euler(0, yaw, 0));
    const move  = new THREE.Vector3();

    if (keys['KeyW'] || keys['ArrowUp'])    move.addScaledVector(fwd,    1);
    if (keys['KeyS'] || keys['ArrowDown'])  move.addScaledVector(fwd,   -1);
    if (keys['KeyA'] || keys['ArrowLeft'])  move.addScaledVector(right, -1);
    if (keys['KeyD'] || keys['ArrowRight']) move.addScaledVector(right,  1);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * dt);
      const nx = myPos.x + move.x;
      const nz = myPos.z + move.z;
      if (!hitsWall(nx, myPos.z, COLLIDE_R)) myPos.x = nx;
      if (!hitsWall(myPos.x, nz, COLLIDE_R)) myPos.z = nz;
    }
  }

  // Camera follows player
  camera.position.set(myPos.x, myPos.y + EYE_HEIGHT, myPos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y     = yaw;
  camera.rotation.x     = pitch;

  // Broadcast position at ~20 Hz
  if (maze && now - lastMoveSent > MOVE_EMIT_HZ) {
    socket.emit('move', {
      position: { x: myPos.x, y: myPos.y, z: myPos.z },
      yaw,
    });
    lastMoveSent = now;
  }

  // Update bolts – move forward, check collisions
  for (let i = bolts.length - 1; i >= 0; i--) {
    const bolt = bolts[i];
    const dist = BOLT_SPEED * dt;
    bolt.traveled += dist;
    bolt.pos.addScaledVector(bolt.dir, dist);
    bolt.mesh.position.copy(bolt.pos);
    bolt.glow.position.copy(bolt.pos);

    let hit = bolt.traveled >= BOLT_MAX_DIST ||
              (bolt.pos.y >= 0 && bolt.pos.y <= WALL_HEIGHT && isWallAt(bolt.pos.x, bolt.pos.z));
    if (!hit && bolt.isLocal) {
      const hitId = checkBoltHit(bolt.pos);
      if (hitId) {
        socket.emit('hit', { targetId: hitId });
        hit = true;
      }
    }
    if (hit) removeBolt(i);
  }

  drawMinimap();

  renderer.render(scene, camera);
}

animate();

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
