// ─── VADT SIMULATOR ───────────────────────────────────────────────────────────
// Integrates with the existing STL/OBJ viewer pattern in app.js.
// Uses the same Three.js scene setup, CSS variables, and electronAPI bridge.

const SIM = {
  // Three.js
  scene: null, camera: null, renderer: null,
  animId: null, group: null, fieldGroup: null, gameObjectsGroup: null,

  // Camera orbit (same pattern as STL viewer)
  spherical: { theta: 0, phi: 0.4, radius: 22 },
  target: null,
  mouse: { down: false, right: false, lastX: 0, lastY: 0 },

  // Robot state (all in field inches, 0–144)
  robot: {
    x: 72, y: 72,        // world position in inches
    angle: 0,             // degrees, 0 = facing +Y
    vx: 0, vy: 0,        // velocity in/s
    omega: 0,             // angular velocity deg/s
    width: 15, height: 15,
  },

  // Simulation config (loaded from simulation.json)
  config: null,

  // Motor states keyed by motor id
  motors: {},

  // Piston states keyed by piston id
  pistons: {},

  // Sensor readings
  sensors: {
    imu: 0,
    odomX: 72, odomY: 72,
    encFwd: 0,
    imuDrift: 0,
  },

  // PID state
  pid: {
    kP: 1.5, kI: 0.01, kD: 0.8,
    target: 90,
    current: 0,
    integral: 0,
    prevError: 0,
    history: [],
    running: false,
  },

  // Match state
  match: {
    mode: 'driver',       // 'driver' | 'auton' | 'pid'
    elapsed: 0,
    duration: 105,        // 1:45 driver + 15s auton
    running: false,
    rafId: null,
    lastTs: null,
  },

  // Input
  keys: {},
  gamepad: null,

  // Loaded OBJ meshes keyed by meshName from config
  meshMap: {},

  // Game objects (rings, goals, etc.)
  gameObjects: [],

  // Annotation / auton
  autonRunning: false,
};

// Field dimensions: 12ft × 12ft = 144in × 144in
const FIELD_IN = 144;
const FIELD_SCALE = 0.1; // 1 inch = 0.1 Three.js units → field = 14.4 units

function inToWorld(inches) { return inches * FIELD_SCALE; }
function worldToIn(world)  { return world / FIELD_SCALE; }

// ─── OPEN / CLOSE ─────────────────────────────────────────────────────────────
function openSimulator() {
  const page = document.getElementById('simPage');
  if (!page) return;
  page.style.display = 'flex';
  if (!SIM.renderer) initSimRenderer();
  simResetRobot();
  simUpdateSidebar();
}

function closeSimulator() {
  const page = document.getElementById('simPage');
  if (page) page.style.display = 'none';
  simStopMatch();
  if (SIM.animId) { cancelAnimationFrame(SIM.animId); SIM.animId = null; }
  // Stop any autonomous routine
  SIM.autonRunning = false;
}

