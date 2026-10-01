// The learning half of the flywheel: turn the track record of past renders into rules for the
// next one. No model decides these; they are counts. A defect Hy keeps making on a chart form
// becomes a warning in the prompt, and a fix that keeps failing stops being attempted.

import type { FormTrackRecord } from "./db";

export type RenderPolicy = {
  // Printed into the render prompt as known failure modes of this chart form.
  warnings: string[];
  // Defect kinds whose edits rarely work here; they go straight to a fresh render.
  noEdit: string[];
  // Evidence behind the rules, for logs and the agent.
  basis: string;
};

const MIN_RUNS = 3;
const WARN_RATE = 0.3;
const MIN_EDIT_ATTEMPTS = 4;
const EDIT_GIVE_UP_RATE = 0.25;

const WARNING: Record<string, string> = {
  misspelled: "Words and numbers get misspelled: copy every quoted string letter by letter and digit by digit.",
  missing: "Quoted strings get dropped: every quoted string must appear, including small footer text.",
  invented: "Extra text appears: print nothing that is not quoted, no invented labels, numbers or logos.",
  malformed: "Letters come out broken: keep all type crisp, fully formed and large enough to read.",
  misplaced: "Values land on the wrong row: each value sits on the same row as its own label.",
  order: "Rows come out of order: keep the items in exactly the order listed.",
  magnitude: "Mark sizes drift from the data: every bar, column, tile or segment strictly proportional to its value.",
  callout: "Callout pointers land on the wrong item: draw callouts with no pointer, arrow or leader line at all.",
  encoding: "Stray average or threshold lines appear: draw no reference lines of any kind.",
};

export const EMPTY_POLICY: RenderPolicy = { warnings: [], noEdit: [], basis: "no track record yet" };

export function policyFrom(record: FormTrackRecord): RenderPolicy {
  if (record.runs < MIN_RUNS) return { ...EMPTY_POLICY, basis: `${record.runs} past ${record.form} renders` };
  const warnings = Object.entries(record.firstPassKinds)
    .filter(([kind, rate]) => rate >= WARN_RATE && WARNING[kind])
    .sort((a, b) => b[1] - a[1])
    // Rates stay out of the prompt: numbers in the render prompt can end up printed on the graphic.
    .map(([kind]) => WARNING[kind]);
  const noEdit = Object.entries(record.fixes)
    .filter(([key, stat]) => key.startsWith("edit:") && stat.attempts >= MIN_EDIT_ATTEMPTS && stat.fixed / stat.attempts < EDIT_GIVE_UP_RATE)
    .map(([key]) => key.slice("edit:".length));
  return {
    warnings,
    noEdit,
    basis: `${record.runs} past ${record.form} renders, ${Math.round(record.firstPassClean * 100)}% clean on the first pass`,
  };
}
