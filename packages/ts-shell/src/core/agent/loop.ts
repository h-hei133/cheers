import type { AgentEventSink } from "./events.js";
import { randomUUID } from 'node:crypto';
import type { ProviderFailureClass } from "../../provider/registry/provider.js";
import { flushMetrics, recordCount, recordTiming } from "../../observability/metrics.js";
import type { AgentMessage, AgentStopReason } from "./state.js";
import {
  exceedsRetryCeiling,
  isRetryableFailure,
  resolveRetryPolicy,
  retryDelayMs,
  waitBeforeRetry,
  type RetryPolicy,
} from "./retry.js";
import {
  executeToolBatch,
  failTruncatedCalls,
  type AgentTool,
  type AgentToolCall,
  type AgentToolExecutionMode,
  type ToolHooks,
} from "./tools.js";

export interface AssistantStep {
  readonly admissionFailure?: import('./request/model.js').ModelAdmissionError['code'];
  readonly text: string;
  readonly toolCalls: readonly AgentToolCall[];
  readonly stopReason: AgentStopReason;
  readonly errorMessage?: string;
  /**
   * What kind of failure this was, when it was a provider failure.
   *
   * Separate from `errorMessage`, which holds the provider's own wording. The
   * class is the part a reader can branch on: an expired credential, an
   * exhausted quota and a transient outage all read as prose that differs by
   * provider, but only one of them is worth retrying.
   */
  readonly failureClass?: ProviderFailureClass;
  /**
   * Whether the layer that made this request already used up its retries.
   *
   * Two layers retry and they see different facts, so both exist on purpose —
   * but only one may act on the same failure. The step knows the HTTP status and
   * the server's own `Retry-After`, so it is the layer that retries a provider
   * refusal; by the time it gives up, asking again from above is asking the same
   * endpoint the same question a second time. Marked here so the loop can tell
   * "this failed and nobody has retried it" from "this failed and the layer that
   * understood it has already tried", which is the difference between one retry
   * and one per layer.
   */
  readonly retriesExhausted?: boolean;
  /** Server-requested wait, carried when this loop owns the remaining retries. */
  readonly requestedDelayMs?: number;
  /**
   * The working out this step came with, and the provider's signature over it.
   *
   * Not the answer and not shown as one. It is carried because some providers
   * require it back: a signed reasoning block that is omitted from the next
   * request in the same trajectory makes the provider reject that request.
   */
  readonly reasoning?: {
    readonly text: string;
    readonly signature?: string;
  };
  /**
   * The model this step came from, so a failure can be told apart from the
   * current model's failure after a switch.
   *
   * Absent when the step had no model behind it — a synthetic step for tests,
   * or a step function built before the field was threaded. Readers treat an
   * absent origin as matching, which keeps unattributed steps behaving as
   * they did before the field existed.
   */
  readonly origin?: {
    readonly provider?: string;
    readonly model: string;
  };
}
export interface NextStepSnapshot {
  readonly message: AgentMessage;
  readonly toolResults: readonly AgentMessage[];
  readonly messages: readonly AgentMessage[];
}

export interface NextStepUpdate {
  readonly messages?: readonly AgentMessage[];
}

export interface AgentLoopConfig {
  readonly tools?: readonly AgentTool[];
  readonly toolExecution?: AgentToolExecutionMode;
  readonly beforeToolCall?: ToolHooks["beforeToolCall"];
  readonly afterToolCall?: ToolHooks["afterToolCall"];
  readonly shouldStopAfterStep?: (snapshot: NextStepSnapshot) => boolean | Promise<boolean>;
  readonly prepareNextStep?: (
    snapshot: NextStepSnapshot,
    signal?: AbortSignal,
  ) => NextStepUpdate | undefined | Promise<NextStepUpdate | undefined>;
  readonly onContextReplaced?: (messages: readonly AgentMessage[]) => void;
  readonly getSteeringMessages?: () => Promise<AgentMessage[]>;
  readonly getFollowUpMessages?: () => Promise<AgentMessage[]>;
  /**
   * How many times a failed step is asked for again.
   *
   * This sits above the step rather than inside it because the two see
   * different things: the step sees one HTTP response, while this sees the
   * finished step and runs between steps, so a retry here happens after
   * `prepareNextStep` has had its chance to reshape the context.
   *
   * Partial because the caller states what the user asked for and this layer's
   * own default fills the rest.
   */
  readonly retry?: Partial<RetryPolicy>;
  readonly streamStep: (
    messages: readonly AgentMessage[],
    signal?: AbortSignal,
    request?: { readonly requestId: string },
  ) => Promise<AssistantStep>;
}

