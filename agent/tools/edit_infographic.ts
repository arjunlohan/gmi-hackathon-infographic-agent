import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDraft } from "../lib/drafts";
import { type RenderResult, renderAndReview, summarizeForModel } from "../lib/render";

export default defineTool({
  description:
    "Make a targeted fix to an existing draft with Hy Image 3.5 reference-guided editing (fix a wrong number, remove invented text, restyle a detail), then re-run the vision review against the original text contract. Use this for small corrections; use generate_infographic for a new layout, chart form, or format.",
  inputSchema: z.object({
    draftId: z.string().describe("Draft to edit, e.g. 'v1'"),
    instruction: z
      .string()
      .describe(
        "Precise edit, quoting exact strings. Say what to change and what must stay, e.g. 'Replace the value \"14.9M\" beside Canada with \"14.4M\". Keep every other element identical.'",
      ),
  }),
  label: {
    start: ({ draftId }) => `Editing draft ${draftId}`,
    delta: (_input, partial: RenderResult) =>
      partial.phase === "rendering"
        ? "Applying edit with Hy Image 3.5"
        : "Fact-checking the edit with Muse Spark vision",
    complete: (_input, output: RenderResult) =>
      output.review
        ? `Draft ${output.draftId} · review ${output.review.verdict} (${output.review.score}/10)`
        : `Draft ${output.draftId} rendered`,
  },
  async *execute({ draftId, instruction }, ctx) {
    const parent = getDraft(draftId);
    const prompt = [
      `Edit the reference infographic. ${instruction}`,
      "Keep everything else identical: layout, canvas size, colors, typography, illustration, and every other piece of text, spelled exactly as it is. Do not add any new text.",
    ].join("\n");
    yield* renderAndReview({
      prompt,
      size: parent.size,
      textContract: parent.textContract,
      dataSummary: parent.dataSummary,
      referenceImages: [parent.imageUrl],
      parentId: parent.id,
      signal: ctx.abortSignal,
    });
  },
  toModelOutput(output) {
    return { type: "text", value: summarizeForModel(output) };
  },
});
