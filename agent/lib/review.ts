// Vision QA pass: Muse Spark looks at the rendered image in a clean context and checks it
// against the text contract and the data. Image models misspell, drop, and invent labels;
// this is the guard that keeps wrong numbers out of a published infographic.

import { generateText, Output } from "ai";
import { z } from "zod";

export const REVIEW_MODEL = "meta/muse-spark-1.3-contributor";

export const reviewSchema = z.object({
  observedText: z
    .array(z.string())
    .describe(
      "Transcription of EVERY readable piece of text on the image, top to bottom, left to right, exactly as rendered (including typos, duplicates and stray words). Do this before judging.",
    ),
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
  input: { imageUrl: string; textContract: string[]; dataSummary: string },
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

  return output;
}
