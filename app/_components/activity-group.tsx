"use client";

import type { EveDynamicToolPart, EveMessagePart } from "eve/react";
import {
  BrainIcon,
  GlobeIcon,
  type LucideIcon,
  PlugIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";

type ReasoningPart = Extract<EveMessagePart, { type: "reasoning" }>;
export type ActivityPart = ReasoningPart | EveDynamicToolPart;

type Step = {
  readonly key: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly detail?: string;
  readonly sources?: readonly string[];
  readonly running: boolean;
  readonly failed: boolean;
};

/**
 * One stretch of agent work between visible outputs (thinking, searches, page reads, other
 * tools), shown as a single collapsible chain of thought. Open while it runs, closed after.
 */
export function ActivityGroup({
  isActive,
  parts,
}: {
  readonly isActive: boolean;
  readonly parts: readonly ActivityPart[];
}) {
  const steps = parts.map(toStep);
  const [open, setOpen] = useState(isActive);
  const [seconds, setSeconds] = useState<number>();
  const startedAt = useRef<number | null>(isActive ? Date.now() : null);

  useEffect(() => {
    if (isActive) {
      startedAt.current ??= Date.now();
      setOpen(true);
    } else if (startedAt.current !== null) {
      setSeconds(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
      startedAt.current = null;
      setOpen(false);
    }
  }, [isActive]);

  const current = [...steps].reverse().find((step) => step.running) ?? steps.at(-1);
  const researched = steps.some((step) => step.icon === SearchIcon || step.icon === GlobeIcon);
  const summary = seconds
    ? `${researched ? "Researched" : "Worked"} for ${seconds} ${seconds === 1 ? "second" : "seconds"}`
    : researched
      ? "Research and planning"
      : "Thought process";

  return (
    <ChainOfThought onOpenChange={setOpen} open={open}>
      <ChainOfThoughtHeader>
        {isActive ? (
          <span className="shimmer">
            {!current || current.icon === BrainIcon ? "Thinking" : current.label}…
          </span>
        ) : (
          summary
        )}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((step, index) => (
          <ChainOfThoughtStep
            description={step.detail}
            icon={step.failed ? XCircleIcon : step.icon}
            key={step.key}
            label={step.label}
            status={isActive && (step.running || index === steps.length - 1) ? "active" : "complete"}
          >
            {step.sources?.length ? (
              <ChainOfThoughtSearchResults>
                {step.sources.map((source) => (
                  <ChainOfThoughtSearchResult key={source}>{source}</ChainOfThoughtSearchResult>
                ))}
              </ChainOfThoughtSearchResults>
            ) : null}
          </ChainOfThoughtStep>
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function toStep(part: ActivityPart, index: number): Step {
  if (part.type === "reasoning") {
    return {
      key: `reasoning:${index}`,
      icon: BrainIcon,
      label: tidyReasoning(part.text) || "Thinking",
      running: part.state === "streaming",
      failed: false,
    };
  }

  const input = (part.input ?? {}) as Record<string, unknown>;
  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error";
  const base = { key: part.toolCallId, running, failed };
  const error = failed ? part.errorText : undefined;

  switch (part.toolName) {
    case "web_search": {
      const query = typeof input.query === "string" ? input.query : undefined;
      return {
        ...base,
        icon: SearchIcon,
        label: query
          ? `${running ? "Searching" : "Searched"} for “${query}”`
          : running
            ? "Searching the web"
            : "Searched the web",
        detail: error,
        sources: running || failed ? undefined : hostnames(part.output).slice(0, 5),
      };
    }
    case "web_fetch": {
      const host = hostname(typeof input.url === "string" ? input.url : undefined);
      return {
        ...base,
        icon: GlobeIcon,
        label: `${running ? "Reading" : "Read"} ${host ?? "a page"}`,
        detail: error ?? (typeof input.url === "string" ? input.url : undefined),
      };
    }
    case "bash":
      return {
        ...base,
        icon: TerminalIcon,
        label: running ? "Running a command" : failed ? "Ran a command, which failed" : "Ran a command",
        detail: typeof input.command === "string" ? input.command.slice(0, 160) : error,
      };
    case "connection_search":
      return {
        ...base,
        icon: PlugIcon,
        label: running ? "Looking up connected services" : "Looked up connected services",
        detail: error,
      };
    default:
      return { ...base, icon: WrenchIcon, label: humanize(part.toolName), detail: error };
  }
}

/**
 * Muse Spark streams its thinking as short summaries with no separator between them
 * ("...value.Dropping the..."). Restore the space; "U.S." and "3.5" are left alone.
 */
export function tidyReasoning(text: string): string {
  return text.replace(/([a-z0-9)%][.!?])(?=[A-Z])/g, "$1 ").trim();
}

function humanize(toolName: string): string {
  const words = toolName.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function hostname(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** Distinct hostnames of any `url` fields in a search result, in order. */
function hostnames(output: unknown): string[] {
  const found: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    const host = hostname(typeof record.url === "string" ? record.url : undefined);
    if (host && !found.includes(host)) found.push(host);
    for (const child of Object.values(record)) visit(child, depth + 1);
  };
  visit(output, 0);
  return found;
}
