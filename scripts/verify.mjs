/* Verification harness: drives headless Chrome over CDP, captures console
   errors, request failures, layout overflow, and screenshots across
   viewports — including an erratic-hover test for the sliding highlight. */
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

async function checkOverflow(page, tag) {
  const ok = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  if (!ok) issues.push(`[${tag}] horizontal overflow detected`);
}

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
  const contentOk = await page.evaluate(() => {
    const el = document.querySelector(".hero__name");
    const cs = getComputedStyle(el);
    return cs.visibility === "visible" && parseFloat(cs.opacity) > 0.98;
  });
  if (!contentOk) issues.push(`[${vp.name}] hero content not visible after intro`);
  await page.screenshot({ path: `${OUT}/${vp.name}-1-home.png` });
  await checkOverflow(page, `${vp.name} home`);

  await page.evaluate(() => document.querySelector("#work").scrollIntoView({ block: "start" }));
  await sleep(400);
  await page.screenshot({ path: `${OUT}/${vp.name}-2-work.png` });

  await page.evaluate(() => document.querySelector("#contact").scrollIntoView({ block: "center" }));
  await sleep(400);
  await page.screenshot({ path: `${OUT}/${vp.name}-3-contact.png` });

  if (vp.name === "desktop") {
    // ---- erratic hover: sweep the pointer across every row fast,
    // settle on row 2; the pill should sit calmly on row 2 ----
    await page.evaluate(() => document.querySelector("#work").scrollIntoView({ block: "center" }));
    await sleep(300);
    const rows = await page.$$("#work .row");
    const boxes = [];
    for (const r of rows) boxes.push(await r.boundingBox());
    for (let pass = 0; pass < 3; pass++) {
      for (const b of pass % 2 ? boxes : [...boxes].reverse()) {
        await page.mouse.move(b.x + 200 + pass * 60, b.y + b.height / 2, { steps: 1 });
        await sleep(16);
      }
    }
    const b2 = boxes[1];
    await page.mouse.move(b2.x + 260, b2.y + b2.height / 2, { steps: 2 });
    await sleep(450);
    await page.screenshot({ path: `${OUT}/${vp.name}-4-hover-settled.png` });

    // ---- copy button feedback ----
    await page.evaluate(() => document.querySelector("#contact").scrollIntoView({ block: "center" }));
    await sleep(250);
    await page.click("[data-copy]");
    await sleep(200);
    await page.screenshot({ path: `${OUT}/${vp.name}-5-copied.png` });
  }

  // ---- writing page (via anchor, checks :target affordance) ----
  await page.goto(`${BASE}/writing.html${q ? q + "&" : "?"}x=1#order-book-memory`, {
    waitUntil: "networkidle0", timeout: 30000,
  });
  await sleep(1400);
  await page.screenshot({ path: `${OUT}/${vp.name}-6-writing-target.png` });
  await checkOverflow(page, `${vp.name} writing`);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  await page.screenshot({ path: `${OUT}/${vp.name}-7-writing-top.png` });

  await page.close();
}

// ---- reduced motion: everything visible, nothing animated ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  watch(page, "reduced-motion");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(600);
  const visible = await page.evaluate(() =>
    [...document.querySelectorAll("[data-in]")].every(
      (el) => getComputedStyle(el).visibility === "visible"
    )
  );
  if (!visible) issues.push("[reduced-motion] data-in content hidden");
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
  console.log("OK: no console errors, page errors, failed requests, or overflow.");
}
console.log(`Screenshots in ${OUT}/`);
