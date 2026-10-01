import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { qualityLoop, type RenderResult, summarizeForModel } from "../lib/render";
import { loadDraftStep } from "../lib/steps";

export default defineWorkflowTool({
  description:
    "Apply a small visual revision the user asked for to an existing draft (recolor an element, move or remove a callout, adjust a detail) using Hy Image 3.5 reference-guided editing, then run the same fact-check and fix loop. For wording, data, headline, format or style changes, use generate_infographic instead.",
  inputSchema: z.object({
    draftId: z.string().describe("Draft to revise, e.g. 'v1'"),
    instruction: z
      .string()
      .describe(
        "Precise visual change, quoting exact strings where relevant, e.g. 'Make the highlighted bar deep green. Keep every other element identical.'",
      ),
  }),
  label: {
    start: ({ draftId }) => `Revising draft ${draftId}`,
    delta: (_input, partial: RenderResult) => partial.note ?? "Rendering",
    complete: (_input, output: RenderResult) =>
      output.review
        ? `Draft ${output.draftId} · ${output.review.verdict === "publish" ? "fact-checked" : "needs attention"} (${output.review.checks.passed}/${output.review.checks.total} checks)`
        : `Draft ${output.draftId} rendered`,
  },
  async *execute({ draftId, instruction }, ctx) {
    "use workflow";
    const loaded = await loadDraftStep(ctx.session.id, draftId);
    if ("error" in loaded) throw new Error(loaded.error);
    const parent = loaded.draft;
    return yield* qualityLoop({
      basePrompt: parent.basePrompt,
      size: parent.size,
      qa: loaded.plan,
      policy: loaded.policy,
      meta: parent.meta,
      referenceImages: parent.referenceImages ?? [],
      fileName: parent.fileName ?? "infographic",
      // Revise the render itself, without any code-drawn overlay.
      startFrom: { imageUrl: parent.baseImageUrl ?? parent.imageUrl, instruction, parentId: parent.id },
      sessionId: ctx.session.id,
      qaId: `${ctx.session.id}:${ctx.callId}`,
    });
  },
  toModelOutput(output: RenderResult) {
    return { type: "text", value: summarizeForModel(output) };
  },
});
