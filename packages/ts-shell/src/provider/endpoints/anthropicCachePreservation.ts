import type { ToolSchema } from "../../turn/tools.js";
import type { SimpleRequest, TurnRequest } from "./kinds.js";
import { projectRequestDeclarations, toolChangeBlocks, topLevelTools, type DeclarationInput, type NativeSystemMessage } from './anthropic/declarations.js';
export { DEFERRED_TOOL_PLACEHOLDER } from './anthropic/declarations.js';

const MID_CONVERSATION_OUTPUT_CONFIG_BETA = "mid-conversation-output-config-2026-07-01";
const THINKING_BINDING_CONTROLS_BETA = "thinking-binding-controls-2026-08-01";
const INLINE_TOOLS_BETA = "inline-tools-2026-09-15";

export function anthropicBetaHeaders(
  input: SimpleRequest | TurnRequest,
): Record<string, string> {
  if (!('tools' in input)) return {};
  const declarations = projectRequestDeclarations(input);
  const betas: string[] = [];
  if (declarations ? declarations.nativeEffort : input.supportsMidConvoEffort && input.thinkingLevelName !== undefined) {
    betas.push(MID_CONVERSATION_OUTPUT_CONFIG_BETA, THINKING_BINDING_CONTROLS_BETA);
  }
  const inlineTools = declarations ? declarations.requiresInlineTools : input.allowTools
    && input.supportsMidConvoToolChanges && input.initialTools !== undefined
    && (input.tools.length > 0 || input.initialTools.length > 0);
  if (inlineTools) {
    betas.push(INLINE_TOOLS_BETA);
  }
  return betas.length > 0 ? { "anthropic-beta": betas.join(",") } : {};
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
  readonly toolChangeMessage?: NativeSystemMessage;
} {
  const blocks = toolChangeBlocks(initialTools, currentTools);
  return {
    topLevelTools: topLevelTools(initialTools, cacheControl),
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
