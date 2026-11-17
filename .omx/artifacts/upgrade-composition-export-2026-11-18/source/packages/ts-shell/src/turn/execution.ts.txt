import type { AgentToolExecutionMode } from '../core/agent/tools.js';
import type { ToolDefinition } from '../tools/types.js';

// These effects change what a later call sees. Delegation also owns a model budget.
const SEQUENTIAL_TOOLS = new Set(['bash', 'write', 'edit', 'apply_patch', 'task', 'team', 'browser', 'codemode']);

/** The outer batch and nested calls use the same admitted execution policy. */
export function toolExecutionMode(tool: ToolDefinition): AgentToolExecutionMode | undefined {
  return tool.prepare || SEQUENTIAL_TOOLS.has(tool.name) ? 'sequential' : undefined;
}
