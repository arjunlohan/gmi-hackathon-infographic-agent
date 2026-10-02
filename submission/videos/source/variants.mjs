// Three product videos. `vo` is the caption text; `say` (optional) is what the voice reads when
// numbers or names should be spoken differently. Scene durations come from the voiceover.
const A = "assets/";
const SET = ["copper", "coffee", "cotton", "lithium"].map((n) => `${A}${n}.jpg`);
const REPO = "github.com/arjunlohan/gmi-hackathon-infographic-agent";

// Stage labels for the live run, keyed to capture time (seconds into the recording).
const CHIPS = [
  { t: 0, text: "Muse Spark plans the design" },
  { t: 35, text: "Rendering with Hy Image 3.5" },
  { t: 52, text: "Fact-checking every label" },
  { t: 70, text: "Pass 2 of 6 · Correcting 1 issue" },
  { t: 106, text: "Checking the edit" },
  { t: 128, text: "All checks passed", ok: true },
];
// Hide the sidebar's footer (dev-tools badge) in the live recording.
const MASKS = [[0, 822, 256, 78, "rgb(246,245,241)", 999]];

// 16:9 pieces shared by the walkthrough and the fact-check story.
const WIDE_WIN = { w: 1500, h: 975, y: 18 };
const composer = (vo, extra = {}) => ({
  type: "app", clip: { from: "options+0", to: "submit+1.2", fit: true }, box: WIDE_WIN, masks: MASKS, min: 8,
  camera: [{ at: 0, zoom: 1.3, x: 0.6, y: 0.5 }, { at: 3.5, zoom: 1.35, x: 0.6, y: 0.5 }, { at: 9, zoom: 1.2, x: 0.6, y: 0.3 }],
  vo, ...extra,
});
const progress = (vo, extra = {}) => ({
  type: "app", clip: { from: "submit+1.2", to: "submit+64", fit: true, hold: 0.7 }, box: WIDE_WIN, masks: MASKS, chips: CHIPS, chipY: 70, badge: "2 min run · sped up", min: 4,
  camera: [{ at: 0, zoom: 1.25, x: 0.57, y: 0.42 }, { at: 20, zoom: 1.25, x: 0.57, y: 0.42 }],
  vo, ...extra,
});
const PTR = [0.325, 0.79, 0.405, 0.84];
const pass1 = (vo, extra = {}) => ({
  type: "image", src: `${A}demo-pass1.jpg`, size: 960, x: 90, from: [0, 0, 1], to: [0, 0.2, 1.25], noCap: true, min: 4,
  boxes: [{ rect: PTR, at: 0.9, color: "var(--red)" }],
  panel: { kicker: "Live run · pass 1", color: "var(--red)", text: "Hy pointed a whole-chart note at Zambia", sub: "A line tied “Top three mined almost half” to one country. The check flagged it." },
  vo, ...extra,
});
const pass2 = (vo, extra = {}) => ({
  type: "compare", heading: "One Hy edit erased just that line", before: `${A}ptrz-before.jpg`, after: `${A}ptrz-after.jpg`, aspect: 0.204, stack: true, cropW: 1300, top: 300,
  boxBefore: [0.29, 0.3, 0.52, 0.7], boxAfter: [0.29, 0.3, 0.52, 0.7], beforeLabel: "Live run · pass 1", afterLabel: "Pass 2 · one Hy edit", afterAt: 1.6, min: 4.5,
  vo, ...extra,
});
const result = (vo, extra = {}) => ({
  type: "app", clip: { from: "graphic+0", to: "bottom+0.5", fit: true, hold: 0.4 }, box: WIDE_WIN, min: 7,
  camera: [{ at: 0, zoom: 1.55, x: 0.56, y: 0.15 }, { at: 2.8, zoom: 1.55, x: 0.56, y: 0.2 }, { at: 4.2, zoom: 1.2, x: 0.56, y: 0.4 }, { at: 9, zoom: 1.2, x: 0.56, y: 0.55 }],
  vo, ...extra,
});
const TOTAL = { before: `${A}total-before.jpg`, after: `${A}total-after.jpg`, aspect: 0.646, boxBefore: [0.11, 0.59, 0.38, 0.77], boxAfter: [0.11, 0.59, 0.38, 0.77] };
const SPELL = { before: `${A}spell3-before.jpg`, after: `${A}spell3-after.jpg`, aspect: 0.091, stack: true, boxBefore: [0.525, 0.04, 0.835, 0.96], boxAfter: [0.525, 0.04, 0.835, 0.96] };
const AXIS = { before: `${A}axis2-before.jpg`, after: `${A}axis2-after.jpg`, aspect: 0.251, boxBefore: [0, 0.82, 1, 0.99] };
const TEST = { beforeLabel: "Copper test render · pass 1", afterLabel: "After one Hy edit" };
const final16 = (i, kicker, text, vo, extra = {}) => ({
  type: "image", src: SET[i], size: 980, x: 110, from: [0, 0, 1], to: [0.03, 0.04, 1.07], noCap: true, min: 4.2,
  panel: { kicker, text, size: 5 }, vo, ...extra,
});

