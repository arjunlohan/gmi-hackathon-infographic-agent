"use client";

import type {
  EveAuthorizationPart,
  EveDynamicToolPart,
  EveMessage,
  EveMessagePart,
} from "eve/react";
import {
  cloneElement,
  type ComponentProps,
  createElement,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
} from "react";
import {
  CheckCircleIcon,
  ExternalLinkIcon,
  FileIcon,
  ImageIcon,
  KeyRoundIcon,
  XCircleIcon,
} from "lucide-react";
import type { Components, ExtraProps } from "streamdown";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import {
  BashToolContent,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import { cn } from "@/lib/utils";
import { type ActivityPart, ActivityGroup, tidyReasoning } from "./activity-group";
import { ClarifyingQuestions, isQuestionPart } from "./clarifying-questions";
import { INFOGRAPHIC_TOOLS, InfographicCard } from "./infographic-card";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

type EveFilePart = Extract<EveMessagePart, { type: "file" }>;

// Agent replies are styled by typeset (app/typeset.css). Streamdown's own element components carry
// utility classes that outrank typeset's component layer, so text elements render plain. Code
// blocks and mermaid keep Streamdown's UI and are fenced off from typeset.
const TYPESET_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "hr", "strong",
  "sup", "sub", "table", "thead", "tbody", "tr", "th", "td",
] as const;

const plain =
  (tag: string) =>
  ({ node: _node, ...props }: ExtraProps & HTMLAttributes<HTMLElement>) =>
    createElement(tag, props);

const typesetComponents = {
  ...Object.fromEntries(TYPESET_TAGS.map((tag) => [tag, plain(tag)])),
  inlineCode: plain("code"),
  a: ({ node: _node, ...props }: ExtraProps & ComponentProps<"a">) =>
    createElement("a", { ...props, rel: "noreferrer", target: "_blank" }),
  // Same as Streamdown's pre (marks the code as a block), inside a typeset exclusion.
  pre: ({ children }: ComponentProps<"pre">) => (
    <div data-not-typeset="">
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, { "data-block": "true" })
        : children}
    </div>
  ),
} as Components;

// Streamdown's root adds space-y-4 in the utilities layer; revert-layer hands child margins back
// to typeset's flow.
const TYPESET_ROOT = "typeset typeset-docs max-w-[37em] [&>*]:[margin-block:revert-layer]";

export function AgentMessage({
  canRespond,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
}) {
  const optimistic = message.metadata?.optimistic ? "true" : undefined;

  if (message.role === "user") {
    const files = message.parts.filter((part) => part.type === "file");
    const text = message.parts
      .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
      .join("\n\n");
    return (
      <Message align="end" data-optimistic={optimistic}>
        <MessageContent>
          {files.map((part, index) => (
            <div data-slot="message-attachment" key={partKey(part, index)}>
              <AttachmentPart part={part} />
            </div>
          ))}
          {text ? (
            <Bubble align="end">
              <BubbleContent className="rounded-2xl px-4 py-2.5">
                <MessageResponse>{text}</MessageResponse>
              </BubbleContent>
            </Bubble>
          ) : null}
        </MessageContent>
      </Message>
    );
  }

  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );
  const questions = message.parts.filter(isQuestionPart);
  const segments = segmentParts(message.parts);

  return (
    <Message data-optimistic={optimistic}>
      <MessageContent>
        {segments.map((segment, segmentIndex) => {
          const isLast = segmentIndex === segments.length - 1;
          if (segment.kind === "activity") {
            const isActive = isStreaming && isLast;
            const key = `activity:${segment.start}`;
            // Thinking alone reads as one Reasoning block; thinking mixed with tools reads as
            // a chain of thought with named steps.
            if (segment.parts.every((part) => part.type === "reasoning")) {
              const text = segment.parts
                .map((part) => (part.type === "reasoning" ? tidyReasoning(part.text) : ""))
                .join("\n\n");
              return (
                <Reasoning isStreaming={isActive} key={key}>
                  <ReasoningTrigger />
                  <ReasoningContent>{text}</ReasoningContent>
                </Reasoning>
              );
            }
            return <ActivityGroup isActive={isActive} key={key} parts={segment.parts} />;
          }
          const { part, index } = segment;
          if (isQuestionPart(part)) {
            // All questions in a message render once, as one questionnaire.
            return part === questions[0] ? (
              <ClarifyingQuestions
                canRespond={canRespond}
                key={part.toolCallId}
                onInputResponses={onInputResponses}
                parts={questions}
              />
            ) : null;
          }
          return (
            <AgentMessagePart
              canRespond={canRespond}
              key={partKey(part, index)}
              onInputResponses={onInputResponses}
              part={part}
              showCaret={isStreaming && index === lastTextIndex}
            />
          );
        })}
      </MessageContent>
    </Message>
  );
}

type Segment =
  | { readonly kind: "activity"; readonly start: number; readonly parts: ActivityPart[] }
  | { readonly kind: "part"; readonly index: number; readonly part: EveMessagePart };

/** Background work (thinking, research, ordinary tools) between visible outputs. */
function isActivityPart(part: EveMessagePart): part is ActivityPart {
  if (part.type === "reasoning") return part.text.trim().length > 0;
  if (part.type !== "dynamic-tool") return false;
  return (
    !INFOGRAPHIC_TOOLS.has(part.toolName) &&
    part.toolMetadata?.eve?.inputRequest === undefined &&
    part.state !== "approval-requested" &&
    part.state !== "approval-responded"
  );
}

