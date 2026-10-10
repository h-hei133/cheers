import type { CommandContext, LocalCommandResult } from '../../core/commands/types.js';
import { jobsSyntax } from '../../core/commands/jobs/syntax.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import { createCoreToolRegistry } from '../../core/tools/registry.js';
import { runPreparedTool } from '../../turn/invoke.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js';
import type { JobsComposition } from './model.js';
import { jobAdmission } from './authority.js';
import { report, localPage, localProjection, remoteProjection } from './projection.js';
import { hubProjection } from './hub.js';

export async function runJobsCommand(host: JobsComposition, name: 'jobs' | 'hub', args: string[], context: CommandContext): Promise<LocalCommandResult> {
  if (name === 'hub') {
    try { return { kind: 'local', output: args.length ? 'Usage: /hub' : report(hubProjection(host)) }; }
    catch { return { kind: 'local', output: 'The stored job and request ledger is unavailable.' }; }
  }
  const raw = context.rawCommandArgs; const shell = raw && /^\s*(run|queue)\s+([\s\S]*)$/i.exec(raw);
  let tokens: string[];
  try { tokens = shell ? [shell[1]!, shell[2]!] : raw !== undefined ? tokenizeCommandArgs(raw) : args; }
  catch { return { kind: 'local', output: `Invalid /jobs arguments.\n${syntaxHelp(jobsSyntax)}` }; }
  const parsed = parseSyntax(jobsSyntax, tokens);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /jobs arguments: ${parsed.reason}\n${syntaxHelp(jobsSyntax)}` };
  try { return { kind: 'local', output: await control(host, parsed.action.name, parsed.args) }; }
  catch { return { kind: 'local', output: 'Local job operation refused or unverified. Inspect /jobs; dispatched IDs are never replayed.' }; }
}
async function control(host: JobsComposition, action: string, args: readonly string[]): Promise<string> {
  if (action === 'list') { const journal = host.jobs.read(); return report([...(journal.local ?? []).map(job => localProjection(host, job)), ...journal.jobs.map(remoteProjection)]); }
  const tool = createCoreToolRegistry();
  if (action === 'run' || action === 'queue') return approved(host, 'bash', args[0]!, `Local command: ${report(args[0]!, 24000)}\n300s native deadline; 64KiB retained per stream; exact live cancellation. ${action === 'queue' ? 'Queue only; fresh resume approval is required to dispatch.' : 'Runs independently of the main turn.'}`,
    async context => action === 'queue' ? { success: true, output: `Queued ${host.local.create({ command: args[0]!, cwd: context.workspaceRoot })}; no command was dispatched.` }
      : tool.get('bash')!.execute({ command: args[0], runInBackground: true }, context));
  const local = host.local.get(args[0]!);
  if (action === 'show') return report(localProjection(host, local));
  if (action === 'output') {
    if (args[1] !== 'stdout' && args[1] !== 'stderr') throw new Error('Unknown output stream.');
    return localPage(local, args[1], Number(args[2]));
  }
  if (action === 'cancel') return approved(host, 'taskStop', local.command, `Cancel exact local job ${local.id}. The live owner must settle cleanup; no stored PID is used.`,
    async context => {
      if (!local.dispatchPossible) { host.local.adopt(local.id); host.local.cancelIntent(local.id); return { success: true, output: `Intent ${local.id} cancelled; no command was dispatched.` }; }
      return tool.get('taskStop')!.execute({ taskId: local.id }, context);
    });
  if (action === 'pause') return approved(host, 'bash', local.command, `Pause undispatched local job ${local.id}; running processes cannot be paused without loss.`,
    async () => { host.local.adopt(local.id); host.local.pause(local.id); return { success: true, output: `Queued job ${local.id} paused; no process was frozen.` }; });
  if (action === 'resume') return approved(host, 'bash', local.command, `Approve exact undispatched job ${local.id}:\n${report(local.command, 24000)}\nA dispatched/unknown ID cannot resume.`, async context => {
    if (local.directory.path !== context.workspaceRoot) throw new Error('Resume requires the original job directory.');
    const selected = host.local.adopt(local.id);
    const runner = { start: (input: Parameters<JobsComposition['registry']['start']>[0]) => host.registry.resume(selected.id, input),
      list: () => host.registry.list(), get: (id: string) => host.registry.get(id), stop: (id: string) => host.registry.stop(id),
      onEnded: host.registry.onEnded.bind(host.registry) };
    return tool.get('bash')!.execute({ command: selected.command, runInBackground: true }, { ...context, background: runner });
  });
  throw new Error('Unsupported local job operation.');
}
async function approved(host: JobsComposition, name: string, command: string, preview: string,
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>): Promise<string> {
  const admission = jobAdmission(host); const gate = host.gate(name);
  const definition: ToolDefinition = { name, description: 'Operate one session-bound local job.', argsSchema: { type: 'object' },
    prepare: () => ({ targets: [], permissionArgs: { command, runInBackground: true }, previewKind: 'execution', preview,
      execute: context => { if (admission()) throw new Error('Job admission changed after approval.'); return execute(context); } }),
    execute: async () => ({ success: false, error: 'Prepared job approval required.' }), resultAdmission: admission };
  return (await runPreparedTool(definition, {}, { ...gate, background: host.registry, admission }, undefined, undefined, 'Local job', { eventKey: 'jobs' })).output;
}
