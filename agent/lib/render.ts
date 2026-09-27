// Render, check, refine: one tool call runs the whole quality loop and reveals only the
// final draft. Partial snapshots carry progress but never an image, so the user never sees
// a draft that failed its fact-check.

import type { Draft } from "./drafts";
import type { GeneratedImage, HySize } from "./gmi";
import type { RenderMeta } from "./infographic";
import type { RenderPolicy } from "./policy";
import { type Box, type QaPlan, rankOf } from "./qa";
import type { Review } from "./review";
import { composeStep, preferStep, renderStep, reviewStep, saveDraftStep } from "./steps";

// The loop runs inside a durable workflow tool: every render, edit and review is its own step,
// so passes are bounded by usefulness, not by one function's time limit.
const MAX_PASSES = 6;
// Stop early when this many passes in a row failed to beat the best draft.
const MAX_STALE_PASSES = 3;
// More fixes than this in one edit, or any structural fix (row order, misplaced values), goes
// to a fresh render instead: editors patch and remove text well and re-lay out charts badly.
const MAX_EDITABLE_ISSUES = 3;

export type RenderPhase = "rendering" | "checking" | "refining" | "done";

export type PassSummary = {
  pass: number;
  method: "render" | "edit";
  imageUrl?: string;
  // The literal fix lines sent with an edit pass.
  instruction?: string;
  verdict?: Review["verdict"];
  score?: number;
  factualIssues?: number;
  checks?: Review["checks"];
  defects?: { kind: string; severity: number; expected?: string; found?: string }[];
  // Defect kinds this pass tried to fix, and which of them it did: the fix success rates the
  // render policy learns from.
  targets?: string[];
  resolved?: string[];
  // Pixel change outside the edited regions (0-1); an edit is meant to leave the rest alone.
  drift?: number;
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
  // The render before code-drawn connectors and rules were added.
  baseImageUrl?: string;
  width?: number;
  height?: number;
  prompt?: string;
  review?: Review;
  reviewError?: string;
  passes?: PassSummary[];
  // Links user feedback to the QA record of this tool call.
  qaId?: string;
  meta?: RenderMeta;
};

type Candidate = { image: GeneratedImage; prompt: string; review?: Review; reviewError?: string };

type NextPass = {
  method: "render" | "edit";
  prompt: string;
  reference?: string;
  reseed?: boolean;
  note: string;
  instruction?: string;
  targets?: string[];
};

function compare(a: Review, b: Review): number {
  const [x, y] = [rankOf(a), rankOf(b)];
  for (let index = 0; index < x.length; index += 1) {
    if (x[index] !== y[index]) return x[index] - y[index];
  }
  return 0;
}

function isBetter(next: Candidate, current: Candidate | undefined): boolean {
  if (!current) return true;
  if (!next.review || !current.review) return Boolean(next.review);
  return compare(next.review, current.review) > 0;
}

function fixLines(review: Review): string[] {
  return [...new Set(review.defects.map((defect) => defect.fix))];
}

const KEEP =
  "KEEP UNCHANGED: every other element exactly as it is: layout, canvas size, colors, typography, illustration, and all other text, spelled exactly as now.";

/**
 * Literal, atomic instructions: what to change, quoted old and new strings with a location, then
 * what to keep. Vague instructions ("fix the typo") make editors guess and drift.
 */
function editPrompt(lines: string[]): string {
  return ["Edit the reference infographic.", "CHANGE:", ...lines.map((line) => `- ${line}`), `${KEEP} Add no new text.`].join("\n");
}

/**
 * Body of the generate and edit workflow tools. Deterministic by design: every side effect
 * (render, review, compose) is a durable step, so the loop replays safely after a restart.
 */
