import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CommandContext, LocalCommandResult } from '../../core/commands/types.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { CoreMcpGateway } from '../../core/mcp/gateway.js';
import { addMcpDefinition, runMcpConfigCommand, type McpConfigHost } from '../mcp/config.js';
import type { McpConfigScope } from '../../core/mcp/types.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { projectTrust } from '../../core/security/projectTrust.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { mcpSyntax } from '../../core/commands/mcp/syntax.js';
import { runMcpAuthCommand } from '../mcp/auth/command.js';

const hosts = new WeakMap<ShellRuntimeContext, { gate: () => ToolGateOptions; gateway: CoreMcpGateway; onAuthorizeUrl?: (url: string) => void }>();
const pending = new WeakMap<ShellRuntimeContext, AbortController>();

export function cancelMcpFor(context: ShellRuntimeContext): void { pending.get(context)?.abort(); }

export function installMcpRuntime(context: ShellRuntimeContext, gateway: CoreMcpGateway, gate: (tool?: string) => ToolGateOptions, onAuthorizeUrl?: (url: string) => void): void {
  hosts.set(context, { gateway, gate: () => gate('apply_patch'), onAuthorizeUrl });
}

export function mcpCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['mcpCommand']> {
  return (args, command) => {
    const parsed = parseSyntax(mcpSyntax, args);
    const run = parsed.ok && ['auth', 'logout'].includes(parsed.action.name) ? runMcpAuthCommand : runMcpConfigCommand;
    return runMcpFor(context, command, host => run(args, host));
  };
}

/** A wizard keeps its original owner through all steps and the ordinary approval. */
export function mcpDefinitionFor(context: ShellRuntimeContext): (scope: McpConfigScope, name: string, definition: unknown) => Promise<string | undefined> {
  const admission = configurationAdmission(context);
  const command = { cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id };
  return async (scope, name, definition) => {
    const refused = admission(); if (refused) return refused;
    const result = await runMcpFor(context, command, host => addMcpDefinition(scope, name, definition,
      { ...host, gate: () => { const gate = host.gate(); return { ...gate, admission: () => admission() ?? gate.admission?.() }; } }));
    return result.kind === 'local' ? result.output : undefined;
  };
}

async function runMcpFor(context: ShellRuntimeContext, command: CommandContext, run: (host: McpConfigHost) => Promise<LocalCommandResult>): Promise<LocalCommandResult> {
  const host = hosts.get(context); const session = context.session.id; const root = context.cwd;
  if (!host || command.sessionId !== session || command.cwd !== root) return { kind: 'local', output: 'MCP management refused: session runtime is unavailable or changed.' };
  if (pending.has(context)) return { kind: 'local', output: 'MCP configuration management is already pending; finish its approval first.' };
  const original = host.gate();
  const configuration = configurationAdmission(context);
  const abort = new AbortController();
  const admission = () => abort.signal.aborted ? 'MCP configuration publication cancelled.' : configuration() ?? original.admission?.()
    ?? (context.session.id !== session || context.cwd !== root ? 'MCP session or workspace changed.' : undefined);
  pending.set(context, abort);
  try { return await run({ root, trusted: () => !projectTrust.isProjectUntrusted(root),
    gate: () => ({ ...original, admission }), signal: abort.signal, changed: target => host.gateway.configurationChanged(target), onAuthorizeUrl: host.onAuthorizeUrl,
    sourceAccess: absolute => { const refused = admission(); if (refused) throw new Error(refused);
      assertSourceAccess(absolute, root, context.session.workspaceRoots, original.permissionScope, original.denyRules); } });
  } finally { pending.delete(context); }
}
