"use client";

import type { EveMessage } from "eve/react";
import { useEffect, useSyncExternalStore } from "react";

// eve has no session-listing API, so the sidebar keeps a per-browser index of chats.
// Conversation content itself stays durable on the server; this only remembers how to get
// back to it, plus sidebar metadata (title, favorite, trash, selected brand kit).
const STORAGE_KEY = "plate.chats.v1";
const LEGACY_KEY = "plate.history.v1";
const MAX_ENTRIES = 200;
const SEARCH_TEXT_LIMIT = 4000;

export type ChatEntry = {
  sessionId: string;
  title: string;
  titleSource: "prompt" | "ai" | "user";
  searchText: string;
  thumbnailUrl?: string;
  favorite?: boolean;
  trashedAt?: number;
  brandKitId?: string;
  createdAt: number;
  updatedAt: number;
};

const listeners = new Set<() => void>();
let cache: ChatEntry[] | undefined;
const EMPTY: ChatEntry[] = [];

function load(): ChatEntry[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cache = JSON.parse(raw) as ChatEntry[];
    } else {
      // One-time migration from the earlier History panel.
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]") as {
        sessionId: string;
        title: string;
        updatedAt: number;
        thumbnailUrl?: string;
      }[];
      cache = legacy.map((entry) => ({
        ...entry,
        titleSource: "prompt",
        searchText: entry.title,
        createdAt: entry.updatedAt,
      }));
    }
  } catch {
    cache = [];
  }
  return cache;
}

function save(entries: ChatEntry[]) {
  cache = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage unavailable: the sidebar still works for this page view.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cache = undefined;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChats(): ChatEntry[] {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

export function useChat(sessionId: string | undefined): ChatEntry | undefined {
  const chats = useChats();
  return sessionId ? chats.find((chat) => chat.sessionId === sessionId) : undefined;
}

export function updateChat(sessionId: string, patch: Partial<ChatEntry>) {
  save(load().map((chat) => (chat.sessionId === sessionId ? { ...chat, ...patch } : chat)));
}

export const chatActions = {
  /** The user sent a message: move the chat to the top. */
  touch: (sessionId: string) => updateChat(sessionId, { updatedAt: Date.now() }),
  rename: (sessionId: string, title: string) =>
    updateChat(sessionId, { title: title.trim().slice(0, 80), titleSource: "user" }),
  toggleFavorite: (sessionId: string) => {
    const chat = load().find((entry) => entry.sessionId === sessionId);
    if (chat) updateChat(sessionId, { favorite: !chat.favorite });
  },
  trash: (sessionId: string) => updateChat(sessionId, { trashedAt: Date.now(), favorite: false }),
  restore: (sessionId: string) => updateChat(sessionId, { trashedAt: undefined }),
  deleteForever: (sessionId: string) =>
    save(load().filter((chat) => chat.sessionId !== sessionId)),
  setBrandKit: (sessionId: string, brandKitId: string | undefined) =>
    updateChat(sessionId, { brandKitId: brandKitId || undefined }),
};

export function chatUrl(sessionId: string): string {
  return `/s/${encodeURIComponent(sessionId)}`;
}

function textOf(message: EveMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : part.type === "file" ? (part.filename ?? "") : ""))
    .join(" ")
    .replace(/\[Brief:[^\]]*\]/g, "")
    .replace(/--- Uploaded document: ([^\n]+) ---[\s\S]*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function latestImage(messages: readonly EveMessage[]): string | undefined {
  for (let m = messages.length - 1; m >= 0; m -= 1) {
    const parts = messages[m].parts;
    for (let p = parts.length - 1; p >= 0; p -= 1) {
      const part = parts[p];
      if (part.type === "dynamic-tool" && part.state === "output-available") {
        const output = part.output as { phase?: string; imageUrl?: string } | undefined;
        if (output?.phase === "done" && output.imageUrl) return output.imageUrl;
      }
    }
  }
  return undefined;
}

export function transcriptOf(messages: readonly EveMessage[]): string {
  return messages
    .map((message) => {
      const images = message.parts.flatMap((part) => {
        if (part.type !== "dynamic-tool" || part.state !== "output-available") return [];
        const output = part.output as { phase?: string; imageUrl?: string; draftId?: string };
        return output?.phase === "done" && output.imageUrl
          ? [`[Infographic ${output.draftId ?? ""}: ${output.imageUrl}]`]
          : [];
      });
      const body = [textOf(message), ...images].filter(Boolean).join("\n");
      return body ? `${message.role === "user" ? "You" : "Plate"}:\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

const titleRequests = new Set<string>();

async function requestTitle(sessionId: string, text: string) {
  if (titleRequests.has(sessionId)) return;
  titleRequests.add(sessionId);
  try {
    const response = await fetch("/api/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const { title } = (await response.json()) as { title?: string | null };
    const current = load().find((chat) => chat.sessionId === sessionId);
    // Never overwrite a title the user typed.
    if (title && current && current.titleSource !== "user") {
      updateChat(sessionId, { title, titleSource: "ai" });
    }
  } catch {
    titleRequests.delete(sessionId);
  }
}

/** Titles chats that still show their raw prompt (older chats, or a failed first attempt). */
export function useBackfillTitles(chats: readonly ChatEntry[]) {
  useEffect(() => {
    for (const chat of chats) {
      if (chat.titleSource === "prompt" && !chat.trashedAt) {
        void requestTitle(chat.sessionId, chat.searchText || chat.title);
      }
    }
  }, [chats]);
}

/** Keeps the sidebar entry for the active session in sync and titles it once. */
export function useRecordChat(sessionId: string | undefined, messages: readonly EveMessage[]) {
  const firstUser = messages.find((message) => message.role === "user");
  const firstText = firstUser ? textOf(firstUser) : "";
  const searchText = messages
    .map(textOf)
    .join(" ")
    .slice(0, SEARCH_TEXT_LIMIT);
  const thumbnailUrl = latestImage(messages);

  // Metadata sync only. Recency (updatedAt) changes when the user sends a message
  // (chatActions.touch); opening a chat replays its history and must not reorder the sidebar.
  useEffect(() => {
    if (!sessionId || !firstText) return;
    const existing = load().find((chat) => chat.sessionId === sessionId);
    if (!existing) {
      const now = Date.now();
      save([
        {
          sessionId,
          title: firstText.length > 60 ? `${firstText.slice(0, 57)}…` : firstText,
          titleSource: "prompt",
          searchText,
          thumbnailUrl,
          createdAt: now,
          updatedAt: now,
        },
        ...load(),
      ]);
    } else if (
      searchText.length >= existing.searchText.length &&
      (existing.searchText !== searchText || existing.thumbnailUrl !== thumbnailUrl)
    ) {
      updateChat(sessionId, { searchText, thumbnailUrl });
    }
    if ((existing?.titleSource ?? "prompt") === "prompt") void requestTitle(sessionId, firstText);
  }, [sessionId, firstText, searchText, thumbnailUrl]);
}
