/* ============================================================
   lattice.js — Conway's Game of Life, run quietly in the page
   margins. The one WebGL element on the site, and it tries to
   earn it:
   - a real simulation (B3/S23, toroidal), not decoration; the
     note in the corner cites it and can pause it
   - cells fade between generations instead of popping
   - the pointer's influence runs through a critically damped
     spring, so erratic mouse movement still produces calm,
     continuous motion
   - frames render only when something changed; paused, the
     loop sleeps at zero CPU once the spring settles
   ============================================================ */

import * as THREE from "./vendor/three.module.min.js";

const SPACING = 28;      // css px between cells
const RADIUS = 150;      // pointer influence, css px
const PUSH = 8;          // max displacement, css px
const STIFFNESS = 90;    // spring constant; damping is critical
const TICK_MS = 750;     // one generation
const FADE_MS = 300;     // generation crossfade
const SEED_P = 0.12;     // initial soup density
const MIN_ALIVE = 0.02;  // reseed threshold (fraction of cells)
const MIN_CHANGE = 0.004; // below this churn the board counts as frozen
const FROZEN_TICKS = 4;  // consecutive frozen ticks before immigration

const GLIDER = [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]];

const VERT = /* glsl */ `
  uniform vec2 uPointer;
  uniform float uRadius;
  uniform float uDpr;
  uniform float uMix;
  attribute float aPrev;
  attribute float aCurr;
  varying float vGlow;
  varying float vState;
  void main() {
    vec2 p = position.xy;
    vec2 d = p - uPointer;
    float dist = length(d);
    float infl = 1.0 - smoothstep(0.0, uRadius, dist);
    infl *= infl; /* soft shoulder — surface tension, not a hard ring */
    p += (d / max(dist, 0.0001)) * infl * ${PUSH.toFixed(1)};
    vGlow = infl;
    vState = mix(aPrev, aCurr, uMix);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
    gl_PointSize = uDpr * (1.4 + 0.55 * vState + 0.8 * infl);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vGlow;
  varying float vState;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(uColor, 0.15 + 0.44 * vState + 0.30 * vGlow);
  }
`;

