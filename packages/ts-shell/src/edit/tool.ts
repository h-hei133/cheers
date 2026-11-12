import { createHash } from 'node:crypto';
import { validateToolArguments } from '../core/tools/arguments.js';
import { resolveToolTarget } from '../core/tools/permissionContext.js';
import { replaceInContent, replaceManyInContent } from '../core/tools/editEngine.js';
import { approvedResult } from '../core/tools/toolResultLifecycle.js';
import { verifyPathContainment } from '../core/security/pathJail.js';
import { assertWorkspaceRoot, captureWorkspaceRoot, resolveWorkspaceRoot } from '../core/workspace/roots.js';
import { workspaceRelativePath } from '../core/workspace/files.js';
import { withFileLock } from '../runtime/execution/fileLock.js';
import { detectLineEnding, splitByteOrderMark, toUnixLines, withLineEnding } from '../runtime/execution/fileText.js';
import type { ExecutionService } from '../runtime/execution/service.js';
import type { ToolDefinition, ToolExecutionContext, ToolPreparation } from '../tools/types.js';
import { createUnifiedDiff } from '../presentation/tui/transcript/diff.js';

const schema = {
  type: 'object', properties: {
    path: { type: 'string', description: 'The relative path of the file to edit.' },
    content: { type: 'string', description: 'The full replacement content for the file. An alternative to edits/oldText+newText, not a companion: give one form.' },
    edits: { type: 'array', minItems: 1,
      description: 'Targeted replacements, applied as one edit or none. Each is matched against the original file, not against the result of the previous one, and they must not overlap — merge nearby changes into one edit instead.',
      items: { type: 'object', properties: {
        oldText: { type: 'string', description: 'The exact or fuzzy block of text to replace.' },
        newText: { type: 'string', description: 'The text to put in its place.' },
      }, required: ['oldText', 'newText'] } },
    oldText: { type: 'string', description: 'The exact or fuzzy block of text to replace (single-replacement form).' },
    newText: { type: 'string', description: 'The new text to replace oldText with.' },
    replaceAll: { type: 'boolean', description: 'Whether to replace every occurrence of oldText. Applies to the single-replacement form only.' },
  }, required: ['path'], oneOf: [
    { required: ['content'], not: { anyOf: [{ required: ['edits'] }, { required: ['oldText'] }, { required: ['newText'] }, { required: ['replaceAll'] }] } },
    { required: ['edits'], not: { anyOf: [{ required: ['content'] }, { required: ['oldText'] }, { required: ['newText'] }, { required: ['replaceAll'] }] } },
    { required: ['oldText', 'newText'], not: { anyOf: [{ required: ['content'] }, { required: ['edits'] }] } },
  ],
};

export function createEditToolDefinition(service: ExecutionService): ToolDefinition<Promise<ToolPreparation>> {
  return {
    name: 'edit',
    description: 'Edit an existing file: several targeted replacements in one call, or full replacement content. Each file commits independently; multi-file edits are not atomic. If editing a later file fails, earlier changes remain. Use /undo to inspect the latest snapshot or /restore to explicitly restore individual recorded edits.',
    argsSchema: schema,
    prepare: (args, context) => prepareEdit(service, args, context),
    // Low-level callers retain their read-modify-write lock. The host always
    // consumes its approved preparation instead of calling this compatibility entry.
    execute: (args, context) => withFileLock(resolveToolTarget(args, 'path', context.workspaceRoot), async () =>
      (await prepareEdit(service, args, context)).execute(context)),
  };
}

