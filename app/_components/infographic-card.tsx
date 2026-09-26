"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Maximize2Icon,
  ShieldCheckIcon,
} from "lucide-react";
import { useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Mirrors RenderResult in agent/lib/render.ts.
type Review = {
  verdict: "publish" | "fix";
  score: number;
  wrongOrMissing: { expected: string; found: string }[];
  invented: string[];
  encodingIssues: string[];
  designIssues: string[];
};

export type RenderResult = {
  phase: "rendering" | "checking" | "refining" | "done";
  pass: number;
  maxPasses: number;
  note?: string;
  size: string;
  draftId?: string;
  fileName?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  prompt?: string;
  review?: Review;
  reviewError?: string;
  passes?: { pass: number }[];
};

const FORMAT_RATIO: Record<string, string> = {
  portrait: "3 / 4",
  tall: "9 / 16",
  square: "1 / 1",
  landscape: "16 / 9",
};

const STEPS = [
  { id: "planning", label: "Plan" },
  { id: "rendering", label: "Render" },
  { id: "checking", label: "Fact-check" },
  { id: "done", label: "Deliver" },
] as const;

export const INFOGRAPHIC_TOOLS = new Set(["generate_infographic", "edit_infographic"]);

/** The most recent finished infographic in a conversation, if any. */
export function latestRender(
  messages: readonly { parts: readonly { type: string; state?: string; output?: unknown }[] }[],
): RenderResult | undefined {
  for (let m = messages.length - 1; m >= 0; m -= 1) {
    for (let p = messages[m].parts.length - 1; p >= 0; p -= 1) {
      const part = messages[m].parts[p];
      const output = part.state === "output-available" ? (part.output as RenderResult) : undefined;
      if (part.type === "dynamic-tool" && output?.phase === "done" && output.imageUrl) return output;
    }
  }
  return undefined;
}

export function InfographicCard({ part }: { readonly part: EveDynamicToolPart }) {
  const input = (part.input ?? {}) as { title?: string; format?: string; draftId?: string };
  const output = part.state === "output-available" ? (part.output as RenderResult) : undefined;
  const isEdit = part.toolName === "edit_infographic";
  const phase = output?.phase ?? "planning";
  const isDone = phase === "done" && Boolean(output?.imageUrl);

  const ratio = output?.size
    ? output.size.replace("x", " / ")
    : (FORMAT_RATIO[input.format ?? ""] ?? "3 / 4");
  // Cap height near the viewport: tall and portrait drafts get narrower cards.
  const [w, h] = ratio.split("/").map((n) => Number(n.trim()));
  const maxWidth = `max(20rem, min(100%, calc(70dvh * ${w / h})))`;
  const title = isEdit
    ? `Revision of ${input.draftId ?? "draft"}`
    : (input.title ?? "New infographic");

  if (part.state === "output-error") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="font-medium">Render failed</p>
          <p className="mt-1 break-words text-muted-foreground">{part.errorText}</p>
        </div>
      </div>
    );
  }

  return (
    <figure
      className="w-full overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_oklch(0_0_0/0.3),0_12px_32px_-12px_oklch(0_0_0/0.6)]"
      style={{ maxWidth }}
    >
      <figcaption className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base uppercase tracking-wide">{title}</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {isDone && output
              ? `Draft ${output.draftId} · ${output.width}×${output.height} · Hy Image 3.5`
              : "Hy Image 3.5 · Muse Spark"}
          </p>
        </div>
        {isDone && output ? <ReviewBadge output={output} /> : null}
      </figcaption>

      {isDone && output?.imageUrl ? (
        <FinishedImage alt={input.title ?? "Generated infographic"} output={output} ratio={ratio} />
      ) : (
        <InProgress output={output} phase={phase} ratio={ratio} />
      )}

      {isDone && output ? <CardFooter output={output} /> : null}
    </figure>
  );
}

function InProgress({
  output,
  phase,
  ratio,
}: {
  readonly output?: RenderResult;
  readonly phase: string;
  readonly ratio: string;
}) {
  // A refining pass is another render + check; show it on the Render step.
  const stepId = phase === "refining" ? "rendering" : phase;
  const activeIndex = STEPS.findIndex((step) => step.id === stepId);
  const note =
    output?.note ??
    (phase === "planning" ? "Picking the story, chart form and visual concept" : "Working");

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-5 p-8"
      style={{ aspectRatio: ratio }}
    >
      <div className="studio-scan absolute inset-0" aria-hidden="true" />
      <ol aria-label="Progress" className="relative flex flex-wrap items-center justify-center gap-2">
        {STEPS.map((step, index) => (
          <li className="flex items-center gap-2" key={step.id}>
            <span
              aria-current={index === activeIndex ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors duration-[var(--duration-base)]",
                index < activeIndex && "text-foreground",
                index === activeIndex && "font-medium text-signal",
                index > activeIndex && "text-muted-foreground/60",
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border",
                  index < activeIndex && "border-foreground bg-foreground text-background",
                  index === activeIndex && "border-signal",
                )}
              >
                {index < activeIndex ? <CheckIcon className="size-2.5" /> : null}
              </span>
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <span aria-hidden="true" className="h-px w-4 bg-border" />
            ) : null}
          </li>
        ))}
      </ol>
      <div className="relative text-center text-sm">
        <Shimmer duration={1.5}>{note}</Shimmer>
      </div>
      {output && output.pass > 1 ? (
        <p className="relative text-muted-foreground text-xs tabular-nums">
          Pass {output.pass} of {output.maxPasses}
        </p>
      ) : null}
    </div>
  );
}

