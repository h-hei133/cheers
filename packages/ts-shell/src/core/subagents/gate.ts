import type { ToolDefinition } from '../../tools/types.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { runPreparedTool } from '../../turn/invoke.js';

export function publishAgent(tool: ToolDefinition, options: ToolGateOptions) {
  return runPreparedTool(tool, {}, options, undefined, undefined, 'Agent publication', { eventKey: 'agentPublication' });
}
