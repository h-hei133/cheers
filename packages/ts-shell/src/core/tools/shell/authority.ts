import type { ExecutionAuthority } from '../../../runtime/execution/types.js';
export const TOOL_APPROVED_COMMAND_AUTHORITY: ExecutionAuthority = {
  mode: 'command-allowlisted',
  source: 'tool-runtime-approval',
  reason: 'ToolRuntime allowlist and process permission checks passed before ExecutionService was called.',
}
