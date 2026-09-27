// Rendered drafts of a chat, so edits can reuse the original spec, QA plan and render without
// the model copying the spec around. Stored in Neon per chat because the render tools run as
// durable workflows, whose steps have no access to in-memory session state.

import { findDraft, insertDraft } from "./db";
import type { HySize } from "./gmi";
import type { RenderMeta } from "./infographic";
import { type CalloutCheck, legacyPlan, type QaPlan } from "./qa";

export type Draft = {
  id: string;
  imageUrl: string;
  // The render without code-drawn connectors; user revisions edit this one and redraw them.
  baseImageUrl?: string;
  size: HySize;
  // Full description of the graphic (compiled spec plus any revisions), reused for re-renders.
  basePrompt: string;
  // Brand-kit style references reused by fresh renders of this graphic.
  referenceImages: string[];
  fileName: string;
  // What the reviewer checks every re-render and edit of this graphic against.
  qa?: QaPlan;
  meta?: RenderMeta;
  parentId?: string;
  // Drafts saved before the structured QA plan; read through draftPlan().
  textContract?: string[];
  callouts?: CalloutCheck[];
};

export async function saveDraft(sessionId: string, draft: Omit<Draft, "id">): Promise<Draft> {
  const seq = await insertDraft(sessionId, draft);
  return { ...draft, id: `v${seq}` };
}

export async function getDraft(sessionId: string, id: string): Promise<Draft> {
  const seq = Number(id.replace(/^v/i, ""));
  const found = Number.isInteger(seq) ? await findDraft(sessionId, seq) : { known: [] };
  if ("data" in found) return found.data as Draft;
  const known = found.known.map((n) => `v${n}`).join(", ");
  throw new Error(`Unknown draft "${id}". Known drafts: ${known || "none yet"}.`);
}

/** The QA plan of a draft, rebuilt from the plain string list for drafts saved before it existed. */
export function draftPlan(draft: Draft): QaPlan {
  return draft.qa ?? legacyPlan(draft.textContract ?? [], draft.callouts);
}