async function prepareEdit(service: ExecutionService, args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolPreparation> {
  validateToolArguments(schema, args);
  const target = resolveToolTarget(args, 'path', context.workspaceRoot);
  return withFileLock(target, async () => {
    context.abortSignal?.throwIfAborted();
    const root = context.workspaceRoots?.length
      ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, target, 'write') ?? context.workspaceRoot : context.workspaceRoot;
    const containment = verifyPathContainment(target, root);
    if (!containment.allowed) throw new Error(`${containment.reason ?? `Target '${target}' is outside the workspace.`} Writes are limited to the workspace (${root}) and the roots the user attaches. To allow this path, the user can run /workspace add <path> --write, then retry.`);
    const workspace = captureWorkspaceRoot(root, root, 'write');
    const verifyWorkspace = () => {
      assertWorkspaceRoot(workspace);
      if (captureWorkspaceRoot(root, root, 'write').path !== workspace.path) throw new Error('Edit workspace changed after preparation.');
    };
    // Use the writer's lexical path contract before an absent-file read can
    // publish a candidate. A dangling link is not a creatable missing file.
    const relative = workspaceRelativePath(root, target);
    let raw: string | undefined;
    // Keep mutable model-owned arrays out of the asynchronous read. The host's
    // prepared capability separately refuses any later change to the original args.
    const replacement = { ...args, ...(Array.isArray(args.edits) ? { edits: args.edits.map(segment => ({ ...segment })) } : {}) };
    try {
      raw = await service.readTextFile({ operationKind: 'file.read', absolutePath: containment.resolvedPath, workspaceRoot: root,
        assertFileAccess: context.assertFileAccess, abortSignal: context.abortSignal,
        authority: { mode: 'read-only', source: 'tool-runtime-approval', reason: 'Read the authorized edit source.' },
        caller: 'core-tool:edit', reason: 'Read original content for the prepared edit.', reportSafeTarget: containment.resolvedPath });
    } catch (error) {
      // Only full replacement can create a file. Permission, unstable reads and
      // resource failures remain failures rather than evidence of absence.
      if (!(typeof args.content === 'string' && error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const content = replacementContent(raw, replacement);
    const before = raw === undefined ? { state: 'absent' as const }
      : { state: 'exists' as const, sha256: createHash('sha256').update(raw).digest('hex') };
    const writeCandidate = Object.freeze({ path: target, content, before: Object.freeze(before) });
    const diff = raw && raw !== content ? createUnifiedDiff(relative, raw, content) : '';
    const output = diff ? `Updated ${relative}\n\n\`\`\`diff\n${diff}\n\`\`\``
      : raw === undefined ? `Updated ${relative} (original unreadable, no diff)` : `Updated ${relative}`;
    return Object.freeze({ targets: Object.freeze([Object.freeze({ path: target, operation: 'write' as const })]),
      preview: diff || `Update ${relative}`, writeCandidate,
      execute: async (actual: ToolExecutionContext) => {
        actual.abortSignal?.throwIfAborted();
        const blocked = actual.admission?.(); if (blocked) throw new Error(blocked);
        verifyWorkspace();
        const written = await service.writeTextFile({ operationKind: 'file.write', absolutePath: target, workspaceRoot: root, content,
          ...(raw === undefined ? { expectedAbsent: true } : { expectedContent: raw }),
          ...(actual.sessionId ? { editIdentity: { sessionId: actual.sessionId, workspaceRoot: actual.artifactRoot ?? actual.workspaceRoot,
            callId: actual.taskId, correlationId: actual.correlationId } } : {}),
          assertFileAccess: absolute => { verifyWorkspace(); actual.assertFileAccess?.(absolute); }, abortSignal: actual.abortSignal,
          authority: { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'The original prepared edit was approved.' },
          caller: 'core-tool:edit', reason: 'Commit the approved prepared replacement.', reportSafeTarget: containment.resolvedPath });
        return approvedResult(output, written ? { ...written } : { status: 'unverified' });
      } });
  });
}

function replacementContent(raw: string | undefined, args: Record<string, unknown>): string {
  if (typeof args.content === 'string') return args.content;
  const { bom, text } = splitByteOrderMark(raw!);
  const normalized = toUnixLines(text);
  const clean = (value: string) => toUnixLines(splitByteOrderMark(value).text);
  const segments = args.edits as Array<{ oldText: string; newText: string }> | undefined;
  const result = segments ? replaceManyInContent(normalized, segments.map(segment => ({ oldText: clean(segment.oldText), newText: clean(segment.newText) })))
    : replaceInContent(normalized, clean(args.oldText as string), clean(args.newText as string), { replaceAll: Boolean(args.replaceAll) });
  if (!result.success) throw new Error(result.error ?? 'Failed to apply replacements.');
  return bom + withLineEnding(result.content, detectLineEnding(text));
}
