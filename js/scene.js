/* ============================================================
   scene.js — hero particle terrain
   A field of points displaced by layered simplex noise, with a
   ripple that follows the pointer. Cheap on purpose: one draw
   call, custom point shader, DPR capped.
   ============================================================ */

import * as THREE from "./vendor/three.module.min.js";

const NOISE_GLSL = /* glsl */ `
  // simplex 2D noise (Ian McEwan / Ashima Arts, MIT)
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
`;

const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  uniform float uPixelRatio;
  uniform float uIntro;

  varying float vElev;
  varying float vPulse;
  varying float vDepth;

  ${"${NOISE}"}

  void main() {
    vec3 p = position;

    float t = uTime * 0.18;
    float elev =
        snoise(vec2(p.x * 0.115, p.z * 0.115 + t)) * 1.45
      + snoise(vec2(p.x * 0.42 + 5.0, p.z * 0.42 + t * 2.1)) * 0.32;

    float d = distance(p.xz, uPointer);
    float ripple = sin(d * 2.4 - uTime * 3.2) * exp(-d * 0.5) * uPointerStrength;
    float pulse = exp(-d * 0.42) * uPointerStrength;

    p.y = (elev + ripple * 1.25) * uIntro;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    vElev = clamp(elev * 0.5 + 0.5, 0.0, 1.0);
    vPulse = clamp(pulse, 0.0, 1.0);
    vDepth = -mv.z;

    float size = 1.05 + vElev * 1.7 + vPulse * 2.4;
    gl_PointSize = size * uPixelRatio * (26.0 / vDepth);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  varying float vElev;
  varying float vPulse;
  varying float vDepth;

  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float disc = smoothstep(0.5, 0.12, r);

    // base dust -> bone on crests -> acid where the pointer lives
    vec3 col = mix(uColorA, uColorB, pow(vElev, 2.2) * 0.85);
    col = mix(col, uColorC, clamp(vPulse * 1.35, 0.0, 1.0));

    float depthFade = smoothstep(30.0, 9.0, vDepth);
    float alpha = disc * depthFade * (0.32 + vElev * 0.5 + vPulse * 0.45);

    gl_FragColor = vec4(col, alpha);
  }
`;

export function createScene(canvas, { reducedMotion = false } = {}) {
  const isMobile = window.innerWidth < 768;
  const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
  const camBase = new THREE.Vector3(0, 4.0, 10.2);
  camera.position.copy(camBase);
  camera.lookAt(0, 0.4, 0);

  // ---- point grid ----
  const COLS = isMobile ? 130 : 210;
  const ROWS = isMobile ? 78 : 120;
  const W = 40, D = 22;
  const count = COLS * ROWS;
  const positions = new Float32Array(count * 3);
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      positions[i++] = (c / (COLS - 1) - 0.5) * W;
      positions[i++] = 0;
      positions[i++] = (r / (ROWS - 1) - 0.5) * D;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const uniforms = {
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uPointerStrength: { value: 0 },
    uPixelRatio: { value: dpr },
    uIntro: { value: reducedMotion ? 1 : 0 },
    uColorA: { value: new THREE.Color("#2e3134") },
    uColorB: { value: new THREE.Color("#b9b6ac") },
    uColorC: { value: new THREE.Color("#c6f546") },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT.replace("${NOISE}", NOISE_GLSL),
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  scene.add(new THREE.Points(geometry, material));

  // ---- pointer -> world (intersect ray with y=0 plane) ----
  const pointerTarget = new THREE.Vector2(0, 0);
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let strengthTarget = 0;
  let parallaxX = 0, parallaxTarget = 0;

  function onPointerMove(e) {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) {
      pointerTarget.set(
        THREE.MathUtils.clamp(hit.x, -W / 2, W / 2),
        THREE.MathUtils.clamp(hit.z, -D / 2, D / 2)
      );
      strengthTarget = 1;
    }
    parallaxTarget = ndc.x;
  }

  // ---- sizing ----
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  // ---- loop ----
  let running = false;
  let visible = true;
  let scrollShift = 0; // 0..1 from hero scroll progress
  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    uniforms.uTime.value += dt;

    // ease pointer + strength
    uniforms.uPointer.value.lerp(pointerTarget, 1 - Math.pow(0.0014, dt));
    strengthTarget *= Math.pow(0.45, dt); // decay when idle
    uniforms.uPointerStrength.value +=
      (Math.min(strengthTarget * 1.6, 1) - uniforms.uPointerStrength.value) *
      (1 - Math.pow(0.002, dt));

    // camera: gentle parallax + scroll dolly
    parallaxX += (parallaxTarget - parallaxX) * (1 - Math.pow(0.01, dt));
    camera.position.x = camBase.x + parallaxX * 0.9;
    camera.position.y = camBase.y + scrollShift * 2.6;
    camera.position.z = camBase.z - scrollShift * 1.4;
    camera.lookAt(0, 0.4 - scrollShift * 0.8, 0);

    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    frame();
    requestAnimationFrame(loop);
  }

  function setRunning(v) {
    const next = v && visible && !document.hidden && !reducedMotion;
    if (next && !running) {
      running = true;
      clock.getDelta(); // drop the dead time
      requestAnimationFrame(loop);
    } else if (!next) {
      running = false;
    }
  }

  // only animate while the hero is on screen
  let started = false;
  const io = new IntersectionObserver(
    ([entry]) => { visible = entry.isIntersecting; if (started) setRunning(true); },
    { threshold: 0.02 }
  );
  io.observe(canvas);
  document.addEventListener("visibilitychange", () => { if (started) setRunning(true); });
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  return {
    /** kick things off (called once the preloader exits) */
    start() {
      started = true;
      resize();
      if (reducedMotion) {
        uniforms.uTime.value = 7.3; // a flattering frame
        frame();
        return;
      }
      setRunning(true);
    },
    /** rise the terrain in during the intro (0..1) */
    setIntro(v) { uniforms.uIntro.value = v; },
    /** hero scroll progress (0..1) -> camera dolly */
    setScroll(p) { scrollShift = p; },
  };
}
