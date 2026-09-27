// Vision QA pass. Muse Spark is used only as eyes, never as the judge of its own reading:
//   1. Transcribe: a blind read of every string with its position. It never sees the brief, so
//      it cannot echo the text it was told to expect (the classic VLM-judge failure).
//   2. Inspect: where callout pointers end, which of two marks is bigger, and design notes.
//   3. Re-read: disputed strings are cropped, zoomed and read again before they count.
// Code (agent/lib/qa.ts) does every comparison and decides the verdict: publish only when every
// check passes.

import { generateText, Output } from "ai";
import { z } from "zod";
import {
  type Box,
  checkComparisons,
  checkPointers,
  checkReferenceLines,
  type Defect,
  type Located,
  matchTranscription,
  type PointerVerdict,
  norm,
  type QaPlan,
  type Transcribed,
} from "./qa";

export const REVIEW_MODEL = "meta/muse-spark-1.3-contributor";

// sharp is a native module; load it lazily so a missing binary only disables the zoomed
// re-read and drift metric instead of the whole agent.
const loadSharp = () => import("sharp").then((module) => module.default);

const DESIGN_GRADES = ["unpublishable", "major_fixes", "minor_fixes", "polish_only", "ship"] as const;
type DesignGrade = (typeof DESIGN_GRADES)[number];
const GRADE_SCORE: Record<DesignGrade, number> = {
  unpublishable: 2,
  major_fixes: 4,
  minor_fixes: 6,
  polish_only: 8,
  ship: 10,
};

export type Review = {
  // 'publish' only when every factual check passed.
  verdict: "publish" | "fix";
  // Design quality from a labeled grade (1-10); never used to decide publish.
  score: number;
  checks: { total: number; passed: number };
  defects: Defect[];
  // Views of `defects` kept for the UI and the agent.
  wrongOrMissing: { expected: string; found: string }[];
  invented: string[];
  encodingIssues: string[];
  designIssues: string[];
  // Literal edit lines for the image editor, most important first. Empty when publishable.
  editInstruction: string;
  // Where each brief string was found and where callout pointers end; used to draw connectors.
  positions: Located[];
  // Each callout's own pointer: true if it ends on its anchor, false if not, null if it has none.
  pointers: PointerVerdict[];
};

const transcriptionSchema = z.object({
  texts: z.array(
    z.object({
      text: z.string().describe("Exactly as drawn, letter by letter; never corrected"),
      box: z
        .array(z.number())
        .length(4)
        .describe("[left, top, right, bottom] in 0-1000 coordinates of the image"),
      role: z.enum(["heading", "label", "value", "legend", "annotation", "footer", "axis", "logo", "decoration", "other"]),
      malformed: z
        .boolean()
        .describe("True when any character is warped, fused with another, missing strokes, or not a real letter"),
    }),
  ),
});

const inspectionSchema = z.object({
  pointers: z
    .array(
      z.object({
        callout: z.string().describe("The callout's opening words as drawn"),
        pointsTo: z
          .string()
          .describe("The data label nearest the pointer's tip, or 'none' when the callout has no pointer, arrow or leader line"),
        tip: z
          .array(z.number())
          .describe("[x, y] of the very end of the pointer or arrowhead, in 0-1000 image coordinates; empty when there is no pointer"),
      }),
    )
    .describe("One entry per callout or annotation box"),
  comparisons: z.array(
    z.object({ id: z.number(), answer: z.enum(["first", "second", "same", "unclear"]) }),
  ),
  referenceLines: z
    .array(
      z.object({
        orientation: z.enum(["vertical", "horizontal"]),
        where: z.string().describe("Where it runs, in a few words, e.g. 'through the bars just right of the 499 value'"),
      }),
    )
    .describe(
      "Long lines across the chart that mark an average, target, median or threshold. Not gridlines, axes, bar edges, dashed row separators, or callout arrows.",
    ),
  unlabeledMarks: z
    .array(z.string().describe("Where it is, e.g. 'an extra bar below the last row'"))
    .describe("Bars, columns, segments, tiles or dots in the chart that have no label and no value of their own"),
  designIssues: z
    .array(z.string())
    .describe("Legibility, overlap, cropping, clutter, weak hierarchy; one short sentence each"),
  designGrade: z.enum(DESIGN_GRADES),
});

