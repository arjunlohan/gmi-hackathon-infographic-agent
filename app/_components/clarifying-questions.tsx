"use client";

import { Questionnaire } from "@shadcn/react/questionnaire";
import type { EveDynamicToolPart, EveMessageInputRequest } from "eve/react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentInputResponse } from "./agent-message";

// Sent when the user skips a question, so the agent proceeds instead of waiting on it.
const SKIPPED_ANSWER = "No preference. Use your judgment.";

type Question = {
  readonly request: EveMessageInputRequest;
  readonly response?: AgentInputResponse;
};

export function isQuestionPart(part: { type: string }): part is EveDynamicToolPart {
  return (
    part.type === "dynamic-tool" &&
    (part as EveDynamicToolPart).toolMetadata?.eve?.inputRequest?.kind === "question"
  );
}

/**
 * Every ask_question call in one assistant message, asked as a single step-by-step
 * questionnaire and answered together.
 */
export function ClarifyingQuestions({
  canRespond,
  onInputResponses,
  parts,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly parts: readonly EveDynamicToolPart[];
}) {
  const questions: Question[] = parts.flatMap((part) => {
    const request = part.toolMetadata?.eve?.inputRequest;
    return request ? [{ request, response: part.toolMetadata?.eve?.inputResponse }] : [];
  });
  const answered = questions.filter((question) => question.response);
  const pending = questions.filter((question) => !question.response);

  return (
    <div className="flex w-full flex-col gap-3">
      {answered.length > 0 ? <AnsweredQuestions questions={answered} /> : null}
      {pending.length > 0 ? (
        <PendingQuestions
          canRespond={canRespond}
          onInputResponses={onInputResponses}
          questions={pending}
        />
      ) : null}
    </div>
  );
}

function PendingQuestions({
  canRespond,
  onInputResponses,
  questions,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly questions: readonly Question[];
}) {
  const [submitting, setSubmitting] = useState(false);
  const items = questions.map(({ request }) => ({
    name: request.requestId,
    choices: request.options?.map((option) => ({ value: option.id })),
  }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const responses = questions.map(({ request }): AgentInputResponse => {
      const optionIds = new Set(request.options?.map((option) => option.id));
      const values = data
        .getAll(request.requestId)
        .map((value) => String(value).trim())
        .filter(Boolean);
      // A typed answer wins over a selected option.
      const text = values.find((value) => !optionIds.has(value));
      const optionId = values.find((value) => optionIds.has(value));
      if (text) return { requestId: request.requestId, text };
      if (optionId) return { requestId: request.requestId, optionId };
      return { requestId: request.requestId, text: SKIPPED_ANSWER };
    });
    setSubmitting(true);
    void Promise.resolve(onInputResponses(responses)).catch(() => setSubmitting(false));
  };

  return (
    <Questionnaire.Root
      className="flex w-full flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-xs"
      items={items}
      onSubmit={handleSubmit}
      shortcuts="numbers"
    >
      {questions.length > 1 ? (
        <Questionnaire.Progress className="text-muted-foreground text-xs tabular-nums" />
      ) : null}
      {questions.map(({ request }) => {
        const hasOptions = (request.options?.length ?? 0) > 0;
        return (
          <Questionnaire.Item
            className="m-0 min-w-0 border-0 p-0 outline-none data-active:fade-in-0 data-active:slide-in-from-bottom-2 data-active:animate-in data-active:duration-300 motion-reduce:animate-none"
            key={request.requestId}
            name={request.requestId}
          >
            <Questionnaire.Title className="mb-3 p-0 font-medium text-sm leading-snug">
              {request.prompt}
            </Questionnaire.Title>
            <Questionnaire.Choices className="flex flex-col gap-2">
              {request.options?.map((option) => (
                <Questionnaire.Choice
                  className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors duration-[var(--duration-fast)] data-checked:border-ring data-checked:bg-accent [@media(hover:hover)]:hover:bg-accent/60"
                  key={option.id}
                  value={option.id}
                >
                  <Questionnaire.ChoiceInput className="mt-0.5 size-4 shrink-0 accent-(--signal)" />
                  <Questionnaire.ChoiceLabel className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-foreground leading-snug">{option.label}</span>
                    {option.description ? (
                      <span className="text-muted-foreground leading-snug">
                        {option.description}
                      </span>
                    ) : null}
                  </Questionnaire.ChoiceLabel>
                  <Questionnaire.ChoiceShortcut className="flex size-5 shrink-0 items-center justify-center rounded border font-mono text-[11px] text-muted-foreground" />
                </Questionnaire.Choice>
              ))}
              <Questionnaire.Input
                aria-label={hasOptions ? "Another answer" : "Answer"}
                placeholder={hasOptions ? "Or type your own answer" : "Type your answer"}
                render={<Input />}
              />
            </Questionnaire.Choices>
            <Questionnaire.Error className="mt-2 text-destructive text-xs" />
          </Questionnaire.Item>
        );
      })}
      <div className="flex items-center justify-end gap-2">
        <Questionnaire.Previous
          className="mr-auto data-hidden:hidden"
          render={<Button size="sm" type="button" variant="ghost" />}
        >
          Back
        </Questionnaire.Previous>
        <Questionnaire.Skip
          className="data-hidden:hidden"
          render={<Button size="sm" type="button" variant="ghost" />}
        >
          Skip
        </Questionnaire.Skip>
        <Questionnaire.Next className="data-hidden:hidden" render={<Button size="sm" type="button" />}>
          Next
        </Questionnaire.Next>
        <Questionnaire.Submit
          className="data-hidden:hidden"
          disabled={!canRespond || submitting}
          render={<Button size="sm" />}
        >
          {questions.length > 1 ? "Send answers" : "Send answer"}
        </Questionnaire.Submit>
      </div>
    </Questionnaire.Root>
  );
}

function AnsweredQuestions({ questions }: { readonly questions: readonly Question[] }) {
  return (
    <dl className="flex w-full flex-col gap-2 rounded-xl border px-4 py-3 text-sm">
      {questions.map(({ request, response }) => {
        const option = request.options?.find((item) => item.id === response?.optionId);
        return (
          <div className="flex flex-col gap-0.5" key={request.requestId}>
            <dt className="text-muted-foreground text-xs">{request.prompt}</dt>
            <dd className="font-medium">{option?.label ?? response?.text ?? response?.optionId}</dd>
          </div>
        );
      })}
    </dl>
  );
}
