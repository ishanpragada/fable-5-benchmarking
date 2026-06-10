/* Renders the hero at 1200x630 into assets/og.png for social cards. */
import puppeteer from "puppeteer";
import { spawn } from "node:child_process";

const server = spawn("python3", ["-m", "http.server", "8033", "--bind", "127.0.0.1"], {
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 700));

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1.6 });
await page.goto("http://127.0.0.1:8033/?forcefine=1", { waitUntil: "networkidle0" });
await page.waitForSelector("body:not([data-loading])", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 3200));
// park the cursor ripple somewhere flattering, hide the custom cursor
await page.mouse.move(820, 260, { steps: 6 });
await page.evaluate(() => (document.querySelector(".cursor").style.display = "none"));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: "assets/og.png" });
await browser.close();
server.kill();
console.log("wrote assets/og.png");
