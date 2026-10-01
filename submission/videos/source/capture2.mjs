// Re-open the captured chat and record the delivered result: graphic, check badge, takeaways, table.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const [OUT, SID] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  args: ["--hide-scrollbars"],
});
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await page.goto(`http://localhost:3000/s/${SID}`, { waitUntil: "networkidle2", timeout: 120000 });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => [...document.querySelectorAll("img")].some((i) => /googleapis|blob|api\/image/.test(i.src) && i.naturalWidth > 400), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
// the chat sticks to the bottom; wheel up until the graphic's top sits near the top of the view
const imgTop = () => page.evaluate(() => [...document.querySelectorAll("img")].find((i) => i.naturalWidth > 1000 && i.getBoundingClientRect().width > 300).getBoundingClientRect().top);
await page.mouse.move(800, 450);
for (let i = 0; i < 200 && (await imgTop()) < 120; i++) { await page.mouse.wheel({ deltaY: -120 }); await new Promise((r) => setTimeout(r, 30)); }
for (let i = 0; i < 50 && (await imgTop()) > 150; i++) { await page.mouse.wheel({ deltaY: 20 }); await new Promise((r) => setTimeout(r, 30)); }
await new Promise((r) => setTimeout(r, 800));
const info = { top: await imgTop() };
const cdp = await page.createCDPSession();
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `r${String(frames.length).padStart(5, "0")}.jpg`;
  fs.writeFileSync(`${OUT}/${file}`, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
const mark = (m) => frames.push({ mark: m, t: Date.now() / 1000 });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88 });
mark("graphic");
await new Promise((r) => setTimeout(r, 3500));
mark("glide");
for (let i = 0; i < 150; i++) { await page.mouse.wheel({ deltaY: 14 }); await new Promise((r) => setTimeout(r, 60)); }
mark("bottom");
await new Promise((r) => setTimeout(r, 2000));
mark("end");
await cdp.send("Page.stopScreencast");
fs.writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames));
await browser.close();
console.log("frames", frames.filter((f) => f.file).length, JSON.stringify(info));
