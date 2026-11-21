import { validateFileCursor, validateRemotePath } from '../../runtime/execution/ssh/remote/file.js';
import { sameValue } from '../../config/values.js';
import { approveOperation } from './approval.js';
import { connectedAdmission, sshAuthority } from './authority.js';
import { admittedOperation } from './lifetime.js';
import type { SshComposition } from './model.js';
import { display, pageDisplay } from './projection.js';

export function observeFile(host: SshComposition, action: 'stat' | 'read', args: readonly string[]): Promise<string> {
  const [relative, offsetArg, version] = args;
  const offset = offsetArg === undefined ? 0 : Number(offsetArg);
  validateRemotePath(relative!);
  validateFileCursor(offset, version);
  const client = host.client;
  const workspace = host.jobs.read().remote;
  if (!client || !workspace) throw new Error('SSH workspace not connected.');
  const connection = connectedAdmission(host);
  const admission = () => connection() ?? (sameValue(workspace, host.jobs.read().remote) ? undefined : 'SSH workspace changed.');
  const operation = action === 'stat' ? 'Observe size of one regular file' : `Read up to 64 KiB for redaction and display a 16 KiB text page at byte ${offset}`;
  const target = JSON.stringify({ action, workspace: workspace.namespace, path: relative, ...(action === 'read' ? { offset, version } : {}) });
  return approveOperation(host, action === 'stat' ? 'remote-file-stat' : 'remote-file-read', `${operation}.\nRemote path: ${display(relative)}${version ? `\nVersion: ${version}` : ''}`, async context => {
    if (action === 'stat') {
      const info = await admittedOperation(admission, context.abortSignal, signal => client.stat(workspace, relative!, sshAuthority, signal), host);
      return { success: true, output: `Remote file ${display(relative)} is ${info.size} bytes.`, metadata: { status: 'observed', size: info.size, evidence: 'remote-reported' } };
    }
    const page = await admittedOperation(admission, context.abortSignal, signal => client.read(workspace, relative!, offset, version, sshAuthority, signal), host);
    return { success: true, output: `Remote file ${display(relative)}. Next byte ${page.nextOffset}/${page.size}.\nVersion ${page.version}\n${pageDisplay(page)}`,
      metadata: { status: 'page', nextOffset: page.nextOffset, size: page.size, version: page.version, evidence: 'remote-reported' } };
  }, admission, target);
}
