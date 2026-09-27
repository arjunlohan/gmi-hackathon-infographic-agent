// Capture every finished render and its full QA trail (per-pass defects, edit instructions,
// drift, final checks) so reviews feed the next generation instead of vanishing with the chat.

import { defineHook } from "eve/hooks";
import type { RenderResult } from "../lib/render";
import { saveQaRun } from "../lib/qa-log";

const RENDER_TOOLS = new Set(["generate_infographic", "edit_infographic"]);

export default defineHook({
  events: {
    async "action.result"(event, ctx) {
      try {
        // The render tools are durable workflow tools, which toolResultFrom does not narrow;
        // match the tool-result action by name instead.
        const result = event.data.result;
        if (result.kind !== "tool-result" || result.isError || !RENDER_TOOLS.has(result.toolName)) return;
        const output = result.output as RenderResult | null;
        if (output?.phase !== "done") return;
        await saveQaRun({
          qaId: output.qaId ?? `${ctx.session.id}:${result.callId}`,
          sessionId: ctx.session.id,
          principalId: ctx.session.auth.current?.principalId,
          tool: result.toolName,
          meta: output.meta,
          verdict: output.review?.verdict,
          checks: output.review?.checks,
          passes: output.passes ?? [],
          output,
        });
      } catch (error) {
        // Logging must never fail the user's turn.
        console.error("qa-capture failed", error);
      }
    },
  },
});
