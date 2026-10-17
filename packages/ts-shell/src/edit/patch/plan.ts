import path from 'node:path';
import { captureWorkspaceRoot, selectWorkspaceRoot } from '../../core/workspace/roots.js';
import type { WorkspaceRoot } from '../../core/workspace/model.js';
import { inspectWorkspaceFile, workspaceFilePath } from '../authority/state.js';
import { hashContent } from '../authority/content.js';
import { captureOperationScope } from '../recovery/operation/store.js';
import type { OperationScope, PreparedFile } from '../recovery/operation/model.js';
import { applyHunks } from './apply.js';
import { parsePatch, patchLimits } from './parse.js';

/** One independently selectable unit of a patch. */
export interface PatchGroup {
  /** Content-derived and stable for the same operation against the same base. */
  readonly id: string;
  readonly label: string;
  readonly files: readonly string[];
}

export interface PatchPlan {
  readonly scope: OperationScope;
  readonly files: readonly PreparedFile[];
  readonly revision: string;
  /** Revision of every group; a subset selection keeps this value. */
  readonly fullRevision: string;
  readonly groups: readonly PatchGroup[];
  /** Group ids this plan applied; empty when no selection was requested. */
  readonly selected: readonly string[];
}

export function planPatch(input: string, context: {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly assertFileAccess?: (absolutePath: string) => void;
}, selection?: readonly string[]): PatchPlan {
  const scope = captureOperationScope(context);
  const files: PreparedFile[] = [];
  const paths = new Set<string>();
  const objects = new Set<string>();
  let bytes = 0;
  const target = (name: string) => {
    const absolute = path.resolve(scope.workspace.path, name);
    const root = selectWorkspaceRoot(scope.workspace.path, context.workspaceRoots ?? [], absolute, 'write');
    const workspace = captureWorkspaceRoot(root, root, 'write');
    const relative = path.relative(root, absolute);
    const canonical = workspaceFilePath(root, relative);
    context.assertFileAccess?.(absolute);
    // Conservatively reject case/normalization aliases even on case-sensitive volumes.
    const key = canonical.normalize('NFC').toLowerCase();
    if ([...paths].some(other => key === other || key.startsWith(other + path.sep) || other.startsWith(key + path.sep))) {
      throw new Error('Patch contains duplicate or overlapping targets.');
    }
    paths.add(key);
    const before = Object.freeze(inspectWorkspaceFile(root, relative, context.assertFileAccess, patchLimits.fileBytes));
    if (before.state === 'exists') {
      if (objects.has(before.identity)) throw new Error('Patch contains multiple paths to the same file.');
      if (before.content.includes('\0')) throw new Error('Binary patch targets are not supported.');
      objects.add(before.identity);
      bytes += Buffer.byteLength(before.content);
      if (bytes > patchLimits.totalBytes) throw new Error('Patch batch exceeds its total size limit.');
    }
    return { workspaceRoot: root, workspaceIdentity: workspace.identity, relativePath: relative, before };
  };
  const entries: { readonly group: PatchGroup; readonly files: readonly PreparedFile[] }[] = [];
  for (const operation of parsePatch(input)) {
    const groupStart = files.length;
    const source = target(operation.path);
    if (operation.kind === 'add') {
      if (source.before.state !== 'absent') throw new Error('Add File target already exists.');
      files.push({ ...source, content: operation.content });
    } else {
      if (source.before.state !== 'exists') throw new Error('Patch source file is missing.');
      if (operation.kind === 'delete') files.push({ ...source, content: undefined });
      else {
        const content = applyHunks(source.before.content, operation.hunks);
        if (operation.kind === 'move') {
          const destination = target(operation.moveTo);
          if (destination.workspaceRoot !== source.workspaceRoot || destination.before.state !== 'absent') throw new Error('Rename requires an absent target in the same workspace.');
          const rename = Object.freeze({ source: source.relativePath, target: destination.relativePath });
          files.push({ ...destination, content, mode: source.before.mode & 0o777, rename }, { ...source, content: undefined, rename });
        } else if (content !== source.before.content) files.push({ ...source, content });
      }
    }
    const groupFiles = files.slice(groupStart);
    const groupPaths = groupFiles.map(file => path.join(file.workspaceRoot, file.relativePath));
    const signature = operation.kind === 'update' || operation.kind === 'move'
      ? { kind: operation.kind, path: operation.path, ...(operation.kind === 'move' ? { moveTo: operation.moveTo } : {}), hunks: operation.hunks }
      : { kind: operation.kind, path: operation.path };
    const label = operation.kind === 'add' ? `Add ${operation.path}`
      : operation.kind === 'delete' ? `Delete ${operation.path}`
        : operation.kind === 'move' ? `Move ${operation.path} to ${operation.moveTo}`
          : `Update ${operation.path} (${operation.hunks.length} hunk${operation.hunks.length === 1 ? '' : 's'})`;
    entries.push({ group: Object.freeze({ id: hashContent(JSON.stringify(signature)).slice(0, 12), label, files: Object.freeze(groupPaths) }), files: groupFiles });
  }
  for (const file of files) {
    const size = file.content === undefined ? 0 : Buffer.byteLength(file.content);
    if (size > patchLimits.fileBytes) throw new Error('Planned patch file exceeds the size limit.');
    bytes += size;
  }
  if (bytes > patchLimits.totalBytes) throw new Error('Patch batch exceeds its total size limit.');
  const planned = files.map(file => Object.freeze({ ...file,
    maxBytes: Math.max(file.before.state === 'exists' ? Buffer.byteLength(file.before.content) : 0,
      file.content === undefined ? 0 : Buffer.byteLength(file.content)),
    mode: file.content === undefined ? undefined : file.mode ?? (file.before.state === 'exists' ? file.before.mode & 0o777 : 0o666 & ~process.umask()) }));
  const fullRevision = hashContent(JSON.stringify({ scope, files: planned }));
  const groups = Object.freeze(entries.map(entry => entry.group));
  const selected = selection === undefined ? Object.freeze([] as string[])
    : Object.freeze([...new Set(selection)]);
  if (selection !== undefined) {
    if (selected.length === 0) throw new Error('Patch selection is empty; choose at least one group.');
    const known = new Set(groups.map(group => group.id));
    const unknown = selected.find(id => !known.has(id));
    if (unknown !== undefined) throw new Error(`Patch selection ${unknown} is stale or unknown; re-plan before applying.`);
    const chosen = new Set(selected);
    const chosenPaths = new Set(entries.filter(entry => chosen.has(entry.group.id)).flatMap(entry => entry.group.files));
    const kept = planned.filter(file => chosenPaths.has(path.join(file.workspaceRoot, file.relativePath)));
    const revision = hashContent(JSON.stringify({ scope, files: kept }));
    return Object.freeze({ scope, revision, fullRevision, files: Object.freeze(kept), groups, selected });
  }
  return Object.freeze({ scope, revision: fullRevision, fullRevision, files: Object.freeze(planned), groups, selected });
}
