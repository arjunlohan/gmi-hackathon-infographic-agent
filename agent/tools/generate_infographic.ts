import { defineTool } from "eve/tools";
import { compileInfographic, infographicSpecSchema } from "../lib/infographic";
import { type RenderResult, renderAndReview, summarizeForModel } from "../lib/render";

export default defineTool({
  description:
    "Render a new infographic with Hy Image 3.5 (GMI Cloud) from a structured spec, then fact-check the render with a vision review. Returns a draft id, the image URL, and the review. Every string in the spec is printed verbatim, so put only final, verified copy and data in it.",
  inputSchema: infographicSpecSchema,
  label: {
    start: ({ title }) => `Designing "${title}"`,
    delta: (_input, partial: RenderResult) =>
      partial.phase === "rendering"
        ? "Rendering with Hy Image 3.5"
        : "Fact-checking every label with Muse Spark vision",
    complete: (_input, output: RenderResult) =>
      output.review
        ? `Draft ${output.draftId} · review ${output.review.verdict} (${output.review.score}/10)`
        : `Draft ${output.draftId} rendered`,
  },
  async *execute(spec, ctx) {
    const compiled = compileInfographic(spec);
    yield* renderAndReview({ ...compiled, signal: ctx.abortSignal });
  },
  toModelOutput(output) {
    return { type: "text", value: summarizeForModel(output) };
  },
});
