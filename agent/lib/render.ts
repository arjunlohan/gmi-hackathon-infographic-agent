// Render, check, refine: one tool call runs the whole quality loop and reveals only the
// final draft. Partial snapshots carry progress but never an image, so the user never sees
// a draft that failed its fact-check.

import { type Draft, saveDraft } from "./drafts";
import { type GeneratedImage, generateHyImage, type HySize } from "./gmi";
import { type Review, reviewInfographic } from "./review";

const MAX_PASSES = 3;
const MAX_EDITABLE_ISSUES = 3;
// Keep one tool call under the 300s Vercel function limit: stop starting new passes once
// the budget is spent, and bound each upstream call.
const WALL_BUDGET_MS = 240_000;
const PASS_ESTIMATE_MS = 75_000;
const RENDER_TIMEOUT_MS = 110_000;
// Reference edits normally finish in 30-40s; when they fail upstream they hang for 2+ minutes.
const EDIT_TIMEOUT_MS = 70_000;

export type RenderPhase = "rendering" | "checking" | "refining" | "done";

export type PassSummary = {
  pass: number;
  method: "render" | "edit";
  verdict?: Review["verdict"];
  score?: number;
  factualIssues?: number;
  error?: string;
};

// The UI renders this shape directly (see app/_components/infographic-card.tsx).
export type RenderResult = {
  phase: RenderPhase;
  pass: number;
  maxPasses: number;
  note?: string;
  size: HySize;
  // Present only on the final "done" snapshot.
  draftId?: string;
  fileName?: string;
  parentId?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  prompt?: string;
  review?: Review;
  reviewError?: string;
  passes?: PassSummary[];
};

type Candidate = { image: GeneratedImage; prompt: string; review?: Review; reviewError?: string };

function factualIssues(review: Review): number {
  return review.wrongOrMissing.length + review.invented.length + review.encodingIssues.length;
}

function isBetter(next: Candidate, current: Candidate | undefined): boolean {
  if (!current) return true;
  if (!next.review || !current.review) return Boolean(next.review);
  const rank = (review: Review) => [
    review.verdict === "publish" ? 1 : 0,
    -factualIssues(review),
    review.score,
  ];
  const [a, b] = [rank(next.review), rank(current.review)];
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return true; // tie: prefer the later, corrected pass
}

function describeFixes(review: Review): string {
  const lines = [
    ...review.wrongOrMissing.map((item) => `- Print "${item.expected}" exactly (the last render showed "${item.found}").`),
    ...review.invented.map((item) => `- Do not print "${item}".`),
    ...review.encodingIssues.map((item) => `- ${item}`),
  ];
  return lines.join("\n");
}