// ─── RENDERER INIT ────────────────────────────────────────────────────────────
function initSimRenderer() {
  if (typeof THREE === 'undefined') return;

  const canvas = document.getElementById('simCanvas');
  const vp     = document.getElementById('simViewport');

  SIM.scene = new THREE.Scene();
  SIM.scene.background = new THREE.Color(0x0a0a10);
  SIM.target = new THREE.Vector3(inToWorld(72), 0, inToWorld(72));

  // Camera
  SIM.camera = new THREE.PerspectiveCamera(50, vp.offsetWidth / vp.offsetHeight, 0.01, 500);
  simUpdateCamera();

  // Renderer
  SIM.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  SIM.renderer.setPixelRatio(window.devicePixelRatio);
  SIM.renderer.setSize(vp.offsetWidth, vp.offsetHeight);
  SIM.renderer.shadowMap.enabled = true;

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.9);
  dir1.position.set(8, 16, 8); dir1.castShadow = true;
  const dir2 = new THREE.DirectionalLight(0x8888ff, 0.2);
  dir2.position.set(-8, -4, -8);
  SIM.scene.add(ambient, dir1, dir2);

  // Build field
  buildField();

  // Groups
  SIM.group          = new THREE.Group(); // robot meshes
  SIM.gameObjectsGroup = new THREE.Group();
  SIM.scene.add(SIM.group, SIM.gameObjectsGroup);

  // Default robot placeholder (blue box) — replaced when OBJ is loaded
  buildDefaultRobot();

  // Controls
  canvas.addEventListener('mousedown', e => {
    SIM.mouse.down = true;
    SIM.mouse.right = e.button === 2;
    SIM.mouse.lastX = e.clientX; SIM.mouse.lastY = e.clientY;
    canvas.focus();
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mouseup', () => { SIM.mouse.down = false; });
  window.addEventListener('mousemove', e => {
    if (!SIM.mouse.down) return;
    const dx = e.clientX - SIM.mouse.lastX, dy = e.clientY - SIM.mouse.lastY;
    SIM.mouse.lastX = e.clientX; SIM.mouse.lastY = e.clientY;
    if (SIM.mouse.right) {
      const ps = SIM.spherical.radius * 0.001;
      SIM.target.x -= dx * ps; SIM.target.z += dy * ps;
    } else {
      SIM.spherical.theta -= dx * 0.006;
      SIM.spherical.phi = Math.max(0.1, Math.min(1.4, SIM.spherical.phi - dy * 0.006));
    }
    simUpdateCamera();
  });
  canvas.addEventListener('wheel', e => {
    SIM.spherical.radius = Math.max(3, Math.min(40, SIM.spherical.radius * (1 + e.deltaY * 0.001)));
    simUpdateCamera(); e.preventDefault();
  }, { passive: false });

  // Keyboard
  canvas.setAttribute('tabindex', '0');
  canvas.addEventListener('keydown', e => {
    SIM.keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') { simKeyTogglePistons(); e.preventDefault(); }
  });
  canvas.addEventListener('keyup',   e => { SIM.keys[e.key.toLowerCase()] = false; });

  // Gamepad
  window.addEventListener('gamepadconnected',    e => { SIM.gamepad = e.gamepad.index; simSetStatus('Controller connected'); });
  window.addEventListener('gamepaddisconnected', e => { if (SIM.gamepad === e.gamepad.index) SIM.gamepad = null; });

  // Resize
  new ResizeObserver(() => {
    if (!SIM.renderer) return;
    SIM.renderer.setSize(vp.offsetWidth, vp.offsetHeight);
    SIM.camera.aspect = vp.offsetWidth / vp.offsetHeight;
    SIM.camera.updateProjectionMatrix();
  }).observe(vp);

  // Load default game objects (High Stakes season)
  loadDefaultGameObjects();

  // Start render + physics loop
  simRenderLoop();
  setInterval(simPhysicsTick, 16); // ~60fps physics
}

function simUpdateCamera() {
  if (!SIM.camera) return;
  const { theta, phi, radius } = SIM.spherical;
  SIM.camera.position.set(
    SIM.target.x + radius * Math.sin(phi) * Math.sin(theta),
    SIM.target.y + radius * Math.cos(phi),
    SIM.target.z + radius * Math.sin(phi) * Math.cos(theta)
  );
  SIM.camera.lookAt(SIM.target);
}

function simRenderLoop() {
  SIM.animId = requestAnimationFrame(simRenderLoop);
  if (SIM.renderer && SIM.scene && SIM.camera) {
    SIM.renderer.render(SIM.scene, SIM.camera);
  }
}

// ─── FIELD BUILD ──────────────────────────────────────────────────────────────
function buildField() {
  const FW = inToWorld(FIELD_IN);

  // Field floor (carpet)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FW, FW),
    new THREE.MeshStandardMaterial({ color: 0x2a5c2a, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(FW / 2, 0, FW / 2);
  floor.receiveShadow = true;
  SIM.scene.add(floor);

  // Field border walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x444450 });
  const wallH = inToWorld(3.5);
  const wallThick = inToWorld(1);
  const walls = [
    { pos: [FW/2, wallH/2, 0],    size: [FW+wallThick*2, wallH, wallThick] },
    { pos: [FW/2, wallH/2, FW],   size: [FW+wallThick*2, wallH, wallThick] },
    { pos: [0,    wallH/2, FW/2], size: [wallThick, wallH, FW] },
    { pos: [FW,   wallH/2, FW/2], size: [wallThick, wallH, FW] },
  ];
  walls.forEach(w => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
    m.position.set(...w.pos);
    SIM.scene.add(m);
  });

  // Tile grid lines
  const lineMat = new THREE.LineBasicMaterial({ color: 0x1a3a1a, transparent: true, opacity: 0.5 });
  const tileSize = inToWorld(24); // 2ft tiles
  for (let i = 0; i <= 6; i++) {
    const p = i * tileSize;
    const hLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.01, p), new THREE.Vector3(FW, 0.01, p)]),
      lineMat
    );
    const vLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p, 0.01, 0), new THREE.Vector3(p, 0.01, FW)]),
      lineMat
    );
    SIM.scene.add(hLine, vLine);
  }

  // ── Push Back: alliance corner zones (24"×24" colored tiles) ──────────────
  const cornerSize = inToWorld(24);
  const corners = [
    { x: 0,              z: 0,              color: 0x4a1010 }, // red near-left
    { x: FW - cornerSize, z: 0,              color: 0x4a1010 }, // red near-right
    { x: 0,              z: FW - cornerSize, color: 0x102040 }, // blue far-left
    { x: FW - cornerSize, z: FW - cornerSize, color: 0x102040 }, // blue far-right
  ];
  corners.forEach(c => {
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(cornerSize, cornerSize),
      new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.95 })
    );
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(c.x + cornerSize / 2, 0.005, c.z + cornerSize / 2);
    SIM.scene.add(tile);
  });

  // ── Push Back: center barrier (runs full width at z = 72") ────────────────
  const barrierW = inToWorld(FIELD_IN);
  const barrierH = inToWorld(3.5);
  const barrierD = inToWorld(2);
  const barrier = new THREE.Mesh(
    new THREE.BoxGeometry(barrierW, barrierH, barrierD),
    new THREE.MeshStandardMaterial({ color: 0x888898, metalness: 0.4, roughness: 0.5 })
  );
  barrier.position.set(FW / 2, barrierH / 2, FW / 2);
  barrier.castShadow = true;
  SIM.scene.add(barrier);

  // ── Push Back: scoring troughs along each wall (6" deep colored strips) ───
  const troughDepth  = inToWorld(6);
  const troughHeight = inToWorld(0.5);
  const troughMats = {
    red:  new THREE.MeshStandardMaterial({ color: 0x6a1a1a, roughness: 0.9 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x1a2a5a, roughness: 0.9 }),
  };
  const troughs = [
    { x: FW/2, z: troughDepth/2,    w: FW, d: troughDepth, mat: troughMats.red  },
    { x: FW/2, z: FW-troughDepth/2, w: FW, d: troughDepth, mat: troughMats.blue },
    { x: troughDepth/2,    z: FW/2, w: troughDepth, d: FW, mat: troughMats.red  },
    { x: FW-troughDepth/2, z: FW/2, w: troughDepth, d: FW, mat: troughMats.blue },
  ];
  troughs.forEach(t => {
    const trough = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.d), t.mat);
    trough.rotation.x = -Math.PI / 2;
    trough.position.set(t.x, 0.004, t.z);
    SIM.scene.add(trough);
  });
}

