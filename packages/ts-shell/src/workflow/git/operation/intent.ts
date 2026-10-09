import { randomUUID } from 'node:crypto';
import type { ToolDefinition } from '../../../tools/types.js';
import type { SessionMessage } from '../../../session/schema/sessionMessage.js';
import type { GitSnapshot } from '../read/model.js';
import type { NativeGit } from '../read/native.js';
import type { GitStore } from './store.js';
import { retainGitRecord } from './store.js';
import { gitPlan } from './plan.js';
import { nativeGitTool } from './tool.js';
import { publishGitResult } from './publication.js';

/** Only the submitted native slash intent arms the model's constrained composer. */
export class GitCommitIntent {
  private armed?: { id: string; sessionId: string; cwd: string; snapshot: GitSnapshot; index: string };
  constructor(readonly store: GitStore, readonly current: () => { id: string; cwd: string; prompt?: SessionMessage }) {}
  arm(snapshot: GitSnapshot, index: string): string {
    const current = this.current(); const id = randomUUID();
    this.armed = { id, sessionId: current.id, cwd: current.cwd, snapshot, index }; return id;
  }
  tools(git: NativeGit): readonly ToolDefinition[] {
    const capture = this.armed; const current = this.current();
    if (!capture || capture.sessionId !== current.id || capture.cwd !== current.cwd
      || current.prompt?.role !== 'user' || current.prompt.metadata?.source !== 'git-commit' || current.prompt.metadata.gitCommitId !== capture.id) return [];
    return [{ name: 'git_commit', description: 'Commit only the exact host-armed staged index. Cannot stage, amend, merge or push. Ordinary exact command approval and snapshot validation are required.',
      argsSchema: { type: 'object', additionalProperties: false, required: ['commitId', 'message'], properties: { commitId: { const: capture.id }, message: { type: 'string', minLength: 1, maxLength: 64000 } } },
      onRefusal: (_args, _context, status) => { this.armed = undefined; publishGitResult({ status: status === 'denied' ? 'denied' : 'blocked', note: 'Commit refused; no write was authorized.' },
        result => retainGitRecord(this.store, { id: capture.id, root: capture.snapshot.root, summary: 'Host-armed commit', result })); },
      prepare: (args, context) => {
        if (this.armed !== capture || args.commitId !== capture.id || !String(args.message).trim()) throw new Error('Commit intent identity changed.');
        const plan = { ...gitPlan(capture.snapshot, ['commit', '--file=-'], [], Buffer.from(String(args.message))), commitIndex: capture.index,
          sources: capture.snapshot.files.filter(file => !['.', '?'].includes(file.index)).flatMap(file => [file.path, ...(file.originalPath ? [file.originalPath] : [])]).map(name => path.join(capture.snapshot.root, name)) };
        const tool = nativeGitTool(git, plan, result => { this.armed = undefined; retainGitRecord(this.store, { id: plan.id, root: capture.snapshot.root, summary: plan.summary, result }); });
        return { ...tool.prepare!({ command: plan.summary }, context), permissionToolName: 'bash' as const };
      }, async execute() { throw new Error('Commit requires its original prepared native command.'); } }];
  }
}
import path from 'node:path';
