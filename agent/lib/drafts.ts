// Per-session memory of rendered drafts, so edits can reuse the original text contract
// and reference the previous render without the model copying the spec around.

import { defineState } from "eve/context";
import type { HySize } from "./gmi";
import type { CalloutCheck } from "./infographic";

export type Draft = {
  id: string;
  imageUrl: string;
  size: HySize;
  // Full description of the graphic (compiled spec plus any revisions), reused for re-renders.
  basePrompt: string;
  // Brand-kit style references reused by fresh renders of this graphic.
  referenceImages: string[];
  fileName: string;
  textContract: string[];
  dataSummary: string;
  callouts?: CalloutCheck[];
  parentId?: string;
};

export const drafts = defineState("infographic.drafts", () => ({
  counter: 0,
  byId: {} as Record<string, Draft>,
}));

export function saveDraft(draft: Omit<Draft, "id">): Draft {
  const id = `v${drafts.get().counter + 1}`;
  const saved = { ...draft, id };
  drafts.update((state) => ({
    counter: state.counter + 1,
    byId: { ...state.byId, [id]: saved },
  }));
  return saved;
}

export function getDraft(id: string): Draft {
  const draft = drafts.get().byId[id];
  if (!draft) {
    const known = Object.keys(drafts.get().byId).join(", ") || "none yet";
    throw new Error(`Unknown draft "${id}". Known drafts: ${known}.`);
  }
  return draft;
}