async function loadImage(url: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mediaType: string }> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not download image for review (${response.status}).`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mediaType: response.headers.get("content-type") ?? "image/png",
  };
}

async function transcribe(image: { bytes: Uint8Array; mediaType: string }, signal?: AbortSignal): Promise<Transcribed[]> {
  const { output } = await generateText({
    model: REVIEW_MODEL,
    reasoning: "low",
    abortSignal: signal,
    output: Output.object({ schema: transcriptionSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Transcribe every piece of readable text in this image exactly as it is drawn, letter by letter and digit by digit.",
              "- Do not correct spelling, do not complete cut-off or garbled words, do not normalize numbers or units. A typo in the image must stay a typo in your answer.",
              "- One entry per separate text element (a title, one label, one value, one legend entry, one note, one footer line). Never merge a label with its value. If the same text is drawn twice, list it twice.",
              "- Mark malformed = true when any character is warped, fused, missing strokes, or not a real letter.",
              "- Role 'decoration' is for text that is part of an illustration or background texture (chalk formulas, printed props); skip faint texture that cannot be read.",
            ].join("\n"),
          },
          { type: "file", mediaType: image.mediaType, data: image.bytes },
        ],
      },
    ],
  });
  return output.texts.map((item) => ({ ...item, box: item.box as Box }));
}

async function inspect(
  image: { bytes: Uint8Array; mediaType: string },
  plan: QaPlan,
  signal?: AbortSignal,
): Promise<z.infer<typeof inspectionSchema>> {
  const questions = plan.comparisons.map(
    (pair, id) => `${id}. Which is drawn bigger: the "${pair.first}" ${plan.markNoun} (first) or the "${pair.second}" ${plan.markNoun} (second)?`,
  );
  const { output } = await generateText({
    model: REVIEW_MODEL,
    reasoning: "low",
    abortSignal: signal,
    output: Output.object({ schema: inspectionSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "You are the design editor of a data-journalism desk looking at a finished infographic. Spelling and numbers are checked separately; report only what is asked.",
              plan.labels.length ? `Data labels on this chart: ${plan.labels.map((label) => `"${label}"`).join(", ")}.` : "",
              "",
              "pointers: for every callout box or speech bubble, follow its pointer, arrow, tail or leader line to its very end and give that point's coordinates, plus the data label nearest it. Judge by where the line ends, never by where the box sits or what its text says.",
              questions.length
                ? `comparisons: judge by the drawn length or area only, not the printed numbers. Answer 'same' only if they look equal.\n${questions.join("\n")}`
                : "comparisons: return an empty list.",
              "referenceLines: every long line across the chart that marks an average, target, median or threshold value. Empty when there are none.",
              "unlabeledMarks: every data mark (bar, column, segment, tile, dot) with no label and no value of its own, such as an extra bar at the end of the chart. Empty when every mark is labeled.",
              "designIssues: legibility, overlapping or cut-off elements, clutter, weak hierarchy. Empty when there are none.",
              "designGrade: how close this is to a Visual Capitalist or Economist graphic, ignoring spelling.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          { type: "file", mediaType: image.mediaType, data: image.bytes },
        ],
      },
    ],
  });
  return output;
}

/**
 * Crop each disputed string with generous margins, zoom it, and read it again blind. A
 * misspelling or malformed glyph only counts when the zoomed read agrees.
 */
async function reread(
  image: { bytes: Uint8Array },
  boxes: Box[],
  signal?: AbortSignal,
): Promise<{ text: string; malformed: boolean }[]> {
  const sharp = await loadSharp();
  const { width = 0, height = 0 } = await sharp(image.bytes).metadata();
  if (!width || !height) return [];
  const crops = await Promise.all(
    boxes.map(async (box) => {
      const [l, t, r, b] = box.map((v) => Math.min(1000, Math.max(0, v)) / 1000);
      const padX = Math.max(0.02, (r - l) * 0.2);
      const padY = Math.max(0.015, (b - t) * 0.6);
      const left = Math.floor(Math.max(0, l - padX) * width);
      const top = Math.floor(Math.max(0, t - padY) * height);
      const cropWidth = Math.max(8, Math.min(width - left, Math.ceil((r - l + 2 * padX) * width)));
      const cropHeight = Math.max(8, Math.min(height - top, Math.ceil((b - t + 2 * padY) * height)));
      const scale = Math.min(4, Math.max(1, 160 / cropHeight));
      const png = await sharp(image.bytes)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .resize({ width: Math.round(cropWidth * scale), kernel: "lanczos3" })
        .png()
        .toBuffer();
      return new Uint8Array(png);
    }),
  );
  const { output } = await generateText({
    model: REVIEW_MODEL,
    reasoning: "low",
    abortSignal: signal,
    output: Output.object({
      schema: z.object({
        readings: z.array(z.object({ id: z.number(), text: z.string(), malformed: z.boolean() })),
      }),
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Here are ${crops.length} zoomed crops from one image, numbered from 0. For each, transcribe the main text in the middle of the crop exactly as drawn, letter by letter, without correcting anything; ignore partial text cut off at the edges. malformed = true when any character is warped, fused, missing strokes, or not a real letter.`,
          },
          ...crops.flatMap((data, id) => [
            { type: "text" as const, text: `Crop ${id}:` },
            { type: "file" as const, mediaType: "image/png", data },
          ]),
        ],
      },
    ],
  });
  return crops.map((_, id) => {
    const reading = output.readings.find((item) => item.id === id);
    return { text: reading?.text ?? "", malformed: reading?.malformed ?? false };
  });
}

