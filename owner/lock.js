/* ============================================================================
   The safe-lock: the first thing at /owner/. A Three.js model of the owner's
   reference: a 100 mm round matte-black body, an 8 mm knurled ring, ten 12 mm
   buttons (1-9 and 0) and a white index mark at twelve o'clock.

   IT CHECKS NOTHING. Each press only appends a digit to the plain field in
   the page (#code), which is the single source of truth and what is posted to
   the server. The code, its hash and the lockout all live on the server; no
   part of either is in this file.

   Scale: 1 unit = 100 mm, so the body's radius is 0.5. The lock faces +z.

   Loaded only by owner.js, only when WebGL works. If anything here throws,
   owner.js keeps the plain digit field and the page works without it.
   ========================================================================== */
import * as THREE from './vendor/three-0.169.0.module.min.js';

const BODY_R = 0.5, BODY_D = 0.2;            // 100 mm across; the body's depth
const RING_IN = 0.385, RING_OUT = 0.465;     // the 8 mm knurled ring
const RING_D = 0.042;                        // how far it stands proud of the body
const FACE_R = 0.372;
const BTN_R = 0.06, BTN_H = 0.06;            // 12 mm across, 6 mm tall
const BTN_Z = 0.032;                         // buttons stand on the face
const NOTCH = Math.PI / 15;                  // the ring turns 12 degrees a digit

const KEYS = [
  ['1', -0.15, 0.2], ['2', 0, 0.2], ['3', 0.15, 0.2],
  ['4', -0.15, 0.067], ['5', 0, 0.067], ['6', 0.15, 0.067],
  ['7', -0.15, -0.066], ['8', 0, -0.066], ['9', 0.15, -0.066],
  ['0', 0, -0.199],
];