// ─── DEFAULT ROBOT (placeholder before OBJ is loaded) ─────────────────────────
function buildDefaultRobot() {
  // Robot body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(inToWorld(15), inToWorld(6), inToWorld(15)),
    new THREE.MeshStandardMaterial({ color: 0x185FA5, metalness: 0.3, roughness: 0.6 })
  );
  body.position.y = inToWorld(3);
  body.castShadow = true;

  // Direction indicator (front arrow)
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(inToWorld(2.5), inToWorld(5), 8),
    new THREE.MeshStandardMaterial({ color: 0xe8f4ff })
  );
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, inToWorld(3), inToWorld(-9));

  SIM.group.add(body, arrow);
  simPositionRobotMesh();
}

function simPositionRobotMesh() {
  if (!SIM.group) return;
  const wx = inToWorld(SIM.robot.x);
  const wz = inToWorld(SIM.robot.y); // Y in field = Z in world
  SIM.group.position.set(wx, 0, wz);
  SIM.group.rotation.y = -SIM.robot.angle * Math.PI / 180;
}

// ─── GAME OBJECTS — PUSH BACK 2025-26 ────────────────────────────────────────
function loadDefaultGameObjects() {
  // Clear existing
  while (SIM.gameObjectsGroup.children.length) {
    SIM.gameObjectsGroup.remove(SIM.gameObjectsGroup.children[0]);
  }
  SIM.gameObjects = [];

  // Push Back uses 4" foam balls as the only game object.
  // Standard starting layout: 3 rows of 6 balls on each side of the center barrier,
  // plus 4 balls stacked against the near walls (in the troughs).
  const ballRadius = inToWorld(2); // 4" diameter
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xdde8f0, roughness: 0.6, metalness: 0.05 });

  // Red side (z < 72): rows at z = 20, 36, 56
  // Blue side (z > 72): rows at z = 88, 108, 124
  const rowsRed  = [20, 36, 56];
  const rowsBlue = [88, 108, 124];
  const cols = [24, 48, 72, 96, 120]; // x positions

  [...rowsRed, ...rowsBlue].forEach(fy => {
    cols.forEach(fx => {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(ballRadius, 12, 8),
        ballMat.clone()
      );
      ball.position.set(inToWorld(fx), ballRadius, inToWorld(fy));
      ball.castShadow = true;
      SIM.gameObjectsGroup.add(ball);
      SIM.gameObjects.push({ type: 'ball', x: fx, y: fy, mesh: ball, scored: false });
    });
  });

  // 4 pre-loaded balls in the troughs (near each wall center)
  const troughBalls = [
    { x: 72, y:  4 }, { x: 72, y: 140 },
    { x:  4, y: 72 }, { x: 140, y:  72 },
  ];
  troughBalls.forEach(pos => {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(ballRadius, 12, 8),
      ballMat.clone()
    );
    ball.position.set(inToWorld(pos.x), ballRadius, inToWorld(pos.y));
    ball.castShadow = true;
    SIM.gameObjectsGroup.add(ball);
    SIM.gameObjects.push({ type: 'ball', x: pos.x, y: pos.y, mesh: ball, scored: true });
  });
}

// ─── PHYSICS TICK ─────────────────────────────────────────────────────────────
const DRIVE_SPEED   = 48;  // inches per second (roughly 600RPM 3.25" wheel)
const TURN_RATE     = 300; // degrees per second
const TURN_SLEW     = 60;  // deg/s per tick (separate from linear slew so turns feel snappy)
const FRICTION      = 0.82;
const SLEW_RATE     = 0.18; // max delta per tick (motor inertia)
const TICK_DT       = 0.016;

let _targetVx = 0, _targetVy = 0, _targetOmega = 0;

function simPhysicsTick() {
  if (SIM.match.mode === 'driver') {
    processDriverInput();
  } else if (SIM.match.mode === 'pid') {
    processPIDTick();
  }
  // Autonomous mode moves are handled by the auton script runner

  // Apply slew rate (motor inertia) — linear and angular use separate ramps
  const slewLin = (cur, tgt) => cur + Math.sign(tgt - cur) * Math.min(Math.abs(tgt - cur), SLEW_RATE * DRIVE_SPEED);
  const slewRot = (cur, tgt) => cur + Math.sign(tgt - cur) * Math.min(Math.abs(tgt - cur), TURN_SLEW);

  SIM.robot.vx    = slewLin(SIM.robot.vx, _targetVx) * FRICTION;
  SIM.robot.vy    = slewLin(SIM.robot.vy, _targetVy) * FRICTION;
  SIM.robot.omega = slewRot(SIM.robot.omega, _targetOmega) * 0.78;

  // Clamp velocity
  const maxV = DRIVE_SPEED;
  const spd = Math.sqrt(SIM.robot.vx**2 + SIM.robot.vy**2);
  if (spd > maxV) { SIM.robot.vx *= maxV/spd; SIM.robot.vy *= maxV/spd; }

  // Integrate position
  SIM.robot.x = Math.max(7.5, Math.min(136.5, SIM.robot.x + SIM.robot.vx * TICK_DT));
  SIM.robot.y = Math.max(7.5, Math.min(136.5, SIM.robot.y + SIM.robot.vy * TICK_DT));
  SIM.robot.angle += SIM.robot.omega * TICK_DT;

  // Animate tagged motors
  animateMotors();

  // Sensor updates
  const spd2 = Math.sqrt(SIM.robot.vx**2 + SIM.robot.vy**2);
  SIM.sensors.encFwd    += spd2 * TICK_DT * (360 / (Math.PI * 3.25)); // ticks per rev
  SIM.sensors.imuDrift  += (Math.random() - 0.5) * 0.002;
  SIM.sensors.imu        = SIM.robot.angle + SIM.sensors.imuDrift;
  SIM.sensors.odomX      = SIM.robot.x + (Math.random() - 0.5) * 0.05;
  SIM.sensors.odomY      = SIM.robot.y + (Math.random() - 0.5) * 0.05;

  // Match timer
  if (SIM.match.running) {
    SIM.match.elapsed = Math.min(SIM.match.duration, SIM.match.elapsed + TICK_DT);
    if (SIM.match.elapsed >= SIM.match.duration) simStopMatch();
  }

  // Update Three.js mesh position
  simPositionRobotMesh();

  // Update sidebar (throttled to ~10Hz to avoid DOM thrash)
  simUpdateSidebar();
}

