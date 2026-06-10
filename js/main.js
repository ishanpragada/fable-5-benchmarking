/* ============================================================
   main.js — ishan.kr
   Orchestration: preloader -> intro -> scroll choreography.
   GSAP + Lenis are vendored UMD globals; the three.js scene is
   an ES module.
   ============================================================ */

import { createScene } from "./scene.js";

const { gsap, ScrollTrigger, SplitText, ScrambleTextPlugin, Lenis } = window;
gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer =
  matchMedia("(hover: hover) and (pointer: fine)").matches ||
  new URLSearchParams(location.search).has("forcefine"); // test hook
document.documentElement.classList.toggle("fine-pointer", finePointer);
const EASE = "power4.out";
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

/* ============================================================
   clock — Urbana, IL
   ============================================================ */
function initClock() {
  const els = [$("#clock"), $("#clockFooter")].filter(Boolean);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const tick = () => {
    const t = fmt.format(new Date());
    els.forEach((el) => (el.textContent = t));
  };
  tick();
  setInterval(tick, 1000);
}

/* ============================================================
   smooth scroll
   ============================================================ */
let lenis = null;
function initLenis() {
  if (reducedMotion) return;
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

function scrollToHash(hash) {
  const target = $(hash);
  if (!target) return;
  if (lenis) lenis.scrollTo(target, { offset: -8, duration: 1.5 });
  else target.scrollIntoView();
}

function initAnchors() {
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const hash = a.getAttribute("href");
      if (hash.length < 2) return;
      e.preventDefault();
      closeMenu();
      scrollToHash(hash);
    });
  });
}

/* ============================================================
   fit text — scale [data-fit] lines to their container width
   (optionally a fraction of it), then keep the hero lockup
   inside the viewport's height budget
   ============================================================ */
function fitText() {
  $$("[data-fit]").forEach((el) => {
    const frac = parseFloat(el.dataset.fit) || 1;
    const max = el.parentElement.clientWidth * frac;
    if (!max) return;
    el.style.fontSize = "100px";
    let w = el.getBoundingClientRect().width;
    if (!w) return;
    let size = 100 * (max / w);
    el.style.fontSize = `${size}px`;
    // correction pass: glyph hinting drifts at display sizes
    w = el.getBoundingClientRect().width;
    if (w > 0) size *= max / w;
    el.style.fontSize = `${Math.floor(size * 100) / 100}px`;
  });
  fitHeroHeight();
}

function fitHeroHeight() {
  const hero = $("#hero");
  const title = $(".hero__title");
  if (!hero || !title) return;
  const lines = $$(".hero__line");
  const siblings = [".hero__head", ".hero__sub", ".hero__meta"].map((s) => $(s));
  const cs = getComputedStyle(hero);
  const ts = getComputedStyle(title);
  const chrome =
    parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) +
    parseFloat(ts.paddingTop) + parseFloat(ts.paddingBottom) +
    siblings.reduce((a, el) => a + (el?.offsetHeight || 0), 0) + 24;
  const avail = window.innerHeight - chrome;
  const natural = lines.reduce((a, l) => a + l.offsetHeight, 0);
  if (avail > 0 && natural > avail) {
    const k = avail / natural;
    lines.forEach((l) => {
      l.style.fontSize = `${parseFloat(l.style.fontSize) * k}px`;
    });
  }
}

/* ============================================================
   preloader — boot log + counter, then the curtain lifts
   ============================================================ */
const BOOT_LINES = [
  "[ 0.000012 ] init ishan.kr v5.0 — cold start",
  "[ 0.000489 ] mounting /dev/ambition ........ <i>ok</i>",
  "[ 0.001337 ] warming caches L1 L2 L3 ....... <i>ok</i>",
  "[ 0.004096 ] linking gsap + three .......... <i>ok</i>",
  "[ 0.008128 ] scanning for spinners ......... <i>none</i>",
  "[ 0.012000 ] ready — p99 under budget",
];

