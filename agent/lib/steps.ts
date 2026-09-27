// Durable steps of the render loop. Each runs as its own step of an eve workflow tool, so a
// multi-pass render is not bound by one function's time limit, and a crash resumes from the last
// finished step. Steps return errors as values: a failed render or edit is information for the
// loop's next decision, not a reason to retry the same call blindly.

import { getBrandKit } from "./brand-kits";
import { composeOverlay, planOverlay } from "./compose";
import { formTrackRecord } from "./db";
import { type Draft, draftPlan, getDraft, saveDraft } from "./drafts";
import { type GeneratedImage, generateHyImage, type HySize } from "./gmi";
import { type CompiledInfographic, compileInfographic, type InfographicSpec } from "./infographic";
import { EMPTY_POLICY, policyFrom, type RenderPolicy } from "./policy";
import type { Box, QaPlan } from "./qa";
import { driftOutside, preferPolished, type Review, reviewInfographic } from "./review";

const RENDER_TIMEOUT_MS = 110_000;
// Reference edits normally finish in 30-40s; when they fail upstream they hang for 2+ minutes.
const EDIT_TIMEOUT_MS = 70_000;
const REVIEW_TIMEOUT_MS = 90_000;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What past renders of this chart form teach; an empty policy when there is no record yet. */
async function learnedPolicy(form: string | undefined): Promise<RenderPolicy> {
  if (!form) return EMPTY_POLICY;
  try {
    return policyFrom(await formTrackRecord(form));
  } catch {
    return EMPTY_POLICY; // learning is an improvement, never a reason to fail a render
  }
}

function withWarnings(prompt: string, policy: RenderPolicy): string {
  if (policy.warnings.length === 0) return prompt;
  return `${prompt}\n\nKNOWN PROBLEMS ON THIS CHART FORM (learned from ${policy.basis}); avoid every one:\n${policy.warnings.map((line) => `- ${line}`).join("\n")}`;
}

export async function prepareStep(
  spec: InfographicSpec,
): Promise<{ compiled: CompiledInfographic; policy: RenderPolicy } | { error: string }> {
  "use step";
  try {
    const kit = spec.brandKitId ? await getBrandKit(spec.brandKitId) : undefined;
    if (spec.brandKitId && !kit) return { error: `Brand kit "${spec.brandKitId}" was not found.` };
    const compiled = compileInfographic(spec, kit);
    const policy = await learnedPolicy(compiled.meta.form);
    return { compiled: { ...compiled, prompt: withWarnings(compiled.prompt, policy) }, policy };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function renderStep(input: {
  prompt: string;
  size: HySize;
  referenceImages: string[];
  edit: boolean;
  reseed: boolean;
}): Promise<{ image: GeneratedImage } | { error: string }> {
  "use step";
  try {
    const image = await generateHyImage(
      {
        prompt: input.prompt,
        size: input.size,
        referenceImages: input.referenceImages,
        // A retried edit gets a new seed rather than the same outcome.
        seed: input.reseed ? 1 + Math.floor(Math.random() * 2_000_000_000) : undefined,
      },
      AbortSignal.timeout(input.edit ? EDIT_TIMEOUT_MS : RENDER_TIMEOUT_MS),
    );
    return { image };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function reviewStep(input: {
  imageUrl: string;
  plan: QaPlan;
  // For edits: the draft that was edited, to measure how much else changed.
  anchor?: { imageUrl: string; boxes: Box[] };
}): Promise<{ review?: Review; error?: string; drift?: number }> {
  "use step";
  const [review, drift] = await Promise.all([
    reviewInfographic({ imageUrl: input.imageUrl, plan: input.plan }, AbortSignal.timeout(REVIEW_TIMEOUT_MS)).then(
      (value) => ({ review: value }),
      (error: unknown) => ({ error: message(error) }),
    ),
    input.anchor
      ? driftOutside(input.anchor.imageUrl, input.imageUrl, input.anchor.boxes).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);
  return { ...review, drift };
}

export async function preferStep(a: string, b: string): Promise<"a" | "b" | undefined> {
  "use step";
  return preferPolished(a, b, AbortSignal.timeout(40_000)).catch(() => undefined);
}

/** Draw callout connectors and the benchmark rule onto the chosen render, when it needs any. */
export async function composeStep(input: {
  imageUrl: string;
  review: Review;
  plan: QaPlan;
  name: string;
}): Promise<{ url: string; width: number; height: number } | { error: string } | undefined> {
  "use step";
  const overlay = planOverlay(input.review, input.plan);
  if (overlay.lines.length === 0) return undefined;
  try {
    return await composeOverlay(input.imageUrl, overlay, input.name);
  } catch (error) {
    return { error: message(error) };
  }
}

export async function saveDraftStep(sessionId: string, draft: Omit<Draft, "id">): Promise<Draft> {
  "use step";
  try {
    return await saveDraft(sessionId, draft);
  } catch (error) {
    // The render still reaches the user; only later revisions of it need the stored draft.
    console.error("saving draft failed", error);
    return { ...draft, id: "unsaved" };
  }
}

/** A draft with its QA plan resolved, or the reason it cannot be revised. */
export async function loadDraftStep(
  sessionId: string,
  draftId: string,
): Promise<{ draft: Draft; plan: QaPlan; policy: RenderPolicy } | { error: string }> {
  "use step";
  try {
    const draft = await getDraft(sessionId, draftId);
    return { draft, plan: draftPlan(draft), policy: await learnedPolicy(draft.meta?.form) };
  } catch (error) {
    return { error: message(error) };
  }
}
