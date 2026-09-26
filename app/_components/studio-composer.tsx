"use client";

import type { UserContent } from "ai";
import { FileTextIcon, PaperclipIcon, SquareIcon, XIcon } from "lucide-react";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";

export const DESTINATIONS = [
  { id: "auto", label: "Any destination", format: "" },
  { id: "article", label: "Article · 3:4", format: "portrait" },
  { id: "newsletter", label: "Newsletter · 1:1", format: "square" },
  { id: "blog-header", label: "Blog header · 16:9", format: "landscape" },
  { id: "story", label: "Social story · 9:16", format: "tall" },
] as const;

export const STYLES = [
  { id: "auto", label: "Style: auto" },
  { id: "dark_editorial", label: "Dark editorial" },
  { id: "cinematic_hero", label: "Cinematic hero" },
  { id: "chalkboard", label: "Chalkboard" },
  { id: "illustrated_map", label: "Illustrated map" },
  { id: "material_texture", label: "Material texture" },
  { id: "clean_light", label: "Clean light" },
  { id: "neon_tech", label: "Neon tech" },
] as const;

export type Brief = { destination: string; style: string };

// Muse Spark reads PDFs and images natively; plain-text formats are inlined as text parts.
const ACCEPT = ".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,image/png,image/jpeg,image/webp";
const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|html?)$/i;

function isTextFile(file: { mediaType?: string; filename?: string }): boolean {
  return (
    file.mediaType?.startsWith("text/") === true ||
    file.mediaType === "application/json" ||
    TEXT_EXTENSIONS.test(file.filename ?? "")
  );
}

function decodeDataUrl(url: string): string {
  const [, payload = ""] = url.split(",", 2);
  const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function briefLine({ destination, style }: Brief): string | undefined {
  const parts = [
    destination !== "auto"
      ? (() => {
          const item = DESTINATIONS.find((d) => d.id === destination);
          return `destination ${item?.id} (format ${item?.format})`;
        })()
      : "",
    style !== "auto" ? `style preset ${style}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? `[Brief: ${parts.join(", ")}]` : undefined;
}

export function buildUserContent(message: PromptInputMessage, brief: Brief): string | UserContent {
  const text = [briefLine(brief), message.text.trim()].filter(Boolean).join("\n\n");
  if (message.files.length === 0) return text;

  const parts: Exclude<UserContent, string> = [];
  if (text) parts.push({ type: "text", text });
  for (const file of message.files) {
    if (isTextFile(file) && file.url?.startsWith("data:")) {
      parts.push({
        type: "text",
        text: `--- Uploaded document: ${file.filename ?? "document"} ---\n${decodeDataUrl(file.url)}`,
      });
    } else {
      parts.push({
        type: "file",
        data: file.url,
        filename: file.filename,
        mediaType: file.mediaType,
      });
    }
  }
  return parts;
}

export function StudioComposer({
  brief,
  isBusy,
  isResuming,
  onBriefChange,
  onCancel,
  onSubmit,
  hasInputText,
  onInputTextChange,
}: {
  readonly brief: Brief;
  readonly isBusy: boolean;
  readonly isResuming: boolean;
  readonly onBriefChange: (brief: Brief) => void;
  readonly onCancel: () => void;
  readonly onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  readonly hasInputText: boolean;
  readonly onInputTextChange: (hasText: boolean) => void;
}) {
  return (
    <PromptInput accept={ACCEPT} globalDrop multiple onSubmit={onSubmit}>
      <AttachmentChips />
      <PromptInputTextarea
        className="min-h-24 text-base"
        disabled={isResuming}
        onChange={(event) => onInputTextChange(event.currentTarget.value.trim().length > 0)}
        placeholder="Paste an article, drop a URL or a PDF, or describe the chart you want…"
      />
      <PromptInputFooter className="pr-14">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <UploadButton />
          <PromptInputSelect
            onValueChange={(destination) => onBriefChange({ ...brief, destination })}
            value={brief.destination}
          >
            <PromptInputSelectTrigger aria-label="Destination" size="sm">
              <PromptInputSelectValue />
            </PromptInputSelectTrigger>
            <PromptInputSelectContent>
              {DESTINATIONS.map((item) => (
                <PromptInputSelectItem key={item.id} value={item.id}>
                  {item.label}
                </PromptInputSelectItem>
              ))}
            </PromptInputSelectContent>
          </PromptInputSelect>
          <PromptInputSelect
            onValueChange={(style) => onBriefChange({ ...brief, style })}
            value={brief.style}
          >
            <PromptInputSelectTrigger aria-label="Style" size="sm">
              <PromptInputSelectValue />
            </PromptInputSelectTrigger>
            <PromptInputSelectContent>
              {STYLES.map((item) => (
                <PromptInputSelectItem key={item.id} value={item.id}>
                  {item.label}
                </PromptInputSelectItem>
              ))}
            </PromptInputSelectContent>
          </PromptInputSelect>
        </div>
      </PromptInputFooter>
      <ComposerAction
        hasInputText={hasInputText}
        isBusy={isBusy}
        isResuming={isResuming}
        onCancel={onCancel}
      />
    </PromptInput>
  );
}

function UploadButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton
      aria-label="Upload a document"
      onClick={() => attachments.openFileDialog()}
      tooltip="Upload PDF, text, CSV, or image"
    >
      <PaperclipIcon className="size-4" />
    </PromptInputButton>
  );
}

function AttachmentChips() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <PromptInputHeader className="flex-wrap gap-1.5 px-3 pt-3">
      {attachments.files.map((file) => (
        <span
          className="inline-flex max-w-60 items-center gap-1.5 rounded-full border bg-secondary py-1 pr-1 pl-2.5 text-xs"
          key={file.id}
        >
          <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{file.filename ?? "Attachment"}</span>
          <button
            aria-label={`Remove ${file.filename ?? "attachment"}`}
            className="flex size-5 items-center justify-center rounded-full hover:bg-accent"
            onClick={() => attachments.remove(file.id)}
            type="button"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
    </PromptInputHeader>
  );
}

function ComposerAction({
  hasInputText,
  isBusy,
  isResuming,
  onCancel,
}: {
  readonly hasInputText: boolean;
  readonly isBusy: boolean;
  readonly isResuming: boolean;
  readonly onCancel: () => void;
}) {
  const attachments = usePromptInputAttachments();
  const canSubmit = hasInputText || attachments.files.length > 0;

  if (!isBusy || canSubmit) {
    return <PromptInputSubmit disabled={isResuming || !canSubmit} />;
  }

  return (
    <PromptInputButton
      aria-label="Stop"
      className="absolute right-2.5 bottom-2.5"
      onClick={onCancel}
      variant="outline"
    >
      <SquareIcon className="size-3 fill-current" />
    </PromptInputButton>
  );
}
