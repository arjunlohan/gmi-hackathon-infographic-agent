import { defineWorkflowTool } from "eve/tools";
import { infographicSpecSchema } from "../lib/infographic";
import { qualityLoop, type RenderResult, summarizeForModel } from "../lib/render";
import { prepareStep } from "../lib/steps";

export default defineWorkflowTool({
  description:
    "Render a new infographic with Hy Image 3.5 (GMI Cloud) from a structured spec. Internally runs render, fact-check and fix passes until every check passes (up to six) and shows the user only the final checked draft. Returns the draft id, image URL, and the final review. Every string in the spec is printed verbatim, so put only final, verified copy and data in it.",
  inputSchema: infographicSpecSchema,
  label: {
    start: ({ title }) => `Designing "${title}"`,
    delta: (_input, partial: RenderResult) => partial.note ?? "Rendering",
    complete: (_input, output: RenderResult) =>
      output.review
        ? `Draft ${output.draftId} · ${output.review.verdict === "publish" ? "fact-checked" : "needs attention"} (${output.review.checks.passed}/${output.review.checks.total} checks)`
        : `Draft ${output.draftId} rendered`,
  },
  async *execute(spec, ctx) {
    "use workflow";
    const prepared = await prepareStep(spec);
    if ("error" in prepared) throw new Error(prepared.error);
    const { prompt, ...compiled } = prepared.compiled;
    return yield* qualityLoop({
      ...compiled,
      basePrompt: prompt,
      policy: prepared.policy,
      sessionId: ctx.session.id,
      qaId: `${ctx.session.id}:${ctx.callId}`,
    });
  },
  toModelOutput(output: RenderResult) {
    return { type: "text", value: summarizeForModel(output) };
  },
});
