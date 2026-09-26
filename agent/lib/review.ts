// Vision QA pass: Muse Spark looks at the rendered image in a clean context and checks it
// against the text contract and the data. Image models misspell, drop, and invent labels;
// this is the guard that keeps wrong numbers out of a published infographic.

import { generateText, Output } from "ai";
import { z } from "zod";
import type { CalloutCheck } from "./infographic";

export const REVIEW_MODEL = "meta/muse-spark-1.3-contributor";

export const reviewSchema = z.object({
  observedText: z
    .array(z.string())
    .describe(
      "Transcription of EVERY readable piece of text on the image, top to bottom, left to right, exactly as rendered (including typos, duplicates and stray words). Do this before judging.",
    ),
  annotations: z
    .array(
      z.object({
        text: z.string().describe("The callout or annotation text as rendered"),
        pointsTo: z
          .string()
          .describe(
            "The data label of the row, bar, segment or point that this callout's pointer, tail, leader line or dot indicates: follow it to its tip. If the tip touches a data mark, name that mark. If the tip stops in empty space, name the row, bar or point level with the tip (same height for horizontal bars, same position for columns). 'none' only when the callout has no pointer at all.",
          ),
      }),
    )
    .describe("Every callout, speech bubble or annotation note on the image, with what it points at"),
  verdict: z
    .enum(["publish", "fix"])
    .describe("'publish' only if every data value and headline is correct and nothing is invented"),
  score: z.number().min(1).max(10).describe("Overall publication quality, 10 = Visual Capitalist grade"),
  wrongOrMissing: z
    .array(z.object({ expected: z.string(), found: z.string() }))
    .describe("Required strings that are misspelled, wrong, or absent ('found' = 'missing' when absent)"),
  invented: z
    .array(z.string())
    .describe("Every observed word, number or label that is not part of a required string (for example stray labels, placeholder words, extra statistics)"),
  encodingIssues: z
    .array(z.string())
    .describe("Bar/area/color encodings that contradict the data: wrong order, wrong proportions, wrong color band"),
  designIssues: z.array(z.string()).describe("Legibility, overlap, cropping, clutter"),
  editInstruction: z
    .string()
    .describe(
      "One precise edit instruction for an image-editing model that fixes the most important problems while keeping everything else identical. Empty string when verdict is 'publish'.",
    ),
});

export type Review = z.infer<typeof reviewSchema>;

export async function reviewInfographic(
  input: {
    imageUrl: string;
    textContract: string[];
    dataSummary: string;
    callouts?: CalloutCheck[];
  },
  signal?: AbortSignal,
): Promise<Review> {
  const image = await fetch(input.imageUrl, { signal });
  if (!image.ok) throw new Error(`Could not download image for review (${image.status}).`);
  const bytes = new Uint8Array(await image.arrayBuffer());

  const { output } = await generateText({
    model: REVIEW_MODEL,
    reasoning: "low",
    abortSignal: signal,
    output: Output.object({ schema: reviewSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "You are the fact-checking editor at a data-journalism desk. Inspect this infographic, zoom into every label, and compare it with the brief.",
              "",
              "REQUIRED TEXT (each must appear verbatim, legible, exactly once):",
              ...input.textContract.map((text) => `- ${text}`),
              "",
              "DATA THE GRAPHIC MUST ENCODE:",
              input.dataSummary,
              "",
              "Method: first transcribe every readable string into observedText. Then diff it against the required text:",
              "- wrongOrMissing: a required string that is absent, misspelled, or shows a different number or name. If only the unit suffix or formatting differs and the number is identical (for example '23.2' for '23.2M' when the unit is stated elsewhere), put it once in designIssues instead.",
              "- invented: observed text that corresponds to no required string (stray labels, placeholder words, extra statistics). Never list a variant of a required string here; it belongs in exactly one list.",
              "- Rank prefixes (1., 2., ...) are acceptable. Tick numbers are acceptable only on a real axis of the chart; numbers in decorative illustrations (rulers, graph paper, doodles) are invented.",
              "- annotations: for every callout box or speech bubble, trace its pointer, tail or leader line to its tip and name the data element the tip indicates: the mark it touches, or, if it stops in empty space, the row level with the tip. Judge by the tip, not by where the box sits, and never assume the callout points where its text says.",
              "- Encoding: measure bar lengths (or areas) against each other. Ratios should match the data ratios within about 10% on a zero baseline; a visibly truncated or inconsistent scale goes in encodingIssues.",
              "Verdict 'fix' only for factual problems: wrongOrMissing or invented non-empty, or an encoding that misrepresents the data. Formatting and design issues alone still get 'publish' with a lower score.",
              "Be strict about numbers, names and stray text; they are what make an infographic untrustworthy. Ignore decorative background texture that contains no readable words.",
            ].join("\n"),
          },
          { type: "file", mediaType: image.headers.get("content-type") ?? "image/png", data: bytes },
        ],
      },
    ],
  });

  return checkCallouts(sanitizeReview(output, input.textContract), input.callouts ?? []);
}

