import { runAgentLoop, type AssistantStep } from "../agent/loop.js";
import type { AgentTool } from "../agent/tools.js";
import type { AgentMessage } from "../agent/state.js";
import type { SubagentDefinition } from "./types.js";
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
  /** The next assistant step for a context, as the main loop asks for it. */
  readonly step: (
    messages: readonly AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AssistantStep>;
}

export interface SubagentRunInput {
  readonly definition: SubagentDefinition;
  /** What the caller asked the subagent to do. */
  readonly prompt: string;
  /** Where the subagent works, named in its instruction so it knows its root. */
  readonly workspace: string;
  /** Extra context the caller attached, already rendered. */
  readonly context?: string;
  /** Persistent memory for this agent type, already rendered. */
  readonly memory?: string;
  readonly signal?: AbortSignal;
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
  /** What the subagent said, in order. */
  readonly text: string;
  /** Whether it ended by failing rather than by finishing. */
  readonly failed: boolean;
  /** Why it failed, when it did. */
  readonly failure?: string;
  /** Steps it actually took. */
  readonly steps: number;
  /** The tools it was allowed to use, after the boundary was applied. */
  readonly tools: readonly string[];
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
  },
): Promise<SubagentRunResult> {
  const available = [...host.tools.keys()];
  const allowed = subagentTools(input.definition, available);
  const maxSteps = subagentMaxSteps(input.definition, host.defaultMaxSteps);

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
  const messages: AgentMessage[] = [{ role: "user", content: instruction }];

  const produced = await runAgentLoop(
    messages,
    [],
    {
      tools: [...selected.values()],
      streamStep: (context, signal) => {
        steps += 1;
        return host.step(context, signal);
      },
      shouldStopAfterStep: () => steps >= maxSteps,
    },
    () => {},
    input.signal,
  );

  const text = produced
    .filter((message) => message.role === "assistant")
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .filter(Boolean)
    .join("\n\n");

  const last = produced[produced.length - 1];
  if (last && last.role === "assistant" && (last.stopReason === "error" || last.stopReason === "aborted")) {
    failure = last.errorMessage ?? `the run stopped with reason ${last.stopReason}`;
  }

  return {
    text,
    failed: failure !== undefined,
    ...(failure ? { failure } : {}),
    steps,
    tools: allowed,
  };
}