export function mountLock(stage, { onPress } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'lock__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  // A context that cannot be created throws here, and owner.js falls back.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  if (!renderer.getContext()) throw new Error('no webgl');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  stage.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
  const CAM = new THREE.Vector3(0.42, 0.36, 2.95);   // a quarter turn off square, like the reference's isometric view
  camera.position.copy(CAM);
  camera.lookAt(0, -0.01, 0);

  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 1.5;

  const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
  key.position.set(-1.6, 2.2, 2.4);
  const rim = new THREE.DirectionalLight(0xdbe7ff, 1.1);
  rim.position.set(2.4, -0.4, 1.0);
  scene.add(key, rim, new THREE.HemisphereLight(0xf1ece1, 0x1c2f26, 0.35));

  /* ---- materials: matte black, satin metal, the steel line ---- */
  const matBody  = new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.58, metalness: 0.4 });
  const matFace  = new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.7,  metalness: 0.25 });
  const matRing  = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.34, metalness: 0.85 });
  const matSteel = new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.28, metalness: 1 });
  const matBtn   = new THREE.MeshStandardMaterial({ color: 0x272a2e, roughness: 0.42, metalness: 0.55 });
  const matMark  = new THREE.MeshStandardMaterial({ color: 0xf1ece1, roughness: 0.4, emissive: 0x000000 });

  const lock = new THREE.Group();
  scene.add(lock);

  // Body: a short cylinder with a softened front edge (a lathe profile).
  const body = new THREE.Mesh(lathe([
    [0, -BODY_D], [BODY_R - 0.01, -BODY_D], [BODY_R, -BODY_D + 0.01],
    [BODY_R, -0.016], [BODY_R - 0.004, -0.005], [BODY_R - 0.016, 0], [0, 0],
  ], 128), matBody);
  lock.add(body);

  // Mounting plate behind it, as on the reference's back view.
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R * 0.98, BODY_R * 0.98, 0.03, 96), matFace);
  plate.rotation.x = Math.PI / 2;
  plate.position.z = -BODY_D - 0.015;
  lock.add(plate);

  // The index mark at twelve o'clock, on the rim outside the ring.
  const mark = new THREE.Mesh(roundedBar(0.014, 0.05, 0.006), matMark);
  mark.position.set(0, (RING_OUT + BODY_R) / 2 + 0.002, 0.003);
  lock.add(mark);

  // The knurled ring: a core plus 132 ridges around its outside, as instances.
  const ring = new THREE.Group();
  ring.add(new THREE.Mesh(lathe([
    [RING_IN, 0], [RING_OUT - 0.012, 0], [RING_OUT - 0.012, RING_D - 0.008],
    [RING_OUT - 0.02, RING_D], [RING_IN + 0.006, RING_D], [RING_IN, RING_D - 0.006],
  ], 160), matRing));
  const RIDGES = 132;
  const ridge = new THREE.BoxGeometry(0.009, 0.03, RING_D - 0.012);
  const ridges = new THREE.InstancedMesh(ridge, matRing, RIDGES);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (let i = 0; i < RIDGES; i++) {
    const a = (i / RIDGES) * Math.PI * 2;
    p.set(Math.sin(a) * (RING_OUT - 0.016), Math.cos(a) * (RING_OUT - 0.016), (RING_D - 0.012) / 2);
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
    ridges.setMatrixAt(i, m.compose(p, q, s));
  }
  ring.add(ridges);
  lock.add(ring);

  // The thin steel line just inside the ring.
  const line = new THREE.Mesh(new THREE.TorusGeometry(RING_IN - 0.006, 0.0035, 10, 160), matSteel);
  line.position.z = 0.034;
  lock.add(line);

  // The keypad face, set a touch below the ring.
  const face = new THREE.Mesh(new THREE.CylinderGeometry(FACE_R, FACE_R, 0.032, 128), matFace);
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.016;          // its top sits at z 0.032, just under the ring's
  lock.add(face);

  // Buttons: a domed lathe each, with the digit printed on top.
  const btnGeo = lathe([
    [0, 0], [BTN_R, 0], [BTN_R, BTN_H - 0.016], [BTN_R - 0.005, BTN_H - 0.006],
    [BTN_R - 0.016, BTN_H - 0.001], [0, BTN_H],
  ], 48);
  const buttons = new Map();
  const hits = [];
  for (const [d, x, y] of KEYS) {
    const g = new THREE.Group();
    g.position.set(x, y - 0.004, BTN_Z);
    const b = new THREE.Mesh(btnGeo, matBtn.clone());
    b.userData.digit = d;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(BTN_R * 1.5, BTN_R * 1.5),
      new THREE.MeshBasicMaterial({ map: digitTexture(d), transparent: true, depthWrite: false, toneMapped: false }));
    label.position.z = BTN_H + 0.0015;
    g.add(b, label);
    lock.add(g);
    buttons.set(d, { g, b, t: 0 });
    hits.push(b);
  }

  lock.rotation.x = -0.02;

  /* ---- animation state ---- */
  let ringTarget = 0, ringNow = 0;
  let shakeT = 0, openT = -1, tilt = { x: 0, y: 0 }, tiltNow = { x: 0, y: 0 };
  let locked = false;
  let raf = 0, last = performance.now();

  const frame = now => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let busy = false;

    ringNow += (ringTarget - ringNow) * Math.min(1, dt * 10);
    if (Math.abs(ringTarget - ringNow) > 1e-4) busy = true; else ringNow = ringTarget;
    ring.rotation.z = -ringNow;

    for (const k of buttons.values()) {
      if (k.t > 0) { k.t = Math.max(0, k.t - dt); busy = true; }
      const depth = k.t > 0 ? Math.sin((k.t / 0.18) * Math.PI) * 0.022 : 0;
      k.g.position.z = BTN_Z - depth;
    }

    let sx = 0;
    if (shakeT > 0) { shakeT = Math.max(0, shakeT - dt); sx = Math.sin(shakeT * 60) * 0.03 * (shakeT / 0.45); busy = true; }
    tiltNow.x += (tilt.x - tiltNow.x) * Math.min(1, dt * 4);
    tiltNow.y += (tilt.y - tiltNow.y) * Math.min(1, dt * 4);
    if (Math.abs(tilt.x - tiltNow.x) + Math.abs(tilt.y - tiltNow.y) > 1e-4) busy = true;
    lock.rotation.y = tiltNow.x + sx;
    lock.rotation.x = -0.02 + tiltNow.y;

    if (openT >= 0) {
      openT = Math.min(1, openT + dt / 0.9);
      const e = 1 - Math.pow(1 - openT, 3);
      ring.rotation.z = -ringNow - e * Math.PI / 2;      // the bolt: a quarter turn
      matMark.emissive.setRGB(0.55 * e, 0.3 * e, 0.16 * e);
      if (openT < 1) busy = true;
    }

    renderer.render(scene, camera);
    if (busy) kick();
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  /* ---- size: square, fills the stage ---- */
  const fit = () => {
    const w = stage.clientWidth || 300;
    renderer.setSize(w, w, false);
    camera.aspect = 1; camera.updateProjectionMatrix();
    kick();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  /* ---- pointer: press a button, and a slight parallax ---- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    return hit ? hit.object.userData.digit : null;
  };
  canvas.addEventListener('pointerdown', e => {
    if (locked) return;
    const d = pick(e);
    if (d === null) return;
    e.preventDefault();
    if (onPress) onPress(d);
  });
  canvas.addEventListener('pointermove', e => {
    canvas.style.cursor = (!locked && pick(e) !== null) ? 'pointer' : 'default';
    if (reduced || e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    tilt = { x: (((e.clientX - r.left) / r.width) - 0.5) * 0.16, y: (((e.clientY - r.top) / r.height) - 0.5) * 0.12 };
    kick();
  });
  canvas.addEventListener('pointerleave', () => { tilt = { x: 0, y: 0 }; kick(); });

  return {
    /** Animate one button and turn the ring a notch. */
    press(d) {
      const k = buttons.get(d);
      if (k) k.t = reduced ? 0 : 0.18;
      ringTarget += reduced ? 0 : NOTCH;
      kick();
    },
    /** The field was cleared: the ring goes home. */
    clear() { ringTarget = 0; kick(); },
    /** A wrong code: a short shake. */
    shake() { shakeT = reduced ? 0 : 0.45; ringTarget = 0; kick(); },
    /** Locked by the server: the mark turns terracotta and the buttons dim. */
    setLocked(on) {
      locked = on;
      matMark.color.set(on ? 0xc9683d : 0xf1ece1);
      for (const k of buttons.values()) k.b.material.color.set(on ? 0x0f1011 : 0x272a2e);
      kick();
    },
    /** The right code: the bolt turns. Resolves when it has. */
    open() {
      return new Promise(res => {
        if (reduced) { res(); return; }
        openT = 0; kick(); setTimeout(res, 950);
      });
    },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      renderer.dispose(); canvas.remove();
    },
  };
}

