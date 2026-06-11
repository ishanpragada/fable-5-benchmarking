/* ============================================================
   main.js — ishankr.com
   Small on purpose. GSAP handles the load-in stagger, the
   sliding hover highlight, and the writing crossfade. The rest
   is a few lines of vanilla.
   ============================================================ */

const { gsap } = window;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer =
  matchMedia("(pointer: fine)").matches ||
  new URLSearchParams(location.search).has("forcefine"); // test hook
document.documentElement.classList.toggle("fine", finePointer);

/* ------------------------------------------------------------
   nav — links to the page you're already on don't reload it
   (a same-page navigation just re-runs the view transition for
   nothing); they scroll to the top instead
   ------------------------------------------------------------ */
function initNav() {
  const norm = (p) => p.replace(/\/index\.html$/, "/");
  $$(".top__mark, .top__nav a").forEach((a) => {
    const url = new URL(a.getAttribute("href"), location.href);
    if (url.origin !== location.origin) return; // mailto / external
    a.addEventListener("click", (e) => {
      if (norm(url.pathname) !== norm(location.pathname)) return;
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    });
  });
}

/* ------------------------------------------------------------
   load-in — one quiet cascade, then get out of the way
   ------------------------------------------------------------ */
function intro() {
  const els = $$("[data-in]");
  if (!document.documentElement.classList.contains("anim")) return;
  gsap.fromTo(
    els,
    { autoAlpha: 0, y: 8 },
    {
      autoAlpha: 1,
      y: 0,
      duration: 0.65,
      ease: "power2.out",
      stagger: 0.055,
      delay: 0.05,
      onComplete() {
        // release the CSS gate first, then drop the inline styles
        document.documentElement.classList.remove("anim");
        gsap.set(els, { clearProps: "all" });
      },
    }
  );
}

/* ------------------------------------------------------------
   sliding hover highlight
   One pill per list, chasing the hovered row. The details:
   - if the pill is invisible it appears in place (no flying in
     from wherever it last was)
   - if it's mid-fade-out and the pointer returns, the fade is
     cancelled and it keeps sliding — erratic input, calm output
   - keyboard focus drives it exactly like hover
   - a list may declare a "rest" row (the selected tab); on
     leave, the pill glides home instead of fading out
   ------------------------------------------------------------ */
function attachPill(list) {
  const pill = $(".pill", list);
  if (!pill) return null;

  const yTo = gsap.quickTo(pill, "y", { duration: 0.3, ease: "expo.out" });
  const hTo = gsap.quickTo(pill, "height", { duration: 0.3, ease: "expo.out" });
  let rest = null;

  function moveTo(row, instant) {
    const y = row.offsetTop;
    const h = row.offsetHeight;
    if (reducedMotion || instant) {
      gsap.set(pill, { y, height: h, opacity: 1 });
      yTo(y);
      hTo(h);
      return;
    }
    if (gsap.getProperty(pill, "opacity") < 0.12) {
      // invisible: take position silently, then fade in.
      // (re-target the quickTos below rather than killing their tweens —
      // a killed quickTo silently ignores every later call)
      gsap.set(pill, { y, height: h });
    }
    yTo(y);
    hTo(h);
    gsap.to(pill, { opacity: 1, duration: 0.18, ease: "power1.out", overwrite: "auto" });
  }

  function leave() {
    if (rest && rest.offsetParent) {
      moveTo(rest);
      return;
    }
    if (reducedMotion) {
      gsap.set(pill, { opacity: 0 });
      return;
    }
    gsap.to(pill, { opacity: 0, duration: 0.25, ease: "power1.out", overwrite: "auto" });
  }

  $$(".row", list).forEach((row) => {
    row.addEventListener("pointerenter", () => moveTo(row));
    row.addEventListener("focusin", () => moveTo(row));
    row.addEventListener("focusout", (e) => {
      if (!list.contains(e.relatedTarget)) leave();
    });
  });
  list.addEventListener("pointerleave", leave);

  return {
    setRest(row, instant) {
      rest = row;
      if (row && row.offsetParent && !list.matches(":hover")) moveTo(row, instant);
    },
  };
}

/* ------------------------------------------------------------
   writing reader — tabs, crossfade, hash, keys, swipe
   ------------------------------------------------------------ */
