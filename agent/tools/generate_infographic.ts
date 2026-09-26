import { defineTool } from "eve/tools";
import { getBrandKit } from "../lib/brand-kits";
import { compileInfographic, infographicSpecSchema } from "../lib/infographic";
import { type RenderResult, renderWithQualityLoop, summarizeForModel } from "../lib/render";

export default defineTool({
  description:
    "Render a new infographic with Hy Image 3.5 (GMI Cloud) from a structured spec. Internally runs up to three render, fact-check and fix passes and shows the user only the final checked draft. Returns the draft id, image URL, and the final review. Every string in the spec is printed verbatim, so put only final, verified copy and data in it.",
  inputSchema: infographicSpecSchema,
  label: {
    start: ({ title }) => `Designing "${title}"`,
    delta: (_input, partial: RenderResult) => partial.note ?? "Rendering",
    complete: (_input, output: RenderResult) =>
      output.review
        ? `Draft ${output.draftId} · ${output.review.verdict === "publish" ? "fact-checked" : "needs attention"} (${output.review.score}/10)`
        : `Draft ${output.draftId} rendered`,
  },
  async *execute(spec, ctx) {
    const kit = spec.brandKitId ? await getBrandKit(spec.brandKitId) : undefined;
    if (spec.brandKitId && !kit) throw new Error(`Brand kit "${spec.brandKitId}" was not found.`);
    const { prompt, ...compiled } = compileInfographic(spec, kit);
    yield* renderWithQualityLoop({ ...compiled, basePrompt: prompt, signal: ctx.abortSignal });
  },
  toModelOutput(output) {
    return { type: "text", value: summarizeForModel(output) };
  },
});
