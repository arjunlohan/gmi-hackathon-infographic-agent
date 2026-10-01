// Record a real Plate session in headless Chrome: pick format and style, type and paste a brief,
// submit, and save every repainted frame (CDP screencast) with its timestamp.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); fs.appendFileSync(`${OUT}/events.log`, line + "\n"); };
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  args: ["--hide-scrollbars", "--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
const cdp = await page.createCDPSession();
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const n = frames.length;
  const file = `f${String(n).padStart(5, "0")}.jpg`;
  fs.writeFileSync(`${OUT}/${file}`, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
const mark = (name) => { frames.push({ mark: name, t: Date.now() / 1000 }); log(`mark ${name}`); };
await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 120000 });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1 });
mark("intro");
await new Promise((r) => setTimeout(r, 2500));

async function pick(label, option) {
  await page.click(`[aria-label="${label}"]`);
  await new Promise((r) => setTimeout(r, 700));
  const opts = await page.$$('[role="option"]');
  for (const o of opts) {
    const text = await o.evaluate((el) => el.textContent?.trim());
    if (text?.startsWith(option)) { await o.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 800));
}
mark("options");
await pick("Destination", "Newsletter");
await pick("Style", "Material texture");

mark("typing");
await page.click("textarea");
await page.keyboard.type("Rank the world's top copper-mining countries. Make each bar a hammered copper ingot.", { delay: 28 });
await new Promise((r) => setTimeout(r, 600));
mark("paste");
const pasted = `

Source: U.S. Geological Survey, Mineral Commodity Summaries 2026 (copper). Thousand metric tons of copper content, 2025 estimates.
Chile 5,300
DR Congo 3,200
Peru 2,700
China 1,800
Russia 1,300
United States 1,000
Zambia 940
World total (rounded): 23,000

Use exactly these two callouts:
- "Chile out-mined the U.S., China and Russia combined: 5,300 vs 4,100" (anchored to Chile)
- "Top three mined almost half of the world's copper: 11,200 of 23,000"
Keep the warm off-white paper, a heavy grotesque headline, and copper only in the bars and one small hero.`;
await page.evaluate((text) => { const ta = document.querySelector("textarea"); ta.focus(); document.execCommand("insertText", false, text); }, pasted);
await new Promise((r) => setTimeout(r, 1800));
mark("submit");
await page.keyboard.press("Enter");

// wait for the finished graphic: an <img> from storage/blob inside the reply, and no Stop button
const t0 = Date.now();
let done = false;
while (Date.now() - t0 < 9 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 3000));
  const state = await page.evaluate(() => ({
    stop: Boolean(document.querySelector('[aria-label="Stop"]')),
    imgs: [...document.querySelectorAll("img")].filter((i) => /googleapis|blob|api\/image/.test(i.src) && i.naturalWidth > 400).length,
  }));
  if (state.imgs > 0 && !state.stop) { done = true; break; }
}
mark(done ? "done" : "timeout");
await new Promise((r) => setTimeout(r, 2500));
// scroll through the reply
mark("scroll");
for (let i = 0; i < 40; i++) { await page.mouse.wheel({ deltaY: 60 }); await new Promise((r) => setTimeout(r, 120)); }
await new Promise((r) => setTimeout(r, 1500));
for (let i = 0; i < 60; i++) { await page.mouse.wheel({ deltaY: 60 }); await new Promise((r) => setTimeout(r, 120)); }
await new Promise((r) => setTimeout(r, 2000));
mark("end");
await cdp.send("Page.stopScreencast");
fs.writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames));
await page.screenshot({ path: `${OUT}/final-full.png`, fullPage: false });
await browser.close();
log(`frames ${frames.filter((f) => f.file).length}`);
