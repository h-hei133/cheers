import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { runAgentsCommand } from '../../core/subagents/command.js';
import { assertAgentSourceAccess } from '../../core/subagents/source.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { projectTrust } from '../../core/security/projectTrust.js';
import { parseAgentsArgs } from '../../core/commands/agents/syntax.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import { SubagentLoader } from '../../core/subagents/subagentLoader.js';

const gates = new WeakMap<ShellRuntimeContext, () => ToolGateOptions>();
const pending = new WeakSet<ShellRuntimeContext>();

export interface AgentDefinitionRow {
  readonly name: string;
  readonly source: 'builtin' | 'user' | 'project';
  readonly status: 'enabled' | 'disabled' | 'invalid';
  readonly description: string;
  readonly model?: string;
  readonly effort?: string;
  readonly diagnostic?: string;
}
export interface AgentDiscoveryView {
  readonly definitions: readonly AgentDefinitionRow[];
  readonly diagnostics: readonly string[];
}
export function isAgentsControl(text: string): boolean {
  const match = /^\/agents(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return Boolean(match && parseAgentsArgs(tokenizeCommandArgs(match[1] ?? '')).ok);
}
export function installAgentsRuntime(context: ShellRuntimeContext, gate: (tool?: string) => ToolGateOptions): void {
  gates.set(context, () => gate('apply_patch'));
}

/** Read the same definitions and discovery diagnostics as the management command. */
export function agentDiscoveryFor(context: ShellRuntimeContext): AgentDiscoveryView {
  const bound = gates.get(context);
  if (!bound) throw new Error('Agent definitions require a bound session runtime.');
  const session = context.session.id; const root = context.cwd; const original = bound();
  const admission = () => configurationAdmission(context)() ?? original.admission?.()
    ?? (context.session.id !== session || context.cwd !== root ? 'Agent session or workspace changed.' : undefined);
  const sourceAccess = (absolute: string): void => {
    const refused = admission(); if (refused) throw new Error(refused);
    assertAgentSourceAccess(absolute, root, context.session.workspaceRoots, original.permissionScope, original.denyRules);
  };
  const discovery = new SubagentLoader(root, sourceAccess).discover(!projectTrust.isProjectUntrusted(root));
  return {
    definitions: [...discovery.effective].map(([key, candidate]) => ({
      name: candidate.name,
      source: candidate.source,
      status: candidate.diagnostic ? 'invalid' : candidate.definition?.enabled === false ? 'disabled' : 'enabled',
      description: candidate.definition?.description ?? candidate.diagnostic ?? 'Definition is invalid.',
      ...(candidate.definition?.model ? { model: candidate.definition.model } : {}),
      ...(candidate.definition?.effort !== undefined ? { effort: candidate.definition.effort === null ? 'auto' : candidate.definition.effort } : {}),
      ...(candidate.diagnostic ? { diagnostic: candidate.diagnostic } : {}),
      ...(key !== candidate.name.toLowerCase() ? { diagnostic: candidate.diagnostic ?? 'Definition name is not stable.' } : {}),
    })),
    diagnostics: discovery.diagnostics,
  };
}

/** Read effective definitions without publishing changes. */
export function agentDefinitionsFor(context: ShellRuntimeContext): readonly AgentDefinitionRow[] {
  return agentDiscoveryFor(context).definitions;
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
