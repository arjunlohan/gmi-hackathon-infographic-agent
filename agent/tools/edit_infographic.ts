import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDraft } from "../lib/drafts";
import { type RenderResult, renderWithQualityLoop, summarizeForModel } from "../lib/render";

export default defineTool({
  description:
    "Apply a small visual revision the user asked for to an existing draft (recolor an element, move or remove a callout, adjust a detail) using Hy Image 3.5 reference-guided editing, then run the same fact-check and fix loop. For wording, data, headline, format or style changes, use generate_infographic instead.",
  inputSchema: z.object({
    draftId: z.string().describe("Draft to revise, e.g. 'v1'"),
    instruction: z
      .string()
      .describe(
        "Precise visual change, quoting exact strings where relevant, e.g. 'Make the Russia bar deep green. Keep every other element identical.'",
      ),
  }),
  label: {
    start: ({ draftId }) => `Revising draft ${draftId}`,
    delta: (_input, partial: RenderResult) => partial.note ?? "Rendering",
    complete: (_input, output: RenderResult) =>
      output.review
        ? `Draft ${output.draftId} · ${output.review.verdict === "publish" ? "fact-checked" : "needs attention"} (${output.review.score}/10)`
        : `Draft ${output.draftId} rendered`,
  },
  async *execute({ draftId, instruction }, ctx) {
    const parent = getDraft(draftId);
    yield* renderWithQualityLoop({
      basePrompt: parent.basePrompt,
      size: parent.size,
      textContract: parent.textContract,
      dataSummary: parent.dataSummary,
      startFrom: { imageUrl: parent.imageUrl, instruction, parentId: parent.id },
      signal: ctx.abortSignal,
    });
  },
  toModelOutput(output) {
    return { type: "text", value: summarizeForModel(output) };
  },
});