export function mount(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    // keep the buffer readable so page-transition snapshots capture it
    // correctly instead of as undefined (sometimes white) content
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  let camera = null;

  const uniforms = {
    uPointer: { value: new THREE.Vector2(-9999, -9999) },
    uRadius: { value: RADIUS },
    uDpr: { value: dpr },
    uMix: { value: 1 },
    uColor: { value: new THREE.Color("#b5b3ae") },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthTest: false,
  });

  // ---- life state ----
  let cols = 0, rows = 0, cells = 0;
  let curr = null, next = null;
  let prevAttr = null, currAttr = null;
  let points = null;

  function stampGlider(grid, cx, cy) {
    for (const [dy, dx] of GLIDER) {
      grid[((cy + dy + rows) % rows) * cols + ((cx + dx + cols) % cols)] = 1;
    }
  }

  // a column inside the visible margins, so immigration is seen, not implied
  function marginCol() {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const contentLeft = Math.max(0, (window.innerWidth - 64 * rem) / 2);
    const band = Math.floor(contentLeft / SPACING);
    if (band < 4) return (Math.random() * cols) | 0;
    const inBand = (Math.random() * (band - 2)) | 0;
    return Math.random() < 0.5 ? inBand : cols - 1 - inBand;
  }

  function seed() {
    for (let i = 0; i < cells; i++) curr[i] = Math.random() < SEED_P ? 1 : 0;
    prevAttr.array.set(curr);
    currAttr.array.set(curr);
    prevAttr.needsUpdate = currAttr.needsUpdate = true;
    uniforms.uMix.value = 1;
  }

  function build() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera = new THREE.OrthographicCamera(0, w, 0, h, -1, 1);

    cols = Math.ceil(w / SPACING) + 1;
    rows = Math.ceil(h / SPACING) + 1;
    cells = cols * rows;
    curr = new Uint8Array(cells);
    next = new Uint8Array(cells);

    const pos = new Float32Array(cells * 3);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        pos[i++] = c * SPACING;
        pos[i++] = r * SPACING;
        pos[i++] = 0;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    prevAttr = new THREE.BufferAttribute(new Float32Array(cells), 1);
    currAttr = new THREE.BufferAttribute(new Float32Array(cells), 1);
    geo.setAttribute("aPrev", prevAttr);
    geo.setAttribute("aCurr", currAttr);

    if (points) {
      points.geometry.dispose();
      points.geometry = geo;
    } else {
      points = new THREE.Points(geo, material);
      points.frustumCulled = false;
      scene.add(points);
    }
    seed();
  }

  let frozenTicks = 0;

  function step() {
    let alive = 0;
    let changed = 0;
    for (let r = 0; r < rows; r++) {
      const up = ((r - 1 + rows) % rows) * cols;
      const mid = r * cols;
      const dn = ((r + 1) % rows) * cols;
      for (let c = 0; c < cols; c++) {
        const l = (c - 1 + cols) % cols;
        const ri = (c + 1) % cols;
        const n =
          curr[up + l] + curr[up + c] + curr[up + ri] +
          curr[mid + l] + curr[mid + ri] +
          curr[dn + l] + curr[dn + c] + curr[dn + ri];
        const v = curr[mid + c] ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
        next[mid + c] = v;
        alive += v;
        changed += v ^ curr[mid + c];
      }
    }
    [curr, next] = [next, curr];

    // Life soups settle into still lifes; a frozen board isn't much of a
    // simulation. When churn dies down (or population collapses), a few
    // gliders immigrate through the visible margins.
    frozenTicks = changed < cells * MIN_CHANGE ? frozenTicks + 1 : 0;
    if (alive < cells * MIN_ALIVE || frozenTicks >= FROZEN_TICKS) {
      frozenTicks = 0;
      for (let g = 0; g < 3; g++) {
        stampGlider(curr, marginCol(), (Math.random() * rows) | 0);
      }
    }

    prevAttr.array.set(currAttr.array);
    currAttr.array.set(curr);
    prevAttr.needsUpdate = currAttr.needsUpdate = true;
    uniforms.uMix.value = 0; // restart the crossfade
  }

  // ---- critically damped spring toward the pointer ----
  const damping = 2 * Math.sqrt(STIFFNESS);
  let px = -9999, py = -9999, vx = 0, vy = 0;
  let tx = -9999, ty = -9999;
  let hasPointer = false;
  let lastInput = 0;

  function springSettled() {
    return (
      Math.abs(tx - px) < 0.4 && Math.abs(ty - py) < 0.4 &&
      Math.abs(vx) < 0.4 && Math.abs(vy) < 0.4
    );
  }

  // ---- loop ----
  let simRunning = true;
  let raf = null;
  let last = 0;
  let sinceTick = 0;

  function frame(t) {
    const dt = Math.min((t - last) / 1000 || 0.016, 0.05);
    last = t;

    let dirty = false;

    // spring
    if (!springSettled() || performance.now() - lastInput < 1500) {
      vx += ((tx - px) * STIFFNESS - vx * damping) * dt;
      vy += ((ty - py) * STIFFNESS - vy * damping) * dt;
      px += vx * dt;
      py += vy * dt;
      uniforms.uPointer.value.set(px, py);
      dirty = true;
    }

    // generations
    if (simRunning) {
      sinceTick += dt * 1000;
      if (sinceTick >= TICK_MS) {
        sinceTick %= TICK_MS;
        step();
      }
      if (uniforms.uMix.value < 1) {
        uniforms.uMix.value = Math.min(1, uniforms.uMix.value + (dt * 1000) / FADE_MS);
        dirty = true;
      }
    }

    if (dirty) renderer.render(scene, camera);

    // keep the loop only while there's work now or work coming
    if (simRunning || dirty) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = null; // paused + settled: zero CPU until input
    }
  }

  function wake() {
    if (raf == null && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  window.addEventListener(
    "pointermove",
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!hasPointer) {
        // first contact: no fly-in from offscreen
        px = tx; py = ty;
        hasPointer = true;
      }
      lastInput = performance.now();
      wake();
    },
    { passive: true }
  );

  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      build();
      lastInput = performance.now();
      wake();
    }, 150);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && raf != null) {
      cancelAnimationFrame(raf);
      raf = null;
    } else {
      wake();
    }
  });

  build();
  renderer.render(scene, camera);
  wake();

  return {
    /** pause/resume the simulation; returns whether it now runs */
    toggle() {
      simRunning = !simRunning;
      if (simRunning) {
        sinceTick = 0;
        wake();
      }
      return simRunning;
    },
  };
}