const squash = (text: string) => norm(text).replace(/\s/g, "");

export async function reviewInfographic(
  input: { imageUrl: string; plan: QaPlan },
  signal?: AbortSignal,
): Promise<Review> {
  const { plan } = input;
  const image = await loadImage(input.imageUrl, signal);
  const [texts, inspection] = await Promise.all([transcribe(image, signal), inspect(image, plan, signal)]);

  const matched = matchTranscription(texts, plan);
  const pointerCheck = checkPointers(inspection.pointers, plan.callouts, matched.positions);
  let defects = [
    ...matched.defects,
    ...pointerCheck.defects,
    ...checkReferenceLines(inspection.referenceLines),
    ...inspection.unlabeledMarks.map(
      (where): Defect => ({
        kind: "invented",
        severity: 3,
        found: `unlabeled mark (${where})`,
        message: `A data mark with no label is drawn: ${where}.`,
        fix: `Erase ${where}, filling in the background; keep every labeled bar, label and value exactly as it is.`,
      }),
    ),
    ...checkComparisons(inspection.comparisons, plan),
  ];

  // Settle disputed readings on a zoomed crop before they cost a fix pass.
  const disputed = defects.filter(
    (defect): defect is Defect & { box: Box } =>
      (defect.kind === "misspelled" || defect.kind === "malformed") && Boolean(defect.box),
  ).slice(0, 8);
  if (disputed.length) {
    try {
      const readings = await reread(image, disputed.map((defect) => defect.box), signal);
      const cleared = new Set<Defect>();
      disputed.forEach((defect, i) => {
        const reading = readings[i];
        if (!reading?.text) return;
        if (defect.kind === "misspelled" && squash(reading.text) === squash(defect.expected ?? "") && !reading.malformed) {
          cleared.add(defect);
        }
        if (defect.kind === "malformed" && !reading.malformed) cleared.add(defect);
      });
      defects = defects.filter((defect) => !cleared.has(defect));
    } catch (error) {
      if (signal?.aborted) throw error;
      // Keep the findings from the full read.
    }
  }

  defects.sort((a, b) => b.severity - a.severity);
  // One check per contract string, layout rule, comparison and callout, plus "no stray text".
  const total = matched.checks + plan.comparisons.length + plan.callouts.length + 1;
  const failing =
    defects.filter((defect) => defect.kind !== "invented").length +
    (defects.some((defect) => defect.kind === "invented") ? 1 : 0);
  const verdict = defects.length === 0 ? "publish" : "fix";
  const score = Math.min(GRADE_SCORE[inspection.designGrade], verdict === "fix" ? 6 : 10);

  return {
    verdict,
    score,
    checks: { total, passed: Math.max(0, total - failing) },
    defects,
    wrongOrMissing: defects
      .filter((defect) => defect.kind === "misspelled" || defect.kind === "missing")
      .map((defect) => ({ expected: defect.expected ?? "", found: defect.found ?? "missing" })),
    invented: defects.filter((defect) => defect.kind === "invented").map((defect) => defect.found ?? ""),
    encodingIssues: defects
      .filter((defect) => !["misspelled", "missing", "invented"].includes(defect.kind))
      .map((defect) => defect.message),
    designIssues: [...inspection.designIssues, ...matched.formatNotes],
    editInstruction: defects.map((defect) => defect.fix).join("\n"),
    positions: matched.positions,
    pointers: pointerCheck.verdicts,
  };
}