const normalize = (text: string) =>
  text.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Remove self-contradicting findings the vision model sometimes emits ("expected X, found X",
 * or a required string listed as invented) so they never trigger a needless fix pass.
 */
export function sanitizeReview(review: Review, textContract: string[]): Review {
  const required = new Set(textContract.map(normalize));
  const wrongOrMissing = review.wrongOrMissing.filter(
    (item) => normalize(item.expected) !== normalize(item.found),
  );
  const invented = review.invented.filter((item) => !required.has(normalize(item)));
  const dropped =
    review.wrongOrMissing.length - wrongOrMissing.length + review.invented.length - invented.length;
  const clean = wrongOrMissing.length === 0 && invented.length === 0 && review.encodingIssues.length === 0;
  return {
    ...review,
    wrongOrMissing,
    invented,
    verdict: dropped > 0 && clean ? "publish" : review.verdict,
    editInstruction: dropped > 0 && clean ? "" : review.editInstruction,
  };
}

const NO_POINTER = new Set(["", "none", "no pointer", "nothing", "n/a"]);

/**
 * A callout that points at the wrong row misstates the data as surely as a wrong number, so a
 * mismatch between where a pointer ends and the spec's anchor is a factual issue. The vision
 * model only reports what each pointer touches; the comparison happens here.
 */
export function checkCallouts(review: Review, callouts: CalloutCheck[]): Review {
  const issues: string[] = [];
  for (const callout of callouts) {
    const observed = review.annotations.find((item) => sameCallout(item.text, callout.text));
    if (!observed) continue; // a missing callout is already a wrongOrMissing finding
    const target = normalize(observed.pointsTo).replace(/^(the )?/, "");
    if (callout.anchor) {
      const anchor = normalize(callout.anchor);
      if (!NO_POINTER.has(target) && !target.includes(anchor) && !anchor.includes(target)) {
        issues.push(
          `The callout "${callout.text}" points at "${observed.pointsTo}"; its pointer must end on "${callout.anchor}".`,
        );
      }
    } else if (!NO_POINTER.has(target)) {
      issues.push(
        `The callout "${callout.text}" is a general statement but points at "${observed.pointsTo}"; remove its pointer or leader line.`,
      );
    }
  }
  if (issues.length === 0) return review;
  return {
    ...review,
    encodingIssues: [...review.encodingIssues, ...issues],
    verdict: "fix",
    editInstruction: [review.editInstruction, ...issues].filter(Boolean).join(" "),
  };
}

/** Rendered callout text is matched to the spec loosely: same opening words, or most words. */
function sameCallout(observed: string, expected: string): boolean {
  const a = normalize(observed);
  const b = normalize(expected);
  if (a.includes(b.slice(0, 24)) || b.includes(a.slice(0, 24))) return true;
  const words = new Set(a.split(" "));
  const shared = b.split(" ").filter((word) => words.has(word)).length;
  return shared / Math.max(1, b.split(" ").length) >= 0.6;
}