function FinishedImage({
  alt,
  output,
  ratio,
}: {
  readonly alt: string;
  readonly output: RenderResult;
  readonly ratio: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label="View full size"
        className="group relative block w-full cursor-zoom-in bg-black/40 focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] focus-visible:outline-none"
        onClick={() => setOpen(true)}
        style={{ aspectRatio: ratio }}
        type="button"
      >
        {/* biome-ignore lint/performance/noImgElement: remote GMI asset, rendered as-is */}
        <img
          alt={alt}
          className="size-full object-contain opacity-0 transition-opacity duration-[var(--duration-slow)] ease-[var(--ease-out)] data-[loaded=true]:opacity-100"
          onLoad={(event) => {
            event.currentTarget.dataset.loaded = "true";
          }}
          src={output.imageUrl}
        />
        <span className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity duration-[var(--duration-fast)] group-focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          <Maximize2Icon className="size-4" />
        </span>
      </button>
      <ImageViewer alt={alt} onOpenChange={setOpen} open={open} output={output} />
    </>
  );
}

// In-app viewer: the image opens over the chat and closes back to it, never navigating away.
function ImageViewer({
  alt,
  onOpenChange,
  open,
  output,
}: {
  readonly alt: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly output: RenderResult;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] w-auto max-w-[calc(100vw-2rem)] flex-col items-center gap-4 border-none bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-4rem)]"
        overlayClassName="bg-black/85 backdrop-blur-sm"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {/* biome-ignore lint/performance/noImgElement: remote GMI asset, rendered as-is */}
        <img
          alt={alt}
          className="max-h-[calc(100dvh-7rem)] w-auto rounded-lg object-contain"
          src={output.imageUrl}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <button
            className="glass-button"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            Back to chat
          </button>
          <a className="glass-button" href={downloadHref(output)}>
            <DownloadIcon className="size-3.5" />
            Download PNG
          </a>
          <a
            className="glass-button"
            href={output.imageUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLinkIcon className="size-3.5" />
            Open original
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function downloadHref(output: RenderResult): string {
  const name = output.fileName ?? "infographic";
  return `/api/image?url=${encodeURIComponent(output.imageUrl ?? "")}&name=${encodeURIComponent(name)}.png`;
}

function ReviewBadge({ output }: { readonly output: RenderResult }) {
  const review = output.review;
  if (!review) {
    return (
      <span className="shrink-0 rounded-full border px-2.5 py-1 text-muted-foreground text-xs">
        {output.reviewError ? "Unreviewed" : "Rendered"}
      </span>
    );
  }
  const passed = review.verdict === "publish";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs tabular-nums",
        passed ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-400/15 text-amber-300",
      )}
    >
      {passed ? (
        <ShieldCheckIcon className="size-3.5" />
      ) : (
        <AlertTriangleIcon className="size-3.5" />
      )}
      {passed ? "Fact-checked" : "Needs attention"}
    </span>
  );
}

function CardFooter({ output }: { readonly output: RenderResult }) {
  const [copied, setCopied] = useState(false);
  const review = output.review;
  const factual = review
    ? [
        ...review.wrongOrMissing.map((item) => `Expected "${item.expected}", found "${item.found}"`),
        ...review.invented.map((item) => `Not in the brief: "${item}"`),
        ...review.encodingIssues,
      ]
    : [];
  const design = review?.designIssues ?? [];
  const passCount = output.passes?.length ?? 1;

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(output.prompt ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3 px-4 py-3">
      {factual.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-amber-400/10 p-3 text-amber-100/90 text-xs">
          {factual.map((issue) => (
            <li className="flex gap-2" key={issue}>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 break-words">{issue}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {design.length > 0 ? (
        <details className="group text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground">
            <ChevronDownIcon className="size-3.5 transition-transform duration-[var(--duration-fast)] group-open:rotate-180" />
            {design.length} design {design.length === 1 ? "note" : "notes"}
          </summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {design.map((note) => (
              <li key={note}>· {note}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <a className="studio-button" href={downloadHref(output)}>
          <DownloadIcon className="size-3.5" />
          Download PNG
        </a>
        <button className="studio-button" onClick={() => void copyPrompt()} type="button">
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy prompt"}
        </button>
        <span className="ml-auto text-muted-foreground text-xs tabular-nums">
          {passCount === 1 ? "Checked in 1 pass" : `Refined over ${passCount} passes`}
        </span>
      </div>
    </div>
  );
}
