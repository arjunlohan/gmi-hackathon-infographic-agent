"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ImageIcon,
  Maximize2Icon,
  PackageCheckIcon,
  PenLineIcon,
  ScanSearchIcon,
  ShieldCheckIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { useState } from "react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Mirrors RenderResult in agent/lib/render.ts.
type Review = {
  verdict: "publish" | "fix";
  score: number;
  // Absent on renders from before the checklist reviewer.
  checks?: { total: number; passed: number };
  defects?: { kind: string; message: string }[];
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
  qaId?: string;
};

const FORMAT_RATIO: Record<string, string> = {
  portrait: "3 / 4",
  tall: "9 / 16",
  square: "1 / 1",
  landscape: "16 / 9",
};

const STEPS = [
  { id: "planning", label: "Plan", icon: PenLineIcon },
  { id: "rendering", label: "Render", icon: ImageIcon },
  { id: "checking", label: "Fact-check", icon: ScanSearchIcon },
  { id: "done", label: "Deliver", icon: PackageCheckIcon },
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
  const aspect = w / h;
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
      className="w-full overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[var(--card-shadow)]"
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
        <FinishedImage alt={input.title ?? "Generated infographic"} aspect={aspect} output={output} />
      ) : (
        <InProgress aspect={aspect} output={output} phase={phase} />
      )}

      {isDone && output ? <CardFooter output={output} /> : null}
    </figure>
  );
}

function InProgress({
  aspect,
  output,
  phase,
}: {
  readonly aspect: number;
  readonly output?: RenderResult;
  readonly phase: string;
}) {
  // A refining pass is another render + check; show it on the Render step.
  const stepId = phase === "refining" ? "rendering" : phase;
  const activeIndex = STEPS.findIndex((step) => step.id === stepId);
  const note =
    output?.note ??
    (phase === "planning" ? "Picking the story, chart form and visual concept" : "Working");

  return (
    <>
      <AspectRatio className="flex items-center justify-center overflow-hidden p-8" ratio={aspect}>
        <div className="studio-scan absolute inset-0" aria-hidden="true" />
        <p className="shimmer relative max-w-xs text-balance text-center text-muted-foreground text-sm">
          {note}
        </p>
      </AspectRatio>
      <ChainOfThought className="border-t px-4 py-3" defaultOpen>
        <ChainOfThoughtHeader>
          {output && output.pass > 1 ? `Pass ${output.pass} of ${output.maxPasses}` : "Progress"}
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          {STEPS.map((step, index) => (
            <ChainOfThoughtStep
              aria-current={index === activeIndex ? "step" : undefined}
              icon={index < activeIndex ? CheckIcon : step.icon}
              key={step.id}
              label={step.label}
              status={index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending"}
            />
          ))}
        </ChainOfThoughtContent>
      </ChainOfThought>
    </>
  );
}

function FinishedImage({
  alt,
  aspect,
  output,
}: {
  readonly alt: string;
  readonly aspect: number;
  readonly output: RenderResult;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AspectRatio ratio={aspect}>
        <button
          aria-label="View full size"
          className="group relative block size-full cursor-zoom-in bg-muted focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] focus-visible:outline-none dark:bg-black/40"
          onClick={() => setOpen(true)}
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
      </AspectRatio>
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
        passed
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-400/20 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
      )}
    >
      {passed ? (
        <ShieldCheckIcon className="size-3.5" />
      ) : (
        <AlertTriangleIcon className="size-3.5" />
      )}
      {passed ? "Fact-checked" : "Needs attention"}
      {review.checks ? (
        <span className="opacity-70">
          · {review.checks.passed}/{review.checks.total}
        </span>
      ) : null}
    </span>
  );
}

function CardFooter({ output }: { readonly output: RenderResult }) {
  const [copied, setCopied] = useState(false);
  const review = output.review;
  const factual = review?.defects
    ? [...new Set(review.defects.map((defect) => defect.message))]
    : review
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
        <ul className="space-y-1 rounded-lg bg-amber-400/15 p-3 text-amber-900 text-xs dark:bg-amber-400/10 dark:text-amber-100/90">
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
        <Button asChild className="rounded-full" size="sm" variant="outline">
          <a href={downloadHref(output)}>
            <DownloadIcon />
            Download PNG
          </a>
        </Button>
        <Button
          className="rounded-full"
          onClick={() => void copyPrompt()}
          size="sm"
          type="button"
          variant="outline"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        <span className="ml-auto text-muted-foreground text-xs tabular-nums">
          {passCount === 1 ? "Checked in 1 pass" : `Refined over ${passCount} passes`}
        </span>
      </div>
      <Feedback output={output} />
    </div>
  );
}

/**
 * Was the graphic right? Ratings and notes are stored with the render's QA record; they are
 * the ground truth the automated fact-check is measured against.
 */
function Feedback({ output }: { readonly output: RenderResult }) {
  const [state, setState] = useState<"idle" | "explain" | "sending" | "sent" | "error">("idle");
  const [note, setNote] = useState("");
  if (!output.qaId) return null;

  const send = async (rating: "up" | "down", text?: string) => {
    setState("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qaId: output.qaId,
          draftId: output.draftId,
          imageUrl: output.imageUrl,
          rating,
          note: text?.trim() || undefined,
        }),
      });
      setState(response.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "sent") {
    return <p className="text-muted-foreground text-xs">Thanks. Your rating is saved with this draft's fact-check.</p>;
  }

  if (state === "explain" || (state === "sending" && note)) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send("down", note);
        }}
      >
        <Input
          aria-label="What is wrong with this graphic?"
          autoFocus
          className="h-8 text-sm"
          maxLength={600}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What's wrong? e.g. Brazil should read 3.39"
          value={note}
        />
        <Button className="rounded-full" disabled={state === "sending"} size="sm" type="submit">
          Send
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1 text-muted-foreground text-xs">
      <span className="mr-1">{state === "error" ? "Could not save. Try again:" : "Is this graphic accurate?"}</span>
      <Button
        aria-label="Yes, it is accurate"
        disabled={state === "sending"}
        onClick={() => void send("up")}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ThumbsUpIcon />
      </Button>
      <Button
        aria-label="No, something is wrong"
        disabled={state === "sending"}
        onClick={() => setState("explain")}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ThumbsDownIcon />
      </Button>
    </div>
  );
}
