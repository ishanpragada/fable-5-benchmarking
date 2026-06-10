/* ============================================================
   lattice.js — a dot grid in the page margins.
   The one WebGL element on the site, and it tries to earn it:
   - the pointer's influence runs through a critically damped
     spring, so erratic mouse movement still produces calm,
     continuous motion (no overshoot, no jitter)
   - the render loop sleeps when the spring settles: zero CPU
     while you read
   ============================================================ */

import * as THREE from "./vendor/three.module.min.js";

const SPACING = 28;     // css px between dots
const RADIUS = 150;     // pointer influence, css px
const PUSH = 8;         // max displacement, css px
const STIFFNESS = 90;   // spring constant; damping is critical

const VERT = /* glsl */ `
  uniform vec2 uPointer;
  uniform float uRadius;
  uniform float uDpr;
  varying float vGlow;
  void main() {
    vec2 p = position.xy;
    vec2 d = p - uPointer;
    float dist = length(d);
    float infl = 1.0 - smoothstep(0.0, uRadius, dist);
    infl *= infl; /* soft shoulder — surface tension, not a hard ring */
    p += (d / max(dist, 0.0001)) * infl * ${PUSH.toFixed(1)};
    vGlow = infl;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
    gl_PointSize = uDpr * (1.5 + 0.8 * infl);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vGlow;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(uColor, 0.30 + 0.38 * vGlow);
  }
`;

export function mount(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  let camera = null;

  const uniforms = {
    uPointer: { value: new THREE.Vector2(-9999, -9999) },
    uRadius: { value: RADIUS },
    uDpr: { value: dpr },
    uColor: { value: new THREE.Color("#b5b3ae") },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthTest: false,
  });
  let points = null;

  function build() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera = new THREE.OrthographicCamera(0, w, 0, h, -1, 1);

    const cols = Math.ceil(w / SPACING) + 1;
    const rows = Math.ceil(h / SPACING) + 1;
    const pos = new Float32Array(cols * rows * 3);
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
    if (points) {
      points.geometry.dispose();
      points.geometry = geo;
    } else {
      points = new THREE.Points(geo, material);
      points.frustumCulled = false;
      scene.add(points);
    }
  }

  // ---- critically damped spring toward the pointer ----
  const damping = 2 * Math.sqrt(STIFFNESS);
  let px = -9999, py = -9999, vx = 0, vy = 0;
  let tx = -9999, ty = -9999;
  let hasPointer = false;
  let lastInput = 0;
  let raf = null;
  let last = 0;

  function settled() {
    return (
      Math.abs(tx - px) < 0.4 && Math.abs(ty - py) < 0.4 &&
      Math.abs(vx) < 0.4 && Math.abs(vy) < 0.4
    );
  }

  function frame(t) {
    const dt = Math.min((t - last) / 1000 || 0.016, 0.05);
    last = t;

    vx += ((tx - px) * STIFFNESS - vx * damping) * dt;
    vy += ((ty - py) * STIFFNESS - vy * damping) * dt;
    px += vx * dt;
    py += vy * dt;
    uniforms.uPointer.value.set(px, py);
    renderer.render(scene, camera);

    if (performance.now() - lastInput < 1500 || !settled()) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = null; // sleep — pointermove wakes us
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
  renderer.render(scene, camera); // static paper until the pointer arrives
}
