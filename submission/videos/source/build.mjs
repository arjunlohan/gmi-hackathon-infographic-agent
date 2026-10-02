// Build one product video: voice each scene with macOS `say`, size scenes to their voiceover,
// render every frame of engine.html in headless Chrome straight into ffmpeg, then mix the
// voice (and an optional soft pad) and mux an X-ready MP4.
// Usage: node build.mjs <variant name> [--preview]   (variants live in variants.mjs)
import puppeteer from "puppeteer-core";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { VARIANTS } from "./variants.mjs";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const name = process.argv[2];
const preview = process.argv.includes("--preview");
const v = VARIANTS[name];
if (!v) throw new Error(`unknown variant ${name}`);
const OUT = path.join(DIR, "out", name);
fs.mkdirSync(OUT, { recursive: true });
const FPS = 30;

// 1. voice. ElevenLabs lines are cached by voice, model and text, so a rebuild never pays twice.
async function eleven(text, tts) {
  const { createHash } = await import("node:crypto");
  const dir = path.join(DIR, "out", "tts");
  fs.mkdirSync(dir, { recursive: true });
  const key = createHash("sha1").update(JSON.stringify([tts.voice, tts.model, tts.settings, text])).digest("hex").slice(0, 16);
  const file = path.join(dir, `${key}.mp3`);
  if (fs.existsSync(file)) return file;
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");
  let res;
  for (let attempt = 0; attempt < 8; attempt++) {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${tts.voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: tts.model, voice_settings: tts.settings }),
    });
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); // account allows 3 concurrent requests
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const LEAD = 0.25, TAIL = 0.3, OVERLAP = 0;
let t = 0;
const audio = [];
const captions = [];
for (const [i, s] of v.scenes.entries()) {
  let vo = 0;
  if (s.vo) {
    const file = v.tts ? await eleven(s.say ?? s.vo, v.tts) : path.join(OUT, `vo${i}.aiff`);
    if (!v.tts) execFileSync("say", ["-v", v.voice, "-r", String(v.rate), "-o", file, s.say ?? s.vo]);
    vo = probe(file);
    audio.push({ file, at: t + LEAD });
    // captions: one per sentence, timed by character share
    const sentences = s.vo.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);
    const total = sentences.reduce((a, x) => a + x.length, 0);
    let c0 = t + LEAD;
    for (const sentence of sentences) {
      const d = (vo * sentence.length) / total;
      captions.push({ start: c0, end: c0 + d, text: sentence });
      c0 += d;
    }
  }
  s.capBase = captions.length - (s.vo ? s.vo.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter((x) => x.trim()).length : 0);
  s.start = t;
  s.dur = Math.max(s.min ?? 2.5, vo + LEAD + TAIL);
  t += s.dur - OVERLAP;
}
const duration = t + OVERLAP;
console.log(`${name}: ${duration.toFixed(1)}s, ${v.scenes.length} scenes`);

// 2. capture data for app scenes, times relative to the first frame
// two recordings: the live run (cap/) and the reopened result (cap2/, placed at t = 1000s)
const CAPTURE = { frames: [], marks: {} };
for (const [dir, offset, suffix] of [["cap", 0, ""], ["cap2", 1000, "2"]]) {
  const cap = JSON.parse(fs.readFileSync(path.join(DIR, dir, "frames.json"), "utf8"));
  const t0 = cap.find((f) => f.file).t;
  for (const f of cap) {
    if (f.file) CAPTURE.frames.push({ file: f.file, path: `${dir}/${f.file}`, t: f.t - t0 + offset });
    else CAPTURE.marks[CAPTURE.marks[f.mark] === undefined ? f.mark : f.mark + suffix] = f.t - t0 + offset;
  }
}
for (const s of v.scenes) if (s.type === "app" && typeof s.clip.from === "string") {
  // clip.from / clip.to may name capture marks with an offset, like "submit+5"
  const resolve = (x) => typeof x === "number" ? x : (([m, o]) => CAPTURE.marks[m] + Number(o ?? 0))(x.split("+"));
  s.clip.from = resolve(s.clip.from); s.clip.to = resolve(s.clip.to);
  if (s.clip.fit) s.clip.speed = (s.clip.to - s.clip.from) / Math.max(1, s.dur - 0.6 - (s.clip.hold ?? 0));
}
v.scenes.at(-1).last = true;
// flow nodes light up when their sentence starts (nodeSentences: sentence index, with a fraction into it)
for (const s of v.scenes) if (s.nodeSentences) {
  const at = (x) => { const c = captions[s.capBase + Math.floor(x)]; return (c.start + (c.end - c.start) * (x % 1) - s.start) / s.dur; };
  s.ats = s.nodeSentences.map((x) => (x < 0 ? 0 : at(x)));
  if (s.loopSentence !== undefined) s.loopAt = at(s.loopSentence);
}
const TIMELINE = { w: v.w, h: v.h, cap: v.cap, drift: v.drift, scenes: v.scenes, captions };
fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(TIMELINE, null, 1));

