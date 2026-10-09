import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { mcpCommandFor } from '../runtime/mcp.js';

/** Busy management reports use their own renderer and the current native approval composition. */
export async function runMcpConfigurationControl(text: string, context: ShellRuntimeContext,
  renderer: { renderLine(line: string): void }, questionPending: boolean): Promise<void> {
  if (questionPending) { renderer.renderLine('MCP configuration control refused while another approval or question is pending; answer it first.'); return; }
  const args = tokenizeCommandArgs(text.trim().replace(/^\/mcp(?:\s|$)/i, ''));
  const result = await mcpCommandFor(context)(args, { cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true });
  if (result.kind === 'local') renderer.renderLine(result.output);
}