function initReader(pills) {
  const reader = $("#reader");
  if (!reader) return;
  const tabs = $$(".wtab");
  const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
  const pillApi = pills.get($(".wtabs"));
  let idx = 0;

  function measure(panel) {
    const wasHidden = panel.hidden;
    if (wasHidden) {
      panel.style.visibility = "hidden";
      panel.hidden = false;
    }
    const h = panel.offsetHeight;
    if (wasHidden) {
      panel.hidden = true;
      panel.style.visibility = "";
    }
    return h;
  }

  function apply(next, animate, writeHash = true) {
    const prev = idx;
    idx = next;
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", k === next ? "true" : "false");
      t.tabIndex = k === next ? 0 : -1;
    });
    pillApi?.setRest(tabs[next], !animate);
    // never write the hash during page load: the browser's deferred
    // scroll-to-fragment step would pick it up and scroll the page
    if (writeHash) history.replaceState(null, "", "#" + panels[next].id);

    const inc = panels[next];
    const h = measure(inc);

    gsap.killTweensOf([reader, ...panels]);
    if (!animate || reducedMotion || prev === next) {
      panels.forEach((p, k) => {
        p.hidden = k !== next;
        gsap.set(p, { clearProps: "all" });
      });
      reader.style.height = h + "px";
      return;
    }

    panels.forEach((p, k) => {
      if (k !== next && k !== prev) p.hidden = true;
    });
    const out = panels[prev];
    inc.hidden = false;
    gsap.set(inc, { autoAlpha: 0, y: 6 });
    gsap.to(out, {
      autoAlpha: 0,
      y: -4,
      duration: 0.14,
      ease: "power1.in",
      onComplete() {
        out.hidden = true;
        gsap.set(out, { clearProps: "all" });
      },
    });
    gsap.to(reader, { height: h, duration: 0.26, ease: "power2.out" });
    gsap.to(inc, {
      autoAlpha: 1,
      y: 0,
      duration: 0.22,
      delay: 0.1,
      ease: "power2.out",
      onComplete: () => gsap.set(inc, { clearProps: "opacity,visibility,transform" }),
    });
  }

  const fromHash = () =>
    Math.max(0, panels.findIndex((p) => "#" + p.id === decodeURIComponent(location.hash)));

  // wiring
  tabs.forEach((tab, k) => tab.addEventListener("click", () => apply(k, true)));

  $(".wtabs").addEventListener("keydown", (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    let to = null;
    if (step) to = (idx + step + tabs.length) % tabs.length;
    if (e.key === "Home") to = 0;
    if (e.key === "End") to = tabs.length - 1;
    if (to === null) return;
    e.preventDefault();
    apply(to, true);
    tabs[to].focus();
  });

  // global arrows for readers who never touch the tabs
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
    if ($(".wtabs").contains(document.activeElement)) return; // tablist handles its own
    if (e.key === "ArrowRight") apply((idx + 1) % tabs.length, true);
    if (e.key === "ArrowLeft") apply((idx - 1 + tabs.length) % tabs.length, true);
  });

  // swipe between posts on touch
  let touch = null;
  reader.addEventListener("touchstart", (e) => {
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  reader.addEventListener("touchend", (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 56 || Math.abs(dy) > 64) return;
    apply((idx + (dx < 0 ? 1 : -1) + tabs.length) % tabs.length, true);
  }, { passive: true });

  window.addEventListener("hashchange", () => {
    const k = fromHash();
    if (k !== idx) apply(k, true);
  });

  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      reader.style.height = measure(panels[idx]) + "px";
      pillApi?.setRest(tabs[idx], true);
    }, 120);
  });

  // initial state: honor the hash, settle height once fonts are real
  apply(fromHash(), false, false);
  document.fonts.ready.then(() => {
    reader.style.height = measure(panels[idx]) + "px";
    pillApi?.setRest(tabs[idx], true);
  });
}

/* ------------------------------------------------------------
   copy email
   ------------------------------------------------------------ */
function initCopy() {
  $$("[data-copy]").forEach((btn) => {
    btn.setAttribute("aria-live", "polite");
    let t = null;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = btn.dataset.copy;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      btn.textContent = "copied";
      btn.setAttribute("data-done", "");
      clearTimeout(t);
      t = setTimeout(() => {
        btn.textContent = "copy";
        btn.removeAttribute("data-done");
      }, 1800);
    });
  });
}

/* ------------------------------------------------------------
   local time, Urbana
   ------------------------------------------------------------ */
function initClock() {
  const els = $$(".clock");
  if (!els.length) return;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const tick = () => {
    const now = new Date();
    const s = fmt.format(now);
    els.forEach((el) => {
      el.textContent = s;
      el.dateTime = now.toISOString();
    });
  };
  tick();
  setInterval(tick, 10_000);
}

/* ------------------------------------------------------------
   background simulation — only where it can be seen and felt:
   wide viewport, fine pointer, motion allowed, WebGL present.
   The bottom-right note cites the process and pauses it.
   ------------------------------------------------------------ */
function initLattice() {
  const canvas = $("#lattice");
  if (!canvas) return;
  const wide = matchMedia("(min-width: 1160px)");
  let mounted = false;

  const tryMount = () => {
    if (mounted || !wide.matches || !finePointer || reducedMotion) return;
    mounted = true;
    import("./lattice.js")
      .then((m) => {
        const sim = m.mount(canvas);
        const note = $("#simNote");
        if (!note) return;
        const base = note.textContent.trim();
        note.hidden = false;
        note.addEventListener("click", () => {
          const running = sim.toggle();
          note.setAttribute("aria-pressed", String(!running));
          note.textContent = running ? base : base + " · paused";
        });
      })
      .catch(() => canvas.remove());
  };
  tryMount();
  wide.addEventListener("change", tryMount);
  window.addEventListener("pageswap", () => {
    canvas.style.visibility = "hidden";
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) canvas.style.visibility = "";
  });
}

/* ------------------------------------------------------------ */
function init() {
  initNav();
  intro();
  const pills = new Map();
  $$("[data-pill]").forEach((list) => {
    const api = attachPill(list);
    if (api) pills.set(list, api);
  });
  initReader(pills);
  initCopy();
  initClock();
  initLattice();
  console.log(
    "%cishankr.com %c· hand-rolled, no build step · ibuyy@illinois.edu",
    "font-family:monospace;color:#94b780;",
    "font-family:monospace;color:#9c9a94;"
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
