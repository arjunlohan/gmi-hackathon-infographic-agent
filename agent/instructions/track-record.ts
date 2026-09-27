// Tell the planner which chart forms Hy Image has actually been drawing correctly, from the QA
// record in Neon, so it picks forms that survive the fact-check instead of learning it the hard
// way in every chat.

import { defineDynamic, defineInstructions } from "eve/instructions";
import { formScoreboard } from "../lib/db";

let cache: { at: number; content: string | null } | undefined;
const TTL_MS = 5 * 60_000;

async function trackRecord(): Promise<string | null> {
  const rows = (await formScoreboard()).filter((row) => row.runs >= 2);
  if (rows.length === 0) return null;
  const lines = rows.map(
    (row) =>
      `- ${row.form}: ${row.clean} of ${row.runs} first renders passed every check; ${row.final} of ${row.runs} after the fix passes${row.rejected ? `; ${row.rejected} rated wrong by users` : ""}.`,
  );
  return [
    "# Chart forms: Hy Image track record (last 60 days, from the fact-check log)",
    ...lines,
    "When the story allows more than one form, prefer the one with the stronger record. Use a weak form only when the story needs it, and then keep it sparse: fewer items, short labels, no more than one callout.",
  ].join("\n");
}

export default defineDynamic({
  events: {
    "session.started": async () => {
      if (!cache || Date.now() - cache.at > TTL_MS) {
        try {
          cache = { at: Date.now(), content: await trackRecord() };
        } catch {
          cache = { at: Date.now(), content: null };
        }
      }
      return cache.content ? defineInstructions({ content: cache.content }) : null;
    },
  },
});