/** Groups consecutive activity parts; every other part stands on its own. */
function segmentParts(parts: readonly EveMessagePart[]): Segment[] {
  const segments: Segment[] = [];
  parts.forEach((part, index) => {
    if (part.type === "step-start" || (part.type === "text" && part.text.length === 0)) return;
    if (part.type === "reasoning" && !isActivityPart(part)) return;
    if (isActivityPart(part)) {
      const last = segments.at(-1);
      if (last?.kind === "activity") last.parts.push(part);
      else segments.push({ kind: "activity", start: index, parts: [part] });
      return;
    }
    segments.push({ kind: "part", index, part });
  });
  return segments;
}

function AgentMessagePart({
  canRespond,
  onInputResponses,
  part,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
}) {
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return (
        <MessageResponse
          caret="block"
          className={TYPESET_ROOT}
          components={typesetComponents}
          isAnimating={showCaret}
        >
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return null;
    case "file":
      return <AttachmentPart part={part} />;
    case "authorization":
      return <AuthorizationPrompt part={part} />;
    case "dynamic-tool": {
      if (INFOGRAPHIC_TOOLS.has(part.toolName)) {
        return <InfographicCard part={part} />;
      }

      return (
        <Tool
          defaultOpen={part.state === "approval-requested" || part.state === "approval-responded"}
        >
          <ToolHeader
            state={part.state}
            title={part.toolName}
            toolName={part.toolName}
            type="dynamic-tool"
          />
          <ToolContent>
            {part.toolName === "bash" ? (
              <BashToolContent errorText={part.errorText} input={part.input} output={part.output} />
            ) : (
              <ToolInput input={part.input} />
            )}
            <InputRequestActions
              canRespond={canRespond}
              part={part}
              onInputResponses={onInputResponses}
            />
            {part.toolName === "bash" ? null : (
              <ToolOutput errorText={part.errorText} output={part.output} />
            )}
          </ToolContent>
        </Tool>
      );
    }
  }
}

function AttachmentPart({ part }: { readonly part: EveFilePart }) {
  const label = part.filename ?? "Attachment";
  const detail = [part.mediaType, formatBytes(part.size)].filter(Boolean).join(" - ");
  const isImage = part.mediaType.startsWith("image/") && part.url !== undefined;
  const Icon = isImage ? ImageIcon : FileIcon;
  const body = (
    <span className="flex max-w-sm items-center gap-3 rounded-md border bg-background/60 p-2 text-sm">
      {isImage ? (
        <img alt={label} className="size-12 shrink-0 rounded-sm object-cover" src={part.url} />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {detail ? <span className="block truncate text-muted-foreground">{detail}</span> : null}
      </span>
      {part.url ? <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" /> : null}
    </span>
  );

  return part.url ? (
    <a href={part.url} rel="noreferrer" target="_blank">
      {body}
    </a>
  ) : (
    body
  );
}

function AuthorizationPrompt({ part }: { readonly part: EveAuthorizationPart }) {
  const isAuthorized = part.state === "completed" && part.outcome === "authorized";
  const isCompleted = part.state === "completed";
  const Icon = isAuthorized ? CheckCircleIcon : isCompleted ? XCircleIcon : KeyRoundIcon;
  const instructions = part.authorization?.instructions;
  const shouldShowInstructions = instructions !== undefined && instructions !== part.description;

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border p-3",
        isAuthorized
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isCompleted
            ? "border-destructive/30 bg-destructive/5"
            : "border-blue-500/30 bg-blue-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            isAuthorized
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : isCompleted
                ? "bg-destructive/10 text-destructive"
                : "bg-blue-500/10 text-blue-700 dark:text-blue-300",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-sm">{authorizationTitle(part)}</p>
          <p className="text-muted-foreground text-sm">{authorizationDescription(part)}</p>
          {shouldShowInstructions ? (
            <p className="text-muted-foreground text-sm">{instructions}</p>
          ) : null}
          {part.state === "required" && part.authorization?.userCode ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Code</span>
              <code className="rounded-md bg-background px-2 py-1 font-mono">
                {part.authorization.userCode}
              </code>
            </div>
          ) : null}
          {part.state === "required" && part.authorization?.url ? (
            <Button asChild size="sm">
              <a href={part.authorization.url} rel="noreferrer" target="_blank">
                <ExternalLinkIcon className="size-4" />
                Sign in with {part.displayName}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function authorizationTitle(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return `Connect ${part.displayName}`;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} connected`;
  }
  return `${part.displayName} authorization ${formatAuthorizationOutcome(part.outcome)}`;
}

function authorizationDescription(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return part.description;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} connected.`;
  }
  const tail = part.reason !== undefined ? ` (${part.reason})` : "";
  return `${part.displayName} authorization ${formatAuthorizationOutcome(part.outcome)}${tail}.`;
}

function formatAuthorizationOutcome(outcome: NonNullable<EveAuthorizationPart["outcome"]>): string {
  switch (outcome) {
    case "authorized":
      return "authorized";
    case "declined":
      return "declined";
    case "failed":
      return "failed";
    case "timed-out":
      return "timed out";
  }
}

function formatBytes(size: number | undefined): string | undefined {
  if (size === undefined) {
    return undefined;
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function InputRequestActions({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId,
  );

  return (
    <div className="space-y-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
      <p className="text-muted-foreground text-sm">{inputRequest.prompt}</p>
      {inputResponse ? (
        <p className="font-medium text-sm">
          Responded: {selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options?.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  {
                    optionId: option.id,
                    requestId: inputRequest.requestId,
                  },
                ]);
              }}
              size="sm"
              type="button"
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "authorization":
      return `authorization:${part.turnId}:${part.stepIndex}:${part.name}`;
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}
