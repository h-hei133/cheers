import type { ProviderFailureClass } from "../registry/provider.js";
import {
  providerFetchOutcomeToStreamEvents,
  type ProviderCompletedResponse,
  type ProviderStreamFetchOutcome,
} from "./adapter.js";
import type { ProviderResponseStreamEvent } from "./stream.js";

export type SyntheticProviderStep =
  | {
      readonly kind: "completed";
      readonly response: ProviderCompletedResponse;
    }
  | {
      readonly kind: "failed";
      readonly failureClass: ProviderFailureClass;
      readonly fallbackEligible?: boolean;
    };

export interface SyntheticProviderProgram {
  readonly steps: readonly SyntheticProviderStep[];
  readonly exhaustedStep?: SyntheticProviderStep;
}

export interface SyntheticProviderTurnInput {
  readonly requestId: string;
  readonly responseId: string;
  readonly turnId?: string;
  readonly turn: number;
}

export function selectSyntheticProviderStep(
  program: SyntheticProviderProgram,
  turn: number,
): SyntheticProviderStep {
  return program.steps[turn - 1] ??
    program.exhaustedStep ?? {
      kind: "completed",
      response: {
        content: "synthetic provider exhausted",
        finishReason: "stop",
      },
    };
}

export async function syntheticProviderStepToStreamEvents(input: {
  readonly step: SyntheticProviderStep;
  readonly turn: SyntheticProviderTurnInput;
}): Promise<readonly ProviderResponseStreamEvent[]> {
  if (input.step.kind === "failed") {
    return syntheticFailureEvents(input.step, input.turn);
  }

  return providerFetchOutcomeToStreamEvents({
    requestId: input.turn.requestId,
    responseId: input.turn.responseId,
    turnId: input.turn.turnId,
    outcome: {
      kind: "completed",
      response: input.step.response,
    } satisfies ProviderStreamFetchOutcome,
  });
}

function syntheticFailureEvents(
  step: Extract<SyntheticProviderStep, { readonly kind: "failed" }>,
  turn: SyntheticProviderTurnInput,
): readonly ProviderResponseStreamEvent[] {
  const base = {
    requestId: turn.requestId,
    responseId: turn.responseId,
    ...(turn.turnId ? { turnId: turn.turnId } : {}),
    retry: "not_allowed" as const,
  };
  return Object.freeze([
    {
      eventId: `${turn.responseId}:started`,
      kind: "stream_started",
      ...base,
    },
    {
      eventId: `${turn.responseId}:failed`,
      kind: "stream_failed",
      failureClass: step.failureClass,
      fallbackEligible: step.fallbackEligible ?? false,
      ...base,
    },
  ]);
}
