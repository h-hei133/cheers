import { runAgentLoop, type AssistantStep, type AgentLoopConfig } from "../agent/loop.js";
import type { AgentTool, ToolHooks, AfterToolCallContext } from "../agent/tools.js";
import type { AgentEventSink } from '../agent/events.js';
import type { AgentMessage } from "../agent/state.js";
import type { ReadOnlyDelegation, SubagentDefinition } from "./types.js";
import { subagentMaxSteps, subagentTools } from "./boundary.js";

/**
 * Running a subagent.
 *
 * A subagent is a run of the same loop the main session uses, with three things
 * narrowed: the tool set, the step budget, and the instruction. It was a single
 * completion request until now, which meant the declared tool boundary, the
 * declared step limit, and the declared tool set all went unread — the subagent
 * had no tools at all, so it could research but never act.
 *
 * The runner is a value rather than something this module builds, because a run
 * needs the model side — the provider, the transport, the catalog — and this
 * layer is below all three. The caller that owns those supplies a way to make a
 * step; this decides what the subagent may do with it.
 */
export interface SubagentStep {
  /**
   * The next assistant step for a context, as the main loop asks for it.
   *
   * `allowTools` is passed through because the budget is this module's to
   * enforce, not the step's. The main session withdraws tools on its last step
   * so the model answers with what it has; a subagent whose final step could
   * still call tools would execute them and then stop before the model saw the
   * results — the run would end mid-thought, with narration as its answer.
   */
  readonly step: (
    messages: readonly AgentMessage[],
    signal: AbortSignal | undefined,
    options: { readonly allowTools: boolean; readonly allowedTools: readonly string[]; readonly requestId?: string },
  ) => Promise<AssistantStep>;
}

export interface SubagentRunInput {
  readonly capability?: ReadOnlyDelegation;
  readonly events?: AgentEventSink;
  readonly onRequest?: (requestId: string) => Promise<void> | void;
  /** Observes actual native results, before any model output can claim evidence. */
  readonly observeTool?: (context: AfterToolCallContext) => Promise<{ readonly suffix?: string; readonly metadata?: Record<string, unknown> } | undefined>;
  readonly definition: SubagentDefinition;
  /** Requested restriction; the host intersects it with its own permission boundary. */
  readonly agentMode?: "plan" | "build";
  /** What the caller asked the subagent to do. */
  readonly prompt: string;
  /** Where the subagent works; the host binds tool execution to this root. */
  readonly workspace: string;
  /** Extra context the caller attached, already rendered. */
  readonly context?: string;
  /** Persistent memory for this agent type, already rendered. */
  readonly memory?: string;
  readonly signal?: AbortSignal;
  /** Internal dispatch fence supplied by the owner; never interpreted from model text. */
  readonly admission?: () => string | undefined;
}

/**
 * How a subagent is run, as the tool layer sees it.
 *
 * A function rather than a bag of values because everything a run needs beyond
 * the request — the tool set, the step, the step budget — belongs to the layer
 * that built it, and passing them through the tool context would put the model
 * side into a layer that has no business holding it.
 */
export type SubagentRunner = (input: SubagentRunInput) => Promise<SubagentRunResult>;

export interface SubagentRunResult {
  /** Final answer separately from intermediate narration. */
  readonly finalText?: string;
  /** Set by the host that built the actual tool gate; absent for unbound runners. */
  readonly agentMode?: "plan" | "build";
  /** What the subagent said, in order. */
  readonly text: string;
  /** Whether it ended by failing rather than by finishing. */
  readonly failed: boolean;
  /** Why it failed, when it did. */
  readonly failure?: string;
  /** Steps it actually took. */
  readonly steps: number;
  /**
   * The tools it was allowed to use, after the boundary was applied.
   *
   * Not the tools it called. A caller reporting these as "tools used" claims a
   * subagent did something it may never have touched, so the name says which of
   * the two this is.
   */
  readonly allowedTools: readonly string[];
}

/**
 * The instruction a subagent runs under.
 *
 * Its own prompt, plus what it needs to know about the run: where it is working,
 * what it may do, and how it ends. Saying the tool boundary out loud is part of
 * the boundary being real — a model that keeps reaching for a tool it does not
 * have spends steps discovering that.
 */
function subagentInstruction(input: {
  readonly definition: SubagentDefinition;
  readonly workspace: string;
  readonly tools: readonly string[];
  readonly maxSteps: number;
  readonly context?: string;
  readonly memory?: string;
}): string {
  const lines = [
    input.definition.systemPrompt,
    "",
    `Working directory: ${input.workspace}`,
    input.tools.length > 0
      ? `Tools available to you: ${input.tools.join(", ")}.`
      : "You have no tools. Answer from what you are given.",
    `You have at most ${input.maxSteps} steps. When you have the answer, say it and stop.`,
  ];
  if (input.context) lines.push("", "Context provided by the caller:", input.context);
  if (input.memory) lines.push("", "Notes from earlier runs of this agent:", input.memory);
  return lines.join("\n");
}

