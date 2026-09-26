"use client";

import type { EveMessage } from "eve/react";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { type ChatEntry, chatActions, chatUrl, transcriptOf } from "@/app/_components/chat-store";
import { downloadHref, latestRender } from "@/app/_components/infographic-card";
import { RenameDialog } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function NavActions({
  chat,
  messages,
}: {
  readonly chat: ChatEntry;
  readonly messages: readonly EveMessage[];
}) {
  const [renaming, setRenaming] = useState(false);
  const [copied, setCopied] = useState<"link" | "transcript">();
  const latest = latestRender(messages);

  const copy = async (kind: "link" | "transcript") => {
    await navigator.clipboard.writeText(
      kind === "link"
        ? new URL(chatUrl(chat.sessionId), location.origin).href
        : transcriptOf(messages),
    );
    setCopied(kind);
    setTimeout(() => setCopied(undefined), 1500);
  };

  return (
    <div className="flex items-center gap-1 text-sm">
      {copied ? (
        <span className="hidden items-center gap-1 text-muted-foreground text-xs sm:flex" role="status">
          <CheckIcon className="size-3.5" />
          {copied === "link" ? "Link copied" : "Transcript copied"}
        </span>
      ) : null}
      <Button
        aria-label={chat.favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={chat.favorite ?? false}
        className="size-8"
        onClick={() => chatActions.toggleFavorite(chat.sessionId)}
        size="icon"
        variant="ghost"
      >
        <StarIcon className={cn(chat.favorite && "fill-current text-signal")} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Chat actions" className="size-8" size="icon" variant="ghost">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-lg">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <PencilIcon className="text-muted-foreground" />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copy("link")}>
            <LinkIcon className="text-muted-foreground" />
            <span>Copy link</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copy("transcript")}>
            <CopyIcon className="text-muted-foreground" />
            <span>Copy transcript</span>
          </DropdownMenuItem>
          {latest ? (
            <DropdownMenuItem asChild>
              <a href={downloadHref(latest)}>
                <DownloadIcon className="text-muted-foreground" />
                <span>Download latest PNG</span>
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              chatActions.trash(chat.sessionId);
              window.location.assign("/s");
            }}
            variant="destructive"
          >
            <Trash2Icon />
            <span>Move to trash</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog chat={renaming ? chat : undefined} onClose={() => setRenaming(false)} />
    </div>
  );
}