export async function runAgentLoop(
  prompts: readonly AgentMessage[],
  seed: readonly AgentMessage[],
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal: AbortSignal | undefined,
  options: { readonly skipInitialSteeringPoll?: boolean } = {},
): Promise<AgentMessage[]> {
  const produced: AgentMessage[] = [];
  const context: AgentMessage[] = [...seed, ...prompts];

  const turnStarted = Date.now();
  await emit({ type: "agent_start" });
  await emit({ type: "turn_start" });
  for (const prompt of prompts) {
    await emit({ type: "message_start", message: prompt });
    await emit({ type: "message_end", message: prompt });
    produced.push(prompt);
  }
  try {
    await driveLoop(context, produced, config, emit, signal, !options.skipInitialSteeringPoll);
  } finally {
    // Flushed even when the turn failed: a run that fell over is exactly the one
    // whose numbers someone will want, and dropping them would make the metrics
    // describe only the turns that went well.
    recordTiming("turn.duration", Date.now() - turnStarted);
    flushMetrics();
  }
  return produced;
}

/**
 * Ask for the next step, asking again when the failure may not repeat.
 *
 * The retry lives here rather than inside the step so that the second attempt
 * goes through the same path as the first: whatever the loop does between steps
 * — compaction, steering, a replaced context — happens before a retry too,
 * because a failure caused by the context is answered by changing it.
 *
 * A cancelled run is never retried, and neither is a failure whose text names a
 * condition that will still hold: an exhausted account stays exhausted, and
 * retrying only spends quota to learn that again.
 */
