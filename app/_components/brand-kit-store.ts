"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { BrandKit, BrandKitInput } from "@/agent/lib/brand-kits";

export type { BrandKit, BrandKitInput };

type State = { kits: BrandKit[]; status: "idle" | "loading" | "ready" | "error" };

let state: State = { kits: [], status: "idle" };
const listeners = new Set<() => void>();
const SERVER_STATE: State = { kits: [], status: "idle" };

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export async function refreshBrandKits() {
  set({ status: state.kits.length ? state.status : "loading" });
  try {
    const { kits } = await readJson<{ kits: BrandKit[] }>(await fetch("/api/brand-kits"));
    set({ kits, status: "ready" });
  } catch {
    set({ status: "error" });
  }
}

export function useBrandKits(): State {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => SERVER_STATE,
  );
  useEffect(() => {
    if (state.status === "idle") void refreshBrandKits();
  }, []);
  return snapshot;
}

export async function saveBrandKit(input: BrandKitInput, id?: string): Promise<BrandKit> {
  const { kit } = await readJson<{ kit: BrandKit }>(
    await fetch(id ? `/api/brand-kits/${id}` : "/api/brand-kits", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  set({ kits: [kit, ...state.kits.filter((existing) => existing.id !== kit.id)] });
  return kit;
}

export async function deleteBrandKit(id: string) {
  await readJson(await fetch(`/api/brand-kits/${id}`, { method: "DELETE" }));
  set({ kits: state.kits.filter((kit) => kit.id !== id) });
}

export async function uploadBrandAsset(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { url } = await readJson<{ url: string }>(
    await fetch("/api/brand-kits/upload", { method: "POST", body: form }),
  );
  return url;
}