function editPrompt(instruction: string): string {
  return [
    `Edit the reference infographic. ${instruction}`,
    "Keep everything else identical: layout, canvas size, colors, typography, illustration, and every other piece of text, spelled exactly as it is. Do not add any new text.",
  ].join("\n");
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function* renderWithQualityLoop(input: {
  // Full description of the graphic; used for fresh renders and as the fallback when an edit fails.
  basePrompt: string;
  size: HySize;
  textContract: string[];
  dataSummary: string;
  referenceImages: string[];
  fileName: string;
  // Start from an existing image (user-requested revision) instead of a fresh render.
  startFrom?: { imageUrl: string; instruction: string; parentId: string };
  signal?: AbortSignal;
}): AsyncGenerator<RenderResult> {
  const startedAt = Date.now();
  const base = { size: input.size, maxPasses: MAX_PASSES };
  const passes: PassSummary[] = [];
  let best: Candidate | undefined;
  let next: { method: "render" | "edit"; prompt: string; reference?: string; note: string } =
    input.startFrom
      ? {
          method: "edit",
          prompt: editPrompt(input.startFrom.instruction),
          reference: input.startFrom.imageUrl,
          note: "Applying your revision",
        }
      : {
          method: "render",
          prompt: input.basePrompt,
          note: input.referenceImages.length ? "Rendering in your brand style" : "Rendering with Hy Image 3.5",
        };

  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    if (pass > 1 && Date.now() - startedAt + PASS_ESTIMATE_MS > WALL_BUDGET_MS) break;
    yield { ...base, phase: pass === 1 ? "rendering" : "refining", pass, note: next.note };

    let image: GeneratedImage;
    try {
      image = await generateHyImage(
        {
          prompt: next.prompt,
          size: input.size,
          // Edits reference the previous render only; fresh renders carry the brand-kit references.
          referenceImages: next.reference ? [next.reference] : input.referenceImages,
        },
        withTimeout(input.signal, next.method === "edit" ? EDIT_TIMEOUT_MS : RENDER_TIMEOUT_MS),
      );
    } catch (error) {
      if (input.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      passes.push({ pass, method: next.method, error: message });
      if (next.method === "edit") {
        // Reference edits fail upstream for some images; fall back to a full render with the fixes folded in.
        const fixes = best?.review ? describeFixes(best.review) : "";
        const revision = input.startFrom && !best ? `\n\nREVISION: ${input.startFrom.instruction}` : "";
        next = {
          method: "render",
          prompt: `${input.basePrompt}${revision}${fixes ? `\n\nCORRECTIONS (get these exactly right):\n${fixes}` : ""}`,
          note: "Re-rendering with corrections",
        };
        continue;
      }
      if (pass === MAX_PASSES && !best) throw error;
      continue;
    }

    yield { ...base, phase: "checking", pass, note: "Fact-checking every label" };
    const candidate: Candidate = { image, prompt: next.prompt };
    try {
      candidate.review = await reviewInfographic(
        { imageUrl: image.url, textContract: input.textContract, dataSummary: input.dataSummary },
        withTimeout(input.signal, 60_000),
      );
    } catch (error) {
      if (input.signal?.aborted) throw error;
      candidate.reviewError = error instanceof Error ? error.message : String(error);
    }
    passes.push({
      pass,
      method: next.method,
      verdict: candidate.review?.verdict,
      score: candidate.review?.score,
      factualIssues: candidate.review ? factualIssues(candidate.review) : undefined,
    });
    if (isBetter(candidate, best)) best = candidate;

    const review = candidate.review;
    if (!review || review.verdict === "publish") break;

    const fixCount = factualIssues(review);
    // A few wrong labels are a surgical edit; many mean the render went off the rails, and a
    // fresh render with the corrections spelled out beats patching it.
    next =
      fixCount <= MAX_EDITABLE_ISSUES
        ? {
            method: "edit",
            prompt: editPrompt(review.editInstruction || describeFixes(review)),
            reference: image.url,
            note: `Correcting ${fixCount} ${fixCount === 1 ? "label" : "labels"}`,
          }
        : {
            method: "render",
            prompt: `${input.basePrompt}${input.startFrom ? `\n\nREVISION: ${input.startFrom.instruction}` : ""}\n\nCORRECTIONS (a previous render got these wrong; get them exactly right):\n${describeFixes(review)}`,
            note: "Re-rendering with corrections",
          };
  }

  if (!best) throw new Error("No render completed within the time budget.");

  const draft: Draft = saveDraft({
    imageUrl: best.image.url,
    size: input.size,
    basePrompt: input.startFrom ? `${input.basePrompt}\n\nREVISION: ${input.startFrom.instruction}` : input.basePrompt,
    referenceImages: input.referenceImages,
    fileName: input.fileName,
    textContract: input.textContract,
    dataSummary: input.dataSummary,
    parentId: input.startFrom?.parentId,
  });

  yield {
    ...base,
    phase: "done",
    pass: passes.length,
    draftId: draft.id,
    fileName: draft.fileName,
    parentId: draft.parentId,
    imageUrl: best.image.url,
    width: best.image.width,
    height: best.image.height,
    prompt: best.prompt,
    review: best.review,
    reviewError: best.reviewError,
    passes,
  };
}

export function summarizeForModel(result: RenderResult): string {
  if (!result.imageUrl) return "Render did not complete.";
  const lines = [
    `Draft ${result.draftId} delivered (${result.width}x${result.height}) after ${result.passes?.length ?? 1} internal render/check pass(es): ${result.imageUrl}`,
    "The image is already displayed to the user in the chat; do not embed it again. Only this final draft was shown; earlier passes were hidden.",
  ];
  const review = result.review;
  if (!review) {
    lines.push(`Vision review unavailable: ${result.reviewError ?? "unknown error"}.`);
    return lines.join("\n");
  }
  lines.push(`Final vision review: verdict=${review.verdict}, score=${review.score}/10.`);
  for (const item of review.wrongOrMissing) {
    lines.push(`- still wrong/missing: expected "${item.expected}", found "${item.found}"`);
  }
  for (const item of review.invented) lines.push(`- still invented: "${item}"`);
  for (const item of review.encodingIssues) lines.push(`- encoding: ${item}`);
  for (const item of review.designIssues) lines.push(`- design note: ${item}`);
  return lines.join("\n");
}
