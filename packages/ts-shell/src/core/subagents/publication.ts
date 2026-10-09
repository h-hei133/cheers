import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { withFileLock } from '../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { inspectWorkspaceFile, matchesFileState, type FileState } from '../../edit/authority/state.js';
import { DEFINITION_BYTES } from './definition.js';
import { pathIdentity, readAgentFile } from './files.js';
import type { ToolDefinition } from '../../tools/types.js';

/** A bounded config publication owns exact bytes and paths; ordinary tool approval owns authority. */
export function agentPublication(target: string, next: string | undefined, admission: () => string | undefined, currentAdmission: () => string | undefined): ToolDefinition {
  const original = readAgentFile(target); const identity = pathIdentity(target);
  let root = path.dirname(target);
  while (!fs.existsSync(root)) root = path.dirname(root);
  const relativePath = path.relative(root, target);
  const expected = inspectWorkspaceFile(root, relativePath, undefined, DEFINITION_BYTES);
  const lock = path.join(root, `.agents-${createHash('sha256').update(target).digest('hex')}.lock`);
  let attempted = false;
  let published: FileState | undefined;
  let publishedIdentity: string | undefined;
  const recheck = () => {
    const refused = admission(); if (refused) throw new Error(refused);
    if (pathIdentity(target) !== identity || readAgentFile(target) !== original) throw new Error('FILE_CONTENT_CHANGED: agent publication snapshot changed.');
  };
  return { name: 'apply_patch', description: 'Publish one approved agent definition.', argsSchema: { type: 'object' },
    resultAdmission: () => {
      if (!attempted) return undefined;
      try {
        const refused = currentAdmission(); if (refused) return `Agent current publication verification is unverified: ${refused}`;
        if (!published || !publishedIdentity || pathIdentity(target) !== publishedIdentity
          || !matchesFileState(inspectWorkspaceFile(root, relativePath, undefined, DEFINITION_BYTES), published)) {
          return 'Agent current publication verification is unverified: target identity or bytes changed after publication.';
        }
        return undefined;
      } catch { return 'Agent current publication verification is unverified: current target could not be inspected.'; }
    },
    prepare: () => { recheck(); return { targets: [{ path: target, operation: next === undefined ? 'delete' : 'write' }],
      permissionArgs: { path: target, operation: next === undefined ? 'delete' : 'write' },
      preview: `${next === undefined ? 'Delete' : original === undefined ? 'Create' : 'Replace'} ${JSON.stringify(target)}\n${next ?? '(delete exact current definition)'}\nCurrent bytes are guarded; agent text grants no execution authority.`,
      execute: async context => {
        try {
          recheck(); if (context.abortSignal?.aborted) throw new Error('Agent publication cancelled.');
          withFileLock(lock, () => {
            recheck();
            if (context.abortSignal?.aborted) throw new Error('Agent publication cancelled.');
            attempted = true;
            published = commitWorkspaceFile({ workspaceRoot: root, relativePath, expected, content: next, mode: 0o600 });
            if (readAgentFile(target) !== next) throw new Error('Agent publication verification failed.');
            publishedIdentity = pathIdentity(target);
          }, { createParent: false });
          return { success: true, output: `Agent definition ${next === undefined ? 'deleted' : 'persisted'}: ${target}`, metadata: { status: 'persisted', path: target } };
        } catch (error) {
          return { success: false, error: attempted ? 'Agent publication outcome is unverified; inspect current content before retrying.' : error instanceof Error ? error.message : 'Agent publication refused.',
            metadata: { status: attempted ? 'unverified' : 'unchanged', path: target } };
        }
      } }; },
    execute: async () => ({ success: false, error: 'The exact prepared agent publication and approval are required.' }) };
}
