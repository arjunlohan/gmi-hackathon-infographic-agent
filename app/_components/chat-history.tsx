"use client";

import type { EveMessage } from "eve/react";
import { HistoryIcon, MessageSquareIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RenderResult } from "./infographic-card";

// eve has no session-listing API, so history is a per-browser index of session ids.
// Session content itself is durable on the server; this only remembers how to get back to it.
const STORAGE_KEY = "plate.history.v1";
const MAX_ENTRIES = 50;
const CHANGE_EVENT = "plate:history-change";

export type HistoryEntry = {
  sessionId: string;
  title: string;
  updatedAt: number;
  thumbnailUrl?: string;
};

function readHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage unavailable (private mode, blocked): history is a convenience, not required.
  }
}

function useHistory(): HistoryEntry[] {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    const sync = () => setEntries(readHistory());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return entries;
}

function titleFrom(messages: readonly EveMessage[]): string | undefined {
  const firstUser = messages.find((message) => message.role === "user");
  const text = firstUser?.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .replace(/\[Brief:[^\]]*\]/g, "")
    .replace(/--- Uploaded document: ([^-]+) ---[\s\S]*/g, "$1")
    .trim();
  if (text) return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  const file = firstUser?.parts.find((part) => part.type === "file");
  return file && file.type === "file" ? (file.filename ?? "Uploaded document") : undefined;
}

function latestImage(messages: readonly EveMessage[]): string | undefined {
  for (let m = messages.length - 1; m >= 0; m -= 1) {
    const parts = messages[m].parts;
    for (let p = parts.length - 1; p >= 0; p -= 1) {
      const part = parts[p];
      if (part.type === "dynamic-tool" && part.state === "output-available") {
        const output = part.output as RenderResult | undefined;
        if (output?.phase === "done" && output.imageUrl) return output.imageUrl;
      }
    }
  }
  return undefined;
}

/** Keeps the history index in sync with the active session. */
export function useRecordSession(sessionId: string | undefined, messages: readonly EveMessage[]) {
  const title = titleFrom(messages);
  const thumbnailUrl = latestImage(messages);
  useEffect(() => {
    if (!sessionId || !title) return;
    const entries = readHistory();
    const existing = entries.find((entry) => entry.sessionId === sessionId);
    if (existing && existing.title === title && existing.thumbnailUrl === thumbnailUrl) return;
    writeHistory([
      { sessionId, title, thumbnailUrl, updatedAt: Date.now() },
      ...entries.filter((entry) => entry.sessionId !== sessionId),
    ]);
  }, [sessionId, title, thumbnailUrl]);
}

function openSession(sessionId: string) {
  window.location.assign(`/s/${encodeURIComponent(sessionId)}`);
}

function removeEntry(sessionId: string) {
  writeHistory(readHistory().filter((entry) => entry.sessionId !== sessionId));
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function formatWhen(timestamp: number): string {
  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour");
  return relativeTime.format(Math.round(hours / 24), "day");
}

function HistoryRow({
  active,
  entry,
}: {
  readonly active: boolean;
  readonly entry: HistoryEntry;
}) {
  return (
    <li className="group relative">
      <button
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg p-2 pr-10 text-left transition-colors duration-[var(--duration-fast)] focus-visible:shadow-[0_0_0_2px_var(--ring)] focus-visible:outline-none [@media(hover:hover)]:hover:bg-accent",
          active && "bg-accent",
        )}
        onClick={() => openSession(entry.sessionId)}
        type="button"
      >
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
          {entry.thumbnailUrl ? (
            // biome-ignore lint/performance/noImgElement: remote GMI asset thumbnail
            <img alt="" className="size-full object-cover object-top" src={entry.thumbnailUrl} />
          ) : (
            <MessageSquareIcon className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm leading-snug">{entry.title}</span>
          <span className="text-muted-foreground text-xs">{formatWhen(entry.updatedAt)}</span>
        </span>
      </button>
      <button
        aria-label={`Remove "${entry.title}" from history`}
        className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity duration-[var(--duration-fast)] focus-visible:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:hover:bg-background"
        onClick={() => removeEntry(entry.sessionId)}
        type="button"
      >
        <XIcon className="size-3.5" />
      </button>
    </li>
  );
}

export function HistoryButton({ activeSessionId }: { readonly activeSessionId?: string }) {
  const entries = useHistory();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Chat history"
        className="studio-button pointer-events-auto bg-background/80 backdrop-blur"
        onClick={() => setOpen(true)}
        type="button"
      >
        <HistoryIcon className="size-3.5" />
        <span className="hidden sm:inline">History</span>
      </button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="top-0 left-0 flex h-dvh max-w-sm translate-x-0 translate-y-0 flex-col gap-4 rounded-none border-y-0 border-l-0 p-4 sm:max-w-sm">
          <DialogTitle className="font-display text-lg uppercase tracking-wide">History</DialogTitle>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Your chats will appear here. They are remembered in this browser.
            </p>
          ) : (
            <ul className="-mx-2 flex-1 space-y-1 overflow-y-auto">
              {entries.map((entry) => (
                <HistoryRow
                  active={entry.sessionId === activeSessionId}
                  entry={entry}
                  key={entry.sessionId}
                />
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RecentChats() {
  const entries = useHistory().slice(0, 4);
  if (entries.length === 0) return null;
  return (
    <section aria-label="Recent chats" className="space-y-2">
      <h2 className="text-muted-foreground text-xs uppercase tracking-wider">Recent</h2>
      <ul className="-mx-2 grid gap-1 sm:grid-cols-2">
        {entries.map((entry) => (
          <HistoryRow active={false} entry={entry} key={entry.sessionId} />
        ))}
      </ul>
    </section>
  );
}

