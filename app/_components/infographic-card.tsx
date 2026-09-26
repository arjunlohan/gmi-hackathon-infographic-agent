"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ScanSearchIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
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

type RenderResult = {
  phase: "rendering" | "reviewing" | "done";
  draftId?: string;
  parentId?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  size: string;
  prompt: string;
  review?: Review;
  reviewError?: string;
};

const FORMAT_RATIO: Record<string, string> = {
  portrait: "3 / 4",
  tall: "9 / 16",
  square: "1 / 1",
  landscape: "16 / 9",
};

export const INFOGRAPHIC_TOOLS = new Set(["generate_infographic", "edit_infographic"]);

export function InfographicCard({ part }: { readonly part: EveDynamicToolPart }) {
  const input = (part.input ?? {}) as { title?: string; format?: string; instruction?: string };
  const output = part.state === "output-available" ? (part.output as RenderResult) : undefined;
  const isEdit = part.toolName === "edit_infographic";

  const ratio = output?.size
    ? output.size.replace("x", " / ")
    : (FORMAT_RATIO[input.format ?? ""] ?? "3 / 4");
  const phase = output?.phase ?? "drafting";
  const title = isEdit
    ? `Revision of ${(part.input as { draftId?: string } | undefined)?.draftId ?? "draft"}`
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

  // Cap height near the viewport: tall and portrait drafts get narrower cards.
  const [w, h] = ratio.split("/").map((n) => Number(n.trim()));
  const maxWidth = `min(100%, calc(70dvh * ${w / h}))`;

  return (
    <figure
      className="w-full overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_oklch(0_0_0/0.3),0_12px_32px_-12px_oklch(0_0_0/0.6)]"
      style={{ maxWidth: `max(20rem, ${maxWidth})` }}
    >
      <figcaption className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base uppercase tracking-wide">{title}</p>
          <p className="text-muted-foreground text-xs">
            {output?.draftId ? `Draft ${output.draftId}` : "Draft"}
            {output?.width ? ` · ${output.width}×${output.height}` : ""} · Hy Image 3.5
          </p>
        </div>
        <PhaseBadge phase={phase} review={output?.review} reviewError={output?.reviewError} />
      </figcaption>

      <div className="relative bg-black/40" style={{ aspectRatio: ratio }}>
        {output?.imageUrl ? (
          <a href={output.imageUrl} rel="noreferrer" target="_blank">
            {/* biome-ignore lint/performance/noImgElement: remote GMI asset, rendered as-is */}
            <img
              alt={input.title ?? "Generated infographic"}
              className="size-full object-contain opacity-0 transition-opacity duration-[var(--duration-slow)] ease-[var(--ease-out)] data-[loaded=true]:opacity-100"
              onLoad={(event) => {
                event.currentTarget.dataset.loaded = "true";
              }}
              src={output.imageUrl}
            />
          </a>
        ) : (
          <RenderPlaceholder phase={phase} instruction={input.instruction} />
        )}
        {phase === "reviewing" ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-3 text-sm text-white">
            <ScanSearchIcon className="size-4" />
            <Shimmer duration={1.5}>Fact-checking every label with Muse Spark vision</Shimmer>
          </div>
        ) : null}
      </div>

      {phase === "done" && output ? <CardFooter output={output} /> : null}
    </figure>
  );
}

function RenderPlaceholder({
  phase,
  instruction,
}: {
  readonly phase: string;
  readonly instruction?: string;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="studio-scan absolute inset-0" aria-hidden="true" />
      <div className="relative text-sm">
        <Shimmer duration={1.5}>
          {phase === "drafting" ? "Writing the design spec" : "Rendering with Hy Image 3.5"}
        </Shimmer>
      </div>
      <p className="relative max-w-xs text-muted-foreground text-xs">
        {phase === "drafting"
          ? "Picking the story, the chart form, and the visual concept."
          : (instruction ?? "Usually 15 to 40 seconds.")}
      </p>
    </div>
  );
}

function PhaseBadge({
  phase,
  review,
  reviewError,
}: {
  readonly phase: string;
  readonly review?: Review;
  readonly reviewError?: string;
}) {
  if (phase !== "done") {
    return (
      <span className="shrink-0 rounded-full border px-2.5 py-1 text-muted-foreground text-xs">
        {phase === "reviewing" ? "Reviewing" : phase === "rendering" ? "Rendering" : "Planning"}
      </span>
    );
  }
  if (!review) {
    return (
      <span className="shrink-0 rounded-full border px-2.5 py-1 text-muted-foreground text-xs">
        {reviewError ? "Unreviewed" : "Rendered"}
      </span>
    );
  }
  const issues = countIssues(review);
  const passed = review.verdict === "publish";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs tabular-nums",
        passed ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-400/15 text-amber-300",
      )}
    >
      {passed ? <ShieldCheckIcon className="size-3.5" /> : <AlertTriangleIcon className="size-3.5" />}
      {passed ? "Fact-checked" : `${issues} ${issues === 1 ? "issue" : "issues"}`} · {review.score}/10
    </span>
  );
}

function countIssues(review: Review): number {
  return (
    review.wrongOrMissing.length +
    review.invented.length +
    review.encodingIssues.length +
    review.designIssues.length
  );
}

function CardFooter({ output }: { readonly output: RenderResult }) {
  const [copied, setCopied] = useState(false);
  const review = output.review;
  const issues = review
    ? [
        ...review.wrongOrMissing.map((item) => `Expected "${item.expected}", found "${item.found}"`),
        ...review.invented.map((item) => `Not in the brief: "${item}"`),
        ...review.encodingIssues,
        ...review.designIssues,
      ]
    : [];

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(output.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3 px-4 py-3">
      {issues.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-amber-400/10 p-3 text-amber-100/90 text-xs">
          {issues.map((issue) => (
            <li className="flex gap-2" key={issue}>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 break-words">{issue}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <FooterButton href={`/api/image?url=${encodeURIComponent(output.imageUrl ?? "")}&name=infographic-${output.draftId ?? "draft"}.png`}>
          <DownloadIcon className="size-3.5" />
          Download PNG
        </FooterButton>
        <FooterButton href={output.imageUrl} external>
          <ExternalLinkIcon className="size-3.5" />
          Full size
        </FooterButton>
        <button className="studio-button" onClick={() => void copyPrompt()} type="button">
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </div>
    </div>
  );
}

function FooterButton({
  children,
  external,
  href,
}: {
  readonly children: React.ReactNode;
  readonly external?: boolean;
  readonly href?: string;
}) {
  return (
    <a
      className="studio-button"
      href={href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      {children}
    </a>
  );
}