function runPreloader(onDone) {
  const pre = $("#preloader");
  const count = $("#loadCount");
  const bar = $("#loadBar");
  const log = $("#bootLog");

  if (reducedMotion) {
    pre.remove();
    document.body.removeAttribute("data-loading");
    onDone(true);
    return;
  }

  BOOT_LINES.forEach((line, i) => {
    gsap.delayedCall(0.12 + i * 0.21, () => {
      const div = document.createElement("div");
      div.innerHTML = line.replace(/<i>(.*?)<\/i>/g, '<span class="ok">$1</span>');
      log.appendChild(div);
    });
  });

  const state = { v: 0 };
  const tl = gsap.timeline({
    onComplete: () => {
      gsap.timeline({
        onComplete: () => { pre.remove(); document.body.removeAttribute("data-loading"); },
      })
        .to(pre, { yPercent: -100, duration: 1.05, ease: "power4.inOut", delay: 0.15 })
        .add(() => onDone(false), 0.25);
    },
  });
  tl.to(state, {
    v: 100,
    duration: 2.1,
    ease: "power2.inOut",
    onUpdate: () => {
      count.textContent = String(Math.round(state.v)).padStart(3, "0");
      bar.style.transform = `scaleX(${state.v / 100})`;
    },
  });
}

/* ============================================================
   hero intro
   ============================================================ */
function heroIntro(sceneApi, instant) {
  const lines = $$(".hero__line");
  const intro = { v: 0 };

  if (instant) {
    sceneApi?.start();
    sceneApi?.setIntro(1);
    return;
  }

  gsap.set(lines, { clipPath: "inset(0 0 100% 0)", yPercent: 24 });
  const tl = gsap.timeline({ delay: 0.05 });
  tl.add(() => sceneApi?.start(), 0)
    .to(intro, {
      v: 1, duration: 2.6, ease: "power2.inOut",
      onUpdate: () => sceneApi?.setIntro(intro.v),
    }, 0)
    .to(lines, {
      clipPath: "inset(0 0 -8% 0)", yPercent: 0,
      duration: 1.25, ease: "power4.out", stagger: 0.1,
    }, 0.18)
    .from(".hero__head", { autoAlpha: 0, y: -14, duration: 0.8, ease: EASE }, 0.55)
    .from(".hero__aside", { autoAlpha: 0, duration: 0.8, ease: "power2.out" }, 0.95)
    .from(".hero__bio", { autoAlpha: 0, y: 26, duration: 0.9, ease: EASE }, 0.7)
    .from(".hero__meta", { autoAlpha: 0, duration: 0.9, ease: "power2.out" }, 0.85)
    .from(".nav", { autoAlpha: 0, y: -16, duration: 0.8, ease: EASE }, 0.6);
}

/* ============================================================
   nav — shrink on scroll, hide on scroll-down
   ============================================================ */
function initNav() {
  const nav = $("#nav");
  let lastY = 0;
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      nav.classList.toggle("nav--scrolled", y > 40);
      nav.classList.toggle("nav--hidden", y > lastY && y > 500 && !menuOpen);
      lastY = y;
    },
    { passive: true }
  );
}

/* ============================================================
   mobile menu
   ============================================================ */
let menuOpen = false;
let menuTl = null;
function initMenu() {
  const burger = $("#burger");
  const menu = $("#menu");
  const links = $$(".menu__link, .menu__meta > *", menu);

  menuTl = gsap.timeline({ paused: true })
    .set(menu, { visibility: "visible" })
    .to(menu, { opacity: 1, duration: 0.4, ease: "power2.out" }, 0)
    .from(links, { yPercent: 60, autoAlpha: 0, stagger: 0.06, duration: 0.7, ease: EASE }, 0.08);

  burger.addEventListener("click", () => (menuOpen ? closeMenu() : openMenu()));

  function openMenu() {
    menuOpen = true;
    burger.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    menu.setAttribute("aria-hidden", "false");
    lenis?.stop();
    menuTl.timeScale(1).play();
  }
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  const burger = $("#burger");
  const menu = $("#menu");
  burger.classList.remove("is-open");
  burger.setAttribute("aria-expanded", "false");
  menu.setAttribute("aria-hidden", "true");
  lenis?.start();
  menuTl?.timeScale(1.8).reverse();
}

