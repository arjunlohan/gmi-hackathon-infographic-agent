"use client";

import { useEveAgent } from "eve/react";
import { AlertCircleIcon, BrainIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationTopFade,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { NavActions } from "@/components/nav-actions";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AgentMessage } from "./agent-message";
import { useBrandKits } from "./brand-kit-store";
import { chatActions, useChat, useRecordChat } from "./chat-store";
import { type Brief, buildUserContent, StudioComposer } from "./studio-composer";
import { StudioIntro } from "./studio-intro";

export function AgentChat({
  account,
  sessionId,
  sessionless = false,
  sidebarDefaultOpen = true,
}: {
  readonly account?: ReactNode;
  readonly sessionId?: string;
  readonly sessionless?: boolean;
  readonly sidebarDefaultOpen?: boolean;
}) {
  const [cancellationError, setCancellationError] = useState<string>();
  const [hasInputText, setHasInputText] = useState(false);
  const [brief, setBrief] = useState<Brief>({ destination: "auto", style: "auto" });
  const { kits } = useBrandKits();
  const agent = useEveAgent({
    initialSession:
      sessionId === undefined
        ? undefined
        : {
            sessionId,
            streamIndex: 0,
          },
    resume: sessionId !== undefined,
    onSessionChange(session) {
      if (sessionId === undefined && session !== undefined) {
        // Next patches window.history to navigate, which would detach the active stream.
        History.prototype.replaceState.call(
          window.history,
          window.history.state,
          "",
          `/s/${encodeURIComponent(session.sessionId)}`,
        );
      }
    },
  });

  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isResuming = agent.status === "resuming";
  const isEmpty = agent.data.messages.length === 0;
  const lastMessage = agent.data.messages.at(-1);
  const isPendingAssistantShell =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.every((part) => part.type === "step-start");
  const showPendingThinking =
    isBusy &&
    (agent.status === "submitted" || lastMessage?.role !== "assistant" || isPendingAssistantShell);
  const turnFailure = isBusy || isResuming ? undefined : getLatestTurnFailure(agent.events);
  const errorMessage = cancellationError ?? agent.error?.message ?? turnFailure;
  const hasConversationContent = sessionless || !isEmpty || errorMessage !== undefined;
  const showConversationLayout = isResuming || hasConversationContent;
  const activeSessionId = sessionId ?? agent.session?.sessionId;
  const chat = useChat(activeSessionId);
  useRecordChat(activeSessionId, agent.data.messages);

  // A chat remembers its brand kit: restore it when the chat loads, and attach a kit picked
  // before the first message once the chat exists.
  const storedKitId = chat?.brandKitId;
  const hasChat = chat !== undefined;
  useEffect(() => {
    if (storedKitId) setBrief((current) => ({ ...current, brandKitId: storedKitId }));
  }, [storedKitId]);
  useEffect(() => {
    if (activeSessionId && hasChat && !storedKitId && brief.brandKitId) {
      chatActions.setBrandKit(activeSessionId, brief.brandKitId);
    }
  }, [activeSessionId, hasChat, storedKitId, brief.brandKitId]);

  const changeBrief = (next: Brief) => {
    setBrief(next);
    if (activeSessionId && hasChat && next.brandKitId !== brief.brandKitId) {
      chatActions.setBrandKit(activeSessionId, next.brandKitId);
    }
  };

  const requestCancellation = () => {
    setCancellationError(undefined);
    void agent.cancel().catch((error: unknown) => {
      setCancellationError(toErrorMessage(error));
    });
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    if ((message.text.trim().length === 0 && message.files.length === 0) || isResuming) return;

    setHasInputText(false);
    setCancellationError(undefined);
    const options = isBusy ? { turnPolicy: "steer" as const } : undefined;
    await agent.send(buildUserContent(message, brief, kits), options);
  };

  const sendStarter = (prompt: string) => {
    setCancellationError(undefined);
    void agent.send(buildUserContent({ text: prompt, files: [] }, brief, kits));
  };

  const composer = (
    <StudioComposer
      brief={brief}
      hasInputText={hasInputText}
      isBusy={isBusy}
      isResuming={isResuming}
      kits={kits}
      onBriefChange={changeBrief}
      onCancel={requestCancellation}
      onInputTextChange={setHasInputText}
      onSubmit={handleSubmit}
    />
  );

  const title = chat?.title ?? (activeSessionId ? "Untitled chat" : "New chat");

  return (
    <SidebarProvider className="h-dvh min-h-0" defaultOpen={sidebarDefaultOpen}>
      <AppSidebar
        account={account}
        activeSessionId={activeSessionId}
        onUseBrandKit={(brandKitId) => changeBrief({ ...brief, brandKitId })}
      />
      <SidebarInset className="min-w-0 overflow-hidden text-foreground">
        <header className="flex h-14 shrink-0 items-center gap-2 px-3">
          <SidebarTrigger />
          <Separator className="mr-1 data-[orientation=vertical]:h-4" orientation="vertical" />
          <h1 className="min-w-0 flex-1 truncate font-medium text-sm" title={title}>
            {title}
          </h1>
          {chat ? <NavActions chat={chat} messages={agent.data.messages} /> : null}
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {showConversationLayout ? (
            <Conversation
              className="min-h-0 flex-1"
              initial={sessionId === undefined ? undefined : false}
              resize={activeSessionId === undefined ? "smooth" : "instant"}
              scrollRestorationKey={
                isEmpty || activeSessionId === undefined
                  ? undefined
                  : `eve:web-chat-scroll:${activeSessionId}`
              }
            >
              <ConversationTopFade />
              <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 pt-6 pb-64 sm:px-6">
                {agent.data.messages.map((message, index) =>
                  showPendingThinking &&
                  isPendingAssistantShell &&
                  message.id === lastMessage.id ? null : (
                    <AgentMessage
                      canRespond={!isBusy && !isResuming}
                      isStreaming={
                        agent.status === "streaming" && index === agent.data.messages.length - 1
                      }
                      key={message.id}
                      message={message}
                      onInputResponses={(inputResponses) => {
                        setCancellationError(undefined);
                        return agent.respond(inputResponses);
                      }}
                    />
                  ),
                )}
                {showPendingThinking ? <PendingThinking /> : null}
                {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          ) : null}

          {showConversationLayout ? (
            <div className="absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-3xl bg-gradient-to-t from-background via-background to-transparent px-4 pt-4 pb-6 sm:px-6">
              {composer}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-4 py-10 sm:px-6">
                <StudioIntro />
                {composer}
                <StudioIntro.Starters onPick={sendStarter} />
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ErrorMessage({ message }: { readonly message: string }) {
  return (
    <Message className="max-w-full" from="assistant">
      <MessageContent>
        <div
          className="flex w-full items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm"
          role="alert"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Request failed</p>
            <p className="mt-0.5 text-muted-foreground">{message}</p>
          </div>
        </div>
      </MessageContent>
    </Message>
  );
}

function PendingThinking() {
  return (
    <Message aria-live="polite" from="assistant">
      <MessageContent>
        <div className="mb-4 flex w-full items-center gap-2 text-muted-foreground text-sm">
          <BrainIcon className="size-4" />
          <Shimmer duration={1}>Thinking</Shimmer>
        </div>
      </MessageContent>
    </Message>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to cancel the response.";
}

function getLatestTurnFailure(
  events: ReturnType<typeof useEveAgent>["events"],
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "turn.failed") {
      return event.data.code === "MODEL_CALL_FAILED"
        ? "The model is temporarily unavailable. Please try again."
        : event.data.message;
    }

    if (event.type === "turn.completed" || event.type === "turn.cancelled") {
      return undefined;
    }

    if (event.type === "message.received") {
      return undefined;
    }
  }

  return undefined;
}
