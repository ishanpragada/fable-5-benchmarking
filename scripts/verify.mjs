/* Verification harness: drives headless Chrome over CDP, captures console
   errors, request failures, and screenshots across viewports. */
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

  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type()))
      issues.push(`[${vp.name}][console.${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => issues.push(`[${vp.name}][pageerror] ${e.message}`));
  page.on("requestfailed", (r) =>
    issues.push(`[${vp.name}][requestfailed] ${r.url()} — ${r.failure()?.errorText}`)
  );

  // desktop run forces the fine-pointer path (headless VM reports no pointer)
  await page.goto(vp.mobile ? BASE : `${BASE}/?forcefine=1`, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });

  // mid-preloader shot on desktop only
  if (vp.name === "desktop") {
    await sleep(900);
    await page.screenshot({ path: `${OUT}/${vp.name}-0-preloader.png` });
  }

  // wait for the preloader to finish
  await page.waitForSelector("body:not([data-loading])", { timeout: 15000 });
  await sleep(2200); // hero intro settles
  await page.screenshot({ path: `${OUT}/${vp.name}-1-hero.png` });

  // marquee (sits at the hero/work seam)
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.78));
  await sleep(900);
  await page.screenshot({ path: `${OUT}/${vp.name}-1b-marquee.png` });

  const sections = ["#work", "#about", "#experience", "#writing", "#contact"];
  for (let i = 0; i < sections.length; i++) {
    const sel = sections[i];
    await page.evaluate((s) => {
      document.querySelector(s)?.scrollIntoView({ behavior: "instant", block: "start" });
    }, sel);
    await sleep(1600); // let once-reveals play
    await page.screenshot({ path: `${OUT}/${vp.name}-${i + 2}-${sel.slice(1)}.png` });
  }

  // desktop-only: hover a work row to check the preview card + row invert
  if (vp.name === "desktop") {
    await page.evaluate(() => {
      document.querySelector("#work")?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await sleep(800);
    const row = await page.$('.work__row[data-preview="exchange"] .work__link');
    const box = await row.boundingBox();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2, { steps: 8 });
    await sleep(900);
    await page.screenshot({ path: `${OUT}/${vp.name}-7-work-hover.png` });
  }

  // mobile-only: open the menu
  if (vp.name === "mobile") {
    await page.tap("#burger");
    await sleep(900);
    await page.screenshot({ path: `${OUT}/${vp.name}-7-menu.png` });
  }

  await page.close();
}

await browser.close();
server.kill();

if (issues.length) {
  console.log("ISSUES FOUND:");
  for (const i of issues) console.log("  " + i);
  process.exitCode = 1;
} else {
  console.log("OK: no console errors, page errors, or failed requests.");
}
console.log(`Screenshots in ${OUT}/`);