// ─── INPUT ────────────────────────────────────────────────────────────────────
function processDriverInput() {
  const k = SIM.keys;
  const rad = SIM.robot.angle * Math.PI / 180;
  let fwd = 0, strafe = 0, turn = 0;

  // Keyboard
  if (k['w'] || k['arrowup'])    fwd   =  DRIVE_SPEED;
  if (k['s'] || k['arrowdown'])  fwd   = -DRIVE_SPEED * 0.7;
  if (k['a'] || k['arrowleft'])  turn  = -TURN_RATE;
  if (k['d'] || k['arrowright']) turn  =  TURN_RATE;

  // Gamepad (if connected)
  let intakeVoltage = 0;
  if (SIM.gamepad !== null) {
    const gp = navigator.getGamepads()[SIM.gamepad];
    if (gp) {
      const lx = deadband(gp.axes[0], 0.12);
      const ly = deadband(gp.axes[1], 0.12);
      const rx = deadband(gp.axes[2], 0.12);
      fwd    = -ly * DRIVE_SPEED;
      strafe =  lx * DRIVE_SPEED;
      turn   =  rx * TURN_RATE;
      // R2/L2 drive intake (axes[5]/axes[4] on most controllers; fallback to buttons)
      const r2 = gp.buttons[7] ? gp.buttons[7].value : Math.max(0, (gp.axes[5] ?? -1) + 1) / 2;
      const l2 = gp.buttons[6] ? gp.buttons[6].value : Math.max(0, (gp.axes[4] ?? -1) + 1) / 2;
      intakeVoltage = (r2 - l2) * 100;
    }
  }

  // Keyboard intake (R = forward, F = reverse)
  if (k['r']) intakeVoltage =  100;
  if (k['f']) intakeVoltage = -100;

  // Drive intake-role motors
  if (SIM.config?.motors) {
    SIM.config.motors.forEach(m => {
      if (m.role === 'intake') {
        if (!SIM.motors[m.id]) SIM.motors[m.id] = { voltage: 0 };
        SIM.motors[m.id].voltage = intakeVoltage;
        // Keep the slider in sync
        const slider = document.getElementById('mv_slider_' + m.id);
        const label  = document.getElementById('mv_' + m.id);
        if (slider) slider.value = intakeVoltage;
        if (label)  label.textContent = intakeVoltage + '%';
      }
    });
  }

  _targetVx    = Math.sin(rad) * fwd + Math.cos(rad) * strafe;
  _targetVy    = -Math.cos(rad) * fwd + Math.sin(rad) * strafe;
  _targetOmega = turn;
}

function deadband(v, db) { return Math.abs(v) < db ? 0 : v; }

// ─── PID TUNER TICK ───────────────────────────────────────────────────────────
function processPIDTick() {
  const p = SIM.pid;
  const error = p.target - p.current;
  p.integral = Math.max(-100, Math.min(100, p.integral + error * TICK_DT));
  const deriv = (error - p.prevError) / TICK_DT;
  p.prevError = error;
  const output = p.kP * error + p.kI * p.integral + p.kD * deriv;
  p.current += Math.max(-TURN_RATE, Math.min(TURN_RATE, output)) * TICK_DT;
  SIM.robot.angle = p.current;
  p.history.push(parseFloat(error.toFixed(2)));
  if (p.history.length > 100) p.history.shift();
  simDrawPIDGraph();

  // Status label
  const abs = Math.abs(error);
  let status = abs < 0.5 ? '✓ Settled' : abs < 5 ? 'Stable — low overshoot' : abs < 20 ? 'Oscillating — raise kD' : 'Unstable — lower kP';
  const el = document.getElementById('simPidStatus');
  if (el) el.textContent = status;

  _targetVx = 0; _targetVy = 0; _targetOmega = 0;
}

// ─── MOTOR ANIMATION ──────────────────────────────────────────────────────────
function animateMotors() {
  if (!SIM.config || !SIM.config.motors) return;
  SIM.config.motors.forEach(m => {
    const mesh = SIM.meshMap[m.meshName];
    if (!mesh) return;
    const state = SIM.motors[m.id] || { voltage: 0 };
    const radsPerTick = (state.voltage / 100) * (m.rpm || 600) * (Math.PI / 30) * TICK_DT;
    const axis = m.axis || 'x';
    mesh.rotation[axis] += radsPerTick;
  });

  if (!SIM.config.pistons) return;
  SIM.config.pistons.forEach(p => {
    const mesh = SIM.meshMap[p.meshName];
    if (!mesh) return;
    const state = SIM.pistons[p.id] || { extended: false };
    const target = state.extended ? (p.stroke || 2.5) : 0;
    const axis = p.axis || 'z';
    const cur = mesh.position[axis];
    mesh.position[axis] += (inToWorld(target) - cur) * 0.12;
  });
}

