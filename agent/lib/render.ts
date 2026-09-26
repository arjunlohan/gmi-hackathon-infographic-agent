// Shared render-then-review pipeline for generate_infographic and edit_infographic.

import type { Draft } from "./drafts";
import { saveDraft } from "./drafts";
import { generateHyImage, type HySize } from "./gmi";
import { type Review, reviewInfographic } from "./review";

export type RenderPhase = "rendering" | "reviewing" | "done";

// The UI renders this shape directly (see app/_components/infographic-card.tsx).
export type RenderResult = {
  phase: RenderPhase;
  draftId?: string;
  parentId?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  size: HySize;
  prompt: string;
  review?: Review;
  reviewError?: string;
};

export async function* renderAndReview(input: {
  prompt: string;
  size: HySize;
  textContract: string[];
  dataSummary: string;
  referenceImages?: string[];
  parentId?: string;
  signal?: AbortSignal;
}): AsyncGenerator<RenderResult> {
  const base = { size: input.size, prompt: input.prompt, parentId: input.parentId };
  yield { ...base, phase: "rendering" };

  const image = await generateHyImage(
    { prompt: input.prompt, size: input.size, referenceImages: input.referenceImages },
    input.signal,
  );
  const draft: Draft = saveDraft({
    imageUrl: image.url,
    size: input.size,
    prompt: input.prompt,
    textContract: input.textContract,
    dataSummary: input.dataSummary,
    parentId: input.parentId,
  });
  const rendered = {
    ...base,
    draftId: draft.id,
    imageUrl: image.url,
    width: image.width,
    height: image.height,
  };
  yield { ...rendered, phase: "reviewing" };

  try {
    const review = await reviewInfographic(
      { imageUrl: image.url, textContract: input.textContract, dataSummary: input.dataSummary },
      input.signal,
    );
    yield { ...rendered, phase: "done", review };
  } catch (error) {
    yield {
      ...rendered,
      phase: "done",
      reviewError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function summarizeForModel(result: RenderResult): string {
  if (!result.imageUrl) return "Render did not complete.";
  const lines = [
    `Draft ${result.draftId} rendered (${result.width}x${result.height}): ${result.imageUrl}`,
    "The image is already displayed to the user in the chat; do not embed it again.",
  ];
  const review = result.review;
  if (!review) {
    lines.push(`Vision review unavailable: ${result.reviewError ?? "unknown error"}.`);
    return lines.join("\n");
  }
  lines.push(`Vision review: verdict=${review.verdict}, score=${review.score}/10.`);
  for (const item of review.wrongOrMissing) {
    lines.push(`- wrong/missing: expected "${item.expected}", found "${item.found}"`);
  }
  for (const item of review.invented) lines.push(`- invented text: "${item}"`);
  for (const item of review.encodingIssues) lines.push(`- encoding: ${item}`);
  for (const item of review.designIssues) lines.push(`- design: ${item}`);
  if (review.editInstruction) lines.push(`Suggested edit: ${review.editInstruction}`);
  return lines.join("\n");
}