/**
 * Tie-break between two drafts that are equally correct: ask which is more polished, in both
 * orders, and trust the answer only when the two agree (VLM judges favor whichever comes first).
 */
export async function preferPolished(
  a: string,
  b: string,
  signal?: AbortSignal,
): Promise<"a" | "b" | undefined> {
  const [imageA, imageB] = await Promise.all([loadImage(a, signal), loadImage(b, signal)]);
  const ask = async (first: typeof imageA, second: typeof imageA) => {
    const { output } = await generateText({
      model: REVIEW_MODEL,
      reasoning: "low",
      abortSignal: signal,
      output: Output.object({ schema: z.object({ better: z.enum(["first", "second"]) }) }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Two drafts of the same infographic. Which one is more polished and legible for publication: cleaner typography, no overlaps, clearer hierarchy? Ignore any differences in wording.",
            },
            { type: "text", text: "First:" },
            { type: "file", mediaType: first.mediaType, data: first.bytes },
            { type: "text", text: "Second:" },
            { type: "file", mediaType: second.mediaType, data: second.bytes },
          ],
        },
      ],
    });
    return output.better;
  };
  const [forward, backward] = await Promise.all([ask(imageA, imageB), ask(imageB, imageA)]);
  if (forward === "first" && backward === "second") return "a";
  if (forward === "second" && backward === "first") return "b";
  return undefined;
}

/**
 * Mean pixel change between two renders outside the regions an edit was meant to touch
 * (0 = identical, 1 = completely different). Logged for every edit so the "keep everything else
 * identical" promise can be measured and a drift threshold calibrated from real data.
 */
export async function driftOutside(beforeUrl: string, afterUrl: string, boxes: Box[], signal?: AbortSignal): Promise<number> {
  const size = 96;
  const sharp = await loadSharp();
  const [before, after] = await Promise.all(
    [beforeUrl, afterUrl].map(async (url) => {
      const { bytes } = await loadImage(url, signal);
      return sharp(bytes).resize(size, size, { fit: "fill" }).greyscale().raw().toBuffer();
    }),
  );
  const masked = (x: number, y: number) =>
    boxes.some(([l, t, r, b]) => {
      const px = ((x + 0.5) / size) * 1000;
      const py = ((y + 0.5) / size) * 1000;
      return px >= l - 40 && px <= r + 40 && py >= t - 40 && py <= b + 40;
    });
  let sum = 0;
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (masked(x, y)) continue;
      sum += Math.abs(before[y * size + x] - after[y * size + x]);
      count += 1;
    }
  }
  return count ? Math.round((sum / count / 255) * 1000) / 1000 : 0;
}
