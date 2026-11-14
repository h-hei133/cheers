import { declarationEpoch } from '../../../core/agent/declarations/history.js';
import type { RequestDeclaration } from '../../../core/agent/declarations/model.js';
import type { ChatMessage } from '../../../turn/prompt.js';
import type { ToolSchema } from '../../../turn/tools.js';

export type ToolCacheControl = { readonly type: 'ephemeral'; readonly ttl?: '1h' };
export interface NativeSystemMessage {
  readonly role: 'system';
  readonly content: readonly Record<string, unknown>[];
  readonly output_config?: { readonly effort: string };
}
export interface DeclarationInput {
  readonly messages?: readonly ChatMessage[];
  readonly declarationTarget?: RequestDeclaration['target'];
  readonly tools: readonly ToolSchema[];
  readonly allowTools: boolean;
  readonly supportsMidConvoToolChanges?: boolean;
  readonly supportsMidConvoEffort?: boolean;
  readonly thinkingLevelName?: string;
}
export interface DeclarationProjection {
  readonly markers: ReadonlyMap<ChatMessage, NativeSystemMessage>;
  readonly topLevelTools?: readonly Record<string, unknown>[];
  readonly tail?: NativeSystemMessage;
  readonly nativeTools: boolean;
  readonly nativeEffort: boolean;
  readonly numericEffortFallback: boolean;
  readonly requiresInlineTools: boolean;
}

export const DEFERRED_TOOL_PLACEHOLDER = {
  type: 'tool_search_tool_bm25_20250305', name: 'tool_search',
} as const;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function anthropicToolDefinition(tool: ToolSchema): Record<string, unknown> {
  return {
    name: tool.function.name, description: tool.function.description,
    input_schema: tool.function.parameters ?? { type: 'object', properties: {} },
  };
}

/** The first declaration owns the fixed native prefix; an empty baseline has no placeholder. */
export function topLevelTools(tools: readonly ToolSchema[], cacheControl?: ToolCacheControl): readonly Record<string, unknown>[] {
  if (tools.length === 0) return [];
  const converted = tools.map(anthropicToolDefinition);
  if (cacheControl) converted[converted.length - 1] = { ...converted[converted.length - 1], cache_control: cacheControl };
  return [...converted, DEFERRED_TOOL_PLACEHOLDER];
}

/** Diff complete adjacent snapshots, so removal, schema replacement and restoration remain distinct. */
export function toolChangeBlocks(previous: readonly ToolSchema[], current: readonly ToolSchema[]): Record<string, unknown>[] {
  const previousByName = new Map(previous.map(tool => [tool.function.name, canonicalJson(anthropicToolDefinition(tool))]));
  const currentByName = new Map(current.map(tool => [tool.function.name, tool]));
  const added: ToolSchema[] = [];
  const removed: string[] = [];
  for (const tool of current) {
    const old = previousByName.get(tool.function.name);
    if (old === canonicalJson(anthropicToolDefinition(tool))) continue;
    if (old !== undefined) removed.push(tool.function.name);
    added.push(tool);
  }
  for (const tool of previous) {
    if (!currentByName.has(tool.function.name)) removed.push(tool.function.name);
  }
  return [
    ...removed.map(name => ({ type: 'tool_removal', tool: { type: 'tool_reference', name } })),
    ...added.map(tool => ({ type: 'tool_addition', tool: { type: 'tool_definition', definition: anthropicToolDefinition(tool) } })),
  ];
}

function systemUpdate(content: readonly Record<string, unknown>[], effort?: string): NativeSystemMessage | undefined {
  if (content.length === 0 && effort === undefined) return undefined;
  return { role: 'system', content, ...(effort === undefined ? {} : { output_config: { effort } }) };
}

/** Provider controls retain their raw marker owner; conversion chooses the next legal assistant boundary. */
export function projectRequestDeclarations(input: DeclarationInput, cacheControl?: ToolCacheControl): DeclarationProjection | undefined {
  if (!input.messages || !input.declarationTarget) return undefined;
  const epoch = declarationEpoch(input.messages, input.declarationTarget);
  if (epoch.length === 0) return undefined;
  const first = epoch[0]!.requestDeclaration!;
  const last = epoch[epoch.length - 1]!.requestDeclaration!;
  const nativeTools = input.allowTools && input.supportsMidConvoToolChanges === true;
  // No verified native reset exists for auto. Retain the raw trajectory, but use
  // current numeric thinking for this request rather than replaying a stale effort.
  const numericEffortFallback = input.supportsMidConvoEffort === true && input.thinkingLevelName !== undefined
    && epoch.some(message => message.requestDeclaration!.effort === undefined);
  const nativeEffort = input.supportsMidConvoEffort === true && input.thinkingLevelName !== undefined && !numericEffortFallback;
  const markers = new Map<ChatMessage, NativeSystemMessage>();
  let previous = first;
  for (let index = 0; index < epoch.length; index++) {
    const message = epoch[index]!;
    const declaration = message.requestDeclaration!;
    const blocks = nativeTools && index > 0 ? toolChangeBlocks(previous.tools, declaration.tools) : [];
    const effort = nativeEffort && (index === 0 || declaration.effort !== previous.effort) ? declaration.effort : undefined;
    const update = systemUpdate(blocks, effort);
    if (update) markers.set(message, update);
    previous = declaration;
  }
  const tail = systemUpdate(nativeTools ? toolChangeBlocks(last.tools, input.tools) : [],
    nativeEffort && last.effort !== input.thinkingLevelName ? input.thinkingLevelName : undefined);
  return {
    markers, nativeTools, nativeEffort, numericEffortFallback,
    requiresInlineTools: nativeTools && (input.tools.length > 0 || epoch.some(message => message.requestDeclaration!.tools.length > 0)),
    ...(nativeTools ? { topLevelTools: topLevelTools(first.tools, cacheControl) } : {}),
    ...(tail ? { tail } : {}),
  };
}
