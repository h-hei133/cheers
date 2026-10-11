import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import which from 'which';
import type { CommandDataEffectResult } from '../../core/commands/transfer/contract.js';
import { createDefaultExecutionService, type ExecutionService } from '../../runtime/execution/service.js';
import { runPreparedTool } from '../../turn/invoke.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { ToolDefinition } from '../../tools/types.js';
import { redactUnsafeReportText } from '../../core/security/reportText.js';

/** The selected HTTP link is data; the ordinary command gate authorizes its native opener. */
export async function openConversationLink(url: string, gate: ToolGateOptions, admission: () => string | undefined,
  execution: Pick<ExecutionService, 'runCommand'> = createDefaultExecutionService()): Promise<CommandDataEffectResult> {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password
      || url.length > 2048 || /[\x00-\x1f\x7f-\x9f]/.test(url)) return { outcome: 'blocked', reason: 'Selected link is not a bounded HTTP(S) URL without credentials.' };
    const name = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
    const executable = realpathSync(which.sync(name));
    const args = Object.freeze(process.platform === 'win32' ? ['url.dll,FileProtocolHandler', parsed.href] : [parsed.href]);
    const env = Object.freeze(Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)));
    const identity = executableIdentity(executable);
    const command = [executable, ...args].map(value => JSON.stringify(value)).join(' ');
    let outcome: CommandDataEffectResult = { outcome: 'blocked', reason: 'The system opener was not executed.' };
    const check = () => admission() ?? gate.admission?.() ?? (executableIdentity(executable) !== identity ? 'System opener changed after preparation.' : undefined);
    const tool: ToolDefinition = {
      name: 'bash', description: 'Open this exact selected conversation URL through the operating system.',
      argsSchema: { type: 'object', additionalProperties: false, required: ['command'], properties: { command: { const: command } } },
      onRefusal: (_args, _context, state) => { outcome = { outcome: state, reason: `System opener ${state}; no link was launched.` }; },
      prepare: () => ({ targets: [], permissionArgs: { command }, previewKind: 'execution',
        preview: `System opener: ${executable}\nSelected URL: ${redactUnsafeReportText(parsed.href, undefined, 2048)}\nThe application may contact this destination. Display of a browser page is not verified.`,
        execute: async context => {
          const refused = check(); if (refused) throw new Error(refused);
          const result = await execution.runCommand({ operationKind: 'command.run', command: executable, args,
            cwd: context.workspaceRoot, workspaceRoot: context.workspaceRoot, env, timeoutMs: 10_000, abortSignal: context.abortSignal,
            authority: { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'Exact native URL opener passed the ordinary command gate.' },
            caller: 'conversation-link', reason: 'Explicit selected conversation link', reportSafeCommand: 'system conversation-link opener', captureOutput: false });
          outcome = result.terminationFailed || result.outputFailed ? { outcome: 'unknown', reason: 'System opener cleanup could not be confirmed.' }
            : result.status === 'completed' && result.exitCode === 0 ? { outcome: 'committed', reason: 'The system opener completed; browser display is unverified.' }
              : { outcome: result.status === 'cancelled' ? 'cancelled' : 'failed', reason: `System opener ${result.status}; exit ${result.exitCode ?? 'unknown'}.` };
          return { success: outcome.outcome === 'committed', output: outcome.reason, metadata: { status: outcome.outcome } };
        } }),
      async execute() { throw new Error('A system opener requires its original prepared invocation.'); },
    };
    const result = await runPreparedTool(tool, { command }, { ...gate, admission: check }, undefined, undefined, 'Open conversation link', { eventKey: 'conversationLink' });
    if (result.metadata?.status === 'unverified' || result.metadata?.publication === 'unverified') return { outcome: 'unknown', reason: 'System opener result verification failed; browser display is unverified.' };
    if (outcome.outcome === 'blocked' && result.isError) return { outcome: 'blocked', reason: 'The system opener was refused before execution.' };
    return outcome;
  } catch { return { outcome: 'blocked', reason: 'The selected system opener is unavailable or its identity could not be verified.' }; }
}

function executableIdentity(executable: string): string {
  const stat = statSync(executable);
  if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('System opener must be a bounded regular executable.');
  return createHash('sha256').update(JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs])).update(readFileSync(executable)).digest('hex');
}
