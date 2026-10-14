import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { runAgentsCommand } from '../../core/subagents/command.js';
import { assertAgentSourceAccess } from '../../core/subagents/source.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { projectTrust } from '../../core/security/projectTrust.js';
import { parseAgentsArgs } from '../../core/commands/agents/syntax.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';

const gates = new WeakMap<ShellRuntimeContext, () => ToolGateOptions>();
const pending = new WeakSet<ShellRuntimeContext>();
export function isAgentsControl(text: string): boolean {
  const match = /^\/agents(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return Boolean(match && parseAgentsArgs(tokenizeCommandArgs(match[1] ?? '')).ok);
}
export function installAgentsRuntime(context: ShellRuntimeContext, gate: (tool?: string) => ToolGateOptions): void {
  gates.set(context, () => gate('apply_patch'));
}
export function agentsCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['agentsCommand']> {
  return async (args, command) => {
    const bound = gates.get(context); const session = context.session.id; const root = context.cwd;
    if (!bound || command.sessionId !== session || command.cwd !== root) return { kind: 'local', output: 'Agent management refused: session runtime is unavailable or changed.' };
    const original = bound(); const admission = () => configurationAdmission(context)() ?? original.admission?.()
      ?? (context.session.id !== session || context.cwd !== root ? 'Agent session or workspace changed.' : undefined);
    if (pending.has(context)) return { kind: 'local', output: 'Agent management is already pending; finish its approval first.' };
    pending.add(context);
    try { return await runAgentsCommand(args, { root, trusted: () => !projectTrust.isProjectUntrusted(root),
      gate: () => ({ ...original, admission }), sourceAccess: absolute => {
        const refused = admission(); if (refused) throw new Error(refused);
        assertAgentSourceAccess(absolute, root, context.session.workspaceRoots, original.permissionScope, original.denyRules);
      } }); } finally { pending.delete(context); }
  };
}