// ─── LOAD OBJ CONFIG ──────────────────────────────────────────────────────────
async function simLoadConfig() {
  if (!window.electronAPI?.simLoadConfig) {
    simSetStatus('electronAPI not available');
    return;
  }
  const config = await window.electronAPI.simLoadConfig();
  if (!config) return;
  SIM.config = config;

  // Initialize motor/piston states
  (config.motors || []).forEach(m => { SIM.motors[m.id] = { voltage: 0 }; });
  (config.pistons || []).forEach(p => { SIM.pistons[p.id] = { extended: false }; });

  simSetStatus(`Config loaded: ${config.name || 'Robot'}`);
  simRenderConfigPanel();

  // Load the OBJ file if path is set
  if (config.objPath) await simLoadOBJ(config.objPath, config.mtlPath);
}

async function simLoadOBJ(objPath, mtlPath) {
  if (!window.electronAPI?.stlRead) return;
  const resp = await window.electronAPI.stlRead(objPath);
  if (!resp) return;

  // Remove previous robot mesh children and reset scale
  while (SIM.group.children.length) SIM.group.remove(SIM.group.children[0]);
  SIM.group.scale.set(1, 1, 1);
  SIM.meshMap = {};

  // Inner group: holds CAD orientation (rotation + Y offset from the viewer).
  // The outer SIM.group handles field position and heading every tick — keeping
  // them separate means reorientation is never overwritten by the physics loop.
  const orientGroup = new THREE.Group();
  SIM.group.add(orientGroup);

  if (resp.type === 'obj-geo') {
    resp.groups.forEach((g, i) => {
      if (!g.positions.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
      if (g.normals) geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
      else geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(g.color[0], g.color[1], g.color[2]),
        metalness: 0.2, roughness: 0.6
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.name = g.name || `group_${i}`;
      orientGroup.add(mesh);
      SIM.meshMap[mesh.name] = mesh;
    });
  }

  // Scale orient group to robot size from config
  const rb = SIM.config?.drivetrain;
  if (rb) {
    const box = new THREE.Box3().setFromObject(orientGroup);
    const size = new THREE.Vector3(); box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = inToWorld(rb.robotWidth || 15);
    const s = targetSize / maxDim;
    orientGroup.scale.set(s, s, s);
  }

  // Restore the CAD viewer's saved orientation so the model faces the right way
  const modelName = objPath.split(/[\\/]/).pop();
  try {
    const raw = localStorage.getItem('stl_orient_' + modelName);
    if (raw) {
      const d = JSON.parse(raw);
      orientGroup.rotation.set(d.rx || 0, d.ry || 0, d.rz || 0);
      orientGroup.position.y = d.py || 0;
    }
  } catch {}

  simPositionRobotMesh();
  simSetStatus('OBJ loaded');
}

// ─── MATCH TIMER ──────────────────────────────────────────────────────────────
function simToggleMatch() {
  if (SIM.match.running) simStopMatch(); else simStartMatch();
}
function simStartMatch() {
  SIM.match.running = true;
  const btn = document.getElementById('simStartBtn');
  if (btn) { btn.textContent = '⏸ Pause'; btn.style.background = 'var(--gold)'; btn.style.color = '#000'; }
  if (SIM.match.mode === 'auton') simRunAuton();
}
function simStopMatch() {
  SIM.match.running = false;
  SIM.autonRunning = false;
  const btn = document.getElementById('simStartBtn');
  if (btn) { btn.textContent = '▶ Start'; btn.style.background = ''; btn.style.color = ''; }
}
function simResetMatch() {
  simStopMatch();
  SIM.match.elapsed = 0;
  simResetRobot();
  SIM.pid.history = []; SIM.pid.current = 0; SIM.pid.integral = 0; SIM.pid.prevError = 0;
}

// ─── ROBOT RESET ──────────────────────────────────────────────────────────────
function simResetRobot() {
  SIM.robot.x = 24; SIM.robot.y = 120; // red starting tile
  SIM.robot.angle = 0;
  SIM.robot.vx = 0; SIM.robot.vy = 0; SIM.robot.omega = 0;
  SIM.sensors.encFwd = 0; SIM.sensors.imuDrift = 0;
  _targetVx = 0; _targetVy = 0; _targetOmega = 0;
  simPositionRobotMesh();
}

// ─── MODE SWITCH ──────────────────────────────────────────────────────────────
function simSetMode(mode) {
  SIM.match.mode = mode;
  simStopMatch();
  SIM.match.elapsed = 0;
  SIM.pid.history = []; SIM.pid.current = 0; SIM.pid.integral = 0; SIM.pid.prevError = 0;

  document.querySelectorAll('.sim-mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`simMode_${mode}`);
  if (btn) btn.classList.add('active');

  const pidPanel = document.getElementById('simPidPanel');
  if (pidPanel) pidPanel.style.display = mode === 'pid' ? 'block' : 'none';

  const autonPanel = document.getElementById('simAutonPanel');
  if (autonPanel) autonPanel.style.display = mode === 'auton' ? 'block' : 'none';

  if (mode === 'pid') {
    SIM.pid.target = 90; SIM.pid.current = 0;
    simStartMatch();
  }
}

// ─── AUTONOMOUS RUNNER ────────────────────────────────────────────────────────
async function simRunAuton() {
  if (SIM.autonRunning) return;
  SIM.autonRunning = true;
  simResetRobot();

  // Default demo routine — user will replace with their own steps
  const steps = [
    { type: 'move', inches: 24, speed: 80 },
    { type: 'turn', degrees: 90 },
    { type: 'move', inches: 18, speed: 60 },
    { type: 'turn', degrees: -45 },
    { type: 'move', inches: 12, speed: 80 },
    { type: 'turn', degrees: 180 },
    { type: 'move', inches: 24, speed: 100 },
  ];

  for (const step of steps) {
    if (!SIM.autonRunning) break;
    if (step.type === 'move')  await simAutonMove(step.inches, step.speed || 100);
    if (step.type === 'turn')  await simAutonTurn(step.degrees);
    if (step.type === 'wait')  await simSleep(step.ms || 500);
  }
  SIM.autonRunning = false;
  simSetStatus('Autonomous complete');
}

function simAutonMove(inches, speedPct = 100) {
  return new Promise(resolve => {
    const speed = (speedPct / 100) * DRIVE_SPEED;
    const rad = SIM.robot.angle * Math.PI / 180;
    const targetX = SIM.robot.x + Math.sin(rad) * inches;
    const targetY = SIM.robot.y - Math.cos(rad) * inches;
    const startX = SIM.robot.x, startY = SIM.robot.y;
    const dist = inches;
    let travelled = 0;
    const iv = setInterval(() => {
      if (!SIM.autonRunning) { clearInterval(iv); resolve(); return; }
      const moved = speed * TICK_DT;
      travelled += moved;
      const t = Math.min(1, travelled / Math.abs(dist));
      SIM.robot.x = startX + (targetX - startX) * t;
      SIM.robot.y = startY + (targetY - startY) * t;
      SIM.robot.vx = Math.sin(rad) * speed;
      SIM.robot.vy = -Math.cos(rad) * speed;
      if (t >= 1) { clearInterval(iv); SIM.robot.vx = 0; SIM.robot.vy = 0; resolve(); }
    }, 16);
  });
}

function simAutonTurn(degrees) {
  return new Promise(resolve => {
    const rate = TURN_RATE * 0.8;
    const startAngle = SIM.robot.angle;
    const targetAngle = startAngle + degrees;
    const dir = Math.sign(degrees);
    const iv = setInterval(() => {
      if (!SIM.autonRunning) { clearInterval(iv); resolve(); return; }
      SIM.robot.angle += dir * rate * TICK_DT;
      SIM.robot.omega = dir * rate;
      const done = dir > 0 ? SIM.robot.angle >= targetAngle : SIM.robot.angle <= targetAngle;
      if (done) { SIM.robot.angle = targetAngle; SIM.robot.omega = 0; clearInterval(iv); resolve(); }
    }, 16);
  });
}

function simSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── PID GRAPH ────────────────────────────────────────────────────────────────
function simDrawPIDGraph() {
  const canvas = document.getElementById('simPidCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth * 2;
  canvas.height = 120;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const h = canvas.history || SIM.pid.history;
  if (h.length < 2) return;

  const w = canvas.width, ht = canvas.height;
  const max = Math.max(20, ...h.map(Math.abs));

  // Zero line
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, ht/2); ctx.lineTo(w, ht/2); ctx.stroke();

  // Error line
  ctx.strokeStyle = '#1a7ddf';
  ctx.lineWidth = 2;
  ctx.beginPath();
  h.forEach((v, i) => {
    const px = (i / (h.length - 1)) * w;
    const py = ht/2 - (v / max) * (ht/2 - 6);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();
}

// ─── SIDEBAR UPDATE ───────────────────────────────────────────────────────────
let _sidebarThrottle = 0;
function simUpdateSidebar() {
  const now = Date.now();
  if (now - _sidebarThrottle < 100) return;
  _sidebarThrottle = now;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const r = SIM.robot, s = SIM.sensors;

  set('simStatX',     r.x.toFixed(1) + '"');
  set('simStatY',     r.y.toFixed(1) + '"');
  set('simStatH',     ((r.angle % 360 + 360) % 360).toFixed(1) + '°');
  set('simStatSpd',   (Math.sqrt(r.vx**2 + r.vy**2)).toFixed(1) + ' in/s');
  set('simSensorImu', s.imu.toFixed(1) + '°');
  set('simSensorOdomX', s.odomX.toFixed(1) + '"');
  set('simSensorOdomY', s.odomY.toFixed(1) + '"');
  set('simSensorEnc',   Math.round(s.encFwd) + ' ticks');

  // Match timer
  const rem = Math.max(0, SIM.match.duration - SIM.match.elapsed);
  const m = Math.floor(rem / 60), sec = Math.floor(rem % 60);
  set('simTimer', `${m}:${String(sec).padStart(2,'0')}`);

  // Period badge
  const isAuton = SIM.match.elapsed < 15;
  const badge = document.getElementById('simPeriodBadge');
  if (badge) {
    badge.textContent = isAuton ? 'AUTON' : 'DRIVER';
    badge.style.background = isAuton ? 'rgba(34,197,94,0.25)' : 'rgba(245,197,66,0.2)';
    badge.style.color = isAuton ? '#22c55e' : 'var(--gold)';
  }
}

// ─── CONFIG PANEL ─────────────────────────────────────────────────────────────
function simRenderConfigPanel() {
  const el = document.getElementById('simConfigContent');
  if (!el || !SIM.config) return;

  const c = SIM.config;
  const dt = c.drivetrain || {};

  el.innerHTML = `
    <div class="sim-config-section">
      <div class="sim-config-label">Drivetrain</div>
      <div class="sim-config-row"><span>Type</span><span>${dt.type || 'tank'}</span></div>
      <div class="sim-config-row"><span>Wheel Ø</span><span>${dt.wheelDiameter || 3.25}"</span></div>
      <div class="sim-config-row"><span>Max RPM</span><span>${dt.maxRPM || 450}</span></div>
      <div class="sim-config-row"><span>Track Width</span><span>${dt.trackWidth || 12}"</span></div>
    </div>
    ${(c.motors||[]).length ? `
    <div class="sim-config-section">
      <div class="sim-config-label">Motors (${c.motors.length})</div>
      ${c.motors.map(m => `
        <div class="sim-config-row">
          <span style="flex:1;">${m.id}${m.role && m.role!=='drive' ? ` <span style="font-size:9px;color:var(--t3);">[${m.role}]</span>` : ''}</span>
          <input id="mv_slider_${m.id}" type="range" min="-100" max="100" value="0" step="1"
            style="width:60px;"
            oninput="SIM.motors['${m.id}'].voltage=+this.value;document.getElementById('mv_${m.id}').textContent=this.value+'%'"/>
          <span id="mv_${m.id}" style="font-size:10px;min-width:32px;text-align:right;font-family:var(--fm);">0%</span>
        </div>`).join('')}
    </div>` : ''}
    ${(c.pistons||[]).length ? `
    <div class="sim-config-section">
      <div class="sim-config-label">Pistons (${c.pistons.length})</div>
      ${c.pistons.map(p => `
        <div class="sim-config-row">
          <span style="flex:1;">${p.id}</span>
          <button id="piston_btn_${p.id}" class="sim-piston-btn" onclick="simTogglePiston('${p.id}',this)">Extend</button>
        </div>`).join('')}
    </div>` : ''}
    ${(c.sensors||[]).length ? `
    <div class="sim-config-section">
      <div class="sim-config-label">Sensors (${c.sensors.length})</div>
      ${c.sensors.map(s => `<div class="sim-config-row"><span>${s.id}</span><span style="color:var(--gold);font-size:10px;">${s.type}</span></div>`).join('')}
    </div>` : ''}
  `;
}

function simTogglePiston(id, btn) {
  if (!SIM.pistons[id]) SIM.pistons[id] = { extended: false };
  SIM.pistons[id].extended = !SIM.pistons[id].extended;
  const extended = SIM.pistons[id].extended;
  // Update the button that was clicked (if any)
  if (btn) {
    btn.textContent = extended ? 'Retract' : 'Extend';
    btn.style.background = extended ? 'rgba(26,125,223,0.3)' : '';
  }
  // Also update any other rendered button for this piston
  const b2 = document.getElementById('piston_btn_' + id);
  if (b2 && b2 !== btn) {
    b2.textContent = extended ? 'Retract' : 'Extend';
    b2.style.background = extended ? 'rgba(26,125,223,0.3)' : '';
  }
}

function simKeyTogglePistons() {
  if (!SIM.config?.pistons?.length) return;
  SIM.config.pistons.forEach(p => simTogglePiston(p.id, null));
}

// ─── PID CONTROLS ─────────────────────────────────────────────────────────────
function simUpdatePID() {
  SIM.pid.kP = parseFloat(document.getElementById('simKp')?.value || 1.5);
  SIM.pid.kI = parseFloat(document.getElementById('simKi')?.value || 0.01);
  SIM.pid.kD = parseFloat(document.getElementById('simKd')?.value || 0.8);

  const fmtVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = parseFloat(val).toFixed(2); };
  fmtVal('simKpVal', SIM.pid.kP);
  fmtVal('simKiVal', SIM.pid.kI);
  fmtVal('simKdVal', SIM.pid.kD);

  // Reset PID state on change so graph resets
  SIM.pid.history = []; SIM.pid.current = 0; SIM.pid.integral = 0; SIM.pid.prevError = 0;
}

function simSetPIDTarget() {
  const el = document.getElementById('simPidTarget');
  if (el) SIM.pid.target = parseFloat(el.value) || 90;
  SIM.pid.history = []; SIM.pid.current = 0; SIM.pid.integral = 0; SIM.pid.prevError = 0;
}

// ─── ODOMETRY CONFIG ──────────────────────────────────────────────────────────
function simRenderOdomConfig() {
  const el = document.getElementById('simOdomConfig');
  if (!el) return;
  el.innerHTML = `
    <div class="sim-config-section">
      <div class="sim-config-label">Tracking Wheels</div>
      <div class="sim-config-row"><span>Wheel Ø (in)</span><input type="number" value="2.75" step="0.25" min="1" max="4" style="width:55px;background:var(--s3);border:1px solid var(--b2);color:var(--t1);font-size:12px;padding:2px 5px;border-radius:4px;" id="odomWheelDia"/></div>
      <div class="sim-config-row"><span>Fwd offset (in)</span><input type="number" value="0" step="0.5" style="width:55px;background:var(--s3);border:1px solid var(--b2);color:var(--t1);font-size:12px;padding:2px 5px;border-radius:4px;" id="odomFwdOff"/></div>
      <div class="sim-config-row"><span>Side offset (in)</span><input type="number" value="4" step="0.5" style="width:55px;background:var(--s3);border:1px solid var(--b2);color:var(--t1);font-size:12px;padding:2px 5px;border-radius:4px;" id="odomSideOff"/></div>
    </div>
    <div class="sim-config-section">
      <div class="sim-config-label">IMU</div>
      <div class="sim-config-row"><span>Drift/sec (°)</span><input type="number" value="0.1" step="0.05" min="0" max="2" style="width:55px;background:var(--s3);border:1px solid var(--b2);color:var(--t1);font-size:12px;padding:2px 5px;border-radius:4px;" id="odomImuDrift"/></div>
      <div class="sim-config-row"><span>Noise slider</span><input type="range" min="0" max="5" value="1" step="0.5" style="width:80px;" oninput="simSetNoiseLevel(+this.value)"/></div>
    </div>
    <div class="sim-config-section">
      <div class="sim-config-label">Ground Truth vs Odom</div>
      <div class="sim-config-row"><span>GT X</span><span id="odomGtX" style="font-family:var(--fm);color:var(--green);">—</span></div>
      <div class="sim-config-row"><span>GT Y</span><span id="odomGtY" style="font-family:var(--fm);color:var(--green);">—</span></div>
      <div class="sim-config-row"><span>Odom X</span><span id="odomEstX" style="font-family:var(--fm);color:var(--gold);">—</span></div>
      <div class="sim-config-row"><span>Odom Y</span><span id="odomEstY" style="font-family:var(--fm);color:var(--gold);">—</span></div>
      <div class="sim-config-row"><span>Error</span><span id="odomError" style="font-family:var(--fm);color:var(--red);">—</span></div>
    </div>`;

  setInterval(() => {
    const set2 = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set2('odomGtX', SIM.robot.x.toFixed(2) + '"');
    set2('odomGtY', SIM.robot.y.toFixed(2) + '"');
    set2('odomEstX', SIM.sensors.odomX.toFixed(2) + '"');
    set2('odomEstY', SIM.sensors.odomY.toFixed(2) + '"');
    const err = Math.sqrt((SIM.robot.x - SIM.sensors.odomX)**2 + (SIM.robot.y - SIM.sensors.odomY)**2);
    set2('odomError', err.toFixed(3) + '"');
  }, 200);
}

let _noiseLevel = 1;
function simSetNoiseLevel(v) {
  _noiseLevel = v;
  // Scales the random noise applied to sensor readings
}

// ─── STATUS ───────────────────────────────────────────────────────────────────
function simSetStatus(msg) {
  const el = document.getElementById('simStatus');
  if (el) el.textContent = msg;
}

// ─── ANNOTATION UI ────────────────────────────────────────────────────────────
function simOpenAnnotation() {
  const modal = document.getElementById('simAnnotationModal');
  if (modal) modal.style.display = 'flex';
}
function simCloseAnnotation() {
  const modal = document.getElementById('simAnnotationModal');
  if (modal) modal.style.display = 'none';
}

// Save annotation config (sim.json) via electron
async function simSaveConfig() {
  if (!window.electronAPI?.simSaveConfig || !SIM.config) return;
  await window.electronAPI.simSaveConfig(SIM.config);
  simSetStatus('Config saved');
}

// ─── INIT HOOK ────────────────────────────────────────────────────────────────
// Called after DOM is ready (from index.html)
function initSimulatorPage() {
  simRenderOdomConfig();
}

// ─── ANNOTATION MODAL LOGIC ───────────────────────────────────────────────────
// Appended to simulator.js

let _annMotors  = [];
let _annPistons = [];

function annAddMotor() {
  const id = `motor_${_annMotors.length + 1}`;
  _annMotors.push({ id, meshName: '', rpm: 600, axis: 'x' });
  annRenderMotors();
}

function annAddPiston() {
  const id = `piston_${_annPistons.length + 1}`;
  _annPistons.push({ id, meshName: '', axis: 'z', stroke: 2.5 });
  annRenderPistons();
}

function annRenderMotors() {
  const el = document.getElementById('annMotorList');
  if (!el) return;
  el.innerHTML = _annMotors.map((m, i) => `
    <div class="ann-motor-row">
      <input class="ann-input" placeholder="id" value="${m.id}"
        oninput="_annMotors[${i}].id=this.value"/>
      <input class="ann-input" placeholder="mesh name (from OBJ)" value="${m.meshName}"
        oninput="_annMotors[${i}].meshName=this.value"/>
      <select class="ann-input" oninput="_annMotors[${i}].axis=this.value">
        <option value="x" ${m.axis==='x'?'selected':''}>X axis</option>
        <option value="y" ${m.axis==='y'?'selected':''}>Y axis</option>
        <option value="z" ${m.axis==='z'?'selected':''}>Z axis</option>
      </select>
      <button class="ann-del" onclick="_annMotors.splice(${i},1);annRenderMotors()">✕</button>
    </div>`).join('');
}

function annRenderPistons() {
  const el = document.getElementById('annPistonList');
  if (!el) return;
  el.innerHTML = _annPistons.map((p, i) => `
    <div class="ann-piston-row">
      <input class="ann-input" placeholder="id" value="${p.id}"
        oninput="_annPistons[${i}].id=this.value"/>
      <input class="ann-input" placeholder="mesh name" value="${p.meshName}"
        oninput="_annPistons[${i}].meshName=this.value"/>
      <select class="ann-input" oninput="_annPistons[${i}].axis=this.value">
        <option value="x" ${p.axis==='x'?'selected':''}>X axis</option>
        <option value="y" ${p.axis==='y'?'selected':''}>Y axis</option>
        <option value="z" ${p.axis==='z'?'selected':''}>Z axis</option>
      </select>
      <button class="ann-del" onclick="_annPistons.splice(${i},1);annRenderPistons()">✕</button>
    </div>`).join('');
}

function annSave() {
  const config = {
    name: 'Robot',
    drivetrain: {
      type:        document.getElementById('annDriveType')?.value  || 'tank',
      wheelDiameter: parseFloat(document.getElementById('annWheelDia')?.value  || 3.25),
      maxRPM:        parseInt(document.getElementById('annMaxRpm')?.value      || 450),
      trackWidth:    parseFloat(document.getElementById('annTrackWidth')?.value || 12),
      robotWidth:    parseFloat(document.getElementById('annRobotWidth')?.value || 15),
    },
    motors:   _annMotors.filter(m => m.id && m.meshName),
    pistons:  _annPistons.filter(p => p.id && p.meshName),
    sensors:  [],
  };

  SIM.config = config;
  (config.motors  || []).forEach(m => { SIM.motors[m.id]  = { voltage: 0 }; });
  (config.pistons || []).forEach(p => { SIM.pistons[p.id] = { extended: false }; });

  simRenderConfigPanel();
  simCloseAnnotation();
  simSetStatus('Config built — save it with 📂 or load an OBJ');

  // Persist via electronAPI if available
  if (window.electronAPI?.simSaveConfig) {
    window.electronAPI.simSaveConfig(config);
  }
}