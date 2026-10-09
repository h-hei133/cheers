import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { withFileLock } from '../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from './commit.js';
import { inspectWorkspaceFile, matchesFileState, type FileState } from './state.js';
import { pathIdentity, readTextFile } from '../../core/workspace/files.js';
import type { ToolDefinition } from '../../tools/types.js';

/** A bounded config publication owns exact bytes and paths; ordinary tool approval owns authority. */
export function filePublication(target: string, next: string | undefined, maxBytes: number, admission: () => string | undefined, currentAdmission: () => string | undefined, label = 'File', preview?: string): ToolDefinition {
  if (next !== undefined && Buffer.byteLength(next) > maxBytes) throw new Error('Publication exceeds its size limit.');
  const original = readTextFile(target, maxBytes); const identity = pathIdentity(target);
  let root = path.dirname(target);
  while (!fs.existsSync(root)) root = path.dirname(root);
  const relativePath = path.relative(root, target);
  const expected = inspectWorkspaceFile(root, relativePath, undefined, maxBytes);
  const lock = path.join(root, `.publication-${createHash('sha256').update(target).digest('hex')}.lock`);
  let attempted = false;
  let published: FileState | undefined;
  let publishedIdentity: string | undefined;
  const recheck = () => {
    const refused = admission(); if (refused) throw new Error(refused);
    if (pathIdentity(target) !== identity || readTextFile(target, maxBytes) !== original) throw new Error('FILE_CONTENT_CHANGED: publication snapshot changed.');
  };
  return { name: 'apply_patch', description: 'Publish one approved managed file.', argsSchema: { type: 'object' },
    resultAdmission: () => {
      if (!attempted) return undefined;
      try {
        const refused = currentAdmission(); if (refused) return `File current publication verification is unverified: ${refused}`;
        if (!published || !publishedIdentity || pathIdentity(target) !== publishedIdentity
          || !matchesFileState(inspectWorkspaceFile(root, relativePath, undefined, maxBytes), published)) {
          return 'File current publication verification is unverified: target identity or bytes changed after publication.';
        }
        return undefined;
      } catch { return 'File current publication verification is unverified: current target could not be inspected.'; }
    },
    prepare: () => { recheck(); return { targets: [{ path: target, operation: next === undefined ? 'delete' : 'write' }],
      permissionArgs: { path: target, operation: next === undefined ? 'delete' : 'write' },
      preview: `${next === undefined ? 'Delete' : original === undefined ? 'Create' : 'Replace'} ${JSON.stringify(target)}\n${preview ?? next ?? '(delete exact current file)'}\nCurrent bytes are guarded; configuration text grants no execution authority.`,
      execute: async context => {
        try {
          recheck(); if (context.abortSignal?.aborted) throw new Error('File publication cancelled.');
          withFileLock(lock, () => {
            recheck();
            if (context.abortSignal?.aborted) throw new Error('File publication cancelled.');
            attempted = true;
            published = commitWorkspaceFile({ workspaceRoot: root, relativePath, expected, content: next, mode: 0o600 });
            if (readTextFile(target, maxBytes) !== next) throw new Error('File publication verification failed.');
            publishedIdentity = pathIdentity(target);
          }, { createParent: false });
          return { success: true, output: `${label} ${next === undefined ? 'deleted' : 'persisted'}: ${target}`, metadata: { status: 'persisted', path: target } };
        } catch (error) {
          return { success: false, error: attempted ? 'File publication outcome is unverified; inspect current content before retrying.' : error instanceof Error ? error.message : 'File publication refused.',
            metadata: { status: attempted ? 'unverified' : 'unchanged', path: target } };
        }
      } }; },
    execute: async () => ({ success: false, error: 'The exact prepared file publication and approval are required.' }) };
}