/* ============================================================
   cursor + magnetic
   ============================================================ */
function initCursor() {
  if (!finePointer) return;
  const cursor = $(".cursor");
  const dotX = gsap.quickTo("#cursorDot", "x", { duration: 0.12, ease: "power3" });
  const dotY = gsap.quickTo("#cursorDot", "y", { duration: 0.12, ease: "power3" });
  const ringX = gsap.quickTo("#cursorRing", "x", { duration: 0.45, ease: "power3" });
  const ringY = gsap.quickTo("#cursorRing", "y", { duration: 0.45, ease: "power3" });

  window.addEventListener("pointermove", (e) => {
    cursor.classList.add("is-on");
    dotX(e.clientX); dotY(e.clientY);
    ringX(e.clientX); ringY(e.clientY);
  }, { passive: true });

  window.addEventListener("pointerdown", () => cursor.classList.add("cursor--press"));
  window.addEventListener("pointerup", () => cursor.classList.remove("cursor--press"));

  $$(".work__row").forEach((row) => {
    row.addEventListener("pointerenter", () => cursor.classList.add("cursor--view"));
    row.addEventListener("pointerleave", () => cursor.classList.remove("cursor--view"));
  });
}

function initMagnetic() {
  if (!finePointer || reducedMotion) return;
  $$(".magnetic, .btn").forEach((el) => {
    const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.28);
    });
    el.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
  });
}

/* ============================================================
   scramble hover
   ============================================================ */
function initScramble() {
  if (!finePointer || reducedMotion) return;
  $$("[data-scramble]").forEach((el) => {
    const original = el.textContent;
    const trigger = el.closest("a, button") || el;
    let tween = null;
    trigger.addEventListener("pointerenter", () => {
      tween?.kill();
      tween = gsap.to(el, {
        duration: 0.7,
        scrambleText: { text: original, chars: "upperAndLowerCase", speed: 1.1 },
        ease: "none",
      });
    });
  });
}

/* ============================================================
   scroll choreography
   ============================================================ */
function initScrollFx(sceneApi) {
  // hero -> camera dolly + content drift
  ScrollTrigger.create({
    trigger: "#hero",
    start: "top top",
    end: "bottom top",
    scrub: true,
    onUpdate: (self) => sceneApi?.setScroll(self.progress),
  });
  if (!reducedMotion) {
    gsap.to(".hero__title", {
      yPercent: -12, autoAlpha: 0.25, ease: "none",
      scrollTrigger: { trigger: "#hero", start: "28% top", end: "bottom top", scrub: true },
    });
  }

  // split-line reveals
  $$("[data-split]").forEach((el) => {
    SplitText.create(el, {
      type: "lines",
      mask: "lines",
      linesClass: "split-line",
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, {
          yPercent: 115,
          duration: reducedMotion ? 0 : 1.15,
          stagger: 0.09,
          ease: EASE,
          scrollTrigger: { trigger: el, start: "top 86%", once: true },
        }),
    });
  });

  // generic row/figure entrances
  const enter = (els, vars = {}) =>
    els.forEach((el) =>
      gsap.from(el, {
        autoAlpha: 0, y: reducedMotion ? 0 : 44,
        duration: reducedMotion ? 0 : 0.9, ease: EASE,
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        ...vars,
      })
    );
  enter($$(".work__row"));
  enter($$(".exp__row"));
  enter($$(".writing__row"));
  enter($$(".stats__item"), { stagger: 0.08 });
  enter($$(".section__head"), { y: reducedMotion ? 0 : 24 });
  enter($$(".contact__cta-row, .contact__socials, .contact__kicker"));

  // contact title lines
  $$(".contact__line").forEach((line, i) => {
    gsap.from(line, {
      yPercent: reducedMotion ? 0 : 60, autoAlpha: 0,
      duration: reducedMotion ? 0 : 1.2, delay: i * 0.08, ease: EASE,
      scrollTrigger: { trigger: ".contact__title", start: "top 88%", once: true },
    });
  });

  // watermark drift
  if (!reducedMotion) {
    gsap.from(".contact__watermark", {
      yPercent: 42, ease: "none",
      scrollTrigger: { trigger: ".contact", start: "top bottom", end: "bottom bottom", scrub: true },
    });
  }

  // stat counters
  $$(".count").forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const state = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: "top 92%", once: true,
      onEnter: () =>
        gsap.to(state, {
          v: target,
          duration: reducedMotion ? 0 : 1.8,
          ease: "power3.out",
          onUpdate: () => (el.textContent = state.v.toFixed(decimals)),
          onComplete: () => (el.textContent = target.toFixed(decimals)),
        }),
    });
  });
}

