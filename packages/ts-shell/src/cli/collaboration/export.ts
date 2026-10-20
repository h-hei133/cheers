import path from 'node:path';
import type { CommandContext } from '../../core/commands/types.js';
import type { CollaborationComposition } from './model.js';
import { identifier, integer, object, requireValue } from '../../collaboration/contract/value.js';
import { decodeSnapshot } from '../../collaboration/contract/snapshot.js';
import { snapshotFor, snapshotPreview, currentBinding, display } from './projection.js';
import { approveOperation } from './approval.js';
import { readExportSource } from '../../session/export/source.js';
import { runCopyCommand } from '../../core/commands/copyCommandRuntime.js';
import { selectWorkspaceRoot } from '../../core/workspace/roots.js';
import { inspectWorkspaceFile } from '../../core/workspace/files.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { digest } from '../../collaboration/contract/value.js';

export async function runShare(host: CollaborationComposition, action: string, args: readonly string[], signal?: AbortSignal): Promise<string> {
  if (action === 'preview') return snapshotPreview(snapshotFor(host));
  requireValue(host.client, 'unavailable'); const client = host.client;
  if (action === 'read') {
    const response = await client.request('read-share', { data: { shareId: identifier(args[0]) } }, false, signal);
    const result = object(response.result); return snapshotPreview(decodeSnapshot(result.snapshot));
  }
  if (action === 'publish') {
    const acl = args[0]!.split(',').map(identifier); requireValue(acl.length > 0 && acl.length <= 32);
    const ttl = integer(Number(args[1]), 60, 86400); const snapshot = snapshotFor(host); const bound = currentBinding(host);
    const result = await approveOperation(host, 'publish share', `Send this read-only projection to ${client.profile.origin} as ${client.profile.principal}\nAuthenticated recipients: ${acl.join(', ')}\nExpires after ${ttl} seconds. The share ID is a locator; identity and ACL are still required.\n${snapshotPreview(snapshot)}`, async execution => {
      const response = await client.request('publish', { data: { binding: bound, snapshot, acl, ttl } }, true, execution.abortSignal);
      return { success: true, output: `Share published on ${client.profile.origin}: ${display(response.result)}. Read via /share read <shareId> using an authorized profile.`, metadata: { status: 'published' } };
    }); return result.output;
  }
  const shareId = identifier(args[0]);
  const result = await approveOperation(host, action + ' share', `${action} share ${shareId} at ${client.profile.origin}. Stored content is removed and authenticated access is revoked.`, async execution => {
    const response = await client.request(action === 'delete' ? 'delete-share' : 'revoke-share', { data: { shareId } }, true, execution.abortSignal);
    return { success: true, output: `Share mutation: ${display(response.result)}`, metadata: { status: action === 'delete' ? 'deleted' : 'revoked' } };
  }); return result.output;
}
export async function runDump(host: CollaborationComposition, action: string, args: readonly string[], raw: boolean, command: CommandContext): Promise<string> {
  const snapshot = snapshotFor(host);
  if (action === 'preview') return snapshotPreview(snapshot);
  const content = raw ? rawDump(host) : JSON.stringify(snapshot, null, 2) + '\n';
  if (action === 'copy') {
    const result = await approveOperation(host, 'copy dump', `Copy this scrubbed local session projection to the clipboard; no network.\n${snapshotPreview(snapshot)}`, async () => {
      const copied = await runCopyCommand([content], { ...command, rawCommandArgs: content });
      return { success: copied.state?.clipboard !== 'unavailable', output: copied.output, metadata: { status: String(copied.state?.clipboard ?? 'unverified') } };
    }); return result.output;
  }
  const options = host.gate(); const target = path.resolve(host.context.cwd, args[0]!);
  const root = selectWorkspaceRoot(options.workspaceRoot, options.workspaceRoots ?? [], target, 'write'); const relative = path.relative(root, target);
  const baseline = inspectWorkspaceFile(root, relative, undefined, 2 * 1024 * 1024);
  const preview = raw ? `Raw local transcript includes credentials and opaque records. This is separate approval for local save; raw sharing/copy is unavailable.\nExact UTF-8 bytes: ${Buffer.byteLength(content)}; digest ${digest(content)}\nScrubbed excerpt (at most 2048 characters; the digest binds the complete source):\n${display(content, 2048)}` : snapshotPreview(snapshot);
  const result = await approveOperation(host, 'save dump', `Destination: ${target}\n${preview}`, async execution => {
    execution.abortSignal?.throwIfAborted();
    commitWorkspaceFile({ workspaceRoot: root, relativePath: relative, expected: baseline, content, mode: 0o600,
      assertFileAccess: execution.assertFileAccess });
    requireValue(inspectWorkspaceFile(root, relative, execution.assertFileAccess, 2 * 1024 * 1024).state === 'exists', 'unknown');
    return { success: true, output: `Saved ${raw ? 'raw local transcript' : 'scrubbed projection'} to ${JSON.stringify(target)}; verified file publication, no network.`, metadata: { status: 'persisted' } };
  }, { targets: [{ path: target, operation: 'write' }] }); return result.output;
}
function rawDump(host: CollaborationComposition): string {
  const source = readExportSource(host.context.session.id, 2 * 1024 * 1024); requireValue(source.ok && source.raw !== undefined, 'unavailable'); return source.raw;
}
