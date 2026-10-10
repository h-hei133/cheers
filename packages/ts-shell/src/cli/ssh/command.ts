import type { CommandContext, CommandExecutionResult } from '../../core/commands/types.js';
import { sshSyntax } from '../../core/commands/ssh/syntax.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import type { SshComposition } from './model.js';
import { selectProfile, connect } from './connection.js';
import { approveOperation } from './approval.js';
import { sshAuthority, captureOrigin, operationAdmission } from './authority.js';
import { jobProjection, jobResult, display, pageDisplay } from './projection.js';
import { admittedOperation, cancelLocalOperations, lifetimePreview, releaseParentJobs, submitJob } from './lifetime.js';

export async function runSshCommand(host: SshComposition, args: string[], command: CommandContext): Promise<CommandExecutionResult> {
  const raw = command.rawCommandArgs;
  // Remote shell syntax is preserved as the exact suffix; tokenization must not remove quotes.
  const run = raw === undefined ? undefined : /^\s*run\s+([\s\S]*)$/i.exec(raw);
  const parsed = parseSyntax(sshSyntax, run ? ['run', run[1]!] : args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /ssh arguments: ${parsed.reason}\n${syntaxHelp(sshSyntax)}` };
  try { return { kind: 'local', output: await control(host, parsed.action.name, parsed.args) }; }
  catch { return { kind: 'local', output: 'SSH unavailable, refused or changed; inspect /ssh jobs for any uncertain dispatch. No operation was replayed.' }; }
}
async function control(host: SshComposition, action: string, args: readonly string[]): Promise<string> {
  if (action === 'status') return display({ profile: host.profile ? { host: host.profile.selection.host, port: host.profile.selection.port,
    user: host.profile.selection.user, fingerprint: host.profile.fingerprint } : 'not-selected', connected: Boolean(host.service),
    remote: host.jobs.read().remote, retainedJobs: host.jobs.read().jobs.length });
  if (action === 'jobs') return display(host.jobs.read().jobs.map(jobProjection), 48000);
  if (action === 'cancel-pending') { cancelLocalOperations(host);
    return 'Local SSH cancellation requested; remote termination is separate. Inspect /ssh jobs and explicitly reconcile or cancel unknown jobs.'; }
  if (action === 'profile') return selectProfile(host, args[0]!);
  if (action === 'connect') return approveOperation(host, 'connect', 'Verify the selected remote Linux/bash workspace and native user manager. No job is submitted.', async context => ({
    success: true, output: await connect(host, context.abortSignal), metadata: { status: 'connected' } }));
  if (action === 'disconnect') { const released = await releaseParentJobs(host); host.client?.transport.abort(); host.client = undefined; host.service = undefined; host.jobs.disconnect();
    return `Local SSH binding released. ${released} Detached or unknown jobs may still run remotely; retained IDs were not replayed.`; }
  if (!host.service) throw new Error('SSH workspace not connected.');
  const admission = operationAdmission(host);
  const service = host.service.withAdmission(admission);
  const origin = captureOrigin(host);
  if (action === 'run') return approveOperation(host, 'run', `Submit this exact remote shell command. Two jobs may remain active/unknown.\n${display(args[0]!, 24000)}\nOrigin: ${display(origin)}\n${lifetimePreview(origin)}`, async context => {
    if (admission()) throw new Error('SSH authority changed.');
    return submitJob(host, args[0]!, origin, context);
  });
  const job = host.jobs.get(args[0]!);
  if (action === 'reconcile' || action === 'cancel') return approveOperation(host, action,
    `${action === 'cancel' ? 'Cancel the exact selected native cgroup. Output completeness is separate; escaped processes are outside this guarantee.'
      : 'Query remote status and persist matching native observation metadata; missing/replaced records stay unknown.'}\n${display(jobProjection(job))}`, async context => {
      if (admission()) throw new Error('SSH authority changed.');
      return admittedOperation(admission, context.abortSignal, async signal => jobResult(await service[action](job.id, sshAuthority, signal)), host);
    });
  if (action === 'output') {
    const stream = args[1]; if (stream !== 'stdout' && stream !== 'stderr') throw new Error('Invalid SSH output stream.');
    return approveOperation(host, 'output', `Read the bounded retained ${stream} stream (up to 64KiB) for full-context redaction and display up to 16KiB at byte ${args[2]}. Content is untrusted; sensitive streams are withheld from reports.\n${display(jobProjection(job))}`, async context => {
      if (admission()) throw new Error('SSH authority changed.');
      const page = await admittedOperation(admission, context.abortSignal, signal => service.output(job.id, stream, Number(args[2]), sshAuthority, signal), host);
      return { success: true, output: `Remote ${stream}; next byte ${page.nextOffset}/${page.size}; truncated ${page.truncated}.\n${pageDisplay(page)}`,
        metadata: { status: 'page', nextOffset: page.nextOffset, size: page.size, truncated: page.truncated, evidence: 'remote-reported' } };
    });
  }
  throw new Error('Invalid SSH action.');
}