/* ============================================================
   marquee — velocity-aware
   ============================================================ */
function initMarquee() {
  const track = $("#marqueeTrack");
  if (reducedMotion) return;
  const tween = gsap.to(track, { xPercent: -50, ease: "none", duration: 24, repeat: -1 });
  let speed = 1;
  ScrollTrigger.create({
    onUpdate: (self) => {
      const v = gsap.utils.clamp(-3.5, 3.5, self.getVelocity() / 320);
      if (Math.abs(v) > Math.abs(speed)) speed = v;
    },
  });
  gsap.ticker.add(() => {
    speed += (1 - speed) * 0.05; // always settles back to 1
    tween.timeScale(speed);
  });
}

/* ============================================================
   work hover preview card
   ============================================================ */
function initPreview() {
  if (!finePointer || window.innerWidth <= 1024) return;
  const preview = $("#preview");
  const cards = $$(".preview__card", preview);
  const list = $("#workList");

  const xTo = gsap.quickTo(preview, "x", { duration: 0.5, ease: "power3" });
  const yTo = gsap.quickTo(preview, "y", { duration: 0.5, ease: "power3" });
  const rTo = gsap.quickTo(preview, "rotation", { duration: 0.6, ease: "power3" });
  let lastX = 0;

  list.addEventListener("pointermove", (e) => {
    xTo(e.clientX);
    yTo(e.clientY);
    rTo(gsap.utils.clamp(-9, 9, (e.clientX - lastX) * 0.55));
    lastX = e.clientX;
  });

  $$(".work__row").forEach((row) => {
    row.addEventListener("pointerenter", () => {
      const key = row.dataset.preview;
      cards.forEach((c) => c.classList.toggle("is-active", c.dataset.card === key));
      gsap.to(preview, { autoAlpha: 1, scale: 1, duration: 0.45, ease: "power3.out" });
    });
  });
  list.addEventListener("pointerleave", () => {
    gsap.to(preview, { autoAlpha: 0, scale: 0.88, duration: 0.35, ease: "power3.in" });
    rTo(0);
  });
  gsap.set(preview, { scale: 0.88, autoAlpha: 0, transformOrigin: "center center" });
}

/* ============================================================
   boot
   ============================================================ */
async function init() {
  initClock();
  initLenis();
  initNav();
  initMenu();
  initAnchors();
  initCursor();
  initMagnetic();
  initScramble();
  initMarquee();
  initPreview();

  let sceneApi = null;
  try {
    sceneApi = createScene($("#scene"), { reducedMotion });
  } catch (err) {
    console.warn("[scene] webgl unavailable, staying flat:", err);
    $("#scene").style.display = "none";
  }

  // fonts.ready can resolve before any face is requested — ask explicitly,
  // otherwise fitText/SplitText measure fallback-font widths
  await Promise.all([
    document.fonts.load('400 100px "Anton"'),
    document.fonts.load('430 16px "JetBrains Mono Variable"'),
    document.fonts.load('380 16px "Archivo Variable"'),
  ]).catch(() => {});
  await document.fonts.ready;
  fitText();
  window.addEventListener("load", fitText, { once: true });
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { fitText(); ScrollTrigger.refresh(); }, 150);
  });

  initScrollFx(sceneApi);

  runPreloader((instant) => heroIntro(sceneApi, instant));

  console.log(
    "%c ishan.kr %c p99 of this page: fast. — say hi: ibuyy@illinois.edu ",
    "background:#c6f546;color:#0a0b0d;font-weight:bold;padding:4px 8px;",
    "background:#16181d;color:#e9e6de;padding:4px 8px;"
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
