/* ============================================================================
   The safe-lock's dial: the first thing at /owner/. A Three.js model of the
   owner's reference: a 100 mm round matte-black body, a knurled ring that
   turns a notch for every digit, and an index mark at twelve o'clock.

   IT DRAWS ONLY THE DIAL, AND IT CHECKS NOTHING. The ten keys are real
   buttons in the page (owner/index.html, data-lock-keys), laid over the face
   in CSS so they are a fixed size in CSS pixels on every screen. Each press
   only appends a digit to the plain field (#code), which is the single source
   of truth and what is posted to the server. The code, its hash and the
   lockout all live on the server; no part of either is in this file.

   Scale: 1 unit = 100 mm, so the body's radius is 0.5. The lock faces +z and
   is drawn square-on (an orthographic camera framing exactly the body), so a
   point on the face is at the same place as the CSS key above it. The radii
   below are the ones review-pages.css lays the keys and the halo out against.

   Loaded only by owner.js, only when WebGL works. If anything here throws,
   owner.js draws the same dial in CSS and the keys work the same.
   ========================================================================== */
import * as THREE from './vendor/three-0.169.0.module.min.js';

const BODY_R = 0.5, BODY_D = 0.2;            // 100 mm across; the body's depth
const RING_IN = 0.45, RING_OUT = 0.49;       // the knurled ring: 45% to 49% of the width
const RING_D = 0.03;                         // how far it stands proud of the face
const FACE_R = 0.45;                         // the keys sit inside this (CSS: 45cqw)
const NOTCH = Math.PI / 15;                  // the ring turns 12 degrees a digit

export function mountLock(stage) {
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
  stage.prepend(canvas);              // under the keys and the halo

  const scene = new THREE.Scene();
  // Square-on and exactly the body's width, so the DOM keys line up.
  const camera = new THREE.OrthographicCamera(-BODY_R, BODY_R, BODY_R, -BODY_R, 0.1, 10);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);

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
  const matMark  = new THREE.MeshStandardMaterial({ color: 0xf1ece1, roughness: 0.4, emissive: 0x000000 });

  const lock = new THREE.Group();
  scene.add(lock);

  // Body: a short cylinder with a softened front edge (a lathe profile).
  lock.add(new THREE.Mesh(lathe([
    [0, -BODY_D], [BODY_R - 0.01, -BODY_D], [BODY_R, -BODY_D + 0.01],
    [BODY_R, -0.016], [BODY_R - 0.004, -0.005], [BODY_R - 0.012, 0], [0, 0],
  ], 128), matBody));

  // The knurled ring: a core plus 132 ridges around its outside, as instances.
  const ring = new THREE.Group();
  ring.add(new THREE.Mesh(lathe([
    [RING_IN, 0], [RING_OUT - 0.004, 0], [RING_OUT - 0.004, RING_D - 0.006],
    [RING_OUT - 0.01, RING_D], [RING_IN + 0.005, RING_D], [RING_IN, RING_D - 0.005],
  ], 160), matRing));
  const RIDGES = 132;
  const ridge = new THREE.BoxGeometry(0.007, 0.022, RING_D - 0.008);
  const ridges = new THREE.InstancedMesh(ridge, matRing, RIDGES);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (let i = 0; i < RIDGES; i++) {
    const a = (i / RIDGES) * Math.PI * 2;
    p.set(Math.sin(a) * (RING_OUT - 0.012), Math.cos(a) * (RING_OUT - 0.012), (RING_D - 0.008) / 2 + 0.002);
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
    ridges.setMatrixAt(i, m.compose(p, q, s));
  }
  ring.add(ridges);
  lock.add(ring);

  // The thin steel line just inside the ring.
  const line = new THREE.Mesh(new THREE.TorusGeometry(RING_IN - 0.004, 0.0028, 10, 160), matSteel);
  line.position.z = 0.004;
  lock.add(line);

  // The keypad face, flush with the front of the body.
  const face = new THREE.Mesh(new THREE.CylinderGeometry(FACE_R, FACE_R, 0.01, 128), matFace);
  face.rotation.x = Math.PI / 2;
  face.position.z = -0.004;
  lock.add(face);

  // The index mark at twelve o'clock, on the face just inside the ring and
  // above the 2. It stays still while the ring turns past it.
  const mark = new THREE.Mesh(roundedBar(0.011, 0.034, 0.004), matMark);
  mark.position.set(0, FACE_R - 0.036, 0.002);
  lock.add(mark);

  /* ---- animation state ---- */
  let ringTarget = 0, ringNow = 0, openT = -1;
  let raf = 0, last = performance.now();

  const frame = now => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let busy = false;

    // A short damped spring, so each notch lands with a little settle.
    ringNow += (ringTarget - ringNow) * Math.min(1, dt * 14);
    if (Math.abs(ringTarget - ringNow) > 1e-4) busy = true; else ringNow = ringTarget;
    ring.rotation.z = -ringNow;

    if (openT >= 0) {
      openT = Math.min(1, openT + dt / 0.9);
      const e = 1 - Math.pow(1 - openT, 3);
      ring.rotation.z = -ringNow - e * Math.PI / 2;      // the bolt: a quarter turn
      matMark.emissive.setRGB(0.12 * e, 0.5 * e, 0.3 * e);
      if (openT < 1) busy = true;
    }

    renderer.render(scene, camera);
    if (busy) kick();
  };
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  /* ---- size: square, fills the stage ---- */
  const fit = () => {
    const w = stage.clientWidth || 300;
    renderer.setSize(w, w, false);
    kick();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  return {
    /** n digits are in the field: the ring sits n notches round. */
    turnTo(n) { ringTarget = reduced ? 0 : n * NOTCH; kick(); },
    /** The field was cleared, or a code was refused: the ring goes home. */
    clear() { ringTarget = 0; openT = -1; matMark.emissive.setRGB(0, 0, 0); kick(); },
    /** Locked by the server: the mark turns terracotta. */
    setLocked(on) { matMark.color.set(on ? 0xc9683d : 0xf1ece1); kick(); },
    /** The server accepted the code: the bolt turns. Resolves when it has. */
    open() {
      return new Promise(res => {
        if (reduced) { matMark.emissive.setRGB(0.12, 0.5, 0.3); kick(); res(); return; }
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