async function retryStep(
  config: AgentLoopConfig,
  context: readonly AgentMessage[],
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<AssistantStep> {
  const policy = resolveRetryPolicy("turn", config.retry ?? {});
  const request = Object.freeze({ requestId: randomUUID() });
  let attempt = 0;
  for (;;) {
    const step = await config.streamStep(context, signal, request);
    // A step whose own layer already retried is not retried again here. The
    // provider layer sees the status and the server's delay, so it is the one
    // that knows whether asking again is worth anything; by the time it gives up
    // the answer is no. Retrying anyway multiplies the two counts instead of
    // choosing between them.
    if (step.retriesExhausted) return step;
    if (!isRetryableFailure(step.stopReason, step.errorMessage)) return step;
    attempt += 1;
    if (attempt > policy.maxRetries) return step;
    if (exceedsRetryCeiling(policy, step.requestedDelayMs)) {
      const seconds = Math.ceil(step.requestedDelayMs! / 1000);
      return { ...step, errorMessage: `Provider asked for a ${seconds}s wait before retrying, which is longer than this run will wait. ${step.errorMessage ?? ""}`.trim() };
    }

    recordCount("provider.retries", 1);
    const delayMs = retryDelayMs(policy, attempt, step.requestedDelayMs);
    await emit({ type: "retry_scheduled", attempt, maxAttempts: policy.maxRetries, delayMs });
    if (!(await waitBeforeRetry(delayMs, signal))) return step;
    await emit({ type: "retry_attempt_start", attempt });
  }
}

export async function runAgentLoopContinue(
  seed: readonly AgentMessage[],
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal: AbortSignal | undefined,
): Promise<AgentMessage[]> {
  if (seed.length === 0) {
    throw new Error("Cannot continue: no messages in context");
  }
  if (seed[seed.length - 1].role === "assistant") {
    throw new Error("Cannot continue from message role: assistant");
  }
  const produced: AgentMessage[] = [];
  const context: AgentMessage[] = [...seed];

  const turnStarted = Date.now();
  await emit({ type: "agent_start" });
  await emit({ type: "turn_start" });

  try {
    await driveLoop(context, produced, config, emit, signal, false);
  } finally {
    // The turn's own duration, and then everything the turn recorded. Flushed
    // here rather than per call because the log sink appends synchronously —
    // writing per tool call would put a blocking disk write on the hot path.
    recordTiming("turn.duration", Date.now() - turnStarted);
    flushMetrics();
  }
  return produced;
}

async function driveLoop(
  context: AgentMessage[],
  produced: AgentMessage[],
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal: AbortSignal | undefined,
  seedSteering: boolean,
): Promise<void> {
  const hooks: ToolHooks | undefined =
    config.beforeToolCall || config.afterToolCall
      ? { beforeToolCall: config.beforeToolCall, afterToolCall: config.afterToolCall }
      : undefined;
  let pending: AgentMessage[] = seedSteering ? await pollSteering(config) : [];
  let completedStep: NextStepSnapshot | undefined;

  while (true) {
    let hasMoreToolCalls = true;
    while (hasMoreToolCalls || pending.length > 0) {
      if (completedStep) {
        const update = await config.prepareNextStep?.(completedStep, signal);
        if (update?.messages) {
          replaceContext(context, update.messages);
          config.onContextReplaced?.(update.messages);
        }
        if (pending.length === 0) {
          pending = await pollSteering(config);
        }
        await emit({ type: "turn_start" });
      }

      for (const message of pending) {
        await emit({ type: "message_start", message });
        await emit({ type: "message_end", message });
        context.push(message);
        produced.push(message);
      }
      pending = [];

      const step = await retryStep(config, context, signal, emit);
      const assistant: AgentMessage = {
        role: "assistant",
        content: step.text,
        ...(step.toolCalls.length > 0
          ? {
              tool_calls: step.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
              })),
            }
          : {}),
        stopReason: step.stopReason,
        ...(step.errorMessage ? { errorMessage: step.errorMessage } : {}),
        ...(step.failureClass ? { failureClass: step.failureClass } : {}),
        ...(step.admissionFailure ? { admissionFailure: step.admissionFailure } : {}),
        ...(step.reasoning ? { reasoning: step.reasoning } : {}),
        ...(step.origin ? { origin: step.origin } : {}),
      };
      await emit({ type: "message_start", message: assistant });
      await emit({ type: "message_end", message: assistant });
      context.push(assistant);
      produced.push(assistant);

      if (step.stopReason === "error" || step.stopReason === "aborted") {
        await emit({ type: "turn_end", message: assistant, toolResults: [] });
        await emit({ type: "agent_end", messages: [...produced] });
        return;
      }

      const toolResults: AgentMessage[] = [];
      hasMoreToolCalls = false;
      if (step.toolCalls.length > 0) {
        if (step.stopReason === "length") {
          const failed = await failTruncatedCalls(step.toolCalls, emit);
          toolResults.push(...failed);
          hasMoreToolCalls = true;
        } else {
          const batch = await executeToolBatch(
            config.tools ?? [],
            assistant,
            step.toolCalls,
            hooks,
            config.toolExecution,
            signal,
            emit,
          );
          toolResults.push(...batch.messages);
          hasMoreToolCalls = !batch.terminate;
        }
      }
      for (const result of toolResults) {
        context.push(result);
        produced.push(result);
      }
      if (signal?.aborted) {
        await emit({ type: "turn_end", message: assistant, toolResults });
        await emit({ type: "agent_end", messages: [...produced] });
        return;
      }

      await emit({ type: "turn_end", message: assistant, toolResults, willContinue: hasMoreToolCalls });
      completedStep = { message: assistant, toolResults, messages: [...context] };
      if (await config.shouldStopAfterStep?.(completedStep)) {
        await emit({ type: "agent_end", messages: [...produced] });
        return;
      }
      pending = await pollSteering(config);
    }

    const followUp = await pollFollowUp(config);
    if (followUp.length > 0) {
      pending = followUp;
      continue;
    }
    break;
  }

  await emit({ type: "agent_end", messages: [...produced] });
}

async function pollSteering(config: AgentLoopConfig): Promise<AgentMessage[]> {
  try {
    return (await config.getSteeringMessages?.()) ?? [];
  } catch {
    return [];
  }
}

async function pollFollowUp(config: AgentLoopConfig): Promise<AgentMessage[]> {
  try {
    return (await config.getFollowUpMessages?.()) ?? [];
  } catch {
    return [];
  }
}
function replaceContext(context: AgentMessage[], next: readonly AgentMessage[]): void {
  context.length = 0;
  context.push(...next);
}