export async function* qualityLoop(input: {
  // Full description of the graphic; used for fresh renders and as the fallback when an edit fails.
  basePrompt: string;
  size: HySize;
  qa: QaPlan;
  meta?: RenderMeta;
  referenceImages: string[];
  fileName: string;
  // Start from an existing image (user-requested revision) instead of a fresh render.
  startFrom?: { imageUrl: string; instruction: string; parentId: string };
  sessionId: string;
  qaId?: string;
  // Learned from past renders of this chart form.
  policy?: RenderPolicy;
}): AsyncGenerator<RenderResult> {
  const base = { size: input.size, maxPasses: MAX_PASSES };
  const passes: PassSummary[] = [];
  const reviewed: Candidate[] = [];
  const revision = input.startFrom ? `\n\nREVISION: ${input.startFrom.instruction}` : "";
  // The best draft so far. Every fix edits the anchor, never the latest attempt, so a bad edit
  // is simply discarded instead of compounding (chained edits drift turn over turn).
  let best: Candidate | undefined;
  let failedEdits = 0;
  let stale = 0;
  let next: NextPass = input.startFrom
    ? {
        method: "edit",
        prompt: `Edit the reference infographic. ${input.startFrom.instruction}\n${KEEP} Add no new text unless the change above asks for it.`,
        reference: input.startFrom.imageUrl,
        note: "Applying your revision",
        instruction: input.startFrom.instruction,
      }
    : {
        method: "render",
        prompt: input.basePrompt,
        note: input.referenceImages.length ? "Rendering in your brand style" : "Rendering with Hy Image 3.5",
      };

  const kindsOf = (review?: Review): string[] => [...new Set(review?.defects.map((defect) => defect.kind) ?? [])];
  const noEdit = new Set<string>(input.policy?.noEdit ?? []);
  const rerender = (review?: Review): NextPass => ({
    method: "render",
    targets: kindsOf(review),
    prompt: `${input.basePrompt}${revision}${
      review?.defects.length
        ? `\n\nCORRECTIONS (a previous render got these wrong; get them exactly right):\n${review.defects.map((defect) => `- ${defect.message} ${defect.fix}`).join("\n")}`
        : ""
    }`,
    note: "Re-rendering with corrections",
  });

  for (let pass = 1; pass <= MAX_PASSES && stale < MAX_STALE_PASSES; pass += 1) {
    yield { ...base, phase: pass === 1 ? "rendering" : "refining", pass, note: next.note };

    const rendered = await renderStep({
      prompt: next.prompt,
      size: input.size,
      // Edits reference the anchor only; fresh renders carry the brand-kit references.
      referenceImages: next.reference ? [next.reference] : input.referenceImages,
      edit: next.method === "edit",
      reseed: Boolean(next.reseed),
    });
    if ("error" in rendered) {
      passes.push({ pass, method: next.method, instruction: next.instruction, targets: next.targets, error: rendered.error });
      stale += 1;
      // Reference edits fail upstream for some images; fall back to a full render with the fixes folded in.
      if (next.method === "edit") next = rerender(best?.review);
      continue;
    }

    yield { ...base, phase: "checking", pass, note: "Fact-checking every label" };
    const anchor = best;
    const editedAnchor = next.method === "edit" && anchor !== undefined && next.reference === anchor.image.url;
    const checked = await reviewStep({
      imageUrl: rendered.image.url,
      plan: input.qa,
      anchor: editedAnchor
        ? {
            imageUrl: anchor.image.url,
            boxes: (anchor.review?.defects.flatMap((defect) => (defect.box ? [defect.box] : [])) ?? []) as Box[],
          }
        : undefined,
    });
    const candidate: Candidate = {
      image: rendered.image,
      prompt: next.prompt,
      review: checked.review,
      reviewError: checked.error,
    };
    const review = checked.review;
    passes.push({
      pass,
      method: next.method,
      imageUrl: rendered.image.url,
      instruction: next.instruction,
      verdict: review?.verdict,
      score: review?.score,
      factualIssues: review?.defects.length,
      checks: review?.checks,
      defects: review?.defects.map(({ kind, severity, expected, found }) => ({ kind, severity, expected, found })),
      targets: next.targets,
      resolved: review && next.targets ? next.targets.filter((kind) => !kindsOf(review).includes(kind)) : undefined,
      drift: checked.drift,
    });
    if (review) reviewed.push(candidate);

    if (isBetter(candidate, best)) {
      best = candidate;
      failedEdits = 0;
      stale = 0;
    } else {
      stale += 1;
      if (editedAnchor) failedEdits += 1;
    }

    if (!best?.review || best.review.verdict === "publish") break;

    // Escalate instead of repeating: an edit that failed twice from the same anchor, or fixes an
    // editor cannot make, go to a fresh render with every correction spelled out.
    const target = best.review;
    const lines = fixLines(target);
    // Structural fixes, and fixes this chart form's record says editors rarely manage, re-render.
    const structural = target.defects.some((defect) => defect.structural || noEdit.has(defect.kind));
    if (structural || lines.length > MAX_EDITABLE_ISSUES || failedEdits >= 2) {
      next = rerender(target);
      failedEdits = 0;
    } else {
      next = {
        method: "edit",
        prompt: editPrompt(lines),
        reference: best.image.url,
        reseed: failedEdits > 0,
        note: `Correcting ${lines.length} ${lines.length === 1 ? "issue" : "issues"}`,
        instruction: lines.join("\n"),
        targets: kindsOf(target),
      };
    }
  }

  if (!best) {
    const last = passes.findLast((pass) => pass.error)?.error;
    throw new Error(`Every render attempt failed${last ? ` (last error: ${last})` : ""}. Hy Image may be unavailable; try again shortly.`);
  }

  // Two drafts with the same defects and grade: ask which is more polished, in both orders.
  const rival = reviewed.find(
    (candidate) =>
      candidate !== best && candidate.review && best?.review && compare(candidate.review, best.review) === 0,
  );
  if (rival) {
    const choice = await preferStep(best.image.url, rival.image.url);
    if (choice === "b") best = rival;
  }

  // Connectors and benchmark rules are drawn by code where the checker found their anchors.
  let finalImage = { url: best.image.url, width: best.image.width, height: best.image.height };
  const review = best.review;
  if (review) {
    yield { ...base, phase: "checking", pass: passes.length, note: "Drawing connectors" };
    const composed = await composeStep({ imageUrl: best.image.url, review, plan: input.qa, name: input.fileName });
    if (composed && "url" in composed) finalImage = composed;
    else if (composed) review.designIssues.push(`Connectors could not be drawn: ${composed.error}`);
  }

  const draft: Draft = await saveDraftStep(input.sessionId, {
    imageUrl: finalImage.url,
    baseImageUrl: best.image.url,
    size: input.size,
    basePrompt: input.startFrom ? `${input.basePrompt}${revision}` : input.basePrompt,
    referenceImages: input.referenceImages,
    fileName: input.fileName,
    qa: input.qa,
    meta: input.meta,
    parentId: input.startFrom?.parentId,
  });

  yield {
    ...base,
    phase: "done",
    pass: passes.length,
    draftId: draft.id,
    fileName: draft.fileName,
    parentId: draft.parentId,
    imageUrl: finalImage.url,
    baseImageUrl: best.image.url,
    width: finalImage.width,
    height: finalImage.height,
    prompt: best.prompt,
    review,
    reviewError: best.reviewError,
    passes,
    qaId: input.qaId,
    meta: input.meta,
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
  lines.push(
    `Final check: verdict=${review.verdict}, ${review.checks.passed}/${review.checks.total} checks passed, design ${review.score}/10.`,
  );
  for (const defect of review.defects) lines.push(`- still wrong (${defect.kind}): ${defect.message}`);
  for (const item of review.designIssues) lines.push(`- design note: ${item}`);
  return lines.join("\n");
}