/* ---- helpers ------------------------------------------------------------ */

/** A lathe round the z axis from [radius, z] pairs. */
function lathe(points, segs) {
  const g = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segs);
  g.rotateX(Math.PI / 2);       // lathe spins round y; the lock faces +z
  g.computeVertexNormals();
  return g;
}

function roundedBar(w, h, d) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, -h / 2 + r);
  s.lineTo(-r, h / 2 - r); s.absarc(0, h / 2 - r, r, Math.PI, 0, true);
  s.lineTo(r, -h / 2 + r); s.absarc(0, -h / 2 + r, r, 0, Math.PI, true);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
}

/** The digit, drawn in the site's own Inter, warm white on transparent. */
function digitTexture(d) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ece9e2';
  x.font = '500 84px Inter, system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(d, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A soft studio for the metal to reflect: a few glowing panels in a dark
    room, baked once into an environment map. Nothing is loaded from disk. */
function studioEnvironment(renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x0d0f10);
  const panel = (w, h, x, y, z, ry, c, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; m.lookAt(0, 0, 0);
    room.add(m);
  };
  panel(6, 3, -4, 5, 4, 0, 0xfff1e0, 2.2);   // key softbox, above left
  panel(3, 6, 6, 0, 2, 0, 0xdde8ff, 1.0);    // rim, right
  panel(8, 2, 0, -5, 3, 0, 0x2a4235, 0.6);   // forest bounce from below
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(room, 0.04).texture;
  pm.dispose();
  return tex;
}