/**
 * Run a subagent to completion.
 *
 * The loop is the same one the main session runs, so a subagent gets the same
 * tool-call handling, the same retry, and the same stopping rules. What differs
 * is only what it was handed.
 */
export async function runSubagent(
  input: SubagentRunInput,
  host: {
    readonly tools: ReadonlyMap<string, AgentTool>;
    readonly step: SubagentStep["step"];
    readonly defaultMaxSteps: number;
    readonly retry?: AgentLoopConfig['retry'];
    /**
     * The gate a subagent's tool calls pass through, when the caller has one.
     *
     * The session's own calls go through this, and a subagent's are calls like
     * any other: plan mode, the approval scope, the doom-loop check and the
     * user's refusals all live here. A subagent that ran without them was a run
     * of the same loop answering to none of the same rules.
     */
    readonly beforeToolCall?: ToolHooks["beforeToolCall"];
    readonly afterToolCall?: ToolHooks["afterToolCall"];
  },
): Promise<SubagentRunResult> {
  const available = [...host.tools.keys()];
  const allowed = subagentTools(input.definition, available);
  const maxSteps = subagentMaxSteps(input.definition, host.defaultMaxSteps);
  if (input.signal?.aborted || admissionRefused(input)) {
    return { text: "", failed: true, failure: input.signal?.aborted ? "the subagent was aborted" : 'Delegated request admission refused.', steps: 0, allowedTools: allowed };
  }

  const selected = new Map<string, AgentTool>();
  for (const name of allowed) {
    const tool = host.tools.get(name);
    if (tool) selected.set(name, tool);
  }

  const instruction = subagentInstruction({
    definition: input.definition,
    workspace: input.workspace,
    tools: allowed,
    maxSteps,
    ...(input.context ? { context: input.context } : {}),
    ...(input.memory ? { memory: input.memory } : {}),
  });

  let steps = 0;
  let failure: string | undefined;
  const messages: AgentMessage[] = [
    { role: "user", content: instruction },
    { role: "user", content: input.prompt },
  ];

  const produced = await runAgentLoop(
    messages,
    [],
    {
      tools: [...selected.values()],
      ...(host.retry ? { retry: host.retry } : {}),
      streamStep: async (context, signal, request) => {
        if (admissionRefused(input)) return Promise.resolve({ text: '', toolCalls: [], stopReason: 'error' as const,
          errorMessage: 'Delegated request admission refused.', retriesExhausted: true });
        if (request?.requestId) await input.onRequest?.(request.requestId);
        steps += 1;
        return host.step(context, signal, { allowTools: steps < maxSteps, allowedTools: allowed, requestId: request?.requestId });
      },
      shouldStopAfterStep: () => steps >= maxSteps,
      ...(host.beforeToolCall ? { beforeToolCall: host.beforeToolCall } : {}),
      ...((host.afterToolCall || input.observeTool) ? { afterToolCall: async (context, signal) => {
        const observed = await input.observeTool?.(context);
        const hooked = await host.afterToolCall?.(context, signal);
        return observed || hooked ? { ...hooked,
          ...(observed?.suffix ? { output: `${hooked?.output ?? context.result.output}\n\n${observed.suffix}` } : {}),
          ...(observed?.metadata || hooked?.metadata ? { metadata: { ...observed?.metadata, ...hooked?.metadata } } : {}) } : undefined;
      } } : {}),
    },
    input.events ?? (() => {}),
    input.signal,
  );

  const text = produced
    .filter((message) => message.role === "assistant")
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .filter(Boolean)
    .join("\n\n");

  const lastAssistant = [...produced].reverse().find((message) => message.role === "assistant");
  if (input.signal?.aborted) {
    // Cancellation may happen in a tool, after the last model message ended normally.
    failure = "the subagent was aborted";
  } else if (lastAssistant && (lastAssistant.stopReason === "error" || lastAssistant.stopReason === "aborted")) {
    failure = lastAssistant.errorMessage ?? `the run stopped with reason ${lastAssistant.stopReason}`;
  } else if (steps >= maxSteps && lastAssistant?.tool_calls?.length) {
    // The last step asked for tools and the budget ended there. Reported as a
    // failure because the alternative is a caller reading narration as an
    // answer: the text above is what the subagent said on the way, not what it
    // concluded. A run that answers on its final step is not this case, which is
    // why the check is the step still wanting tools rather than the count alone.
    failure = `the subagent used all ${maxSteps} of its steps without finishing`;
  }

  return {
    finalText: typeof lastAssistant?.content === 'string' ? lastAssistant.content : '',
    text,
    failed: failure !== undefined,
    ...(failure ? { failure } : {}),
    steps,
    allowedTools: allowed,
  };
}

function admissionRefused(input: SubagentRunInput): boolean {
  try { return Boolean(input.admission?.()); } catch { return true; }
}
