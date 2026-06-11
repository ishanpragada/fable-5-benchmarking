/* Verification harness: drives headless Chrome over CDP, captures console
   errors, request failures, layout overflow, and screenshots across
   viewports — plus behavioral checks: erratic hover, writing tabs (click,
   keyboard, hash deep-link), the sim note, and nav consistency. */
import puppeteer from "puppeteer";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const PORT = 8031;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = ".verify";
mkdirSync(OUT, { recursive: true });

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 800));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const issues = [];

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
  ],
});

function watch(page, tag) {
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) issues.push(`[${tag}][console.${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => issues.push(`[${tag}][pageerror] ${e.message}`));
  page.on("requestfailed", (r) =>
    issues.push(`[${tag}][requestfailed] ${r.url()} — ${r.failure()?.errorText}`)
  );
}

async function expect(page, tag, name, fn) {
  const ok = await page.evaluate(fn);
  if (!ok) issues.push(`[${tag}] FAILED: ${name}`);
}

const checkOverflow = (page, tag) =>
  expect(page, tag, "no horizontal overflow",
    () => document.documentElement.scrollWidth <= window.innerWidth);

const checkContent = (page, tag) =>
  expect(page, tag, "hero visible after intro", () => {
    const el = document.querySelector(".hero__name");
    const cs = getComputedStyle(el);
    return cs.visibility === "visible" && parseFloat(cs.opacity) > 0.98;
  });

const checkNav = (page, tag) =>
  expect(page, tag, "nav has no in-page anchors",
    () => [...document.querySelectorAll(".top__nav a")].every((a) => !a.getAttribute("href").includes("#")));

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "tablet", width: 768, height: 1024, mobile: true },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.width, height: vp.height,
    isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1,
  });
  watch(page, vp.name);
  const q = vp.mobile ? "" : "?forcefine=1";

  // ---- home ----
  await page.goto(`${BASE}/${q}`, { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(1400); // intro cascade
  await checkContent(page, `${vp.name} home`);
  await checkOverflow(page, `${vp.name} home`);
  await checkNav(page, `${vp.name} home`);
  await page.screenshot({ path: `${OUT}/${vp.name}-1-home.png` });

  if (vp.name === "desktop") {
    // sim note present and toggles
    await expect(page, "desktop", "sim note visible",
      () => !document.querySelector("#simNote")?.hidden);
    await page.click("#simNote");
    await sleep(150);
    await expect(page, "desktop", "sim note shows paused",
      () => document.querySelector("#simNote").textContent.includes("paused"));
    await page.click("#simNote"); // resume

    // the simulation visibly evolves: the margin changes between frames
    const clip = { x: 0, y: 120, width: 170, height: 600 };
    const shotA = await page.screenshot({ clip });
    await sleep(2600);
    const shotB = await page.screenshot({ clip });
    if (Buffer.compare(shotA, shotB) === 0)
      issues.push("[desktop] FAILED: life simulation appears frozen");

    // clicking "ib" on the home page must not navigate (no white flash)
    await page.evaluate(() => {
      window.__stayed = true;
      window.scrollTo({ top: 300, behavior: "instant" });
    });
    await sleep(150);
    await page.click(".top__mark");
    let settled = false;
    for (let i = 0; i < 25 && !settled; i++) {
      await sleep(120);
      settled = await page.evaluate(() => window.__stayed === true && window.scrollY < 1);
    }
    if (!settled) issues.push("[desktop] FAILED: same-page nav reloaded or did not return to top");

    // ---- erratic hover: sweep fast across rows, settle on row 2 ----
    const rows = await page.$$("#work .row");
    const boxes = [];
    for (const r of rows) boxes.push(await r.boundingBox());
    for (let pass = 0; pass < 3; pass++) {
      for (const b of pass % 2 ? boxes : [...boxes].reverse()) {
        await page.mouse.move(b.x + 180 + pass * 60, b.y + b.height / 2, { steps: 1 });
        await sleep(16);
      }
    }
    const b2 = boxes[1];
    await page.mouse.move(b2.x + 240, b2.y + b2.height / 2, { steps: 2 });
    await sleep(450);
    await page.screenshot({ path: `${OUT}/desktop-2-hover-settled.png` });

    // leave the list entirely, re-enter, then move to another row — the
    // pill must follow (regression: a killed quickTo froze it in place)
    await page.mouse.move(720, 70, { steps: 2 });
    await sleep(550); // fade-out completes
    await page.mouse.move(boxes[0].x + 200, boxes[0].y + boxes[0].height / 2, { steps: 2 });
    await sleep(250);
    await page.mouse.move(boxes[2].x + 200, boxes[2].y + boxes[2].height / 2, { steps: 3 });
    await sleep(500);
    await expect(page, "desktop", "pill follows rows after leave/re-enter", () => {
      const pill = document.querySelector("#work .pill");
      const rows = [...document.querySelectorAll("#work .row")];
      return (
        Math.abs(window.gsap.getProperty(pill, "y") - rows[2].offsetTop) < 3 &&
        window.gsap.getProperty(pill, "opacity") > 0.85
      );
    });


    // ---- copy feedback ----
    await page.click("[data-copy]");
    await sleep(200);
    await page.screenshot({ path: `${OUT}/desktop-3-copied.png` });
  } else {
    await page.evaluate(() => document.querySelector("#contact")?.scrollIntoView({ block: "center" }));
    await sleep(400);
    await page.screenshot({ path: `${OUT}/${vp.name}-2-contact.png` });
  }

  // ---- writing: default tab ----
  await page.goto(`${BASE}/writing.html${q}`, { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(1400);
  await checkOverflow(page, `${vp.name} writing`);
  await expect(page, `${vp.name} writing`, "first tab selected by default", () => {
    const tabs = [...document.querySelectorAll(".wtab")];
    const panels = [...document.querySelectorAll(".wpanel")];
    return tabs[0].getAttribute("aria-selected") === "true" &&
      !panels[0].hidden && panels[1].hidden && panels[2].hidden;
  });
  await page.screenshot({ path: `${OUT}/${vp.name}-4-writing.png` });

  // ---- writing: click second tab ----
  await page.click("#tab-order-book-memory");
  await sleep(600);
  await expect(page, `${vp.name} writing`, "second tab selected after click", () => {
    const panels = [...document.querySelectorAll(".wpanel")];
    return document.querySelector("#tab-order-book-memory").getAttribute("aria-selected") === "true" &&
      panels[0].hidden && !panels[1].hidden &&
      location.hash === "#order-book-memory";
  });
  await page.screenshot({ path: `${OUT}/${vp.name}-5-writing-tab2.png` });

  if (vp.name === "desktop") {
    // ---- keyboard: global ArrowRight cycles to third ----
    await page.keyboard.press("ArrowRight");
    await sleep(600);
    await expect(page, "desktop writing", "ArrowRight moves to third post", () => {
      const panels = [...document.querySelectorAll(".wpanel")];
      return !panels[2].hidden && location.hash === "#on-ai";
    });
  }

  // ---- writing: hash deep link selects the right tab ----
  await page.goto(`${BASE}/writing.html${q}#on-ai`, { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(1200);
  await expect(page, `${vp.name} writing`, "hash deep-link opens its tab", () => {
    const panels = [...document.querySelectorAll(".wpanel")];
    return document.querySelector("#tab-on-ai").getAttribute("aria-selected") === "true" &&
      !panels[2].hidden && panels[0].hidden;
  });
  if (vp.name === "mobile") {
    await page.screenshot({ path: `${OUT}/mobile-6-writing-deeplink.png` });
  }
  if (vp.name === "desktop") {
    // re-navigating must never flash the margins white (view-transition
    // snapshots of the WebGL canvas used to capture as white)
    const countWhite = async (shot) =>
      page.evaluate(async (b64) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let p = 0; p < d.length; p += 4) {
          if (d[p] > 200 && d[p + 1] > 200 && d[p + 2] > 200) n++;
        }
        return n;
      }, shot.toString("base64"));
    const clip = { x: 0, y: 0, width: 150, height: 880 };
    const hops = [`${BASE}/${q}`, `${BASE}/writing.html${q}`, `${BASE}/${q}`];
    for (let i = 0; i < hops.length; i++) {
      await page.goto(hops[i], { waitUntil: "load", timeout: 30000 });
      for (let s = 0; s < 2; s++) {
        const white = await countWhite(await page.screenshot({ clip }));
        if (white > 800)
          issues.push(`[desktop] FAILED: margin white flash on re-navigation (${i}.${s}: ${white}px)`);
        await sleep(90);
      }
    }
  }



  await page.close();
}

// ---- reduced motion: everything visible, sim not loaded ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  watch(page, "reduced-motion");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(600);
  await checkContent(page, "reduced-motion");
  await expect(page, "reduced-motion", "lattice not loaded",
    () => !performance.getEntriesByType("resource").some((e) => e.name.includes("lattice.js")));
  await page.screenshot({ path: `${OUT}/rm-home.png` });
  await page.close();
}

await browser.close();
server.kill();

if (issues.length) {
  console.log("ISSUES FOUND:");
  for (const i of issues) console.log("  " + i);
  process.exitCode = 1;
} else {
  console.log("OK: all checks passed.");
}
console.log(`Screenshots in ${OUT}/`);
