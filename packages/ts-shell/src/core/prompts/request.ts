import { loadToolCatalog, type ToolCatalogInput } from '../tools/catalog.js';
import { assertAdmission } from '../network/admission.js';
import type { ToolDefinition } from '../../tools/types.js';
import { buildSystemPromptContext } from './systemContext.js';
import { systemPromptSnapshot } from '../../turn/prompt.js';
import { toolSchemas } from '../../turn/tools.js';
import type { RequestOverhead } from '../../session/context.js';

export interface PromptRequestInput extends ToolCatalogInput {
  readonly agentMode?: 'plan' | 'build';
  readonly forcedTool?: string;
  readonly allowedTools?: readonly string[];
  readonly onSource?: (target: string) => void;
}

/** Shared by dispatch and read-only preview; callers supply the MCP lifecycle. */
export async function preparePromptRequest(input: PromptRequestInput, override?: () => ReadonlyMap<string, ToolDefinition>) {
  const discover = input.runtimeConfig?.toolDiscovery !== 'full' && !input.forcedTool;
  const { skills, tools: catalogTools, discovery } = await loadToolCatalog({ ...input, discover }, override);
  const tools = input.forcedTool ? new Map([...catalogTools].filter(([name]) => name === input.forcedTool)) : catalogTools;
  if (input.forcedTool && !tools.has(input.forcedTool)) {
    throw new Error(`Forced tool '${input.forcedTool}' is no longer available in the current tool pool.`);
  }
  assertAdmission(input.admission);
  input.signal?.throwIfAborted();
  const allowed = input.allowedTools ? new Set(input.allowedTools) : undefined;
  const filter = (pool: ReadonlyMap<string, ToolDefinition>) => allowed ? new Map([...pool].filter(([name]) => allowed.has(name))) : pool;
  const promptContext = buildSystemPromptContext({ workspaceRoot: input.workspaceRoot, sessionId: input.sessionId,
    runtimeConfig: input.runtimeConfig, skills, toolNames: [...filter(tools).keys()], onSource: input.onSource });
  const system = systemPromptSnapshot(input.agentMode, promptContext);
  // Discovery updates schemas between steps; the assembled system text stays fixed.
  const currentTools = () => filter(discovery?.snapshot() ?? tools);
  const currentOverhead = (): RequestOverhead => ({ systemPrompt: system.text, tools: toolSchemas(currentTools()) });
  return { skills, tools, discovery, promptContext, system, currentTools, currentOverhead };
}