export const VARIANTS = {
  // A: product walkthrough, 16:9
  walkthrough: {
    file: "plate-walkthrough-16x9",
    w: 1920, h: 1080, cap: 4.6, tts: { voice: "XrExE9yKIg1WjnnlVkGX", model: "eleven_v4", settings: { stability: 0.55, similarity_boost: 0.75 } }, pad: 0.09,
    previewTimes: [25.13, 30.78, 35.43, 55.19],
    scenes: [
      { type: "title", kicker: "Plate · Infographic studio", lines: ["Any story into a", "chart <em>worth sharing</em>"], sub: "Designed, rendered and checked label by label.", subWidth: 46, side: SET, sideSize: 440, sideX: 0.54, min: 3.5,
        vo: "Meet Plate. Paste your data, and it designs an editorial infographic, rendered by Tencent's Hy Image 3.5 on GMI Cloud.",
        say: "Meet Plate. Paste your data, and it designs an editorial infographic, rendered by Tencent's Hy Image three point five, on GMI Cloud." },
      composer("Pick where it will run and a style, then paste your data and the source. Meta's Muse Spark 1.3 turns your brief into a design spec, with every word and number locked in.",
        { say: "Pick where it will run and a style, then paste your data and the source. Meta's Muse Spark one point three turns your brief into a design spec, with every word and number locked in." }),
      progress("Hy Image renders it at 2K. Muse Spark reads it back, blind, and code checks every label against the spec."),
      pass1("On this run, Hy drew a pointer that tied a note about the whole chart to Zambia."),
      pass2("Plate flagged it, and one Hy edit erased just that line."),
      result("You get the graphic, checked 31 of 31, with takeaways, a caption, alt text and the data table.",
        { say: "You get the graphic, checked thirty-one of thirty-one, with takeaways, a caption, alt text and the data table." }),
      { type: "compare", heading: "Small print is where it slips", ...TOTAL, ...TEST, cropW: 700, top: 320, afterAt: 3.4, min: 6,
        vo: "Small print is where image models slip. On a copper test render, Hy printed a world total of 23,000 as 28,000.",
        say: "Small print is where image models slip. On a copper test render, Hy printed a world total of twenty-three thousand, as twenty-eight thousand." },
      { type: "compare", heading: "Then a misspelling", ...SPELL, ...TEST, cropW: 1500, top: 330, afterAt: 1.3, min: 3.5,
        vo: "It misspelled Summaries.", say: "It misspelled, Summaries." },
      { type: "compare", heading: "And numbers nobody asked for", ...AXIS, ...TEST, cropW: 860, top: 330, afterAt: 1.6, min: 4.5,
        vo: "And it added axis numbers nobody asked for. One Hy edit fixed all three." },
      final16(0, "Material Facts · Copper", "Chile out-mined the U.S., China and Russia combined", "Copper: Chile mined more than the United States, China and Russia combined."),
      final16(1, "Coffee", "Brazil grows more than the next four together", "Coffee: Brazil grows more than the next four countries together."),
      final16(2, "Cotton", "China grew more than Brazil and the U.S. combined", "Cotton: China grew more than Brazil and the United States combined."),
      final16(3, "Lithium", "Three countries mined nearly three-quarters", "Lithium: Australia, China and Chile mined nearly three-quarters of world output, not counting the U.S.",
        { panel: { kicker: "Lithium", text: "Three countries mined nearly three-quarters", sub: "Australia, China and Chile; world output excluding the U.S., which withholds its figure.", size: 5 } }),
      { type: "grid", images: SET, cols: 4, wFrac: 0.92, hFrac: 0.6, dy: -40, stagger: 0.12, min: 3,
        vo: "Every pixel and every letter, by Hy Image 3.5.", say: "Every pixel, and every letter, by Hy Image three point five." },
      { type: "endcard", lines: ["Material Facts · Hy Image Challenge, Type & Layout", "Hy Image 3.5 (Tencent Hunyuan) on GMI Cloud · Meta Muse Spark 1.3 · built on Vercel eve"], url: REPO, min: 4,
        vo: "Plate. The code and prompts are open on GitHub." },
    ],
  },

  // B: the art first, square for the feed
  showcase: {
    file: "material-facts-showcase-1x1",
    w: 1080, h: 1080, cap: 3.6, tts: { voice: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_v4", settings: { stability: 0.55, similarity_boost: 0.75 } }, pad: 0.1,
    previewTimes: [6.14, 40.54, 47.19, 53.52],
    scenes: [
      { type: "image", src: SET[0], from: [0, 0, 1], to: [0.02, 0.02, 1.04], size: 820, y: 22, min: 6.5,
        vo: "What if every chart was made of what it measures? Copper: Chile mined more than the United States, China and Russia combined." },
      { type: "image", src: SET[1], from: [0, 0, 1], to: [0.02, 0.02, 1.04], size: 820, y: 22, min: 5,
        vo: "Coffee: Brazil grows more than the next four countries together." },
      { type: "image", src: SET[2], from: [0, 0, 1], to: [0.02, 0.02, 1.04], size: 820, y: 22, min: 5,
        vo: "Cotton: China grew more than Brazil and the United States combined." },
      { type: "image", src: SET[3], from: [0, 0, 1], to: [0.02, 0.02, 1.04], size: 820, y: 22, min: 5.5,
        vo: "Lithium: Australia, China and Chile mined nearly three-quarters of world output, not counting the U.S." },
      { type: "title", kicker: "How it's made", lines: ["Made with", "<em>Plate</em>"], size: 11, min: 2.6,
        vo: "Each one was made with Plate." },
      { type: "app", clip: { from: "options+0", to: "submit+1.2", fit: true }, box: { w: 1000, h: 664, y: 140 }, masks: MASKS, min: 7,
        camera: [{ at: 0, zoom: 1.7, x: 0.6, y: 0.5 }, { at: 4, zoom: 1.7, x: 0.62, y: 0.5 }, { at: 8, zoom: 1.4, x: 0.62, y: 0.32 }],
        vo: "Paste your data and pick a format and a style. Muse Spark turns your brief into a design spec." },
      { type: "app", clip: { from: "submit+1.2", to: "submit+64", fit: true, hold: 0.6 }, box: { w: 1000, h: 664, y: 140 }, masks: MASKS, chips: CHIPS, chipY: 60, badge: "sped up", min: 4,
        camera: [{ at: 0, zoom: 1.4, x: 0.62, y: 0.32 }, { at: 1.2, zoom: 1.55, x: 0.57, y: 0.42 }, { at: 20, zoom: 1.55, x: 0.57, y: 0.42 }],
        vo: "Tencent's Hy Image 3.5 renders it on GMI Cloud, and Plate checks every label against the spec.",
        say: "Tencent's Hy Image three point five renders it on GMI Cloud, and Plate checks every label against the spec." },
      { type: "compare", heading: "Live run: caught and fixed", before: `${A}ptrz-before.jpg`, after: `${A}ptrz-after.jpg`, aspect: 0.204, stack: true, cropW: 980, top: 250,
        boxBefore: [0.29, 0.3, 0.52, 0.7], boxAfter: [0.29, 0.3, 0.52, 0.7], beforeLabel: "Pass 1: a pointer to Zambia", afterLabel: "Pass 2: one Hy edit", headSize: 6, afterAt: 2.0, min: 5,
        vo: "When Hy pointed a note about the whole chart at Zambia, Plate caught it, and one edit erased the line." },
      { type: "compare", heading: "Test render: a changed number", ...TOTAL, cropW: 490, gap: 30, top: 300, headSize: 6, afterAt: 1.8, min: 5,
        beforeLabel: "Copper test render", afterLabel: "After one Hy edit",
        vo: "And when it printed 28,000 instead of 23,000, one edit fixed that too.",
        say: "And when it printed twenty-eight thousand instead of twenty-three thousand, one edit fixed that too." },
      { type: "grid", images: SET, hFrac: 0.74, dy: -30, min: 4,
        vo: "Material Facts. Every pixel by Hy Image 3.5.", say: "Material Facts. Every pixel by Hy Image three point five." },
      { type: "endcard", size: 10, lines: ["Material Facts · Hy Image Challenge", "Hy Image 3.5 (Tencent Hunyuan) on GMI Cloud · Muse Spark 1.3"], url: REPO, min: 3.5 },
    ],
  },

  // C: the fact-check story, 16:9
  factcheck: {
    file: "plate-factcheck-story-16x9",
    w: 1920, h: 1080, cap: 4.6, tts: { voice: "onwK4e9ZLuTAKqWW03F9", model: "eleven_v4", settings: { stability: 0.55, similarity_boost: 0.75 } }, pad: 0.09,
    previewTimes: [8.54, 15.66, 56.47, 71.28],
    scenes: [
      { type: "compare", heading: "Hy wrote 28,000. The data said 23,000.", ...TOTAL, ...TEST, cropW: 700, top: 320, afterAt: 0, boxAt: 0, min: 6,
        vo: "Hy Image 3.5 renders type beautifully, but small print slips. On this copper test render, a world total of 23,000 came out as 28,000.",
        say: "Hy Image three point five renders type beautifully, but small print slips. On this copper test render, a world total of twenty-three thousand, came out as twenty-eight thousand." },
      { type: "compare", heading: "A word, misspelled", ...SPELL, ...TEST, cropW: 1500, top: 330, afterAt: 2.2, min: 4.5,
        vo: "Summaries, spelled Summaties. Four times, on two topics.", say: "Summaries, spelled Summa-ties. Four times, on two topics." },
      { type: "compare", heading: "Numbers nobody asked for", ...AXIS, ...TEST, cropW: 860, top: 330, afterAt: 1.6, min: 4.5,
        vo: "And tick numbers nobody asked for. One Hy edit fixed all three." },
      { type: "stats", items: [{ value: 13, label: "runs for this set" }, { value: 26, label: "render and edit passes" }, { value: 8, label: "misspellings caught" }], min: 4,
        vo: "Across 13 runs for this set, Plate flagged 8 misspellings and removed text that Hy invented.",
        say: "Across thirteen runs for this set, Plate flagged eight misspellings, and removed text that Hy invented." },
      composer("Here's the loop. Paste a brief, and pick a format and a style. Meta's Muse Spark 1.3 writes a spec with every string locked.",
        { say: "Here's the loop. Paste a brief, and pick a format and a style. Meta's Muse Spark one point three writes a spec, with every string locked." }),
      progress("Hy Image renders it. Muse Spark, blind to the spec, reads it back, and code diffs every label."),
      pass1("On this run, Hy pointed a note about the whole chart at Zambia."),
      pass2("Plate flagged it, and one Hy edit erased just that line. Fixes are reference edits or corrected re-renders, up to six passes."),
      result("Checked 31 of 31, with takeaways, a caption, alt text and the data table.",
        { say: "Checked thirty-one of thirty-one, with takeaways, a caption, alt text and the data table.", min: 6 }),
      { type: "compare", heading: "The check missed one", before: `${A}qcall-before.jpg`, after: `${A}qcall-after.jpg`, aspect: 0.327, cropW: 820, top: 330, afterAt: 3.2, min: 6,
        boxBefore: [0.14, 0.38, 0.385, 0.625], beforeLabel: "Cotton final, before", afterLabel: "After one Hy edit",
        vo: "It isn't perfect. It missed quarters drawn with a g. A human caught it, and one Hy edit changed that line and nothing else." },
      final16(0, "Material Facts · Copper", "Chile out-mined the U.S., China and Russia combined", "The result: Material Facts. Copper: Chile mined more than the United States, China and Russia combined."),
      final16(1, "Coffee", "Brazil grows more than the next four together", "Coffee: Brazil grows more than the next four countries together."),
      final16(2, "Cotton", "China grew more than Brazil and the U.S. combined", "Cotton: China grew more than Brazil and the United States combined."),
      final16(3, "Lithium", "Three countries mined nearly three-quarters", "Lithium: Australia, China and Chile mined nearly three-quarters of world output, not counting the U.S.",
        { panel: { kicker: "Lithium", text: "Three countries mined nearly three-quarters", sub: "Australia, China and Chile; world output excluding the U.S., which withholds its figure.", size: 5 } }),
      { type: "endcard", lines: ["Every infographic pixel by Hy Image 3.5 preview (Tencent Hunyuan) on GMI Cloud", "Material Facts · Hy Image Challenge, Type & Layout · Meta Muse Spark 1.3 · Vercel eve"], url: REPO, min: 4,
        vo: "Plate. Every infographic pixel by Hy Image 3.5. The code is open on GitHub.", say: "Plate. Every infographic pixel, by Hy Image three point five. The code is open on GitHub." },
    ],
  },

  // D: punchy walkthrough with the architecture, 16:9
  punchy: {
    file: "plate-walkthrough-v2-16x9",
    w: 1920, h: 1080, cap: 4.4, drift: true, music: "assets/music.mp3", musicVol: 0.55,
    tts: { voice: "XrExE9yKIg1WjnnlVkGX", model: "eleven_v4", settings: { stability: 0.5, similarity_boost: 0.75 } },
    previewTimes: [10, 40, 72, 92],
    scenes: [
      { type: "title", words: true, stagger: 0.09, kicker: "Hy Image Challenge · Type & Layout", lines: ["Image models draw", "<em>beautiful</em> charts."], side: SET, sideSize: 440, sideX: 0.54, min: 3.5,
        vo: "Image models can now draw beautiful charts. But one wrong number, and the chart is useless." },
      { type: "compare", heading: "One wrong number", ...TOTAL, ...TEST, cropW: 700, top: 320, afterAt: 3.6, boxAt: 0.6, min: 5,
        stamps: [{ text: "CAUGHT", color: "var(--red)", at: 1.2, x: 0.3, y: 1.06, size: 5 }, { text: "FIXED", color: "var(--green)", on: "after", at: 4.3, x: 0.35, y: 1.06, size: 5 }],
        vo: "In testing, Hy Image printed a world total of 23,000 as 28,000.",
        say: "In testing, Hy Image printed a world total of twenty-three thousand, as twenty-eight thousand." },
      { type: "title", words: true, stagger: 0.12, lines: ["So we built", "<em>Plate.</em>"], size: 11, sub: "Designs with Meta Muse Spark 1.3 · renders with Tencent Hy Image 3.5 · checks every label in code", subWidth: 60, min: 3.5,
        vo: "So we built Plate. It designs with Muse Spark, renders with Hy Image, and checks every label before you see it." },
      composer("You paste your data, and pick a format and a style. That's it.", { min: 5 }),
      { type: "flow", heading: "How <em style='font-style:normal;color:var(--gold)'>Plate</em> works", min: 10, loop: [6, 3], loopAt: 0.86, loopLabel: "Loops up to 6 passes · learns what Hy gets wrong",
        nodeSentences: [-1, 0, 1, 2, 3, 4, 4.55], loopSentence: 5,
        nodes: [
          { who: "You", what: "Data + brief", how: "Article, table or PDF" },
          { who: "Muse Spark 1.3", what: "Design spec", how: "Story, chart form, every string locked" },
          { who: "Plate", plate: true, what: "Prompt compiler", how: "Each label quoted once, sizes, layout" },
          { who: "Hy Image 3.5", what: "2K render", how: "On GMI Cloud" },
          { who: "Muse Spark · blind", what: "Reads it back", how: "Never sees the spec" },
          { who: "Plate", plate: true, what: "Diff in code", how: "Every word, number and row" },
          { who: "Hy Image 3.5", what: "Targeted edit", how: "Fixes only what's wrong" },
        ],
        vo: "Muse Spark writes a spec with every word and number locked. Plate compiles the prompt. Hy Image renders it at 2K on GMI Cloud. Muse Spark reads it back, blind. Plate's code diffs every label, and Hy fixes only the mistakes. Then it loops." },
      { type: "title", words: true, stagger: 0.1, kicker: "Why read it blind?", lines: ["A reader who knows", "the answer <em>sees it.</em>"], size: 7.4, side: [`${A}total-before.jpg`], sideSize: 470, sideX: 0.6, min: 5,
        vo: "Why blind? A reader who knows the answer tends to see it, even when it's wrong. So Muse Spark only reads, and Plate's code judges." },
      { ...progress("Here's a real run, sped up."), min: 3.5 },
      pass1("Plate's check caught Hy tying a note about the whole chart to Zambia.", { min: 4 }),
      { ...pass2("One targeted Hy edit erased just that line. Everything else stayed exactly as Hy drew it."),
        stamps: [{ text: "CAUGHT", color: "var(--red)", at: 0.9, x: 1.02, y: 0.15, size: 4.5 }, { text: "FIXED", color: "var(--green)", on: "after", at: 2.3, x: 1.02, y: 0.15, size: 4.5 }] },
      result("You get the finished graphic, with takeaways, a caption, alt text and the data table.", {
        camera: [{ at: 0, zoom: 1.3, x: 0.56, y: 0.3 }, { at: 3, zoom: 1.3, x: 0.56, y: 0.36 }, { at: 4.5, zoom: 1.15, x: 0.56, y: 0.5 }, { at: 9, zoom: 1.15, x: 0.56, y: 0.6 }] }),
      { type: "compare", heading: "Misspellings", ...SPELL, ...TEST, cropW: 1500, top: 330, afterAt: 1.2, boxAt: 0.3, min: 3,
        stamps: [{ text: "CAUGHT", color: "var(--red)", at: 0.6, x: 0.86, y: -0.25, size: 4 }],
        vo: "Plate catches misspellings," },
      { type: "compare", heading: "Numbers nobody asked for", ...AXIS, ...TEST, cropW: 860, top: 330, afterAt: 1.2, boxAt: 0.3, min: 3,
        stamps: [{ text: "CAUGHT", color: "var(--red)", at: 0.6, x: 0.55, y: 0.25, size: 4 }],
        vo: "and numbers nobody asked for." },
      { type: "features", heading: "<em style='font-style:normal;color:var(--gold)'>Plate</em> does the heavy lifting", min: 7.5,
        items: [["Typed spec", "Every printed string is locked before a pixel is drawn"], ["Prompt compiler", "Each label quoted once, with size and placement rules"], ["Blind read-back", "Muse Spark transcribes without seeing the spec"],
          ["Diff in code", "Words, numbers, row order and invented text"], ["Targeted Hy edits", "Fix only what's wrong, from the best draft so far"], ["Learns", "Every run is logged; Hy's weak spots feed the next prompt"]],
        vo: "Plate does the heavy lifting, and it remembers what Hy gets wrong, so every render starts smarter." },
      final16(0, "Material Facts · Copper", "Chile out-mined the U.S., China and Russia combined", "Copper: Chile mined more than the United States, China and Russia combined.", { min: 3.4 }),
      final16(1, "Coffee", "Brazil grows more than the next four together", "Coffee: Brazil grows more than the next four countries together.", { min: 3.2 }),
      final16(2, "Cotton", "China grew more than Brazil and the U.S. combined", "Cotton: China grew more than Brazil and the United States combined.", { min: 3.2 }),
      final16(3, "Lithium", "Three countries mined nearly three-quarters", "Lithium: three countries mined nearly three-quarters, outside the U.S.",
        { min: 3.2, panel: { kicker: "Lithium", text: "Three countries mined nearly three-quarters", sub: "Australia, China and Chile; world output excluding the U.S., which withholds its figure.", size: 5 } }),
      { type: "grid", images: SET, cols: 4, wFrac: 0.92, hFrac: 0.6, dy: -40, stagger: 0.12, min: 3,
        vo: "Material Facts: every chart built from what it measures, and every label checked by Plate." },
      { type: "endcard", lines: ["Hy Image draws it. Plate makes sure it's right.", "Hy Image 3.5 (Tencent Hunyuan) on GMI Cloud · Meta Muse Spark 1.3 · built on Vercel eve"], url: REPO, min: 4,
        vo: "Plate. Hy Image draws it. Plate makes sure it's right." },
    ],
  },
};
