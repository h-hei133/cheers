import type { ToolSchema } from "../../turn/tools.js";
import type { TurnRequest } from "./kinds.js";

const MID_CONVERSATION_OUTPUT_CONFIG_BETA = "mid-conversation-output-config-2026-07-01";
const THINKING_BINDING_CONTROLS_BETA = "thinking-binding-controls-2026-08-01";
const INLINE_TOOLS_BETA = "inline-tools-2026-09-15";

export function anthropicBetaHeaders(
  input: Pick<
    TurnRequest,
    "allowTools" | "tools" | "initialTools" | "supportsMidConvoToolChanges" | "supportsMidConvoEffort" | "thinkingLevelName"
  >,
): Record<string, string> {
  const betas: string[] = [];
  if (input.supportsMidConvoEffort && input.thinkingLevelName !== undefined) {
    betas.push(MID_CONVERSATION_OUTPUT_CONFIG_BETA, THINKING_BINDING_CONTROLS_BETA);
  }
  if (
    input.allowTools
    && input.supportsMidConvoToolChanges
    && input.initialTools !== undefined
    && (input.tools.length > 0 || input.initialTools.length > 0)
  ) {
    betas.push(INLINE_TOOLS_BETA);
  }
  return betas.length > 0 ? { "anthropic-beta": betas.join(",") } : {};
}

export const DEFERRED_TOOL_PLACEHOLDER = {
  type: "tool_search_tool_bm25_20250305",
  name: "tool_search",
} as const;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function convertSingleTool(tool: ToolSchema): Record<string, unknown> {
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters ?? { type: "object", properties: {} },
  };
}

/**
 * Compute inline `tool_addition` and `tool_removal` blocks when dynamic tools change
 * mid-conversation, keeping the top-level `body.tools` prefix fixed so provider
 * KV caches survive `tool_search` / `tool_load`.
 */
export function declareToolChanges(
  initialTools: readonly ToolSchema[],
  currentTools: readonly ToolSchema[],
  cacheControl?: { readonly type: "ephemeral"; readonly ttl?: "1h" },
): {
  readonly topLevelTools: readonly Record<string, unknown>[];
  readonly toolChangeMessage?: { readonly role: "system"; readonly content: readonly Record<string, unknown>[] };
} {
  const initialConverted = initialTools.map(convertSingleTool);
  const markedInitial = cacheControl && initialConverted.length > 0
    ? initialConverted.map((entry, idx) =>
        idx === initialConverted.length - 1 ? { ...entry, cache_control: cacheControl } : entry)
    : initialConverted;
  const topLevelTools = [...markedInitial, DEFERRED_TOOL_PLACEHOLDER];

  const initialByName = new Map(initialTools.map(t => [t.function.name, canonicalJson(convertSingleTool(t))]));
  const currentByName = new Map(currentTools.map(t => [t.function.name, t]));

  const added: ToolSchema[] = [];
  const modified: string[] = [];
  for (const tool of currentTools) {
    const prev = initialByName.get(tool.function.name);
    const curr = canonicalJson(convertSingleTool(tool));
    if (prev !== curr) {
      if (prev !== undefined) modified.push(tool.function.name);
      added.push(tool);
    }
  }
  const removed: string[] = [...modified];
  for (const tool of initialTools) {
    if (!currentByName.has(tool.function.name)) {
      removed.push(tool.function.name);
    }
  }

  const blocks: Record<string, unknown>[] = [];
  for (const name of removed) {
    blocks.push({
      type: "tool_removal",
      tool: { type: "tool_reference", name },
    });
  }
  for (const tool of added) {
    blocks.push({
      type: "tool_addition",
      tool: { type: "tool_definition", definition: convertSingleTool(tool) },
    });
  }

  return {
    topLevelTools,
    ...(blocks.length > 0 ? { toolChangeMessage: { role: "system" as const, content: blocks } } : {}),
  };
}

/**
 * Inject inline effort system markers so mid-conversation effort changes do not
 * mutate the top-level `thinking` / `output_config` fields in the cached prefix.
 */
export function insertThinkingLevelMessages<T>(
  messages: readonly T[],
  activeEffort: string,
  historicalEfforts?: ReadonlyMap<number, string>,
): Array<T | Record<string, unknown>> {
  const result: Array<T | Record<string, unknown>> = [];
  for (let index = 0; index < messages.length; index++) {
    const historical = historicalEfforts?.get(index);
    if (historical !== undefined) {
      result.push({ role: "system", content: [], output_config: { effort: historical } });
    }
    result.push(messages[index]!);
  }
  result.push({ role: "system", content: [], output_config: { effort: activeEffort } });
  return result;
}