// 3. frames
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: v.w, height: v.h, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars", "--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.evaluateOnNewDocument((tl, capture) => { window.TIMELINE = tl; window.CAPTURE = capture; }, TIMELINE, CAPTURE);
await page.goto("file://" + path.join(DIR, "engine.html"), { waitUntil: "networkidle0", timeout: 120000 });
await page.evaluate(() => window.ready);

const frames = preview ? v.previewTimes ?? [2, 10, 20, 30] : null;
if (preview) {
  for (const ts of frames) {
    await page.evaluate(async (x) => { window.render(x); await Promise.all([...document.images].filter((i) => !i.complete).map((i) => i.decode().catch(() => {}))); }, ts);
    await page.screenshot({ path: path.join(OUT, `preview-${String(ts).replace(".", "_")}.jpg`), type: "jpeg", quality: 85 });
  }
  await browser.close();
  console.log("previews written");
  process.exit(0);
}

const silent = path.join(OUT, "video.mp4");
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-r", String(FPS), silent], { stdio: ["pipe", "inherit", "inherit"] });
const N = Math.ceil(duration * FPS);
for (let i = 0; i < N; i++) {
  await page.evaluate(async (x) => { window.render(x); await Promise.all([...document.images].filter((im) => !im.complete).map((im) => im.decode().catch(() => {}))); }, i / FPS);
  const buf = await page.screenshot({ type: "jpeg", quality: 93, optimizeForSpeed: true });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 300 === 0) console.log(`frame ${i}/${N}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();

// 4. audio: voice segments at their times, optional pad, loudness normalized for social
const inputs = [], filters = [];
audio.forEach((a, i) => { inputs.push("-i", a.file); filters.push(`[${i}:a]aresample=48000,adelay=${Math.round(a.at * 1000)}|${Math.round(a.at * 1000)}[a${i}]`); });
let mixIn = audio.map((_, i) => `[a${i}]`).join("");
let n = audio.length;
if (v.pad) {
  // soft major-seventh pad, slow fade in and out, kept well under the voice
  const expr = "0.10*sin(2*PI*130.81*t)+0.08*sin(2*PI*164.81*t)+0.07*sin(2*PI*196.00*t)+0.05*sin(2*PI*246.94*t)";
  inputs.push("-f", "lavfi", "-t", String(duration), "-i", `aevalsrc=${expr}:s=48000:c=stereo`);
  filters.push(`[${n}:a]lowpass=f=900,tremolo=f=0.15:d=0.3,afade=t=in:d=2,afade=t=out:st=${Math.max(0, duration - 2.5)}:d=2.5,volume=${v.pad}[pad]`);
  mixIn += "[pad]"; n += 1;
}
if (v.music) {
  // voice bus drives a sidechain compressor on the music, so the bed ducks under speech
  inputs.push("-stream_loop", "-1", "-i", path.join(DIR, v.music));
  filters.push(`${mixIn}amix=inputs=${n}:normalize=0:duration=longest,apad,atrim=0:${duration.toFixed(3)},asplit=2[voice][key]`);
  filters.push(`[${n}:a]aresample=48000,atrim=0:${duration.toFixed(3)},volume=${v.musicVol ?? 0.5},afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, duration - 3)}:d=3[bed]`);
  filters.push(`[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[ducked]`);
  filters.push(`[voice][ducked]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[out]`);
} else filters.push(`${mixIn}amix=inputs=${n}:normalize=0:duration=longest,apad,atrim=0:${duration.toFixed(3)},loudnorm=I=-15:TP=-1.5:LRA=11[out]`);
const mixed = path.join(OUT, "audio.m4a");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", mixed]);
const final = path.join(DIR, "out", `${v.file}.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", mixed, "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", final]);
console.log("wrote", final, (fs.statSync(final).size / 1e6).toFixed(1) + " MB");
