/* ============================================================
   main.js — ishankr.com
   Small on purpose. GSAP handles two things: the load-in
   stagger and the sliding hover highlight. Everything else is
   a few lines of vanilla.
   ============================================================ */

const { gsap } = window;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer =
  matchMedia("(pointer: fine)").matches ||
  new URLSearchParams(location.search).has("forcefine"); // test hook

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
   ------------------------------------------------------------ */
function attachPill(list) {
  const pill = $(".pill", list);
  if (!pill) return;
  const rows = $$(".row", list);

  const yTo = gsap.quickTo(pill, "y", { duration: 0.3, ease: "expo.out" });
  const hTo = gsap.quickTo(pill, "height", { duration: 0.3, ease: "expo.out" });

  function show(row) {
    const y = row.offsetTop;
    const h = row.offsetHeight;
    if (reducedMotion) {
      gsap.set(pill, { y, height: h, opacity: 1 });
      return;
    }
    if (gsap.getProperty(pill, "opacity") < 0.12) {
      // invisible: take position silently, then fade in
      gsap.set(pill, { y, height: h });
      yTo.tween?.kill();
      hTo.tween?.kill();
    } else {
      yTo(y);
      hTo(h);
    }
    gsap.to(pill, { opacity: 1, duration: 0.18, ease: "power1.out", overwrite: "auto" });
  }

  function hide() {
    if (reducedMotion) {
      gsap.set(pill, { opacity: 0 });
      return;
    }
    gsap.to(pill, { opacity: 0, duration: 0.25, ease: "power1.out", overwrite: "auto" });
  }

  rows.forEach((row) => {
    row.addEventListener("pointerenter", () => show(row));
    row.addEventListener("focusin", () => show(row));
    row.addEventListener("focusout", (e) => {
      if (!list.contains(e.relatedTarget)) hide();
    });
  });
  list.addEventListener("pointerleave", hide);
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
  const el = $("#clock");
  if (!el) return;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const tick = () => {
    el.textContent = fmt.format(new Date());
    el.dateTime = new Date().toISOString();
  };
  tick();
  setInterval(tick, 10_000);
}

/* ------------------------------------------------------------
   lattice — only where it can be seen and felt:
   wide viewport, fine pointer, motion allowed, WebGL present
   ------------------------------------------------------------ */
function initLattice() {
  const canvas = $("#lattice");
  if (!canvas) return;
  const wide = matchMedia("(min-width: 1101px)");
  let mounted = false;

  const tryMount = () => {
    if (mounted || !wide.matches || !finePointer || reducedMotion) return;
    mounted = true;
    import("./lattice.js")
      .then((m) => m.mount(canvas))
      .catch(() => canvas.remove());
  };
  tryMount();
  wide.addEventListener("change", tryMount);
}

/* ------------------------------------------------------------ */
function init() {
  intro();
  $$("[data-pill]").forEach(attachPill);
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
